import { z } from 'zod'
import { WEBHOOK_EVENT_VALUES } from '@/lib/webhook-events'

const webhookUrl = z
  .string()
  .trim()
  .min(1, 'URL is required')
  .max(500, 'URL must be 500 characters or less')
  .refine((v) => /^https?:\/\/.+/i.test(v), 'URL must start with http:// or https://')

const webhookEvents = z
  .array(z.string())
  .min(1, 'At least one event is required')
  .refine(
    (events) => events.every((e) => WEBHOOK_EVENT_VALUES.includes(e)),
    'One or more events are not supported'
  )

export const apiKeyCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(80, 'Name must be 80 characters or less'),
  expiresInDays: z
    .number()
    .int()
    .min(1, 'Expiry must be at least 1 day')
    .max(3650, 'Expiry cannot exceed 10 years')
    .optional()
    .nullable(),
})

export const webhookCreateSchema = z.object({
  url: webhookUrl,
  events: webhookEvents,
  description: z.string().trim().max(500, 'Description must be 500 characters or less').optional(),
})

export const webhookUpdateSchema = z.object({
  url: webhookUrl.optional(),
  events: webhookEvents.optional(),
  isActive: z.boolean().optional(),
  description: z.string().trim().max(500, 'Description must be 500 characters or less').optional(),
})
