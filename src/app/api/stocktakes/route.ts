import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { Stocktake } from '@/models/Stocktake'
import { Inventory } from '@/models/Inventory'
import { Location } from '@/models/Location'
import { auth } from '@/lib/auth/auth'
import { hasPermission, canUserPerformAction } from '@/lib/permissions'
import { createStocktakeSchema } from '@/lib/validation/stocktakes'
import { AuditEvent } from '@/models/AuditEvent'
import { Types } from 'mongoose'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'stocktakes:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const status = searchParams.get('status') || ''
    const locationId = searchParams.get('locationId') || ''

    const query: any = { organization: session.user.organizationId }

    // Location permission filtering
    if (session.user.locationPermissions.length > 0) {
      query.location = { $in: session.user.locationPermissions.map((id) => new Types.ObjectId(id)) }
    }

    if (status) {
      query.status = status
    }

    if (locationId && Types.ObjectId.isValid(locationId)) {
      // Never let an explicit filter widen access beyond location permissions.
      if (
        session.user.locationPermissions.length > 0 &&
        !session.user.locationPermissions.map(String).includes(locationId)
      ) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
      }
      query.location = new Types.ObjectId(locationId)
    }

    const total = await Stocktake.countDocuments(query)
    const stocktakes = await Stocktake.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('location', 'name code')
      .populate('createdBy', 'name email')
      .lean() as any

    // Cheap list-side rollups: line count + variance count (counted lines where
    // the counted quantity differs from the snapshot taken at count time).
    const data = (stocktakes as any[]).map((s) => ({
      ...s,
      totalLines: Array.isArray(s.lines) ? s.lines.length : 0,
      countedLines: Array.isArray(s.lines)
        ? s.lines.filter((l: any) => l.countedQuantity !== undefined && l.countedQuantity !== null).length
        : 0,
      variances: Array.isArray(s.lines)
        ? s.lines.filter(
            (l: any) =>
              l.countedQuantity !== undefined &&
              l.countedQuantity !== null &&
              l.countedQuantity !== l.systemQuantity
          ).length
        : 0,
    }))

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Get stocktakes error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'stocktakes:create')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = createStocktakeSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { locationId, notes } = parsed.data

    if (!Types.ObjectId.isValid(locationId)) {
      return NextResponse.json({ success: false, error: 'Invalid location ID' }, { status: 400 })
    }

    // Check location access
    if (
      session.user.locationPermissions.length > 0 &&
      !session.user.locationPermissions.map(String).includes(locationId)
    ) {
      return NextResponse.json({ success: false, error: 'Forbidden: No access to this location' }, { status: 403 })
    }

    const location = await Location.findOne({
      _id: locationId,
      organization: session.user.organizationId,
      isActive: true,
    })
    if (!location) {
      return NextResponse.json({ success: false, error: 'Location not found or inactive' }, { status: 404 })
    }

    // Snapshot the count sheet from the inventory records held at this
    // location. systemQuantity is intentionally NOT stored yet — it is read
    // live at count/post time.
    const inventory = await Inventory.find({
      organization: session.user.organizationId,
      location: locationId,
    })
      .populate('product', 'name sku isActive')
      .lean() as any

    const lines = (inventory as any[])
      .filter((inv) => inv.product)
      .map((inv) => ({
        product: inv.product._id,
        productName: inv.product.name,
        sku: inv.product.sku,
        systemQuantity: 0,
      }))

    // Generate reference (same pattern as TXN- references on transfers) —
    // retry on concurrent-create duplicate-key races so two simultaneous
    // creates don't surface a raw E11000 as a 500.
    let stocktake: any = null
    let reference = ''
    for (let attempt = 0; attempt < 3 && !stocktake; attempt++) {
      const count = await Stocktake.countDocuments({ organization: session.user.organizationId })
      reference = `STK-${String(count + 1).padStart(6, '0')}`
      try {
        stocktake = await Stocktake.create({
          organization: session.user.organizationId,
          reference,
          location: locationId,
          status: 'OPEN',
          lines,
          createdBy: session.user.id,
          notes,
        })
      } catch (error: any) {
        if (error?.code === 11000 && attempt < 2) continue // reference collision — recount and retry
        throw error
      }
    }

    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'STOCKTAKE_CREATE',
      resourceType: 'Stocktake',
      resourceId: stocktake._id,
      metadata: { reference, locationId, lines: lines.length },
    })

    return NextResponse.json({ success: true, data: stocktake }, { status: 201 })
  } catch (error) {
    console.error('Create stocktake error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'
