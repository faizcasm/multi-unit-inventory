import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { Product } from '@/models/Product'
import { Inventory } from '@/models/Inventory'
import { Location } from '@/models/Location'
import { auth } from '@/lib/auth/auth'
import { productCreateSchema } from '@/lib/validation/catalog'
import { Supplier } from '@/models/Supplier'
import { hasPermission, canUserPerformAction } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'
import { dispatchWebhook } from '@/lib/webhooks'
import { Types } from 'mongoose'
import { paginationSchema, filterSchema } from '@/lib/validation/schemas'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'products:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const search = searchParams.get('search') || ''
    const category = searchParams.get('category') || ''
    const isActive = searchParams.get('isActive')
    const supplierId = searchParams.get('supplierId') || ''

    const query: any = { organization: session.user.organizationId }

    if (supplierId) {
      if (!Types.ObjectId.isValid(supplierId)) {
        return NextResponse.json({ success: false, error: 'Invalid supplier ID' }, { status: 400 })
      }
      query.supplier = new Types.ObjectId(supplierId)
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } },
      ]
    }

    if (category) {
      query.category = category
    }

    if (isActive !== null && isActive !== undefined) {
      query.isActive = isActive === 'true'
    }

    const total = await Product.countDocuments(query)
    const products = await Product.find(query)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean() as any

    // Get inventory across locations for each product
    const productIds = (products as any).map((p: any) => p._id)
    const inventory = await Inventory.aggregate([
      { $match: { organization: new Types.ObjectId(session.user.organizationId), product: { $in: productIds } } },
      {
        $lookup: {
          from: 'locations',
          localField: 'location',
          foreignField: '_id',
          as: 'locationInfo',
        },
      },
      { $unwind: '$locationInfo' },
      {
        $project: {
          product: 1,
          location: '$locationInfo._id',
          locationName: '$locationInfo.name',
          locationCode: '$locationInfo.code',
          availableQuantity: 1,
          reservedQuantity: 1,
          inTransitQuantity: 1,
          damagedQuantity: 1,
        },
      },
    ])

    const inventoryMap = new Map<string, any[]>()
    inventory.forEach((item) => {
      const pid = item.product.toString()
      if (!inventoryMap.has(pid)) inventoryMap.set(pid, [])
      inventoryMap.get(pid)!.push({
        location: item.location,
        locationName: item.locationName,
        locationCode: item.locationCode,
        availableQuantity: item.availableQuantity,
        reservedQuantity: item.reservedQuantity,
        inTransitQuantity: item.inTransitQuantity,
        damagedQuantity: item.damagedQuantity,
      })
    })

    const productsWithInventory = products.map((product) => {
      const inv = inventoryMap.get(product._id.toString()) || []
      const totalAvailable = inv.reduce((sum, i) => sum + i.availableQuantity, 0)
      const totalReserved = inv.reduce((sum, i) => sum + i.reservedQuantity, 0)
      const totalInTransit = inv.reduce((sum, i) => sum + i.inTransitQuantity, 0)
      const totalDamaged = inv.reduce((sum, i) => sum + i.damagedQuantity, 0)

      return {
        ...product,
        inventory: inv,
        totalAvailable,
        totalReserved,
        totalInTransit,
        totalDamaged,
        isLowStock: totalAvailable <= product.reorderThreshold && product.reorderThreshold > 0,
        isOutOfStock: totalAvailable === 0,
      }
    })

    return NextResponse.json({
      success: true,
      data: productsWithInventory,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Get products error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'products:create')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = productCreateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // Validate the optional supplier reference (must exist in this org).
    if (parsed.data.supplier) {
      if (!Types.ObjectId.isValid(parsed.data.supplier)) {
        return NextResponse.json({ success: false, error: 'Invalid supplier' }, { status: 400 })
      }
      const supplierExists = await Supplier.exists({
        _id: parsed.data.supplier,
        organization: session.user.organizationId,
      })
      if (!supplierExists) {
        return NextResponse.json({ success: false, error: 'Invalid supplier' }, { status: 400 })
      }
    }

    // Check for duplicate SKU
    const existingSku = await Product.findOne({
      organization: session.user.organizationId,
      sku: parsed.data.sku.toUpperCase(),
    })
    if (existingSku) {
      return NextResponse.json({ success: false, error: 'Product SKU already exists' }, { status: 409 })
    }

    const product = await Product.create({
      ...parsed.data,
      supplier: parsed.data.supplier || undefined,
      organization: session.user.organizationId,
      sku: parsed.data.sku.toUpperCase(),
    })

    // Audit log
    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'PRODUCT_CREATE',
      resourceType: 'Product',
      resourceId: product._id,
      metadata: {
        name: product.name,
        sku: product.sku,
        category: product.category,
        supplier: product.supplier ?? null,
        unitCost: product.unitCost ?? 0,
      },
    })

    await dispatchWebhook({
      organization: session.user.organizationId,
      event: 'product.created',
      payload: {
        productId: String(product._id),
        name: product.name,
        sku: product.sku,
        category: product.category,
        unitCost: product.unitCost ?? 0,
      },
    })

    return NextResponse.json({ success: true, data: product }, { status: 201 })
  } catch (error) {
    console.error('Create product error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'

