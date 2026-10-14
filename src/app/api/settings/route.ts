import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { User } from '@/models/User'
import { Organization } from '@/models/Organization'
import { auth } from '@/lib/auth/auth'
import { hasPermission, canUserPerformAction } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'
import { z } from 'zod'

const userPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  notifications: z.object({ email: z.boolean(), inApp: z.boolean() }).optional(),
  dashboardLayout: z.enum(['compact', 'comfortable']).optional(),
})

const orgSettingsSchema = z.object({
  timezone: z.string().optional(),
  currency: z.string().optional(),
  dateFormat: z.string().optional(),
  separationOfDuties: z.boolean().optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const user = await User.findById(session.user.id).select('preferences').lean() as any
    const organization = await Organization.findById(session.user.organizationId).select('settings').lean() as any

    return NextResponse.json({
      success: true,
      data: {
        user: {
          preferences: user?.preferences || {
            theme: 'system',
            notifications: { email: true, inApp: true },
            dashboardLayout: 'comfortable',
          },
        },
        organization: {
          settings: organization?.settings || {
            timezone: 'UTC',
            currency: 'USD',
            dateFormat: 'YYYY-MM-DD',
            separationOfDuties: true,
            lowStockThreshold: 10,
          },
        },
      },
    })
  } catch (error) {
    console.error('Get settings error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const body = await request.json()
    const { userPreferences, organizationSettings } = body

    // Update user preferences
    if (userPreferences) {
      const parsed = userPreferencesSchema.safeParse(userPreferences)
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
          { status: 400 }
        )
      }

      await User.findByIdAndUpdate(session.user.id, {
        $set: { preferences: parsed.data },
      })
    }

    // Update organization settings (admin only)
    if (organizationSettings) {
      if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'settings:update')) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
      }

      const parsed = orgSettingsSchema.safeParse(organizationSettings)
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
          { status: 400 }
        )
      }

      await Organization.findByIdAndUpdate(session.user.organizationId, {
        $set: { settings: parsed.data },
      })

      // Audit log
      await AuditEvent.create({
        organization: session.user.organizationId,
        user: session.user.id,
        action: 'SETTINGS_UPDATE',
        resourceType: 'Organization',
        resourceId: session.user.organizationId,
        metadata: { updatedFields: Object.keys(parsed.data) },
      })
    }

    // Return updated settings
    const user = await User.findById(session.user.id).select('preferences').lean() as any
    const organization = await Organization.findById(session.user.organizationId).select('settings').lean() as any

    return NextResponse.json({
      success: true,
      data: {
        user: { preferences: user?.preferences },
        organization: { settings: organization?.settings },
      },
    })
  } catch (error) {
    console.error('Update settings error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'

