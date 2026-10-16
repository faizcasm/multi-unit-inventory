import { NextRequest, NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { connectDB } from '@/lib/db/mongodb'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { Webhook, WebhookDelivery } from '@/models/Webhook'
import { AuditEvent } from '@/models/AuditEvent'
import { generateWebhookSecret } from '@/lib/webhooks'
import { webhookCreateSchema } from '@/lib/validation/integrations'

/** Public shape of a webhook — the secret is never included. */
function toPublicWebhook(hook: any, lastDelivery?: any) {
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
    lastDelivery: lastDelivery
      ? {
          status: lastDelivery.status,
          responseStatus: lastDelivery.responseStatus ?? null,
          error: lastDelivery.error ?? null,
          createdAt: lastDelivery.createdAt,
        }
      : null,
    createdAt: hook.createdAt,
    updatedAt: hook.updatedAt,
  }
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'integrations:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const hooks = await Webhook.find({ organization: session.user.organizationId })
      .sort({ createdAt: -1 })
      .lean() as any

    // Most recent delivery per webhook, for the "last attempt" column.
    const lastDeliveries = await WebhookDelivery.aggregate([
      { $match: { organization: new Types.ObjectId(session.user.organizationId) } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$webhook', doc: { $first: '$$ROOT' } } },
    ]).catch(() => [])

    const lastByHook = new Map<string, any>()
    lastDeliveries.forEach((row: any) => lastByHook.set(String(row._id), row.doc))

    return NextResponse.json({
      success: true,
      data: (hooks || []).map((hook: any) =>
        toPublicWebhook(hook, lastByHook.get(String(hook._id)))
      ),
    })
  } catch (error) {
    console.error('List webhooks error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'integrations:manage')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const parsed = webhookCreateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    await connectDB()

    const secret = generateWebhookSecret()
    const doc = await Webhook.create({
      organization: session.user.organizationId,
      url: parsed.data.url,
      events: parsed.data.events,
      description: parsed.data.description || undefined,
      secret,
      isActive: true,
    })

    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'WEBHOOK_CREATE',
      resourceType: 'Webhook',
      resourceId: doc._id,
      metadata: { url: doc.url, events: doc.events },
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          webhook: toPublicWebhook(doc),
          // Signing secret is shown ONCE here and never again.
          secret,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create webhook error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
