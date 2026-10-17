import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { Organization } from '@/models/Organization'
import { auth } from '@/lib/auth/auth'
import { organizationSchema } from '@/lib/validation/schemas'
import { hasPermission } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    // Never leak invite tokenHashes (bearer secrets for accepting invites) to
    // ordinary members — project them out; every other field is unchanged.
    const organization = await Organization.findById(session.user.organizationId)
      .select('-invites.tokenHash')
      .lean() as any
    if (!organization) {
      return NextResponse.json({ success: false, error: 'Organization not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: organization })
  } catch (error) {
    console.error('Get organization error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'organization:update')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = organizationSchema.partial().safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const organization = await Organization.findByIdAndUpdate(
      session.user.organizationId,
      { $set: parsed.data },
      { new: true, runValidators: true }
    ).lean() as any

    if (!organization) {
      return NextResponse.json({ success: false, error: 'Organization not found' }, { status: 404 })
    }

    // Audit log
    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'ORG_UPDATE',
      resourceType: 'Organization',
      resourceId: organization._id,
      metadata: { updatedFields: Object.keys(parsed.data) },
    })

    return NextResponse.json({ success: true, data: organization })
  } catch (error) {
    console.error('Update organization error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'

