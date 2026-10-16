import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { Inventory } from '@/models/Inventory'
import { InventoryMovement } from '@/models/InventoryMovement'
import { auth } from '@/lib/auth/auth'
import { canUserPerformAction } from '@/lib/permissions'
import { reserveStockSchema } from '@/lib/validation/stocktakes'
import { AuditEvent } from '@/models/AuditEvent'
import { Types } from 'mongoose'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'inventory:adjust')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = reserveStockSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { inventoryId, quantity } = parsed.data

    if (!Types.ObjectId.isValid(inventoryId)) {
      return NextResponse.json({ success: false, error: 'Invalid inventory ID' }, { status: 400 })
    }

    const existing = await Inventory.findOne({ _id: inventoryId, organization: session.user.organizationId })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Inventory record not found' }, { status: 404 })
    }

    // Location access check
    const locationId = String(existing.location)
    if (
      session.user.locationPermissions.length > 0 &&
      !session.user.locationPermissions.map(String).includes(locationId)
    ) {
      return NextResponse.json({ success: false, error: 'Forbidden: No access to this location' }, { status: 403 })
    }

    if (existing.reservedQuantity < quantity) {
      return NextResponse.json(
        { success: false, error: 'Insufficient reserved stock', details: { reserved: existing.reservedQuantity } },
        { status: 400 }
      )
    }

    const productId = String(existing.product)

    // Same transaction style as the inventory adjust route.
    const mongoSession = await Inventory.startSession()
    mongoSession.startTransaction()

    try {
      const inventory = await Inventory.findOne({
        _id: inventoryId,
        organization: session.user.organizationId,
      }).session(mongoSession)

      if (!inventory) {
        await mongoSession.abortTransaction()
        return NextResponse.json({ success: false, error: 'Inventory record not found' }, { status: 404 })
      }

      if (inventory.reservedQuantity < quantity) {
        await mongoSession.abortTransaction()
        return NextResponse.json(
          { success: false, error: 'Insufficient reserved stock', details: { reserved: inventory.reservedQuantity } },
          { status: 400 }
        )
      }

      const now = new Date()
      const beforeQuantity = {
        available: inventory.availableQuantity,
        reserved: inventory.reservedQuantity,
        inTransit: inventory.inTransitQuantity,
        damaged: inventory.damagedQuantity,
      }

      inventory.reservedQuantity -= quantity
      inventory.availableQuantity += quantity
      inventory.lastMovementAt = now
      await inventory.save({ session: mongoSession })

      const afterQuantity = {
        available: inventory.availableQuantity,
        reserved: inventory.reservedQuantity,
        inTransit: inventory.inTransitQuantity,
        damaged: inventory.damagedQuantity,
      }

      // Signed change in available stock (available increases by `quantity`),
      // mirroring how the adjust route stores movement quantities.
      await InventoryMovement.create(
        [
          {
            organization: session.user.organizationId,
            product: inventory.product,
            location: inventory.location,
            movementType: 'RELEASE_RESERVATION',
            quantity,
            referenceType: 'ADJUSTMENT',
            referenceId: inventory._id,
            responsibleUser: session.user.id,
            reason: 'Stock reservation release',
            beforeQuantity,
            afterQuantity,
          },
        ],
        { session: mongoSession }
      )

      await mongoSession.commitTransaction()

      await AuditEvent.create({
        organization: session.user.organizationId,
        user: session.user.id,
        action: 'INVENTORY_RELEASE',
        resourceType: 'Inventory',
        resourceId: inventory._id,
        metadata: { productId, locationId, quantity },
      })

      return NextResponse.json({
        success: true,
        data: {
          inventory: {
            _id: inventory._id,
            product: inventory.product,
            location: inventory.location,
            availableQuantity: inventory.availableQuantity,
            reservedQuantity: inventory.reservedQuantity,
            inTransitQuantity: inventory.inTransitQuantity,
            damagedQuantity: inventory.damagedQuantity,
          },
        },
      })
    } catch (error) {
      await mongoSession.abortTransaction()
      throw error
    } finally {
      await mongoSession.endSession()
    }
  } catch (error) {
    console.error('Release stock error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'
