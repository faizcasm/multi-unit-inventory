import { z } from 'zod'
import { WEBHOOK_EVENT_VALUES } from '@/lib/webhook-events'

const webhookUrl = z
  .string()
  .trim()
  .min(1, 'URL is required')
  .max(500, 'URL must be 500 characters or less')
  .refine((v) => /^https?:\/\/.+/i.test(v), 'URL must start with http:// or https://')
  .refine((v) => {
    try {
      return !isBlockedWebhookHost(new URL(v).hostname)
    } catch {
      // Unparseable URL → fail closed.
      return false
    }
  }, 'URL must be a public host (internal addresses are blocked)')

/**
 * SSRF guard for webhook destinations: reject loopback-except-explicit,
 * private / link-local / CGNAT / special IPv4 ranges, any IPv6 literal other
 * than `::1`, and internal-looking hostnames. Public hosts are allowed.
 *
 * Note: WHATWG `URL` already normalizes IPv4 shorthands (decimal/octal/hex,
 * `http://0/` → `0.0.0.0`) and lowercases hostnames, so this check runs on the
 * canonical form. `hostname` for IPv6 literals arrives bracketed (`[::1]`).
 */
export function isBlockedWebhookHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '')
  if (!host) return true

  // Explicitly allowed loopback targets (this machine — needed by local test suites).
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
    return false
  }

  // Blocked hostnames.
  if (host === 'metadata.google.internal') return true
  if (host.endsWith('.internal') || host.endsWith('.local') || host.endsWith('.localhost')) return true

  // Strip IPv6 brackets for range checks.
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host

  // Any IPv6 literal other than the allowed `::1` above is blocked.
  if (bare.includes(':')) return true

  // IPv4 literals in private / link-local / special-purpose ranges.
  const parts = bare.split('.')
  if (parts.length === 4 && parts.every((p) => p.length >= 1 && p.length <= 3 && /^\d+$/.test(p))) {
    const a = Number(parts[0])
    const b = Number(parts[1])
    const c = Number(parts[2])
    if (
      a === 0 || // 0.0.0.0/8
      a === 10 || // 10.0.0.0/8
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 0 && c === 0) || // 192.0.0.0/24
      (a === 192 && b === 168) || // 192.168.0.0/16
      (a === 169 && b === 254) || // 169.254.0.0/16 (incl. 169.254.169.254)
      (a === 100 && b >= 64 && b <= 127) // 100.64.0.0/10 (CGNAT)
    ) {
      return true
    }
  }

  return false
}

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
