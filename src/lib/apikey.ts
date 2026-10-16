import { createHash, randomBytes } from 'crypto'
import { connectDB } from '@/lib/db/mongodb'
import { ApiKey } from '@/models/ApiKey'
import { Membership } from '@/models/Membership'
import { User } from '@/models/User'
import type { UserRole } from '@/models/User'

/** The API-side equivalent of a session user, resolved from an API key. */
export interface ApiIdentity {
  userId: string
  organizationId: string
  role: UserRole
  locationPermissions: string[]
  keyId: string
}

/** `rzk_` + 48 hex chars. */
export function generateApiKey(): { key: string; keyHash: string; prefix: string } {
  const key = `rzk_${randomBytes(24).toString('hex')}`
  return { key, keyHash: hashApiKey(key), prefix: key.slice(0, 12) }
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

function extractKey(req: Request): string | null {
  const headerKey = req.headers.get('x-api-key')
  if (headerKey && headerKey.trim()) return headerKey.trim()

  const authorization = req.headers.get('authorization')
  if (authorization && authorization.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(7).trim()
    if (token.startsWith('rzk_')) return token
  }
  return null
}

/**
 * Resolves an API identity from the `X-API-Key` header or an
 * `Authorization: Bearer rzk_…` token. Never throws — returns null on any
 * failure so callers can simply answer 401.
 */
export async function authenticateApiKey(req: Request): Promise<ApiIdentity | null> {
  try {
    const rawKey = extractKey(req)
    if (!rawKey) return null

    await connectDB()

    const now = new Date()
    const key = await ApiKey.findOne({
      keyHash: hashApiKey(rawKey),
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }).lean() as any
    if (!key) return null

    // The user who created the key must still be active.
    const owner = await User.findById(key.createdBy).select('isActive').lean() as any
    if (!owner?.isActive) return null

    // Role + location scope come from the owner's membership in the key's org.
    const membership = await Membership.findOne({
      user: key.createdBy,
      organization: key.organization,
      isActive: true,
    }).lean() as any
    if (!membership) return null

    // Fire-and-forget usage tracking — only when older than 5 minutes.
    const lastUsed = key.lastUsedAt ? new Date(key.lastUsedAt).getTime() : 0
    if (Date.now() - lastUsed > 5 * 60 * 1000) {
      ApiKey.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {})
    }

    return {
      userId: String(key.createdBy),
      organizationId: String(key.organization),
      role: membership.role,
      locationPermissions: (membership.locationPermissions || []).map((id: any) => String(id)),
      keyId: String(key._id),
    }
  } catch (error) {
    console.error('[apikey] authentication failed:', error)
    return null
  }
}
