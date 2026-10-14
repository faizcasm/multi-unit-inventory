import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { Product } from '@/models/Product'
import { Inventory } from '@/models/Inventory'
import { Location } from '@/models/Location'
import { InventoryMovement } from '@/models/InventoryMovement'
import { StockTransfer } from '@/models/StockTransfer'
import { auth } from '@/lib/auth/auth'
import { productSchema } from '@/lib/validation/schemas'
import { hasPermission, canUserPerformAction } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'
import { Types } from 'mongoose'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'products:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid product ID' }, { status: 400 })
    }

    await connectDB()

    const product = await Product.findOne({ _id: id, organization: session.user.organizationId }).lean() as any
    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 })
    }

    // Get inventory across locations
    const inventory = await Inventory.find({ product: id, organization: session.user.organizationId })
      .populate('location', 'name code isActive')
      .lean() as any

    // Get movement history
    const movements = await InventoryMovement.find({ product: id, organization: session.user.organizationId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('location', 'name code')
      .populate('responsibleUser', 'name')
      .lean() as any

    // Get transfer history
    const transfers = await StockTransfer.find({
      organization: session.user.organizationId,
      'lineItems.product': id,
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('sourceLocation', 'name code')
      .populate('destinationLocation', 'name code')
      .populate('requester', 'name')
      .lean() as any

    const invArr = inventory as any[]
    const totalAvailable = invArr.reduce((sum: number, i: any) => sum + (i?.availableQuantity || 0), 0)
    const totalReserved = invArr.reduce((sum: number, i: any) => sum + (i?.reservedQuantity || 0), 0)
    const totalInTransit = invArr.reduce((sum: number, i: any) => sum + (i?.inTransitQuantity || 0), 0)
    const totalDamaged = invArr.reduce((sum: number, i: any) => sum + (i?.damagedQuantity || 0), 0)

    return NextResponse.json({
      success: true,
      data: {
        ...product,
        inventory,
        totalAvailable,
        totalReserved,
        totalInTransit,
        totalDamaged,
        movements,
        recentTransfers: transfers,
        isLowStock: totalAvailable <= product.reorderThreshold && product.reorderThreshold > 0,
        isOutOfStock: totalAvailable === 0,
      },
    })
  } catch (error) {
    console.error('Get product error:', error)
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

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'products:update')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid product ID' }, { status: 400 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = productSchema.partial().safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // Check for duplicate SKU if SKU is being changed
    if (parsed.data.sku) {
      const existingSku = await Product.findOne({
        organization: session.user.organizationId,
        sku: parsed.data.sku.toUpperCase(),
        _id: { $ne: id },
      })
      if (existingSku) {
        return NextResponse.json({ success: false, error: 'Product SKU already exists' }, { status: 409 })
      }
      parsed.data.sku = parsed.data.sku.toUpperCase()
    }

    const product = await Product.findOneAndUpdate(
      { _id: id, organization: session.user.organizationId },
      { $set: parsed.data },
      { new: true, runValidators: true }
    ).lean() as any

    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 })
    }

    // Audit log
    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'PRODUCT_UPDATE',
      resourceType: 'Product',
      resourceId: product._id,
      metadata: { updatedFields: Object.keys(parsed.data) },
    })

    return NextResponse.json({ success: true, data: product })
  } catch (error) {
    console.error('Update product error:', error)
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

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'products:deactivate')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid product ID' }, { status: 400 })
    }

    await connectDB()

    // Check if product is used in active transfers
    const activeTransfers = await StockTransfer.countDocuments({
      organization: session.user.organizationId,
      'lineItems.product': id,
      status: { $in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_TRANSIT'] },
    })

    if (activeTransfers > 0) {
      return NextResponse.json(
        { success: false, error: 'Cannot deactivate product with active transfers' },
        { status: 409 }
      )
    }

    // Check if product has inventory
    const hasInventory = await Inventory.exists({ product: id, organization: session.user.organizationId })
    if (hasInventory) {
      const inventoryWithStock = await Inventory.findOne({
        product: id,
        organization: session.user.organizationId,
        $or: [
          { availableQuantity: { $gt: 0 } },
          { reservedQuantity: { $gt: 0 } },
          { inTransitQuantity: { $gt: 0 } },
        ],
      })
      if (inventoryWithStock) {
        return NextResponse.json(
          { success: false, error: 'Cannot deactivate product with existing stock. Adjust stock first.' },
          { status: 409 }
        )
      }
    }

    const product = await Product.findOneAndUpdate(
      { _id: id, organization: session.user.organizationId },
      { $set: { isActive: false } },
      { new: true }
    ).lean() as any

    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 })
    }

    // Audit log
    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'PRODUCT_DEACTIVATE',
      resourceType: 'Product',
      resourceId: product._id,
      metadata: { name: product.name, sku: product.sku },
    })

    return NextResponse.json({ success: true, data: product })
  } catch (error) {
    console.error('Deactivate product error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'

