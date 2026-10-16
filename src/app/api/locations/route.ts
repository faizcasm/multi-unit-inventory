import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { Location } from '@/models/Location'
import { Product } from '@/models/Product'
import { Inventory } from '@/models/Inventory'
import { auth } from '@/lib/auth/auth'
import { locationCreateSchema } from '@/lib/validation/catalog'
import { hasPermission, canUserPerformAction } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'
import { Types } from 'mongoose'
import { paginationSchema, filterSchema } from '@/lib/validation/schemas'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'locations:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const search = searchParams.get('search') || ''
    const type = searchParams.get('type') || ''
    const isActive = searchParams.get('isActive')

    const query: any = { organization: session.user.organizationId }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ]
    }

    if (type) {
      query.type = type
    }

    if (isActive !== null && isActive !== undefined) {
      query.isActive = isActive === 'true'
    }

    // Location permission filtering
    if (session.user.locationPermissions.length > 0) {
      query._id = { $in: session.user.locationPermissions.map((id) => new Types.ObjectId(id)) }
    }

    const total = await Location.countDocuments(query)
    const locations = await Location.find(query)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean() as any

    // Get inventory stats for each location (one aggregation for the org).
    // `onHand` = available + reserved + damaged — feeds the capacity
    // utilization figure attached to each location below.
    const locationIds = (locations as any).map((l: any) => l._id)
    const inventoryStats = await Inventory.aggregate([
      { $match: { organization: new Types.ObjectId(session.user.organizationId), location: { $in: locationIds } } },
      {
        $group: {
          _id: '$location',
          productCount: { $sum: 1 },
          totalStock: { $sum: '$availableQuantity' },
          onHand: {
            $sum: { $add: ['$availableQuantity', '$reservedQuantity', '$damagedQuantity'] },
          },
          lowStockCount: {
            $sum: {
              $cond: [{ $lt: ['$availableQuantity', 10] }, 1, 0],
            },
          },
        },
      },
    ])

    const statsMap = new Map(
      inventoryStats.map((s) => [
        s._id.toString(),
        { productCount: s.productCount, totalStock: s.totalStock, lowStockCount: s.lowStockCount, onHand: s.onHand },
      ])
    )

    const locationsWithStats = locations.map((loc: any) => {
      const stats = statsMap.get(loc._id.toString())
      const onHand = stats?.onHand || 0
      const capacity = typeof loc.capacity === 'number' ? loc.capacity : null
      return {
        ...loc,
        productCount: stats?.productCount || 0,
        totalStock: stats?.totalStock || 0,
        lowStockCount: stats?.lowStockCount || 0,
        utilization: {
          onHand,
          capacity,
          percent: capacity && capacity > 0 ? Math.round((onHand / capacity) * 100) : null,
        },
      }
    })

    return NextResponse.json({
      success: true,
      data: locationsWithStats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Get locations error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'locations:create')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = locationCreateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // Check for duplicate code
    const existingCode = await Location.findOne({
      organization: session.user.organizationId,
      code: parsed.data.code.toUpperCase(),
    })
    if (existingCode) {
      return NextResponse.json({ success: false, error: 'Location code already exists' }, { status: 409 })
    }

    const location = await Location.create({
      ...parsed.data,
      organization: session.user.organizationId,
      code: parsed.data.code.toUpperCase(),
    })

    // Audit log
    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'LOCATION_CREATE',
      resourceType: 'Location',
      resourceId: location._id,
      metadata: { name: location.name, code: location.code, type: location.type },
    })

    return NextResponse.json({ success: true, data: location }, { status: 201 })
  } catch (error) {
    console.error('Create location error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'

