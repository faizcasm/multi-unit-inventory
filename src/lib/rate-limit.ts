/**
 * In-memory sliding-window rate limiter.
 *
 * PER-INSTANCE CAVEAT (no Redis by design): there is deliberately no Redis or
 * other shared store in this stack (spec constraint). Counters live in a
 * module-level Map owned by THIS server process. If you run multiple instances
 * (or serverless replicas), each process tracks its own counters and the
 * effective global limit scales with the number of instances. This trade-off is
 * accepted — do not "fix" it by introducing shared state.
 */

/** Hard cap on tracked keys so a hostile client cannot grow the Map unbounded. */
const MAX_KEYS = 50_000

/** key -> ascending list of attempt timestamps (ms) inside the current window. */
const buckets = new Map<string, number[]>()

export interface RateLimitOptions {
  /** Max attempts allowed inside the window. */
  limit: number
  /** Sliding window size in milliseconds. */
  windowMs: number
  /**
   * Whether this call records a new attempt. Defaults to `true`.
   * Pass `false` for read-only checks — e.g. the login pre-check, where only
   * *failed* attempts may count toward the limit (successes reset it instead).
   */
  record?: boolean
}

/** FIFO-ish eviction when the Map grows past its cap (oldest key first). */
function evictOldestKeys(): void {
  while (buckets.size > MAX_KEYS) {
    const oldest = buckets.keys().next().value as string | undefined
    if (oldest === undefined) break
    buckets.delete(oldest)
  }
}

export function rateLimit(
  key: string,
  opts: RateLimitOptions
): { ok: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now()
  const record = opts.record !== false

  let stamps = buckets.get(key)
  if (stamps) {
    // Opportunistically prune stale entries for this key (timestamps are
    // appended chronologically, so stale ones are always a prefix).
    let stale = 0
    while (stale < stamps.length && now - stamps[stale] >= opts.windowMs) stale += 1
    if (stale > 0) stamps.splice(0, stale)
    if (stamps.length === 0) {
      buckets.delete(key)
      stamps = undefined
    }
  }

  const count = stamps ? stamps.length : 0

  if (stamps && count >= opts.limit) {
    const oldest = stamps[0]
    const retryAfterSec = Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000))
    return { ok: false, remaining: 0, retryAfterSec }
  }

  if (record) {
    if (!stamps) {
      stamps = []
      buckets.set(key, stamps)
      evictOldestKeys()
    }
    stamps.push(now)
  }

  return {
    ok: true,
    remaining: Math.max(0, opts.limit - count - (record ? 1 : 0)),
    retryAfterSec: 0,
  }
}

/** Clear a key entirely (e.g. after a successful sign-in resets its counter). */
export function resetRateLimit(key: string): void {
  buckets.delete(key)
}

/**
 * Client IP: `x-real-ip` first (set by Vercel and authoritative — a client
 * cannot influence it), else the FIRST `x-forwarded-for` hop (appended by the
 * trusted proxy; note a hostile client can prepend fake entries to the left of
 * x-forwarded-for, so that header is only a fallback), else `'local'`.
 */
export function clientIp(req: Request): string {
  const realIp = req.headers.get('x-real-ip')
  if (realIp) {
    const trimmed = realIp.trim()
    if (trimmed) return trimmed
  }
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]
    const trimmed = first ? first.trim() : ''
    if (trimmed) return trimmed
  }
  return 'local'
}
