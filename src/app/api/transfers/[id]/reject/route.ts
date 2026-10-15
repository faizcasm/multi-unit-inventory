import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { StockTransfer } from '@/models/StockTransfer'
import { auth } from '@/lib/auth/auth'
import { rejectTransferSchema } from '@/lib/validation/schemas'
import { hasPermission, canUserPerformAction, canTransitionTransfer } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'
import { sendTransferNotification } from '@/lib/transfer-emails'
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

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'transfers:reject')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid transfer ID' }, { status: 400 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = rejectTransferSchema.safeParse(body)

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

    if (transfer.status !== 'PENDING_APPROVAL') {
      return NextResponse.json({ success: false, error: 'Only pending approval transfers can be rejected' }, { status: 400 })
    }

    if (!canTransitionTransfer(transfer.status, 'REJECTED')) {
      return NextResponse.json({ success: false, error: 'Invalid status transition' }, { status: 400 })
    }

    // Check separation of duties - approver should not be requester
    if (transfer.requester.toString() === session.user.id) {
      return NextResponse.json({ success: false, error: 'Cannot reject your own transfer' }, { status: 403 })
    }

    transfer.status = 'REJECTED'
    transfer.approver = session.user.id
    transfer.approvedAt = new Date()
    transfer.rejectionReason = parsed.data.rejectionReason
    transfer.statusHistory.push({
      status: 'REJECTED',
      changedBy: session.user.id,
      changedAt: new Date(),
      notes: parsed.data.rejectionReason,
    })
    await transfer.save()

    // Audit log
    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'TRANSFER_REJECT',
      resourceType: 'StockTransfer',
      resourceId: transfer._id,
      metadata: { reference: transfer.reference, rejectionReason: parsed.data.rejectionReason },
    })

    await sendTransferNotification(transfer._id, 'REJECTED', session.user.id)

    return NextResponse.json({ success: true, data: transfer })
  } catch (error) {
    console.error('Reject transfer error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'

