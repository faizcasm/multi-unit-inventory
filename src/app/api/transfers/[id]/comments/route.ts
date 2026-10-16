import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { auth } from '@/lib/auth/auth'
import { StockTransfer } from '@/models/StockTransfer'
import { TransferComment } from '@/models/TransferComment'
import { commentBodySchema } from '@/lib/validation/collab'
import { hasPermission } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'
import { createNotification } from '@/lib/notify'
import { Types } from 'mongoose'

/**
 * GET  /api/transfers/[id]/comments
 *   → { success, data: [{ _id, body, user: {_id, name, avatar?}, createdAt }] } (oldest-first, up to 100)
 * POST /api/transfers/[id]/comments  body { body }
 *   → { success, data: { comment } } 201
 * Both require `transfers:read` — anyone who can see the transfer can discuss it.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'transfers:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid transfer ID' }, { status: 400 })
    }

    await connectDB()

    const transfer = await StockTransfer.findOne({
      _id: id,
      organization: session.user.organizationId,
    }).select('_id')
    if (!transfer) {
      return NextResponse.json({ success: false, error: 'Transfer not found' }, { status: 404 })
    }

    // Newest 100 comments, returned oldest-first for a natural timeline.
    const comments = await TransferComment.find({ transfer: id, organization: session.user.organizationId })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('user', 'name avatar')
      .lean()

    return NextResponse.json({ success: true, data: comments.reverse() })
  } catch (error) {
    console.error('Get transfer comments error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'transfers:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid transfer ID' }, { status: 400 })
    }

    await connectDB()

    const body = await request.json().catch(() => null)
    const parsed = commentBodySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const transfer = await StockTransfer.findOne({
      _id: id,
      organization: session.user.organizationId,
    }).select('_id reference requester approver dispatchedBy receivedBy')
    if (!transfer) {
      return NextResponse.json({ success: false, error: 'Transfer not found' }, { status: 404 })
    }

    const comment = await TransferComment.create({
      organization: session.user.organizationId,
      transfer: transfer._id,
      user: session.user.id,
      body: parsed.data.body,
    })

    // Audit log
    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'TRANSFER_COMMENT',
      resourceType: 'transfer',
      resourceId: transfer._id,
      metadata: { commentId: comment._id },
    })

    // Fire-and-forget: notify everyone involved with this transfer except the author.
    const recipients = Array.from(
      new Set(
        [transfer.requester, transfer.approver, transfer.dispatchedBy, transfer.receivedBy]
          .filter(Boolean)
          .map((userId) => String(userId))
      )
    ).filter((userId) => userId !== String(session.user.id))

    void createNotification({
      organization: session.user.organizationId,
      event: 'TRANSFER_COMMENT',
      title: `${session.user.name} commented on ${transfer.reference}`,
      body: parsed.data.body.slice(0, 120),
      link: `/dashboard/transfers/${id}`,
      actorUserId: session.user.id,
      recipients,
    })

    const created = await TransferComment.findById(comment._id).populate('user', 'name avatar').lean()

    return NextResponse.json({ success: true, data: { comment: created } }, { status: 201 })
  } catch (error) {
    console.error('Create transfer comment error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
