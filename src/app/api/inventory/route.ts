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
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 100)
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
      // An explicit filter may never widen access beyond location permissions.
      if (
        session.user.locationPermissions.length > 0 &&
        !session.user.locationPermissions.some((id: any) => id.toString() === locationId)
      ) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
      }
      query.location = new Types.ObjectId(locationId)
    }

    let inventory: any[]
    let total: number

    if (!search && !lowStock && !outOfStock) {
      // Fast path: paginate and sort in the database instead of loading the
      // org's entire inventory collection into memory. NOTE: aggregate()
      // $match does not get mongoose's string→ObjectId casting, so cast here.
      const match: any = { ...query }
      if (typeof match.organization === 'string') {
        match.organization = new Types.ObjectId(match.organization)
      }
      const [agg] = await Inventory.aggregate([
        { $match: match },
        {
          $lookup: {
            from: 'products',
            localField: 'product',
            foreignField: '_id',
            as: 'product',
            pipeline: [{ $project: { name: 1, sku: 1, unitOfMeasure: 1, reorderThreshold: 1, isActive: 1 } }],
          },
        },
        {
          $lookup: {
            from: 'locations',
            localField: 'location',
            foreignField: '_id',
            as: 'location',
            pipeline: [{ $project: { name: 1, code: 1, isActive: 1 } }],
          },
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        { $unwind: { path: '$location', preserveNullAndEmptyArrays: true } },
        { $sort: { 'location.name': 1, 'product.name': 1 } },
        {
          $facet: {
            rows: [{ $skip: (page - 1) * limit }, { $limit: limit }],
            total: [{ $count: 'n' }],
          },
        },
      ])
      inventory = agg?.rows ?? []
      total = agg?.total?.[0]?.n ?? 0
    } else {
      let rows = await Inventory.find(query)
        .populate('product', 'name sku unitOfMeasure reorderThreshold isActive')
        .populate('location', 'name code isActive')
        .limit(5000) // safety cap for filtered scans
        .lean() as any

      // Filter by search
      if (search) {
        const lowerSearch = search.toLowerCase()
        rows = rows.filter(
          (item: any) =>
            (item.product as any)?.name?.toLowerCase().includes(lowerSearch) ||
            (item.product as any)?.sku?.toLowerCase().includes(lowerSearch)
        )
      }

      // Filter by low stock / out of stock
      if (lowStock) {
        rows = rows.filter(
          (item: any) =>
            (item.product as any)?.reorderThreshold > 0 &&
            item.availableQuantity <= (item.product as any)?.reorderThreshold &&
            item.availableQuantity > 0
        )
      }

      if (outOfStock) {
        rows = rows.filter((item: any) => item.availableQuantity === 0)
      }

      // Sort by location then product name
      rows.sort((a: any, b: any) => {
        const locA = (a.location as any)?.name || ''
        const locB = (b.location as any)?.name || ''
        if (locA !== locB) return locA.localeCompare(locB)
        return ((a.product as any)?.name || '').localeCompare((b.product as any)?.name || '')
      })

      total = rows.length
      inventory = rows.slice((page - 1) * limit, page * limit)
    }

    // Get locations for filter dropdown
    const locations = await Location.find({ organization: session.user.organizationId, isActive: true })
      .select('name code')
      .lean() as any

    return NextResponse.json({
      success: true,
      data: inventory,
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

