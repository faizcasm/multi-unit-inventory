import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { Stocktake } from '@/models/Stocktake'
import { Inventory } from '@/models/Inventory'
import { InventoryMovement } from '@/models/InventoryMovement'
import { auth } from '@/lib/auth/auth'
import { canUserPerformAction } from '@/lib/permissions'
import { stocktakeActionSchema } from '@/lib/validation/stocktakes'
import { AuditEvent } from '@/models/AuditEvent'
import { Types } from 'mongoose'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'stocktakes:post')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid stocktake ID' }, { status: 400 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = stocktakeActionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const stocktake = await Stocktake.findOne({ _id: id, organization: session.user.organizationId })
    if (!stocktake) {
      return NextResponse.json({ success: false, error: 'Stocktake not found' }, { status: 404 })
    }

    // Location access
    if (
      session.user.locationPermissions.length > 0 &&
      !session.user.locationPermissions.map(String).includes(String(stocktake.location))
    ) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    if (stocktake.status !== 'COUNTED') {
      return NextResponse.json({ success: false, error: 'Only counted stocktakes can be posted' }, { status: 400 })
    }

    // Same transaction style as the inventory adjust route.
    const mongoSession = await Stocktake.startSession()
    mongoSession.startTransaction()

    try {
      let posted = 0
      const applied: {
        productId: string
        productName: string
        sku: string
        systemQuantity: number
        countedQuantity: number
        adjustment: number
      }[] = []

      for (const line of stocktake.lines) {
        if (line.countedQuantity === undefined || line.countedQuantity === null) continue

        // LIVE available quantity is the authoritative system quantity —
        // re-read at post time inside the transaction.
        const inventory = await Inventory.findOne({
          organization: session.user.organizationId,
          location: stocktake.location,
          product: line.product,
        }).session(mongoSession)

        const liveAvailable = inventory?.availableQuantity || 0
        line.systemQuantity = liveAvailable

        if (line.countedQuantity === liveAvailable) {
          // No variance — nothing to adjust.
          continue
        }

        const adjustment = line.countedQuantity - liveAvailable
        const now = new Date()

        const beforeQuantity = {
          available: liveAvailable,
          reserved: inventory?.reservedQuantity || 0,
          inTransit: inventory?.inTransitQuantity || 0,
          damaged: inventory?.damagedQuantity || 0,
        }

        let current = inventory
        if (!current) {
          if (line.countedQuantity < 0) {
            await mongoSession.abortTransaction()
            return NextResponse.json(
              { success: false, error: 'Cannot post a negative quantity for a new inventory record' },
              { status: 400 }
            )
          }
          const created = await Inventory.create(
            [
              {
                organization: session.user.organizationId,
                product: line.product,
                location: stocktake.location,
                availableQuantity: line.countedQuantity,
                reservedQuantity: 0,
                inTransitQuantity: 0,
                damagedQuantity: 0,
                lastMovementAt: now,
              },
            ],
            { session: mongoSession }
          )
          current = created[0]
        } else {
          current.availableQuantity = line.countedQuantity
          current.lastMovementAt = now
          await current.save({ session: mongoSession })
        }

        const afterQuantity = {
          available: current.availableQuantity,
          reserved: current.reservedQuantity,
          inTransit: current.inTransitQuantity,
          damaged: current.damagedQuantity,
        }

        await InventoryMovement.create(
          [
            {
              organization: session.user.organizationId,
              product: line.product,
              location: stocktake.location,
              movementType: 'ADJUSTMENT',
              quantity: adjustment,
              referenceType: 'STOCKTAKE',
              referenceId: stocktake._id,
              responsibleUser: session.user.id,
              reason: `Cycle count ${stocktake.reference}`,
              beforeQuantity,
              afterQuantity,
              notes: line.notes || stocktake.notes,
            },
          ],
          { session: mongoSession }
        )

        posted += 1
        applied.push({
          productId: String(line.product),
          productName: line.productName,
          sku: line.sku,
          systemQuantity: liveAvailable,
          countedQuantity: line.countedQuantity,
          adjustment,
        })
      }

      stocktake.status = 'POSTED'
      stocktake.postedBy = session.user.id as any
      stocktake.postedAt = new Date()
      await stocktake.save({ session: mongoSession })

      await mongoSession.commitTransaction()

      await AuditEvent.create({
        organization: session.user.organizationId,
        user: session.user.id,
        action: 'STOCKTAKE_POST',
        resourceType: 'Stocktake',
        resourceId: stocktake._id,
        metadata: { stocktakeId: id, posted, variances: applied.length },
      })

      return NextResponse.json({
        success: true,
        data: {
          _id: stocktake._id,
          reference: stocktake.reference,
          status: stocktake.status,
          summary: {
            totalLines: stocktake.lines.length,
            posted,
            variances: applied.length,
          },
          variances: applied,
        },
      })
    } catch (error) {
      await mongoSession.abortTransaction()
      throw error
    } finally {
      await mongoSession.endSession()
    }
  } catch (error) {
    console.error('Post stocktake error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'
