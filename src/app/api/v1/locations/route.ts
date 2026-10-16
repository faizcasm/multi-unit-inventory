import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { hasPermission } from '@/lib/permissions'
import { authenticateApiKey } from '@/lib/apikey'
import { Location } from '@/models/Location'

/** Read-only list of locations for the organization behind the API key. */
export async function GET(request: NextRequest) {
  try {
    const identity = await authenticateApiKey(request)
    if (!identity) {
      return NextResponse.json({ success: false, error: 'Invalid API key' }, { status: 401 })
    }

    if (!hasPermission(identity.role, 'locations:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20))

    const query: any = { organization: identity.organizationId }

    const total = await Location.countDocuments(query)
    const locations = await Location.find(query)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean() as any

    return NextResponse.json({
      success: true,
      data: locations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('[v1] list locations error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
