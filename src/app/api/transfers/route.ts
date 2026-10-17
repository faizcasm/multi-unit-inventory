import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { StockTransfer } from '@/models/StockTransfer'
import { Location } from '@/models/Location'
import { Product } from '@/models/Product'
import { Inventory } from '@/models/Inventory'
import { auth } from '@/lib/auth/auth'
import { createTransferSchema, paginationSchema, filterSchema } from '@/lib/validation/schemas'
import { hasPermission, canUserPerformAction } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'
import { fireTransferHooks } from '@/lib/transfer-hooks'
import { Types } from 'mongoose'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'transfers:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const { searchParams } = new URL(request.url)
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 100)
    const status = searchParams.get('status') || ''
    const sourceLocationId = searchParams.get('sourceLocationId') || ''
    const destinationLocationId = searchParams.get('destinationLocationId') || ''
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''

    const query: any = { organization: session.user.organizationId }

    // Location permission filtering
    if (session.user.locationPermissions.length > 0) {
      query.$or = [
        { sourceLocation: { $in: session.user.locationPermissions.map((id) => new Types.ObjectId(id)) } },
        { destinationLocation: { $in: session.user.locationPermissions.map((id) => new Types.ObjectId(id)) } },
      ]
    }

    if (status) {
      query.status = status
    }

    if (sourceLocationId && Types.ObjectId.isValid(sourceLocationId)) {
      query.sourceLocation = new Types.ObjectId(sourceLocationId)
    }

    if (destinationLocationId && Types.ObjectId.isValid(destinationLocationId)) {
      query.destinationLocation = new Types.ObjectId(destinationLocationId)
    }

    if (dateFrom || dateTo) {
      query.createdAt = {}
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom)
      if (dateTo) query.createdAt.$lte = new Date(dateTo)
    }

    const total = await StockTransfer.countDocuments(query)
    const transfers = await StockTransfer.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('sourceLocation', 'name code')
      .populate('destinationLocation', 'name code')
      .populate('requester', 'name email')
      .populate('approver', 'name email')
      .populate('lineItems.product', 'name sku unitOfMeasure')
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
    console.error('Get transfers error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'transfers:create')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = createTransferSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { sourceLocationId, destinationLocationId, lineItems, notes } = parsed.data

    // Verify locations
    const [sourceLocation, destinationLocation] = await Promise.all([
      Location.findOne({ _id: sourceLocationId, organization: session.user.organizationId, isActive: true }),
      Location.findOne({ _id: destinationLocationId, organization: session.user.organizationId, isActive: true }),
    ])

    if (!sourceLocation) {
      return NextResponse.json({ success: false, error: 'Source location not found or inactive' }, { status: 404 })
    }
    if (!destinationLocation) {
      return NextResponse.json({ success: false, error: 'Destination location not found or inactive' }, { status: 404 })
    }

    // Check location permissions
    if (session.user.locationPermissions.length > 0) {
      const hasSourceAccess = session.user.locationPermissions.includes(sourceLocationId)
      const hasDestAccess = session.user.locationPermissions.includes(destinationLocationId)
      if (!hasSourceAccess || !hasDestAccess) {
        return NextResponse.json({ success: false, error: 'Forbidden: No access to one or both locations' }, { status: 403 })
      }
    }

    // Verify products and check stock availability
    const productIds = lineItems.map((item) => item.productId)
    const products = await Product.find({ _id: { $in: productIds }, organization: session.user.organizationId, isActive: true })
    if (products.length !== productIds.length) {
      return NextResponse.json({ success: false, error: 'One or more products not found or inactive' }, { status: 404 })
    }

    // Check for duplicate products in line items
    const uniqueProductIds = new Set(productIds)
    if (uniqueProductIds.size !== productIds.length) {
      return NextResponse.json({ success: false, error: 'Duplicate products in transfer' }, { status: 400 })
    }

    // Check inventory availability
    const inventory = await Inventory.find({
      product: { $in: productIds },
      location: sourceLocationId,
      organization: session.user.organizationId,
    })

    for (const item of lineItems) {
      const inv = inventory.find((i) => i.product.toString() === item.productId)
      const available = inv?.availableQuantity || 0
      if (available < item.requestedQuantity) {
        const product = products.find((p) => p._id.toString() === item.productId)
        return NextResponse.json(
          { success: false, error: `Insufficient stock for ${product?.name || 'product'}. Available: ${available}, Requested: ${item.requestedQuantity}` },
          { status: 400 }
        )
      }
    }

    // Generate reference — retry on concurrent-create duplicate-key races so
    // two simultaneous creates don't surface a raw E11000 as a 500.
    let transfer: any = null
    let reference = ''
    for (let attempt = 0; attempt < 3 && !transfer; attempt++) {
      const count = await StockTransfer.countDocuments({ organization: session.user.organizationId })
      reference = `TXN-${String(count + 1).padStart(6, '0')}`
      try {
        transfer = await StockTransfer.create({
          organization: session.user.organizationId,
          reference,
          sourceLocation: sourceLocationId,
          destinationLocation: destinationLocationId,
          lineItems: lineItems.map((item) => ({
            product: item.productId,
            requestedQuantity: item.requestedQuantity,
            notes: item.notes,
          })),
          status: 'DRAFT',
          requester: session.user.id,
          statusHistory: [
            {
              status: 'DRAFT',
              changedBy: session.user.id,
              changedAt: new Date(),
              notes: 'Transfer created as draft',
            },
          ],
          notes,
        })
      } catch (error: any) {
        if (error?.code === 11000 && attempt < 2) continue // reference collision — recount and retry
        throw error
      }
    }

    // Audit log
    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'TRANSFER_CREATE',
      resourceType: 'StockTransfer',
      resourceId: transfer._id,
      metadata: { reference, sourceLocation: sourceLocationId, destinationLocation: destinationLocationId, lineItemsCount: lineItems.length },
    })

    await fireTransferHooks({
      organization: session.user.organizationId,
      event: 'transfer.created',
      transfer,
      actorUserId: session.user.id,
      notifyRequester: false,
      notifyRoles: ['approver', 'admin', 'inventory_manager'],
    })

    return NextResponse.json({ success: true, data: transfer }, { status: 201 })
  } catch (error) {
    console.error('Create transfer error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'

