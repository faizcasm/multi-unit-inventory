import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { StockTransfer } from '@/models/StockTransfer'
import { Inventory } from '@/models/Inventory'
import { InventoryMovement } from '@/models/InventoryMovement'
import { auth } from '@/lib/auth/auth'
import { receiveTransferSchema } from '@/lib/validation/schemas'
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

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'transfers:receive')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid transfer ID' }, { status: 400 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = receiveTransferSchema.safeParse(body)

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

    // Check location permissions - must have access to destination
    if (session.user.locationPermissions.length > 0) {
      const hasDestAccess = session.user.locationPermissions.includes(transfer.destinationLocation.toString())
      if (!hasDestAccess) {
        return NextResponse.json({ success: false, error: 'Forbidden: No access to destination location' }, { status: 403 })
      }
    }

    if (transfer.status !== 'IN_TRANSIT') {
      return NextResponse.json({ success: false, error: 'Only in-transit transfers can be received' }, { status: 400 })
    }

    if (!canTransitionTransfer(transfer.status, 'COMPLETED')) {
      return NextResponse.json({ success: false, error: 'Invalid status transition' }, { status: 400 })
    }

    // Build receive quantities map
    const receiveData = new Map<string, { received: number; missing: number; damaged: number; notes?: string }>()
    for (const item of parsed.data.lineItems) {
      receiveData.set(item.productId, {
        received: item.receivedQuantity,
        missing: item.missingQuantity,
        damaged: item.damagedQuantity,
        notes: item.notes,
      })
    }

    // Validate receive quantities
    for (const item of transfer.lineItems) {
      const productId = item.product.toString()
      const data = receiveData.get(productId)
      const dispatched = item.dispatchedQuantity || 0

      if (!data) {
        return NextResponse.json({ success: false, error: `Missing receive data for product ${productId}` }, { status: 400 })
      }

      const totalAccounted = data.received + data.missing + data.damaged
      if (totalAccounted !== dispatched) {
        return NextResponse.json(
          { success: false, error: `Received + missing + damaged (${totalAccounted}) must equal dispatched (${dispatched}) for product ${productId}` },
          { status: 400 }
        )
      }
    }

    // Use transaction for atomic inventory updates
    const mongoSession = await Inventory.startSession()
    mongoSession.startTransaction()

    try {
      // Update source location inventory (reduce in-transit)
      const sourceProductIds = transfer.lineItems.map((item) => item.product)
      const sourceInventory = await Inventory.find({
        product: { $in: sourceProductIds },
        location: transfer.sourceLocation,
        organization: session.user.organizationId,
      }).session(mongoSession)

      for (const item of transfer.lineItems) {
        const productId = item.product.toString()
        const dispatched = item.dispatchedQuantity || 0
        const data = receiveData.get(productId)!
        const inv = sourceInventory.find((i) => i.product.toString() === productId)

        if (inv) {
          const beforeQuantity = {
            available: inv.availableQuantity,
            reserved: inv.reservedQuantity,
            inTransit: inv.inTransitQuantity,
            damaged: inv.damagedQuantity,
          }

          inv.inTransitQuantity -= dispatched
          inv.lastMovementAt = new Date()
          await inv.save({ session: mongoSession })

          const afterQuantity = {
            available: inv.availableQuantity,
            reserved: inv.reservedQuantity,
            inTransit: inv.inTransitQuantity,
            damaged: inv.damagedQuantity,
          }

          // Movement for source: reduce in-transit
          await InventoryMovement.create(
            [
              {
                organization: session.user.organizationId,
                product: productId,
                location: transfer.sourceLocation,
                movementType: 'DISCREPANCY',
                quantity: -dispatched,
                referenceType: 'TRANSFER',
                referenceId: transfer._id,
                referenceLineItemId: item._id,
                responsibleUser: session.user.id,
                reason: `Transfer receipt: ${data.missing} missing, ${data.damaged} damaged`,
                beforeQuantity,
                afterQuantity,
              },
            ],
            { session: mongoSession }
          )
        }

        // Update transfer line item
        item.receivedQuantity = data.received
        item.missingQuantity = data.missing
        item.damagedQuantity = data.damaged
        item.notes = data.notes
      }

      // Update destination location inventory
      const destProductIds = transfer.lineItems.map((item) => item.product)
      let destInventory = await Inventory.find({
        product: { $in: destProductIds },
        location: transfer.destinationLocation,
        organization: session.user.organizationId,
      }).session(mongoSession)

      // Create map for quick lookup
      const destInvMap = new Map(destInventory.map((i) => [i.product.toString(), i]))

      for (const item of transfer.lineItems) {
        const productId = item.product.toString()
        const data = receiveData.get(productId)!
        let inv = destInvMap.get(productId)

        const beforeQuantity = inv
          ? {
              available: inv.availableQuantity,
              reserved: inv.reservedQuantity,
              inTransit: inv.inTransitQuantity,
              damaged: inv.damagedQuantity,
            }
          : {
              available: 0,
              reserved: 0,
              inTransit: 0,
              damaged: 0,
            }

        if (!inv) {
          if (data.received > 0) {
            inv = await Inventory.create(
              [
                {
                  organization: session.user.organizationId,
                  product: productId,
                  location: transfer.destinationLocation,
                  availableQuantity: data.received,
                  reservedQuantity: 0,
                  inTransitQuantity: 0,
                  damagedQuantity: data.damaged,
                  lastMovementAt: new Date(),
                },
              ],
              { session: mongoSession }
            )
            inv = inv[0]
            destInvMap.set(productId, inv)
          } else if (data.damaged > 0) {
            inv = await Inventory.create(
              [
                {
                  organization: session.user.organizationId,
                  product: productId,
                  location: transfer.destinationLocation,
                  availableQuantity: 0,
                  reservedQuantity: 0,
                  inTransitQuantity: 0,
                  damagedQuantity: data.damaged,
                  lastMovementAt: new Date(),
                },
              ],
              { session: mongoSession }
            )
            inv = inv[0]
            destInvMap.set(productId, inv)
          }
        } else {
          inv.availableQuantity += data.received
          inv.damagedQuantity += data.damaged
          inv.lastMovementAt = new Date()
          await inv.save({ session: mongoSession })
        }

        if (inv) {
          const afterQuantity = {
            available: inv.availableQuantity,
            reserved: inv.reservedQuantity,
            inTransit: inv.inTransitQuantity,
            damaged: inv.damagedQuantity,
          }

          // Movement for destination: receive and damaged
          if (data.received > 0) {
            await InventoryMovement.create(
              [
                {
                  organization: session.user.organizationId,
                  product: productId,
                  location: transfer.destinationLocation,
                  movementType: 'RECEIPT',
                  quantity: data.received,
                  referenceType: 'TRANSFER',
                  referenceId: transfer._id,
                  referenceLineItemId: item._id,
                  responsibleUser: session.user.id,
                  reason: 'Transfer receipt',
                  beforeQuantity,
                  afterQuantity,
                },
              ],
              { session: mongoSession }
            )
          }

          if (data.damaged > 0) {
            await InventoryMovement.create(
              [
                {
                  organization: session.user.organizationId,
                  product: productId,
                  location: transfer.destinationLocation,
                  movementType: 'DAMAGED',
                  quantity: data.damaged,
                  referenceType: 'TRANSFER',
                  referenceId: transfer._id,
                  referenceLineItemId: item._id,
                  responsibleUser: session.user.id,
                  reason: 'Damaged during transfer',
                  beforeQuantity,
                  afterQuantity,
                },
              ],
              { session: mongoSession }
            )
          }
        }
      }

      // Update transfer status
      transfer.status = 'COMPLETED'
      transfer.receivedBy = session.user.id
      transfer.receivedAt = new Date()
      transfer.receiptNotes = parsed.data.receiptNotes
      transfer.statusHistory.push({
        status: 'COMPLETED',
        changedBy: session.user.id,
        changedAt: new Date(),
        notes: parsed.data.receiptNotes || 'Transfer received and completed',
      })
      await transfer.save({ session: mongoSession })

      await mongoSession.commitTransaction()

      // Audit log
      await AuditEvent.create({
        organization: session.user.organizationId,
        user: session.user.id,
        action: 'TRANSFER_RECEIVE',
        resourceType: 'StockTransfer',
        resourceId: transfer._id,
        metadata: { reference: transfer.reference, receiptNotes: parsed.data.receiptNotes },
      })

      await sendTransferNotification(transfer._id, 'RECEIVED', session.user.id)

      await fireTransferHooks({
        organization: session.user.organizationId,
        event: 'transfer.received',
        transfer,
        actorUserId: session.user.id,
      })

      return NextResponse.json({ success: true, data: transfer })
    } catch (error) {
      await mongoSession.abortTransaction()
      throw error
    } finally {
      await mongoSession.endSession()
    }
  } catch (error) {
    console.error('Receive transfer error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'

