import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { StockTransfer } from '@/models/StockTransfer'
import { Inventory } from '@/models/Inventory'
import { InventoryMovement } from '@/models/InventoryMovement'
import { auth } from '@/lib/auth/auth'
import { approveTransferSchema } from '@/lib/validation/schemas'
import { hasPermission, canUserPerformAction, canTransitionTransfer, canApproveOwnTransfer } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'
import { sendTransferNotification } from '@/lib/transfer-emails'
import { fireTransferHooks } from '@/lib/transfer-hooks'
import { Organization } from '@/models/Organization'
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

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'transfers:approve')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid transfer ID' }, { status: 400 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = approveTransferSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const transfer = await StockTransfer.findOne({ _id: id, organization: session.user.organizationId })
      .populate('sourceLocation')
      .populate('destinationLocation')
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

    if (transfer.status !== 'PENDING_APPROVAL') {
      return NextResponse.json({ success: false, error: 'Only pending approval transfers can be approved' }, { status: 400 })
    }

    if (!canTransitionTransfer(transfer.status, 'APPROVED')) {
      return NextResponse.json({ success: false, error: 'Invalid status transition' }, { status: 400 })
    }

    // Check separation of duties
    const org = await Organization.findById(session.user.organizationId)
    if (!canApproveOwnTransfer(org?.settings.separationOfDuties ?? true, transfer.requester, session.user.id)) {
      return NextResponse.json({ success: false, error: 'Cannot approve your own transfer (separation of duties enabled)' }, { status: 403 })
    }

    // Re-validate stock availability
    const productIds = transfer.lineItems.map((item) => item.product)
    const inventory = await Inventory.find({
      product: { $in: productIds },
      location: transfer.sourceLocation,
      organization: session.user.organizationId,
    })

    // Use line item approvals if provided, otherwise use requested quantities
    const approvals = new Map<string, number>()
    if (parsed.data.lineItems) {
      for (const item of parsed.data.lineItems) {
        approvals.set(item.productId, item.approvedQuantity)
      }
    }

    for (const item of transfer.lineItems) {
      const inv = inventory.find((i) => i.product.toString() === item.product.toString())
      const available = inv?.availableQuantity || 0
      const approvedQty = approvals.has(item.product.toString()) ? approvals.get(item.product.toString())! : item.requestedQuantity

      if (approvedQty > item.requestedQuantity) {
        return NextResponse.json({ success: false, error: `Approved quantity cannot exceed requested quantity for product ${item.product}` }, { status: 400 })
      }
      if (available < approvedQty) {
        return NextResponse.json({ success: false, error: 'Insufficient stock at source location' }, { status: 400 })
      }
    }

    // Update transfer with approved quantities
    if (parsed.data.lineItems) {
      for (const item of transfer.lineItems) {
        const approval = parsed.data.lineItems!.find((a) => a.productId === item.product.toString())
        if (approval) {
          item.approvedQuantity = approval.approvedQuantity
        } else {
          item.approvedQuantity = item.requestedQuantity
        }
      }
    } else {
      for (const item of transfer.lineItems) {
        item.approvedQuantity = item.requestedQuantity
      }
    }

    transfer.status = 'APPROVED'
    transfer.approver = session.user.id
    transfer.approvedAt = new Date()
    transfer.approvalNotes = parsed.data.approvalNotes
    transfer.statusHistory.push({
      status: 'APPROVED',
      changedBy: session.user.id,
      changedAt: new Date(),
      notes: parsed.data.approvalNotes || 'Transfer approved',
    })
    await transfer.save()

    // Audit log
    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'TRANSFER_APPROVE',
      resourceType: 'StockTransfer',
      resourceId: transfer._id,
      metadata: { reference: transfer.reference, approvalNotes: parsed.data.approvalNotes },
    })

    await sendTransferNotification(transfer._id, 'APPROVED', session.user.id)

    await fireTransferHooks({
      organization: session.user.organizationId,
      event: 'transfer.approved',
      transfer,
      actorUserId: session.user.id,
    })

    return NextResponse.json({ success: true, data: transfer })
  } catch (error) {
    console.error('Approve transfer error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'

