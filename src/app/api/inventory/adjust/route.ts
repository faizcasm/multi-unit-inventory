import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { Inventory } from '@/models/Inventory'
import { Product } from '@/models/Product'
import { Location } from '@/models/Location'
import { InventoryMovement } from '@/models/InventoryMovement'
import { auth } from '@/lib/auth/auth'
import { inventoryAdjustmentSchema } from '@/lib/validation/schemas'
import { hasPermission, canUserPerformAction } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'
import { dispatchWebhook } from '@/lib/webhooks'
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
    const parsed = inventoryAdjustmentSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { productId, locationId, adjustmentQuantity, reason, notes } = parsed.data

    if (!Types.ObjectId.isValid(productId) || !Types.ObjectId.isValid(locationId)) {
      return NextResponse.json({ success: false, error: 'Invalid product or location ID' }, { status: 400 })
    }

    // Check location access
    if (session.user.locationPermissions.length > 0) {
      const hasAccess = session.user.locationPermissions.includes(locationId)
      if (!hasAccess) {
        return NextResponse.json({ success: false, error: 'Forbidden: No access to this location' }, { status: 403 })
      }
    }

    // Verify product and location exist and are active
    const [product, location] = await Promise.all([
      Product.findOne({ _id: productId, organization: session.user.organizationId, isActive: true }),
      Location.findOne({ _id: locationId, organization: session.user.organizationId, isActive: true }),
    ])

    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found or inactive' }, { status: 404 })
    }
    if (!location) {
      return NextResponse.json({ success: false, error: 'Location not found or inactive' }, { status: 404 })
    }

    // Use transaction for atomicity
    const mongoSession = await Inventory.startSession()
    mongoSession.startTransaction()

    try {
      // Get or create inventory record
      let inventory = await Inventory.findOne({
        product: productId,
        location: locationId,
        organization: session.user.organizationId,
      }).session(mongoSession)

      const beforeQuantity = {
        available: inventory?.availableQuantity || 0,
        reserved: inventory?.reservedQuantity || 0,
        inTransit: inventory?.inTransitQuantity || 0,
        damaged: inventory?.damagedQuantity || 0,
      }

      if (!inventory) {
        if (adjustmentQuantity < 0) {
          await mongoSession.abortTransaction()
          return NextResponse.json({ success: false, error: 'Cannot adjust negative quantity for new inventory record' }, { status: 400 })
        }
        inventory = await Inventory.create(
          [
            {
              organization: session.user.organizationId,
              product: productId,
              location: locationId,
              availableQuantity: adjustmentQuantity,
              reservedQuantity: 0,
              inTransitQuantity: 0,
              damagedQuantity: 0,
              lastMovementAt: new Date(),
            },
          ],
          { session: mongoSession }
        )
        inventory = inventory[0]
      } else {
        const newAvailable = inventory.availableQuantity + adjustmentQuantity
        if (newAvailable < 0) {
          await mongoSession.abortTransaction()
          return NextResponse.json({ success: false, error: 'Adjustment would result in negative available stock' }, { status: 400 })
        }
        inventory.availableQuantity = newAvailable
        inventory.lastMovementAt = new Date()
        await inventory.save({ session: mongoSession })
      }

      const afterQuantity = {
        available: inventory.availableQuantity,
        reserved: inventory.reservedQuantity,
        inTransit: inventory.inTransitQuantity,
        damaged: inventory.damagedQuantity,
      }

      // Create movement record
      await InventoryMovement.create(
        [
          {
            organization: session.user.organizationId,
            product: productId,
            location: locationId,
            movementType: 'ADJUSTMENT',
            quantity: adjustmentQuantity,
            referenceType: 'ADJUSTMENT',
            referenceId: inventory._id,
            responsibleUser: session.user.id,
            reason,
            beforeQuantity,
            afterQuantity,
            notes,
          },
        ],
        { session: mongoSession }
      )

      await mongoSession.commitTransaction()

      // Audit log
      await AuditEvent.create({
        organization: session.user.organizationId,
        user: session.user.id,
        action: 'INVENTORY_ADJUST',
        resourceType: 'Inventory',
        resourceId: inventory._id,
        metadata: { productId, locationId, adjustmentQuantity, reason },
      })

      await dispatchWebhook({
        organization: session.user.organizationId,
        event: 'inventory.adjusted',
        payload: {
          productId,
          locationId,
          adjustmentQuantity,
          reason,
          availableAfter: inventory.availableQuantity,
        },
      })

      return NextResponse.json({
        success: true,
        data: {
          inventory: {
            _id: inventory._id,
            product: productId,
            location: locationId,
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
    console.error('Inventory adjustment error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'

