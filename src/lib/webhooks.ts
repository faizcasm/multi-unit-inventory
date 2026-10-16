import { createHmac, randomBytes } from 'crypto'
import { connectDB } from '@/lib/db/mongodb'
import { Webhook, WebhookDelivery, WEBHOOK_EVENT_VALUES } from '@/models/Webhook'

const DELIVERY_TIMEOUT_MS = 8000

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('hex')}`
}

type WebhookTarget = { _id: any; url: string; secret: string }

/**
 * Fires an event at every active webhook in the organization subscribed to it.
 * Never throws — webhook delivery must never break the action that triggered
 * it. Awaitable, but safe to call fire-and-forget.
 */
export async function dispatchWebhook(input: {
  organization: string
  event: string
  payload: Record<string, unknown>
}): Promise<void> {
  try {
    if (!WEBHOOK_EVENT_VALUES.includes(input.event)) {
      console.error(`[webhook] unknown event "${input.event}" — skipping dispatch`)
      return
    }

    await connectDB()

    const hooks = await Webhook.find({
      organization: input.organization,
      events: input.event,
      isActive: true,
    }).select('+secret').lean() as unknown as WebhookTarget[]

    if (hooks.length === 0) return

    await Promise.allSettled(hooks.map((hook) => deliver(hook, input)))
  } catch (error) {
    console.error('[webhook] dispatch failed:', error)
  }
}

/**
 * Fires an event at one specific webhook (used by the "Send test" button).
 * Returns the id of the created delivery row, or null when nothing was sent.
 * Never throws.
 */
export async function dispatchWebhookTo(
  hook: { _id: any; url: string; secret: string },
  input: { organization: string; event: string; payload: Record<string, unknown> }
): Promise<string | null> {
  try {
    if (!WEBHOOK_EVENT_VALUES.includes(input.event)) return null
    const deliveryId = await deliver(hook as WebhookTarget, input)
    return deliveryId || null
  } catch (error) {
    console.error('[webhook] targeted dispatch failed:', error)
    return null
  }
}

async function deliver(
  hook: WebhookTarget,
  input: { organization: string; event: string; payload: Record<string, unknown> }
): Promise<string> {
  const { organization, event, payload } = input
  let deliveryId = ''
  const startedAt = Date.now()

  try {
    const delivery = await WebhookDelivery.create({
      organization,
      webhook: hook._id,
      event,
      status: 'PENDING',
    })
    deliveryId = String(delivery._id)

    const body = JSON.stringify({
      event,
      deliveryId,
      timestamp: new Date().toISOString(),
      payload,
    })
    const signature = createHmac('sha256', hook.secret).update(body).digest('hex')

    const response = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Ricoz-Event': event,
        'X-Ricoz-Delivery': deliveryId,
        'X-Ricoz-Signature': `sha256=${signature}`,
        'User-Agent': 'Ricoz-Inventory-Webhooks/1.0',
      },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    })

    const durationMs = Date.now() - startedAt
    const ok = response.ok

    await WebhookDelivery.updateOne(
      { _id: deliveryId },
      {
        $set: {
          status: ok ? 'SUCCESS' : 'FAILED',
          responseStatus: response.status,
          durationMs,
          ...(ok ? {} : { error: `Endpoint responded with HTTP ${response.status}` }),
        },
      }
    )
    await Webhook.updateOne(
      { _id: hook._id },
      {
        $inc: ok ? { 'stats.delivered': 1 } : { 'stats.failed': 1 },
        $set: { 'stats.lastStatus': String(response.status), 'stats.lastTriggeredAt': new Date() },
      }
    )

    console.log(`[webhook] ${event} → ${hook.url} ${ok ? 'ok' : `status ${response.status}`}`)
    return deliveryId
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`[webhook] ${event} → ${hook.url} error ${message}`)

    try {
      if (deliveryId) {
        await WebhookDelivery.updateOne(
          { _id: deliveryId },
          { $set: { status: 'FAILED', error: message.slice(0, 300), durationMs: Date.now() - startedAt } }
        )
      }
      await Webhook.updateOne(
        { _id: hook._id },
        {
          $inc: { 'stats.failed': 1 },
          $set: { 'stats.lastStatus': 'error', 'stats.lastTriggeredAt': new Date() },
        }
      )
    } catch {
      // Delivery bookkeeping failing is not worth crashing the caller over.
    }
    return deliveryId
  }
}
