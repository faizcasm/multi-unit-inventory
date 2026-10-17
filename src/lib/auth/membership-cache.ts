import { connectDB } from '@/lib/db/mongodb'
import { Membership } from '@/models/Membership'

/**
 * Snapshot of a user's active membership, re-read from the DB so JWT-stale
 * role/permission data is corrected. `null` means "no active membership" —
 * the session must be treated as dead.
 */
export type MembershipSnapshot = {
  organizationId: string
  role: string
  locationPermissions: string[]
} | null

type CacheEntry = { exp: number; data: MembershipSnapshot }

const TTL_MS = 60_000 // role/permission/removal changes take effect within 60s
const MAX_ENTRIES = 5000

// Module-level cache. Map preserves insertion order, which we exploit for
// simple FIFO eviction of the oldest entry when the cap is reached.
const cache = new Map<string, CacheEntry>()

/**
 * Returns the caller's active membership, cached for 60s per user id.
 *
 * - A `null` result (removed member) is cached too, so ex-members don't
 *   hammer the DB on every request.
 * - Throws on DB errors — callers decide whether to fail open or closed.
 */
export async function getCachedMembership(userId: string): Promise<MembershipSnapshot> {
  const now = Date.now()
  const hit = cache.get(userId)
  if (hit && hit.exp > now) return hit.data

  await connectDB()

  const membership = (await Membership.findOne({ user: userId, isActive: true })
    .select('role organization locationPermissions')
    .lean()) as { role?: string; organization?: unknown; locationPermissions?: unknown[] } | null

  const data: MembershipSnapshot = membership
    ? {
        organizationId: String(membership.organization),
        role: membership.role ?? '',
        locationPermissions: (membership.locationPermissions ?? []).map((id) => String(id)),
      }
    : null

  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(userId, { exp: now + TTL_MS, data })

  return data
}
