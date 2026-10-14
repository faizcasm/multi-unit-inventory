import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { Inventory } from '@/models/Inventory'
import { Product } from '@/models/Product'
import { Location } from '@/models/Location'
import { auth } from '@/lib/auth/auth'
import { hasPermission, canUserPerformAction } from '@/lib/permissions'
import { Types } from 'mongoose'
import { paginationSchema, filterSchema } from '@/lib/validation/schemas'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'inventory:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const search = searchParams.get('search') || ''
    const locationId = searchParams.get('locationId') || ''
    const lowStock = searchParams.get('lowStock') === 'true'
    const outOfStock = searchParams.get('outOfStock') === 'true'

    const query: any = { organization: session.user.organizationId }

    // Location permission filtering
    if (session.user.locationPermissions.length > 0) {
      query.location = { $in: session.user.locationPermissions.map((id) => new Types.ObjectId(id)) }
    }

    if (locationId && Types.ObjectId.isValid(locationId)) {
      query.location = new Types.ObjectId(locationId)
    }

    let inventory = await Inventory.find(query)
      .populate('product', 'name sku unitOfMeasure reorderThreshold isActive')
      .populate('location', 'name code isActive')
      .lean() as any

    // Filter by search
    if (search) {
      const lowerSearch = search.toLowerCase()
      inventory = (inventory as any).filter(
        (item: any) =>

          (item.product as any)?.name?.toLowerCase().includes(lowerSearch) ||
          (item.product as any)?.sku?.toLowerCase().includes(lowerSearch)
      )
    }

    // Filter by low stock / out of stock
    if (lowStock) {
      inventory = (inventory as any).filter(
        (item: any) =>

          (item.product as any)?.reorderThreshold > 0 &&
          item.availableQuantity <= (item.product as any)?.reorderThreshold &&
          item.availableQuantity > 0
      )
    }

    if (outOfStock) {
      inventory = (inventory as any).filter((item: any) => item.availableQuantity === 0)
    }

    // Sort by location then product name
    (inventory as any).sort((a: any, b: any) => {
      const locA = (a.location as any)?.name || ''
      const locB = (b.location as any)?.name || ''
      if (locA !== locB) return locA.localeCompare(locB)
      return ((a.product as any)?.name || '').localeCompare((b.product as any)?.name || '')
    })

    const total = inventory.length
    const paginatedInventory = inventory.slice((page - 1) * limit, page * limit)

    // Get locations for filter dropdown
    const locations = await Location.find({ organization: session.user.organizationId, isActive: true })
      .select('name code')
      .lean() as any

    return NextResponse.json({
      success: true,
      data: paginatedInventory,
      locations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Get inventory error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'

