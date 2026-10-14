import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { StockTransfer } from '@/models/StockTransfer'
import { Inventory } from '@/models/Inventory'
import { InventoryMovement } from '@/models/InventoryMovement'
import { auth } from '@/lib/auth/auth'
import { dispatchTransferSchema } from '@/lib/validation/schemas'
import { hasPermission, canUserPerformAction, canTransitionTransfer } from '@/lib/permissions'
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

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'transfers:dispatch')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid transfer ID' }, { status: 400 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = dispatchTransferSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const transfer = await StockTransfer.findOne({ _id: id, organization: session.user.organizationId })
    if (!transfer) {
      return NextResponse.json({ success: false, error: 'Transfer not found' }, { status: 404 })
    }

    // Check location permissions
    if (session.user.locationPermissions.length > 0) {
      const hasSourceAccess = session.user.locationPermissions.includes(transfer.sourceLocation.toString())
      if (!hasSourceAccess) {
        return NextResponse.json({ success: false, error: 'Forbidden: No access to source location' }, { status: 403 })
      }
    }

    if (transfer.status !== 'APPROVED') {
      return NextResponse.json({ success: false, error: 'Only approved transfers can be dispatched' }, { status: 400 })
    }

    if (!canTransitionTransfer(transfer.status, 'IN_TRANSIT')) {
      return NextResponse.json({ success: false, error: 'Invalid status transition' }, { status: 400 })
    }

    // Build dispatch quantities map
    const dispatchQuantities = new Map<string, number>()
    for (const item of parsed.data.lineItems) {
      dispatchQuantities.set(item.productId, item.dispatchedQuantity)
    }

    // Validate dispatch quantities
    for (const item of transfer.lineItems) {
      const productId = item.product.toString()
      const dispatched = dispatchQuantities.get(productId)
      const approved = item.approvedQuantity || item.requestedQuantity

      if (dispatched === undefined) {
        return NextResponse.json({ success: false, error: `Missing dispatch quantity for product ${productId}` }, { status: 400 })
      }
      if (dispatched > approved) {
        return NextResponse.json({ success: false, error: `Dispatched quantity cannot exceed approved quantity for product ${productId}` }, { status: 400 })
      }
      if (dispatched < 0) {
        return NextResponse.json({ success: false, error: 'Dispatched quantity cannot be negative' }, { status: 400 })
      }
    }

    // Use transaction for atomic inventory updates
    const mongoSession = await Inventory.startSession()
    mongoSession.startTransaction()

    try {
      // Get current inventory at source location
      const productIds = transfer.lineItems.map((item) => item.product)
      const inventoryRecords = await Inventory.find({
        product: { $in: productIds },
        location: transfer.sourceLocation,
        organization: session.user.organizationId,
      }).session(mongoSession)

      // Validate stock availability and update inventory
      for (const item of transfer.lineItems) {
        const productId = item.product.toString()
        const dispatched = dispatchQuantities.get(productId)!
        const inv = inventoryRecords.find((i) => i.product.toString() === productId)

        if (!inv || inv.availableQuantity < dispatched) {
          await mongoSession.abortTransaction()
          return NextResponse.json({ success: false, error: 'Insufficient stock at source location (concurrent modification)' }, { status: 409 })
        }

        const beforeQuantity = {
          available: inv.availableQuantity,
          reserved: inv.reservedQuantity,
          inTransit: inv.inTransitQuantity,
          damaged: inv.damagedQuantity,
        }

        inv.availableQuantity -= dispatched
        inv.inTransitQuantity += dispatched
        inv.lastMovementAt = new Date()
        await inv.save({ session: mongoSession })

        const afterQuantity = {
          available: inv.availableQuantity,
          reserved: inv.reservedQuantity,
          inTransit: inv.inTransitQuantity,
          damaged: inv.damagedQuantity,
        }

        // Create movement record for dispatch
        await InventoryMovement.create(
          [
            {
              organization: session.user.organizationId,
              product: productId,
              location: transfer.sourceLocation,
              movementType: 'DISPATCH',
              quantity: dispatched,
              referenceType: 'TRANSFER',
              referenceId: transfer._id,
              referenceLineItemId: item._id,
              responsibleUser: session.user.id,
              reason: 'Transfer dispatch',
              beforeQuantity,
              afterQuantity,
            },
          ],
          { session: mongoSession }
        )

        // Update transfer line item
        item.dispatchedQuantity = dispatched
      }

      // Update transfer status
      transfer.status = 'IN_TRANSIT'
      transfer.dispatchedBy = session.user.id
      transfer.dispatchedAt = new Date()
      transfer.statusHistory.push({
        status: 'IN_TRANSIT',
        changedBy: session.user.id,
        changedAt: new Date(),
        notes: 'Transfer dispatched',
      })
      await transfer.save({ session: mongoSession })

      await mongoSession.commitTransaction()

      // Audit log
      await AuditEvent.create({
        organization: session.user.organizationId,
        user: session.user.id,
        action: 'TRANSFER_DISPATCH',
        resourceType: 'StockTransfer',
        resourceId: transfer._id,
        metadata: { reference: transfer.reference },
      })

      return NextResponse.json({ success: true, data: transfer })
    } catch (error) {
      await mongoSession.abortTransaction()
      throw error
    } finally {
      await mongoSession.endSession()
    }
  } catch (error) {
    console.error('Dispatch transfer error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'

