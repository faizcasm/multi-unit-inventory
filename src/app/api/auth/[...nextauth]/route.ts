import { NextResponse, type NextRequest } from 'next/server'
import { handlers, auth } from '@/lib/auth/auth'
import { rateLimit, resetRateLimit, clientIp } from '@/lib/rate-limit'
import { connectDB } from '@/lib/db/mongodb'
import { LoginEvent } from '@/models/LoginEvent'
import { User } from '@/models/User'
import { Membership } from '@/models/Membership'
import { AuditEvent } from '@/models/AuditEvent'

export const dynamic = 'force-dynamic'

const FIFTEEN_MIN_MS = 15 * 60 * 1000
const LOGIN_FAIL_LIMIT = 5 // per ip+email, failures only
const LOGIN_IP_LIMIT = 25 // per ip, failures only

function tooManyAttempts(retryAfterSec: number): NextResponse {
  const seconds = Math.max(1, Math.ceil(retryAfterSec))
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  return NextResponse.json(
    { success: false, error: `Too many attempts. Try again in ${minutes} minute(s).` },
    { status: 429, headers: { 'Retry-After': String(seconds) } }
  )
}

function truncate(value: string | null, max: number): string | undefined {
  if (!value) return undefined
  return value.length > max ? value.slice(0, max) : value
}

/**
 * Wraps the NextAuth credentials callback so brute force is throttled and every
 * sign-in attempt is recorded — WITHOUT altering NextAuth's own responses.
 * The delegated response (302 redirect with/without `error=` in the location,
 * cookies, etc.) is returned byte-for-byte unchanged; the only responses this
 * wrapper ever produces itself are 429s when throttled.
 */
async function handleCredentialsCallback(req: NextRequest): Promise<Response> {
  const ip = clientIp(req)
  const ua = truncate(req.headers.get('user-agent'), 500)

  // Clone FIRST, before delegating: the delegated handler consumes req's body.
  const clone = req.clone()
  const form = await clone.formData().catch(() => null)
  let email = ''
  if (form) {
    const value = form.get('email')
    if (typeof value === 'string') email = value.trim().toLowerCase()
  } else {
    // Non-form body (e.g. a JSON client) — best-effort parse from a fresh clone.
    const json = (await req.clone().json().catch(() => null)) as { email?: unknown } | null
    if (json && typeof json.email === 'string') email = json.email.trim().toLowerCase()
  }

  const failKey = `login-fail:${ip}:${email}`
  const ipKey = `login-ip:${ip}`

  // Read-only pre-check (record: false) — only FAILED attempts ever count.
  const failCheck = rateLimit(failKey, {
    limit: LOGIN_FAIL_LIMIT,
    windowMs: FIFTEEN_MIN_MS,
    record: false,
  })
  const ipCheck = rateLimit(ipKey, {
    limit: LOGIN_IP_LIMIT,
    windowMs: FIFTEEN_MIN_MS,
    record: false,
  })
  if (!failCheck.ok || !ipCheck.ok) {
    const retryAfterSec = Math.max(
      failCheck.ok ? 0 : failCheck.retryAfterSec,
      ipCheck.ok ? 0 : ipCheck.retryAfterSec
    )
    return tooManyAttempts(retryAfterSec)
  }

  // Delegate to NextAuth; its response is returned untouched below.
  const res = await handlers.POST(req)

  const location = res.headers.get('location') || ''
  const isRedirect = res.status === 302 || res.status === 303 || res.status === 307
  const failed = (isRedirect && location.includes('error=')) || (res.status >= 400 && res.status < 500)

  if (failed) {
    // Record the failure against both counters (counters count ONLY failures).
    rateLimit(failKey, { limit: LOGIN_FAIL_LIMIT, windowMs: FIFTEEN_MIN_MS })
    rateLimit(ipKey, { limit: LOGIN_IP_LIMIT, windowMs: FIFTEEN_MIN_MS })

    if (email) {
      try {
        await connectDB()
        const existing = await User.findOne({ email }).select('_id')
        await LoginEvent.create({
          user: existing ? existing._id : null,
          email,
          ipAddress: truncate(ip, 45),
          userAgent: ua,
          status: 'failed',
        })
      } catch (err) {
        // Never break login over bookkeeping.
        console.error('Failed to record failed sign-in:', err)
      }
    }
    return res
  }

  // SUCCESS: reset the per-email failure counter, then best-effort bookkeeping.
  resetRateLimit(failKey)
  try {
    await connectDB()
    const user = email ? await User.findOne({ email, isActive: true }) : null
    let organizationId = null
    if (user) {
      const membership = await Membership.findOne({ user: user._id, isActive: true }).populate(
        'organization'
      )
      const organization = membership ? (membership.organization as any) : null
      if (organization && organization._id) organizationId = organization._id
    }

    if (email) {
      await LoginEvent.create({
        organization: organizationId,
        user: user ? user._id : null,
        email,
        ipAddress: truncate(ip, 45),
        userAgent: ua,
        status: 'success',
      })
    }
    if (user && organizationId) {
      await AuditEvent.create({
        organization: organizationId,
        user: user._id,
        action: 'USER_LOGIN',
        resourceType: 'user',
        resourceId: user._id,
        metadata: { email },
        ipAddress: truncate(ip, 45),
        userAgent: ua,
      })
    }
  } catch (err) {
    // Never break login over bookkeeping.
    console.error('Failed to record successful sign-in:', err)
  }

  return res
}

export async function GET(req: NextRequest): Promise<Response> {
  return handlers.GET(req)
}

export async function POST(req: NextRequest): Promise<Response> {
  const { pathname } = new URL(req.url)

  if (pathname.endsWith('/api/auth/callback/credentials')) {
    return handleCredentialsCallback(req)
  }

  if (pathname.endsWith('/api/auth/signout')) {
    try {
      const session = await auth()
      if (session?.user) {
        await connectDB()
        await AuditEvent.create({
          organization: session.user.organizationId,
          user: session.user.id,
          action: 'USER_LOGOUT',
          resourceType: 'user',
          resourceId: session.user.id,
          metadata: { email: session.user.email },
          ipAddress: truncate(clientIp(req), 45),
          userAgent: truncate(req.headers.get('user-agent'), 500),
        })
      }
    } catch (err) {
      // Best-effort: a failed audit must never block sign-out.
      console.error('Failed to record sign-out:', err)
    }
    return handlers.POST(req)
  }

  return handlers.POST(req)
}
