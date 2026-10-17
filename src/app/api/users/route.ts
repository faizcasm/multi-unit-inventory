import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { User } from '@/models/User'
import { Membership } from '@/models/Membership'
import { Location } from '@/models/Location'
import { Organization } from '@/models/Organization'
import { auth } from '@/lib/auth/auth'
import { hasPermission, canUserPerformAction } from '@/lib/permissions'
import { membershipUpdateSchema } from '@/lib/validation/schemas'
import { AuditEvent } from '@/models/AuditEvent'
import { Types } from 'mongoose'
import { UserRole } from '@/models/User'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'users:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const memberships = await Membership.find({ organization: session.user.organizationId, isActive: true })
      .populate('user', 'name email avatar role isActive lastLoginAt preferences')
      .lean() as any

    const users = memberships.map((m) => ({
      _id: m.user._id,
      name: m.user.name,
      email: m.user.email,
      avatar: m.user.avatar,
      role: m.role,
      isActive: m.user.isActive,
      lastLoginAt: m.user.lastLoginAt,
      preferences: m.user.preferences,
      locationPermissions: m.locationPermissions,
      joinedAt: m.joinedAt,
    }))

    // Get available roles
    const roles: { value: UserRole; label: string; description: string }[] = [
      { value: 'admin', label: 'Organization Administrator', description: 'Full access to all features including user management and settings' },
      { value: 'inventory_manager', label: 'Inventory Manager', description: 'Manage products, inventory, and transfers' },
      { value: 'approver', label: 'Approver', description: 'Review and approve/reject transfer requests' },
      { value: 'warehouse_staff', label: 'Warehouse Staff', description: 'Perform dispatch and receiving operations' },
    ]

    // Get locations for permission assignment
    const locations = await Organization.aggregate([
      { $match: { _id: new Types.ObjectId(session.user.organizationId) } },
      {
        $lookup: {
          from: 'locations',
          localField: '_id',
          foreignField: 'organization',
          as: 'locations',
        },
      },
      { $unwind: '$locations' },
      { $match: { 'locations.isActive': true } },
      { $project: { _id: '$locations._id', name: '$locations.name', code: '$locations.code' } },
    ])

    return NextResponse.json({ success: true, data: { users, roles, locations } })
  } catch (error) {
    console.error('Get users error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'users:update')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = membershipUpdateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { userId, role, locationPermissions } = parsed.data

    if (!Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ success: false, error: 'Invalid user ID' }, { status: 400 })
    }

    // Cannot modify own role
    if (userId === session.user.id) {
      return NextResponse.json({ success: false, error: 'Cannot modify your own role' }, { status: 400 })
    }

    const membership = await Membership.findOne({ user: userId, organization: session.user.organizationId, isActive: true })
    if (!membership) {
      return NextResponse.json({ success: false, error: 'User not found in this organization' }, { status: 404 })
    }

    const oldRole = membership.role
    const oldPermissions = membership.locationPermissions

    // Last-admin guard: an org must always retain at least one active admin.
    if (membership.role === 'admin' && role !== 'admin') {
      const adminCount = await Membership.countDocuments({
        organization: session.user.organizationId,
        role: 'admin',
        isActive: true,
      })
      if (adminCount <= 1) {
        return NextResponse.json({ success: false, error: 'Cannot demote the last admin' }, { status: 400 })
      }
    }

    // Location permissions may only reference active locations of this org.
    if (locationPermissions) {
      if (!locationPermissions.every((id) => Types.ObjectId.isValid(id))) {
        return NextResponse.json({ success: false, error: 'One or more location ids are invalid' }, { status: 400 })
      }
      const locations = await Location.find({
        _id: { $in: locationPermissions },
        organization: session.user.organizationId,
        isActive: true,
      })
        .select('_id')
        .lean()
      const validIds = new Set(locations.map((l) => String(l._id)))
      if (locationPermissions.some((id) => !validIds.has(id))) {
        return NextResponse.json({ success: false, error: 'One or more location ids are invalid' }, { status: 400 })
      }
    }

    membership.role = role
    if (locationPermissions) {
      membership.locationPermissions = locationPermissions.map((id) => new Types.ObjectId(id))
    }
    await membership.save()

    // Audit log
    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'MEMBERSHIP_UPDATE',
      resourceType: 'Membership',
      resourceId: membership._id,
      metadata: { userId, oldRole, newRole: role, oldPermissions, newPermissions: locationPermissions },
    })

    return NextResponse.json({ success: true, data: membership })
  } catch (error) {
    console.error('Update user error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'users:delete')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId || !Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ success: false, error: 'Invalid user ID' }, { status: 400 })
    }

    // Cannot remove self
    if (userId === session.user.id) {
      return NextResponse.json({ success: false, error: 'Cannot remove yourself' }, { status: 400 })
    }

    const membership = await Membership.findOne({ user: userId, organization: session.user.organizationId, isActive: true })
    if (!membership) {
      return NextResponse.json({ success: false, error: 'User not found in this organization' }, { status: 404 })
    }

    // Last-admin guard: never remove the org's only active admin.
    if (membership.role === 'admin') {
      const adminCount = await Membership.countDocuments({
        organization: session.user.organizationId,
        role: 'admin',
        isActive: true,
      })
      if (adminCount <= 1) {
        return NextResponse.json({ success: false, error: 'Cannot demote the last admin' }, { status: 400 })
      }
    }

    membership.isActive = false
    await membership.save()

    // Audit log
    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'MEMBERSHIP_REMOVE',
      resourceType: 'Membership',
      resourceId: membership._id,
      metadata: { userId, removedRole: membership.role },
    })

    return NextResponse.json({ success: true, message: 'User removed from organization' })
  } catch (error) {
    console.error('Remove user error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'

