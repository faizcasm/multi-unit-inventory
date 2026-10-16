import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { StockTransfer } from '@/models/StockTransfer'
import { Inventory } from '@/models/Inventory'
import { InventoryMovement } from '@/models/InventoryMovement'
import { auth } from '@/lib/auth/auth'
import { cancelTransferSchema } from '@/lib/validation/schemas'
import { hasPermission, canUserPerformAction, canTransitionTransfer } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'
import { sendTransferNotification } from '@/lib/transfer-emails'
import { fireTransferHooks } from '@/lib/transfer-hooks'
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

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'transfers:cancel')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid transfer ID' }, { status: 400 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = cancelTransferSchema.safeParse(body)

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
      const hasDestAccess = session.user.locationPermissions.includes(transfer.destinationLocation.toString())
      if (!hasSourceAccess && !hasDestAccess) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
      }
    }

    const validCancelStatuses = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_TRANSIT']
    if (!validCancelStatuses.includes(transfer.status)) {
      return NextResponse.json({ success: false, error: `Cannot cancel transfer in ${transfer.status} status` }, { status: 400 })
    }

    if (!canTransitionTransfer(transfer.status, 'CANCELLED')) {
      return NextResponse.json({ success: false, error: 'Invalid status transition' }, { status: 400 })
    }

    // If transfer was dispatched, need to reverse inventory changes
    if (transfer.status === 'IN_TRANSIT') {
      const mongoSession = await Inventory.startSession()
      mongoSession.startTransaction()

      try {
        // Reverse source location inventory
        const sourceProductIds = transfer.lineItems.map((item) => item.product)
        const sourceInventory = await Inventory.find({
          product: { $in: sourceProductIds },
          location: transfer.sourceLocation,
          organization: session.user.organizationId,
        }).session(mongoSession)

        for (const item of transfer.lineItems) {
          const productId = item.product.toString()
          const dispatched = item.dispatchedQuantity || 0
          const inv = sourceInventory.find((i) => i.product.toString() === productId)

          if (inv && dispatched > 0) {
            const beforeQuantity = {
              available: inv.availableQuantity,
              reserved: inv.reservedQuantity,
              inTransit: inv.inTransitQuantity,
              damaged: inv.damagedQuantity,
            }

            inv.inTransitQuantity -= dispatched
            inv.availableQuantity += dispatched
            inv.lastMovementAt = new Date()
            await inv.save({ session: mongoSession })

            const afterQuantity = {
              available: inv.availableQuantity,
              reserved: inv.reservedQuantity,
              inTransit: inv.inTransitQuantity,
              damaged: inv.damagedQuantity,
            }

            // Movement record for reversal
            await InventoryMovement.create(
              [
                {
                  organization: session.user.organizationId,
                  product: productId,
                  location: transfer.sourceLocation,
                  movementType: 'RELEASE_RESERVATION',
                  quantity: dispatched,
                  referenceType: 'TRANSFER',
                  referenceId: transfer._id,
                  referenceLineItemId: item._id,
                  responsibleUser: session.user.id,
                  reason: `Transfer cancelled: ${parsed.data.cancellationReason}`,
                  beforeQuantity,
                  afterQuantity,
                },
              ],
              { session: mongoSession }
            )
          }
        }

        // Reverse destination location inventory if any was received (shouldn't happen for IN_TRANSIT but safe)
        const destProductIds = transfer.lineItems.map((item) => item.product)
        const destInventory = await Inventory.find({
          product: { $in: destProductIds },
          location: transfer.destinationLocation,
          organization: session.user.organizationId,
        }).session(mongoSession)

        for (const item of transfer.lineItems) {
          const productId = item.product.toString()
          const received = item.receivedQuantity || 0
          const damaged = item.damagedQuantity || 0
          const inv = destInventory.find((i) => i.product.toString() === productId)

          if (inv && (received > 0 || damaged > 0)) {
            const beforeQuantity = {
              available: inv.availableQuantity,
              reserved: inv.reservedQuantity,
              inTransit: inv.inTransitQuantity,
              damaged: inv.damagedQuantity,
            }

            inv.availableQuantity -= received
            inv.damagedQuantity -= damaged
            inv.lastMovementAt = new Date()
            await inv.save({ session: mongoSession })

            const afterQuantity = {
              available: inv.availableQuantity,
              reserved: inv.reservedQuantity,
              inTransit: inv.inTransitQuantity,
              damaged: inv.damagedQuantity,
            }

            await InventoryMovement.create(
              [
                {
                  organization: session.user.organizationId,
                  product: productId,
                  location: transfer.destinationLocation,
                  movementType: 'DISCREPANCY',
                  quantity: -(received + damaged),
                  referenceType: 'TRANSFER',
                  referenceId: transfer._id,
                  referenceLineItemId: item._id,
                  responsibleUser: session.user.id,
                  reason: `Transfer cancelled: ${parsed.data.cancellationReason}`,
                  beforeQuantity,
                  afterQuantity,
                },
              ],
              { session: mongoSession }
            )
          }
        }

        transfer.status = 'CANCELLED'
        transfer.cancelledBy = session.user.id
        transfer.cancelledAt = new Date()
        transfer.cancellationReason = parsed.data.cancellationReason
        transfer.statusHistory.push({
          status: 'CANCELLED',
          changedBy: session.user.id,
          changedAt: new Date(),
          notes: parsed.data.cancellationReason,
        })
        await transfer.save({ session: mongoSession })

        await mongoSession.commitTransaction()

        // Audit log
        await AuditEvent.create({
          organization: session.user.organizationId,
          user: session.user.id,
          action: 'TRANSFER_CANCEL',
          resourceType: 'StockTransfer',
          resourceId: transfer._id,
          metadata: { reference: transfer.reference, cancellationReason: parsed.data.cancellationReason },
        })

        await sendTransferNotification(transfer._id, 'CANCELLED', session.user.id)

        await fireTransferHooks({
          organization: session.user.organizationId,
          event: 'transfer.cancelled',
          transfer,
          actorUserId: session.user.id,
          notifyRoles: ['admin'],
        })

        return NextResponse.json({ success: true, data: transfer })
      } catch (error) {
        await mongoSession.abortTransaction()
        throw error
      } finally {
        await mongoSession.endSession()
      }
    } else {
      // For DRAFT, PENDING_APPROVAL, APPROVED - just update status
      transfer.status = 'CANCELLED'
      transfer.cancelledBy = session.user.id
      transfer.cancelledAt = new Date()
      transfer.cancellationReason = parsed.data.cancellationReason
      transfer.statusHistory.push({
        status: 'CANCELLED',
        changedBy: session.user.id,
        changedAt: new Date(),
        notes: parsed.data.cancellationReason,
      })
      await transfer.save()

      // Audit log
      await AuditEvent.create({
        organization: session.user.organizationId,
        user: session.user.id,
        action: 'TRANSFER_CANCEL',
        resourceType: 'StockTransfer',
        resourceId: transfer._id,
        metadata: { reference: transfer.reference, cancellationReason: parsed.data.cancellationReason },
      })

      await sendTransferNotification(transfer._id, 'CANCELLED', session.user.id)

      await fireTransferHooks({
        organization: session.user.organizationId,
        event: 'transfer.cancelled',
        transfer,
        actorUserId: session.user.id,
        notifyRoles: ['admin'],
      })

      return NextResponse.json({ success: true, data: transfer })
    }
  } catch (error) {
    console.error('Cancel transfer error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'

