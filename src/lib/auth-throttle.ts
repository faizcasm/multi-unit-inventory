import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'

/**
 * Records one attempt against `key` and, when the sliding window is exhausted,
 * returns the canonical 429 response used by every auth endpoint:
 * `{ success: false, error: 'Too many attempts. Try again in N minute(s).' }`
 * with a `Retry-After` header in seconds. Returns `null` when the attempt is
 * allowed.
 *
 * @param key     rate-limit bucket (e.g. `rp:<ip>:<email>`)
 * @param limit   max attempts inside the window
 * @param windowMs sliding window size in milliseconds
 * @param minutes window size in minutes, used for the user-facing message
 */
export function tooManyAttempts(
  key: string,
  limit: number,
  windowMs: number,
  minutes: number
): NextResponse | null {
  const result = rateLimit(key, { limit, windowMs })
  if (result.ok) return null

  const seconds = Math.max(1, Math.ceil(result.retryAfterSec))
  const mins = Math.max(1, Math.ceil(minutes))
  return NextResponse.json(
    { success: false, error: `Too many attempts. Try again in ${mins} minute(s).` },
    { status: 429, headers: { 'Retry-After': String(seconds) } }
  )
}
