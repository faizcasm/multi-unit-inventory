import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { PurchaseOrder } from '@/models/PurchaseOrder'
import { Supplier } from '@/models/Supplier'
import { Location } from '@/models/Location'
import { Product } from '@/models/Product'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'
import { updatePurchaseOrderSchema } from '@/lib/validation/purchase-orders'
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

    if (!hasPermission(session.user.role, 'purchase_orders:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid purchase order ID' }, { status: 400 })
    }

    await connectDB()

    const purchaseOrder = await PurchaseOrder.findOne({ _id: id, organization: session.user.organizationId })
      .populate('supplier', 'name leadTimeDays contactName contactEmail phone')
      .populate('destinationLocation', 'name code')
      .populate('createdBy', 'name email')
      .populate('sentBy', 'name email')
      .populate('receivedBy', 'name email')
      .populate('cancelledBy', 'name email')
      .populate('lines.product', 'name sku unitOfMeasure')
      .lean() as any

    if (!purchaseOrder) {
      return NextResponse.json({ success: false, error: 'Purchase order not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: purchaseOrder })
  } catch (error) {
    console.error('Get purchase order error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH — DRAFT only.
 *  - `{status: 'SENT'}` marks the order as sent to the supplier (no email).
 *  - Any other body is a full field/line update, re-validated like create.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'purchase_orders:update')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid purchase order ID' }, { status: 400 })
    }

    await connectDB()

    const purchaseOrder = await PurchaseOrder.findOne({
      _id: id,
      organization: session.user.organizationId,
    })
    if (!purchaseOrder) {
      return NextResponse.json({ success: false, error: 'Purchase order not found' }, { status: 404 })
    }

    if (purchaseOrder.status !== 'DRAFT') {
      return NextResponse.json(
        { success: false, error: `Only draft purchase orders can be edited (status: ${purchaseOrder.status})` },
        { status: 400 }
      )
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

    // --- Mark as sent to supplier -----------------------------------------
    if (body && typeof body === 'object' && 'status' in body) {
      if (body.status !== 'SENT') {
        return NextResponse.json(
          { success: false, error: "status may only be set to 'SENT' — use receive/cancel endpoints for other transitions" },
          { status: 400 }
        )
      }

      purchaseOrder.status = 'SENT'
      purchaseOrder.sentBy = session.user.id as any
      purchaseOrder.sentAt = new Date()
      await purchaseOrder.save()

      await AuditEvent.create({
        organization: session.user.organizationId,
        user: session.user.id,
        action: 'PURCHASE_ORDER_UPDATE',
        resourceType: 'purchase_order',
        resourceId: purchaseOrder._id,
        metadata: { reference: purchaseOrder.reference, action: 'send' },
      })

      return NextResponse.json({ success: true, data: purchaseOrder })
    }

    // --- Regular (DRAFT) update -------------------------------------------
    const parsed = updatePurchaseOrderSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { supplierId, destinationLocationId, notes, lines } = parsed.data
    const fields: string[] = []

    if (supplierId !== undefined) {
      if (!Types.ObjectId.isValid(supplierId)) {
        return NextResponse.json({ success: false, error: 'Invalid supplier ID' }, { status: 400 })
      }
      const supplier = await Supplier.findOne({ _id: supplierId, organization: session.user.organizationId })
      if (!supplier) {
        return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 400 })
      }
      if (purchaseOrder.supplier.toString() !== supplierId) {
        purchaseOrder.supplier = supplierId as any
        fields.push('supplier')
      }
    }

    if (destinationLocationId !== undefined) {
      if (!Types.ObjectId.isValid(destinationLocationId)) {
        return NextResponse.json({ success: false, error: 'Invalid destination location ID' }, { status: 400 })
      }
      const location = await Location.findOne({
        _id: destinationLocationId,
        organization: session.user.organizationId,
      })
      if (!location) {
        return NextResponse.json({ success: false, error: 'Destination location not found' }, { status: 400 })
      }
      if (purchaseOrder.destinationLocation.toString() !== destinationLocationId) {
        purchaseOrder.destinationLocation = destinationLocationId as any
        fields.push('destinationLocation')
      }
    }

    if (notes !== undefined) {
      const nextNotes = notes && notes.trim() ? notes : undefined
      if ((purchaseOrder.notes || undefined) !== nextNotes) {
        purchaseOrder.notes = nextNotes
        fields.push('notes')
      }
    }

    if (lines !== undefined) {
      // Never rewrite lines that already have receipts against them.
      if (purchaseOrder.lines.some((line) => (line.receivedQuantity || 0) > 0)) {
        return NextResponse.json(
          { success: false, error: 'Cannot edit lines after stock has been received' },
          { status: 400 }
        )
      }

      const productIds = lines.map((line) => line.productId)
      for (const productId of productIds) {
        if (!Types.ObjectId.isValid(productId)) {
          return NextResponse.json({ success: false, error: 'Invalid product ID' }, { status: 400 })
        }
      }
      if (new Set(productIds).size !== productIds.length) {
        return NextResponse.json({ success: false, error: 'Duplicate products in purchase order' }, { status: 400 })
      }

      const products = await Product.find({
        _id: { $in: productIds },
        organization: session.user.organizationId,
      })
      if (products.length !== productIds.length) {
        return NextResponse.json({ success: false, error: 'One or more products not found' }, { status: 400 })
      }
      const productMap = new Map(products.map((p: any) => [p._id.toString(), p]))

      purchaseOrder.lines = lines.map((line) => {
        const product: any = productMap.get(line.productId)
        return {
          product: line.productId,
          productName: product.name,
          sku: product.sku,
          requestedQuantity: line.requestedQuantity,
          receivedQuantity: 0,
          unitCost: typeof line.unitCost === 'number' ? line.unitCost : product.unitCost || 0,
        }
      })
      fields.push('lines')
    }

    if (fields.length === 0) {
      return NextResponse.json({ success: false, error: 'No changes provided' }, { status: 400 })
    }

    await purchaseOrder.save()

    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'PURCHASE_ORDER_UPDATE',
      resourceType: 'purchase_order',
      resourceId: purchaseOrder._id,
      metadata: { reference: purchaseOrder.reference, fields },
    })

    return NextResponse.json({ success: true, data: purchaseOrder })
  } catch (error) {
    console.error('Update purchase order error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
