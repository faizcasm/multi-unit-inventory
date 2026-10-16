import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { Location } from '@/models/Location'
import { Inventory } from '@/models/Inventory'
import { StockTransfer } from '@/models/StockTransfer'
import { auth } from '@/lib/auth/auth'
import { locationUpdateSchema } from '@/lib/validation/catalog'
import { hasPermission, canUserPerformAction } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'
import { Types } from 'mongoose'

async function checkLocationAccess(session: any, locationId: string) {
  if (session.user.locationPermissions.length > 0) {
    const hasAccess = session.user.locationPermissions.some((id: string) => id === locationId)
    if (!hasAccess) return false
  }
  return true
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'locations:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid location ID' }, { status: 400 })
    }

    if (!(await checkLocationAccess(session, id))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const location = await Location.findOne({ _id: id, organization: session.user.organizationId }).lean() as any as any
    if (!location) {
      return NextResponse.json({ success: false, error: 'Location not found' }, { status: 404 })
    }

    // Get inventory for this location
    const inventory = await Inventory.find({ location: id, organization: session.user.organizationId })
      .populate('product', 'name sku unitOfMeasure reorderThreshold isActive')
      .lean() as any

    // Get transfer history
    const transfers = await StockTransfer.find({
      organization: session.user.organizationId,
      $or: [{ sourceLocation: id }, { destinationLocation: id }],
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('sourceLocation', 'name code')
      .populate('destinationLocation', 'name code')
      .populate('requester', 'name')
      .lean() as any

    return NextResponse.json({
      success: true,
      data: {
        ...location,
        inventory,
        recentTransfers: transfers,
      },
    })
  } catch (error) {
    console.error('Get location error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'locations:update')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid location ID' }, { status: 400 })
    }

    if (!(await checkLocationAccess(session, id))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = locationUpdateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // Check for duplicate code if code is being changed
    if (parsed.data.code) {
      const existingCode = await Location.findOne({
        organization: session.user.organizationId,
        code: parsed.data.code.toUpperCase(),
        _id: { $ne: id },
      })
      if (existingCode) {
        return NextResponse.json({ success: false, error: 'Location code already exists' }, { status: 409 })
      }
      parsed.data.code = parsed.data.code.toUpperCase()
    }

    const location = await Location.findOneAndUpdate(
      { _id: id, organization: session.user.organizationId },
      { $set: parsed.data },
      { new: true, runValidators: true }
    ).lean() as any as any

    if (!location) {
      return NextResponse.json({ success: false, error: 'Location not found' }, { status: 404 })
    }

    // Audit log
    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'LOCATION_UPDATE',
      resourceType: 'Location',
      resourceId: location._id,
      metadata: { updatedFields: Object.keys(parsed.data) },
    })

    return NextResponse.json({ success: true, data: location })
  } catch (error) {
    console.error('Update location error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'locations:deactivate')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid location ID' }, { status: 400 })
    }

    if (!(await checkLocationAccess(session, id))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    // Check if location is used in active transfers
    const activeTransfers = await StockTransfer.countDocuments({
      organization: session.user.organizationId,
      $or: [{ sourceLocation: id }, { destinationLocation: id }],
      status: { $in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_TRANSIT'] },
    })

    if (activeTransfers > 0) {
      return NextResponse.json(
        { success: false, error: 'Cannot deactivate location with active transfers' },
        { status: 409 }
      )
    }

    // Check if location has inventory
    const hasInventory = await Inventory.exists({ location: id, organization: session.user.organizationId })
    if (hasInventory) {
      // Check if any available stock
      const inventoryWithStock = await Inventory.findOne({
        location: id,
        organization: session.user.organizationId,
        $or: [
          { availableQuantity: { $gt: 0 } },
          { reservedQuantity: { $gt: 0 } },
          { inTransitQuantity: { $gt: 0 } },
        ],
      })
      if (inventoryWithStock) {
        return NextResponse.json(
          { success: false, error: 'Cannot deactivate location with existing stock. Transfer or adjust stock first.' },
          { status: 409 }
        )
      }
    }

    const location = await Location.findOneAndUpdate(
      { _id: id, organization: session.user.organizationId },
      { $set: { isActive: false } },
      { new: true }
    ).lean() as any as any

    if (!location) {
      return NextResponse.json({ success: false, error: 'Location not found' }, { status: 404 })
    }

    // Audit log
    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'LOCATION_DEACTIVATE',
      resourceType: 'Location',
      resourceId: location._id,
      metadata: { name: location.name, code: location.code },
    })

    return NextResponse.json({ success: true, data: location })
  } catch (error) {
    console.error('Deactivate location error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'

