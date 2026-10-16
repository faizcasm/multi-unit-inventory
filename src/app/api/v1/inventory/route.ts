import { NextRequest, NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { connectDB } from '@/lib/db/mongodb'
import { hasPermission } from '@/lib/permissions'
import { authenticateApiKey } from '@/lib/apikey'
import { Inventory } from '@/models/Inventory'

/** Read-only stock levels per product/location. */
export async function GET(request: NextRequest) {
  try {
    const identity = await authenticateApiKey(request)
    if (!identity) {
      return NextResponse.json({ success: false, error: 'Invalid API key' }, { status: 401 })
    }

    if (!hasPermission(identity.role, 'inventory:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20))
    const locationId = searchParams.get('locationId') || ''
    const productId = searchParams.get('productId') || ''

    const query: any = { organization: identity.organizationId }

    if (locationId) {
      if (!Types.ObjectId.isValid(locationId)) {
        return NextResponse.json({ success: false, error: 'Invalid location ID' }, { status: 400 })
      }
      query.location = new Types.ObjectId(locationId)
    }

    if (productId) {
      if (!Types.ObjectId.isValid(productId)) {
        return NextResponse.json({ success: false, error: 'Invalid product ID' }, { status: 400 })
      }
      query.product = new Types.ObjectId(productId)
    }

    const total = await Inventory.countDocuments(query)
    const rows = await Inventory.find(query)
      .sort({ lastMovementAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('product', 'name sku')
      .populate('location', 'name code')
      .lean() as any

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('[v1] list inventory error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
