import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'

/** Action prefixes accepted by the `actionGroup` filter (e.g. TRANSFER matches TRANSFER_APPROVE). */
const ACTION_GROUPS = [
  'TRANSFER',
  'INVENTORY',
  'PRODUCT',
  'LOCATION',
  'PURCHASE_ORDER',
  'STOCKTAKE',
  'SUPPLIER',
  'USER',
  'MEMBERSHIP',
  'ORG',
  'SETTINGS',
] as const

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'audit:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const { searchParams } = new URL(request.url)
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '25', 10) || 25, 1), 100)
    const action = searchParams.get('action') || ''
    const actionGroup = searchParams.get('actionGroup') || ''

    const filters: any[] = []
    if (action) filters.push({ action })
    if (actionGroup && (ACTION_GROUPS as readonly string[]).includes(actionGroup)) {
      filters.push({ action: { $regex: '^' + actionGroup } })
    }

    const query: any = { organization: session.user.organizationId }
    if (filters.length > 0) query.$and = filters

    const [events, total] = await Promise.all([
      AuditEvent.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('user', 'name email role')
        .lean(),
      AuditEvent.countDocuments(query),
    ])

    return NextResponse.json({
      success: true,
      data: events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Get audit log error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
