import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { User } from '@/models/User'
import { Organization } from '@/models/Organization'
import { Membership } from '@/models/Membership'
import { Location } from '@/models/Location'
import { userRegistrationSchema } from '@/lib/validation/schemas'
import bcrypt from 'bcryptjs'
import { UserRole } from '@/models/User'
import { AuditEvent } from '@/models/AuditEvent'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    // Throttle FIRST: 30/hour per ip, counting ALL attempts (including
    // validation failures) so probes cannot slip through uncounted.
    const ip = clientIp(request)
    const rl = rateLimit(`reg:${ip}`, { limit: 30, windowMs: 60 * 60 * 1000 })
    if (!rl.ok) {
      const seconds = Math.max(1, Math.ceil(rl.retryAfterSec))
      const minutes = Math.max(1, Math.ceil(seconds / 60))
      return NextResponse.json(
        { success: false, error: `Too many attempts. Try again in ${minutes} minute(s).` },
        { status: 429, headers: { 'Retry-After': String(seconds) } }
      )
    }

    await connectDB()

    const body = await request.json()
    const parsed = userRegistrationSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { email, password, name, organizationName, organizationSlug } = parsed.data

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() })
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'An account with this email already exists' },
        { status: 409 }
      )
    }

    // ---- Joining an existing workspace via a one-time invite link ----
    const inviteToken = typeof parsed.data.invite === 'string' ? parsed.data.invite.trim() : ''
    if (inviteToken) {
      const crypto = await import('crypto')
      const tokenHash = crypto.createHash('sha256').update(inviteToken).digest('hex')

      const inviteOrg = (await Organization.findOne({
        isActive: true,
        invites: {
          $elemMatch: { tokenHash, acceptedAt: null, expiresAt: { $gt: new Date() } },
        },
      })) as any

      if (!inviteOrg) {
        return NextResponse.json(
          { success: false, error: 'This invite link is invalid, expired, or already used.' },
          { status: 400 }
        )
      }

      const invite = inviteOrg.invites.find(
        (i: any) => i.tokenHash === tokenHash && !i.acceptedAt && i.expiresAt > new Date()
      )
      if (!invite) {
        return NextResponse.json(
          { success: false, error: 'This invite link is invalid, expired, or already used.' },
          { status: 400 }
        )
      }
      if (invite.email && invite.email !== email.toLowerCase()) {
        return NextResponse.json(
          { success: false, error: 'This invite was issued for a different email address.' },
          { status: 403 }
        )
      }

      // Consume the invite atomically so it can never be used twice.
      const consumed = await Organization.findOneAndUpdate(
        { _id: inviteOrg._id, 'invites.tokenHash': tokenHash, 'invites.acceptedAt': null },
        { $set: { 'invites.$.acceptedAt': new Date() } }
      )
      if (!consumed) {
        return NextResponse.json(
          { success: false, error: 'This invite link has already been used.' },
          { status: 400 }
        )
      }

      const passwordHash = await bcrypt.hash(password, 12)
      const joiner = await User.create({
        email: email.toLowerCase(),
        passwordHash,
        name,
        role: invite.role,
        isActive: true,
        preferences: {
          theme: 'system',
          notifications: { email: true, inApp: true },
          dashboardLayout: 'comfortable',
        },
      })

      const membership = await Membership.create({
        user: joiner._id,
        organization: inviteOrg._id,
        role: invite.role,
        locationPermissions: [],
        isActive: true,
      })

      // Best-effort audit — never fails the registration.
      try {
        const ua = request.headers.get('user-agent') || undefined
        await AuditEvent.create({
          organization: inviteOrg._id,
          user: joiner._id,
          action: 'USER_REGISTER',
          resourceType: 'user',
          resourceId: joiner._id,
          metadata: { email: joiner.email, joinedVia: 'invite' },
          ipAddress: ip,
          userAgent: ua,
        })
        await AuditEvent.create({
          organization: inviteOrg._id,
          user: joiner._id,
          action: 'MEMBERSHIP_CREATE',
          resourceType: 'membership',
          resourceId: membership._id,
          metadata: { role: invite.role, joinedVia: 'invite' },
          ipAddress: ip,
          userAgent: ua,
        })
      } catch (auditError) {
        console.error('Registration audit error:', auditError)
      }

      const ROLE_LABELS: Record<string, string> = {
        admin: 'Workspace admin',
        inventory_manager: 'Inventory manager',
        approver: 'Approver',
        warehouse_staff: 'Warehouse staff',
      }

      return NextResponse.json(
        {
          success: true,
          message: `Joined ${inviteOrg.name} as ${ROLE_LABELS[invite.role] || invite.role}.`,
          data: {
            joined: true,
            user: { id: joiner._id.toString(), email: joiner.email, name: joiner.name },
            organization: { id: inviteOrg._id.toString(), name: inviteOrg.name, slug: inviteOrg.slug },
          },
        },
        { status: 201 }
      )
    }

    if (!organizationName || !organizationSlug) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: { organizationName: ['Workspace name is required'] },
        },
        { status: 400 }
      )
    }

    // Check if organization slug is taken
    const existingOrg = await Organization.findOne({ slug: organizationSlug.toLowerCase() })
    if (existingOrg) {
      return NextResponse.json(
        { success: false, error: 'Organization slug is already taken' },
        { status: 409 }
      )
    }

    // Create organization
    const organization = await Organization.create({
      name: organizationName,
      slug: organizationSlug.toLowerCase(),
      settings: {
        timezone: 'UTC',
        currency: 'USD',
        dateFormat: 'YYYY-MM-DD',
        separationOfDuties: true,
        lowStockThreshold: 10,
      },
    })

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12)

    // Create user
    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      name,
      role: 'admin',
      isActive: true,
      preferences: {
        theme: 'system',
        notifications: { email: true, inApp: true },
        dashboardLayout: 'comfortable',
      },
    })

    // Create admin membership
    const membership = await Membership.create({
      user: user._id,
      organization: organization._id,
      role: 'admin',
      locationPermissions: [],
      isActive: true,
    })

    // Create default location
    await Location.create({
      organization: organization._id,
      name: 'Main Warehouse',
      code: 'MAIN',
      type: 'warehouse',
      isActive: true,
    })

    // Best-effort audit — never fails the registration.
    try {
      const ua = request.headers.get('user-agent') || undefined
      await AuditEvent.create({
        organization: organization._id,
        user: user._id,
        action: 'USER_REGISTER',
        resourceType: 'user',
        resourceId: user._id,
        metadata: { email: user.email },
        ipAddress: ip,
        userAgent: ua,
      })
      await AuditEvent.create({
        organization: organization._id,
        user: user._id,
        action: 'ORG_CREATE',
        resourceType: 'organization',
        resourceId: organization._id,
        metadata: { name: organization.name, slug: organization.slug },
        ipAddress: ip,
        userAgent: ua,
      })
      await AuditEvent.create({
        organization: organization._id,
        user: user._id,
        action: 'MEMBERSHIP_CREATE',
        resourceType: 'membership',
        resourceId: membership._id,
        metadata: { role: 'admin' },
        ipAddress: ip,
        userAgent: ua,
      })
    } catch (auditError) {
      console.error('Registration audit error:', auditError)
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Account created successfully',
        data: {
          user: {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
          },
          organization: {
            id: organization._id.toString(),
            name: organization.name,
            slug: organization.slug,
          },
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}export const dynamic = 'force-dynamic'

