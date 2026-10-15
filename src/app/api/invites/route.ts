import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { connectDB } from '@/lib/db/mongodb'
import { auth } from '@/lib/auth/auth'
import { canUserPerformAction } from '@/lib/permissions'
import { Organization } from '@/models/Organization'

const createInviteSchema = z.object({
  role: z.enum(['admin', 'inventory_manager', 'approver', 'warehouse_staff']),
  email: z.string().email('Invalid email address').optional(),
})

const INVITE_TTL_DAYS = 7

/**
 * Creates a one-time registration invite for this workspace.
 * The raw token is returned exactly once — only its SHA-256 hash is stored.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'users:create')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const parsed = createInviteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    await connectDB()

    const token = crypto.randomBytes(32).toString('base64url')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

    const org = await Organization.findById(session.user.organizationId)
    if (!org) {
      return NextResponse.json({ success: false, error: 'Workspace not found' }, { status: 404 })
    }

    // Housekeeping: drop invites that already expired or were accepted long ago.
    org.invites = org.invites.filter(
      (i) => i.expiresAt > new Date() && !i.acceptedAt
    )
    org.invites.push({
      tokenHash,
      role: parsed.data.role,
      email: parsed.data.email?.toLowerCase(),
      expiresAt,
      acceptedAt: null,
      createdBy: session.user.id as any,
    })
    await org.save()

    const origin = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
    const url = `${origin}/register?invite=${token}`

    return NextResponse.json(
      {
        success: true,
        data: {
          token,
          url,
          role: parsed.data.role,
          email: parsed.data.email?.toLowerCase() || null,
          expiresAt,
          message: 'This link is shown only once. Share it with your teammate before closing.',
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create invite error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
export const dynamic = 'force-dynamic'
