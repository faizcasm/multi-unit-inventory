import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { hasPermission } from '@/lib/permissions'
import { authenticateApiKey } from '@/lib/apikey'
import { StockTransfer } from '@/models/StockTransfer'

/** Read-only list of stock transfers (optionally filtered by status). */
export async function GET(request: NextRequest) {
  try {
    const identity = await authenticateApiKey(request)
    if (!identity) {
      return NextResponse.json({ success: false, error: 'Invalid API key' }, { status: 401 })
    }

    if (!hasPermission(identity.role, 'transfers:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20))
    const status = (searchParams.get('status') || '').toUpperCase()

    const query: any = { organization: identity.organizationId }

    if (status) {
      const allowed = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_TRANSIT', 'COMPLETED', 'REJECTED', 'CANCELLED']
      if (!allowed.includes(status)) {
        return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 })
      }
      query.status = status
    }

    const total = await StockTransfer.countDocuments(query)
    const transfers = await StockTransfer.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('sourceLocation', 'name code')
      .populate('destinationLocation', 'name code')
      .populate('requester', 'name email')
      .lean() as any

    return NextResponse.json({
      success: true,
      data: transfers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('[v1] list transfers error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
