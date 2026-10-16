import { NextRequest, NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { connectDB } from '@/lib/db/mongodb'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { Webhook, WebhookDelivery } from '@/models/Webhook'

/** Delivery history for one webhook, newest first. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'integrations:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid webhook ID' }, { status: 400 })
    }

    await connectDB()

    const hook = await Webhook.exists({
      _id: id,
      organization: session.user.organizationId,
    })
    if (!hook) {
      return NextResponse.json({ success: false, error: 'Webhook not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20))

    const query = { webhook: new Types.ObjectId(id), organization: session.user.organizationId }
    const total = await WebhookDelivery.countDocuments(query)
    const deliveries = await WebhookDelivery.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean() as any

    return NextResponse.json({
      success: true,
      data: (deliveries || []).map((d: any) => ({
        _id: String(d._id),
        event: d.event,
        status: d.status,
        responseStatus: d.responseStatus ?? null,
        error: d.error ?? null,
        durationMs: d.durationMs ?? null,
        createdAt: d.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('List webhook deliveries error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
