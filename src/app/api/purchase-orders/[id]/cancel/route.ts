import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { PurchaseOrder } from '@/models/PurchaseOrder'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'
import { cancelPurchaseOrderSchema } from '@/lib/validation/purchase-orders'
import { Types } from 'mongoose'

const CANCELLABLE_STATUSES = ['DRAFT', 'SENT', 'PARTIALLY_RECEIVED']

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'purchase_orders:cancel')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid purchase order ID' }, { status: 400 })
    }

    await connectDB()

    const body = (await request.json().catch(() => ({}))) as unknown
    const parsed = cancelPurchaseOrderSchema.safeParse(body ?? {})

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const purchaseOrder = await PurchaseOrder.findOne({
      _id: id,
      organization: session.user.organizationId,
    })
    if (!purchaseOrder) {
      return NextResponse.json({ success: false, error: 'Purchase order not found' }, { status: 404 })
    }

    if (!CANCELLABLE_STATUSES.includes(purchaseOrder.status)) {
      return NextResponse.json(
        { success: false, error: `Cannot cancel a ${purchaseOrder.status} purchase order` },
        { status: 400 }
      )
    }

    const { reason } = parsed.data
    const alreadyReceived = purchaseOrder.lines.reduce(
      (sum: number, l: any) => sum + (l.receivedQuantity || 0),
      0
    )

    // Received quantities stay on the books — only the open balance is cancelled.
    if (reason && reason.trim()) {
      const note = `Cancelled: ${reason.trim()}`
      purchaseOrder.notes = purchaseOrder.notes ? `${purchaseOrder.notes}\n${note}`.slice(0, 1000) : note
    }

    purchaseOrder.status = 'CANCELLED'
    purchaseOrder.cancelledBy = session.user.id as any
    purchaseOrder.cancelledAt = new Date()
    await purchaseOrder.save()

    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'PURCHASE_ORDER_CANCEL',
      resourceType: 'purchase_order',
      resourceId: purchaseOrder._id,
      metadata: { reference: purchaseOrder.reference, reason: reason || '', alreadyReceived },
    })

    return NextResponse.json({
      success: true,
      data: {
        _id: purchaseOrder._id,
        reference: purchaseOrder.reference,
        status: purchaseOrder.status,
        cancelledAt: purchaseOrder.cancelledAt,
        alreadyReceived,
      },
    })
  } catch (error) {
    console.error('Cancel purchase order error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
