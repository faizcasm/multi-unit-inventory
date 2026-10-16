import { NextRequest, NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { connectDB } from '@/lib/db/mongodb'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { Webhook, WebhookDelivery } from '@/models/Webhook'
import { AuditEvent } from '@/models/AuditEvent'
import { webhookUpdateSchema } from '@/lib/validation/integrations'

function toPublicWebhook(hook: any) {
  return {
    _id: String(hook._id),
    url: hook.url,
    events: hook.events || [],
    description: hook.description || '',
    isActive: hook.isActive,
    stats: {
      delivered: hook.stats?.delivered ?? 0,
      failed: hook.stats?.failed ?? 0,
      lastStatus: hook.stats?.lastStatus ?? null,
      lastTriggeredAt: hook.stats?.lastTriggeredAt ?? null,
    },
    createdAt: hook.createdAt,
    updatedAt: hook.updatedAt,
  }
}

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'integrations:manage')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid webhook ID' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const parsed = webhookUpdateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const updates = parsed.data
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 })
    }

    await connectDB()

    const hook = await Webhook.findOne({
      _id: id,
      organization: session.user.organizationId,
    })
    if (!hook) {
      return NextResponse.json({ success: false, error: 'Webhook not found' }, { status: 404 })
    }

    if (updates.url !== undefined) hook.url = updates.url
    if (updates.events !== undefined) hook.events = updates.events
    if (updates.isActive !== undefined) hook.isActive = updates.isActive
    if (updates.description !== undefined) hook.description = updates.description
    await hook.save()

    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'WEBHOOK_UPDATE',
      resourceType: 'Webhook',
      resourceId: hook._id,
      metadata: { changes: updates },
    })

    return NextResponse.json({ success: true, data: toPublicWebhook(hook) })
  } catch (error) {
    console.error('Update webhook error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'integrations:manage')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid webhook ID' }, { status: 400 })
    }

    await connectDB()

    const hook = await Webhook.findOne({
      _id: id,
      organization: session.user.organizationId,
    })
    if (!hook) {
      return NextResponse.json({ success: false, error: 'Webhook not found' }, { status: 404 })
    }

    // Deliveries are pure history — remove them with the endpoint.
    await WebhookDelivery.deleteMany({ webhook: hook._id })
    await hook.deleteOne()

    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'WEBHOOK_DELETE',
      resourceType: 'Webhook',
      resourceId: hook._id,
      metadata: { url: hook.url, events: hook.events },
    })

    return NextResponse.json({ success: true, data: { deleted: true } })
  } catch (error) {
    console.error('Delete webhook error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
