import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { User } from '@/models/User'
import { Organization } from '@/models/Organization'
import { Membership } from '@/models/Membership'
import { Location } from '@/models/Location'
import { userRegistrationSchema } from '@/lib/validation/schemas'
import bcrypt from 'bcryptjs'
import { UserRole } from '@/models/User'

export async function POST(request: NextRequest) {
  try {
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
    await Membership.create({
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

