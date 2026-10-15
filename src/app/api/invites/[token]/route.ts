import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { connectDB } from '@/lib/db/mongodb'
import { Organization } from '@/models/Organization'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Workspace admin',
  inventory_manager: 'Inventory manager',
  approver: 'Approver',
  warehouse_staff: 'Warehouse staff',
}

/**
 * Public lookup used by the registration page to describe an invite
 * (/register?invite=…). Knowing the token is the authorization — it is a
 * 256-bit random value stored only as a hash.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token || token.length < 10 || token.length > 300) {
      return NextResponse.json({ success: false, error: 'Invalid invite link' }, { status: 400 })
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    await connectDB()

    const org = (await Organization.findOne({
      isActive: true,
      invites: {
        $elemMatch: { tokenHash, acceptedAt: null, expiresAt: { $gt: new Date() } },
      },
    }).select('name slug invites')) as any

    if (!org) {
      return NextResponse.json(
        { success: false, error: 'This invite link is invalid, expired, or already used.' },
        { status: 404 }
      )
    }

    const invite = org.invites.find(
      (i: any) => i.tokenHash === tokenHash && !i.acceptedAt && i.expiresAt > new Date()
    )
    if (!invite) {
      return NextResponse.json(
        { success: false, error: 'This invite link is invalid, expired, or already used.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        organizationName: org.name,
        organizationSlug: org.slug,
        role: invite.role,
        roleLabel: ROLE_LABELS[invite.role] || invite.role,
        emailRequired: invite.email || null,
        expiresAt: invite.expiresAt,
      },
    })
  } catch (error) {
    console.error('Lookup invite error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
export const dynamic = 'force-dynamic'
