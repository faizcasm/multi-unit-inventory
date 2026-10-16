import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { Stocktake } from '@/models/Stocktake'
import { Inventory } from '@/models/Inventory'
import { auth } from '@/lib/auth/auth'
import { canUserPerformAction } from '@/lib/permissions'
import { countStocktakeSchema } from '@/lib/validation/stocktakes'
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

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'stocktakes:count')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid stocktake ID' }, { status: 400 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = countStocktakeSchema.safeParse(body)

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

    if (stocktake.status !== 'OPEN' && stocktake.status !== 'COUNTED') {
      return NextResponse.json(
        { success: false, error: 'Only open or counted stocktakes can be (re)counted' },
        { status: 400 }
      )
    }

    const countedAt = new Date()

    for (const input of parsed.data.lines) {
      if (!Types.ObjectId.isValid(input.productId)) {
        return NextResponse.json({ success: false, error: 'Invalid product ID' }, { status: 400 })
      }

      const line = stocktake.lines.find((l) => l.product.toString() === input.productId)
      if (!line) {
        return NextResponse.json(
          { success: false, error: 'One or more products are not part of this stocktake' },
          { status: 400 }
        )
      }

      // The line must have an inventory record at this location to count it.
      const inventory = await Inventory.findOne({
        organization: session.user.organizationId,
        location: stocktake.location,
        product: input.productId,
      })
      if (!inventory) {
        return NextResponse.json(
          {
            success: false,
            error: `No inventory record for ${line.productName} (${line.sku}) at this location`,
          },
          { status: 400 }
        )
      }

      // Snapshot the system quantity as of this exact moment.
      line.systemQuantity = inventory.availableQuantity
      line.countedQuantity = input.countedQuantity
      line.countedBy = session.user.id as any
      line.countedAt = countedAt
      if (input.notes !== undefined) {
        line.notes = input.notes
      }
    }

    if (stocktake.status === 'OPEN') {
      stocktake.status = 'COUNTED'
    }
    await stocktake.save()

    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'STOCKTAKE_COUNT',
      resourceType: 'Stocktake',
      resourceId: stocktake._id,
      metadata: { stocktakeId: id, lines: parsed.data.lines.length },
    })

    return NextResponse.json({ success: true, data: stocktake })
  } catch (error) {
    console.error('Count stocktake error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'
