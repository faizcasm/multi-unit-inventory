import { NextRequest, NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { connectDB } from '@/lib/db/mongodb'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { Webhook, WebhookDelivery } from '@/models/Webhook'
import { AuditEvent } from '@/models/AuditEvent'
import { Organization } from '@/models/Organization'
import { dispatchWebhookTo } from '@/lib/webhooks'

/**
 * Sends a real `webhook.test` delivery to this one endpoint and returns the
 * recorded result so the UI can show pass/fail immediately.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    }).select('+secret') as any
    if (!hook) {
      return NextResponse.json({ success: false, error: 'Webhook not found' }, { status: 404 })
    }

    const org = await Organization.findById(session.user.organizationId)
      .select('name')
      .lean() as any

    const deliveryId = await dispatchWebhookTo(
      { _id: hook._id, url: hook.url, secret: hook.secret },
      {
        organization: session.user.organizationId,
        event: 'webhook.test',
        payload: {
          message: 'Test delivery from Ricoz Inventory',
          organization: org?.name || 'Ricoz Inventory',
          webhookId: String(hook._id),
        },
      }
    )

    const delivery = deliveryId
      ? await WebhookDelivery.findById(deliveryId).lean() as any
      : null

    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'WEBHOOK_TEST',
      resourceType: 'Webhook',
      resourceId: hook._id,
      metadata: {
        url: hook.url,
        status: delivery?.status ?? 'FAILED',
        responseStatus: delivery?.responseStatus ?? null,
      },
    })

    if (!delivery) {
      return NextResponse.json(
        { success: false, error: 'Test delivery could not be recorded' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        delivery: {
          _id: String(delivery._id),
          event: delivery.event,
          status: delivery.status,
          responseStatus: delivery.responseStatus ?? null,
          error: delivery.error ?? null,
          durationMs: delivery.durationMs ?? null,
          createdAt: delivery.createdAt,
        },
      },
    })
  } catch (error) {
    console.error('Test webhook error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
