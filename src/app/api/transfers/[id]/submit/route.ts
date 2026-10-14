import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { StockTransfer } from '@/models/StockTransfer'
import { Inventory } from '@/models/Inventory'
import { auth } from '@/lib/auth/auth'
import { submitTransferSchema } from '@/lib/validation/schemas'
import { hasPermission, canUserPerformAction, canTransitionTransfer, getRequiredPermissionForTransition } from '@/lib/permissions'
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

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'transfers:submit')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid transfer ID' }, { status: 400 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = submitTransferSchema.safeParse(body)

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

    if (transfer.status !== 'DRAFT') {
      return NextResponse.json({ success: false, error: 'Only draft transfers can be submitted' }, { status: 400 })
    }

    if (!canTransitionTransfer(transfer.status, 'PENDING_APPROVAL')) {
      return NextResponse.json({ success: false, error: 'Invalid status transition' }, { status: 400 })
    }

    // Re-validate stock availability
    const productIds = transfer.lineItems.map((item) => item.product)
    const inventory = await Inventory.find({
      product: { $in: productIds },
      location: transfer.sourceLocation,
      organization: session.user.organizationId,
    })

    for (const item of transfer.lineItems) {
      const inv = inventory.find((i) => i.product.toString() === item.product.toString())
      const available = inv?.availableQuantity || 0
      if (available < item.requestedQuantity) {
        return NextResponse.json({ success: false, error: 'Insufficient stock at source location' }, { status: 400 })
      }
    }

    // Update transfer status
    transfer.status = 'PENDING_APPROVAL'
    transfer.statusHistory.push({
      status: 'PENDING_APPROVAL',
      changedBy: session.user.id,
      changedAt: new Date(),
      notes: 'Transfer submitted for approval',
    })
    await transfer.save()

    // Audit log
    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'TRANSFER_SUBMIT',
      resourceType: 'StockTransfer',
      resourceId: transfer._id,
      metadata: { reference: transfer.reference },
    })

    return NextResponse.json({ success: true, data: transfer })
  } catch (error) {
    console.error('Submit transfer error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'

