import mongoose, { Document, Schema, Types } from 'mongoose'
import { WEBHOOK_EVENT_VALUES } from '@/lib/webhook-events'

// Client-safe event catalogue, re-exported for server-side consumers.
export { WEBHOOK_EVENTS, WEBHOOK_EVENT_VALUES, WEBHOOK_EVENT_LABELS } from '@/lib/webhook-events'

export type WebhookDeliveryStatus = 'PENDING' | 'SUCCESS' | 'FAILED'

export interface IWebhook extends Document {
  organization: Types.ObjectId
  url: string
  events: string[]
  /** HMAC signing secret (`whsec_…`) — server-side only, never returned by list APIs. */
  secret: string
  description?: string
  isActive: boolean
  stats: {
    delivered: number
    failed: number
    lastStatus?: string
    lastTriggeredAt?: Date
  }
  createdAt: Date
  updatedAt: Date
}

export interface IWebhookDelivery extends Document {
  organization: Types.ObjectId
  webhook: Types.ObjectId
  event: string
  status: WebhookDeliveryStatus
  responseStatus?: number
  error?: string
  durationMs?: number
  createdAt: Date
}

const WebhookSchema = new Schema<IWebhook>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
      match: [/^https?:\/\/.+/i, 'URL must start with http:// or https://'],
    },
    events: {
      type: [{ type: String, enum: WEBHOOK_EVENT_VALUES }],
      required: true,
      validate: {
        validator: (events: string[]) => events.length > 0,
        message: 'At least one event is required',
      },
    },
    secret: { type: String, required: true },
    description: { type: String, trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true },
    stats: {
      delivered: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      lastStatus: { type: String },
      lastTriggeredAt: { type: Date },
    },
  },
  { timestamps: true }
)

WebhookSchema.index({ organization: 1, events: 1, isActive: 1 })

const WebhookDeliverySchema = new Schema<IWebhookDelivery>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    webhook: { type: Schema.Types.ObjectId, ref: 'Webhook', required: true },
    event: { type: String, required: true, enum: WEBHOOK_EVENT_VALUES },
    status: { type: String, enum: ['PENDING', 'SUCCESS', 'FAILED'], required: true, default: 'PENDING' },
    responseStatus: { type: Number },
    error: { type: String, maxlength: 300 },
    durationMs: { type: Number },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

WebhookDeliverySchema.index({ webhook: 1, createdAt: -1 })
WebhookDeliverySchema.index({ organization: 1, createdAt: -1 })

export const Webhook = mongoose.models.Webhook || mongoose.model<IWebhook>('Webhook', WebhookSchema)
export const WebhookDelivery =
  mongoose.models.WebhookDelivery || mongoose.model<IWebhookDelivery>('WebhookDelivery', WebhookDeliverySchema)
