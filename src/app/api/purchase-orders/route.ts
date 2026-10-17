import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { PurchaseOrder } from '@/models/PurchaseOrder'
import { Supplier } from '@/models/Supplier'
import { Location } from '@/models/Location'
import { Product } from '@/models/Product'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'
import { notifyRole } from '@/lib/notify'
import { createPurchaseOrderSchema } from '@/lib/validation/purchase-orders'
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = ['DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']

/** Escape user input before building a regex literal. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'purchase_orders:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
    const limit = Math.min(10000, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20))
    const status = searchParams.get('status') || ''
    const supplierId = searchParams.get('supplierId') || ''
    const search = searchParams.get('search') || ''

    const query: any = { organization: session.user.organizationId }

    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json({ success: false, error: 'Invalid status filter' }, { status: 400 })
      }
      query.status = status
    }

    if (supplierId) {
      if (!Types.ObjectId.isValid(supplierId)) {
        return NextResponse.json({ success: false, error: 'Invalid supplier ID' }, { status: 400 })
      }
      query.supplier = new Types.ObjectId(supplierId)
    }

    if (search) {
      const escaped = escapeRegex(search)
      const matchingSuppliers = await Supplier.find({
        organization: session.user.organizationId,
        name: { $regex: escaped, $options: 'i' },
      })
        .select('_id')
        .lean()
      query.$or = [
        { reference: { $regex: escaped, $options: 'i' } },
        { supplier: { $in: matchingSuppliers.map((s: any) => s._id) } },
        { notes: { $regex: escaped, $options: 'i' } },
      ]
    }

    const total = await PurchaseOrder.countDocuments(query)
    const purchaseOrders = await PurchaseOrder.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('supplier', 'name leadTimeDays')
      .populate('destinationLocation', 'name code')
      .populate('createdBy', 'name email')
      .lean() as any

    const data = purchaseOrders.map((po: any) => ({
      ...po,
      totalLines: po.lines?.length ?? 0,
      totalOrdered: (po.lines || []).reduce((sum: number, l: any) => sum + (l.requestedQuantity || 0), 0),
      totalReceived: (po.lines || []).reduce((sum: number, l: any) => sum + (l.receivedQuantity || 0), 0),
    }))

    // Workspace-wide metrics (open / awaiting / received / total value).
    const summaryRows = await PurchaseOrder.aggregate([
      { $match: { organization: new Types.ObjectId(String(session.user.organizationId)) } },
      {
        $project: {
          status: 1,
          value: {
            $sum: {
              $map: {
                input: '$lines',
                as: 'line',
                in: { $multiply: ['$$line.requestedQuantity', '$$line.unitCost'] },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          open: { $sum: { $cond: [{ $in: ['$status', ['DRAFT', 'SENT']] }, 1, 0] } },
          awaiting: { $sum: { $cond: [{ $eq: ['$status', 'PARTIALLY_RECEIVED'] }, 1, 0] } },
          received: { $sum: { $cond: [{ $eq: ['$status', 'RECEIVED'] }, 1, 0] } },
          totalValue: { $sum: '$value' },
        },
      },
    ])
    const summary = {
      open: summaryRows[0]?.open ?? 0,
      awaiting: summaryRows[0]?.awaiting ?? 0,
      received: summaryRows[0]?.received ?? 0,
      totalValue: summaryRows[0]?.totalValue ?? 0,
    }

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary,
    })
  } catch (error) {
    console.error('Get purchase orders error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'purchase_orders:create')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = createPurchaseOrderSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { supplierId, destinationLocationId, lines, notes } = parsed.data

    if (!Types.ObjectId.isValid(supplierId)) {
      return NextResponse.json({ success: false, error: 'Invalid supplier ID' }, { status: 400 })
    }
    if (!Types.ObjectId.isValid(destinationLocationId)) {
      return NextResponse.json({ success: false, error: 'Invalid destination location ID' }, { status: 400 })
    }

    // Supplier + destination must exist inside this organization.
    const [supplier, destinationLocation] = await Promise.all([
      Supplier.findOne({ _id: supplierId, organization: session.user.organizationId }),
      Location.findOne({ _id: destinationLocationId, organization: session.user.organizationId }),
    ])

    if (!supplier) {
      return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 400 })
    }
    if (!destinationLocation) {
      return NextResponse.json({ success: false, error: 'Destination location not found' }, { status: 400 })
    }

    // Products must exist in-org, and each product may appear only once.
    const productIds = lines.map((line) => line.productId)
    for (const productId of productIds) {
      if (!Types.ObjectId.isValid(productId)) {
        return NextResponse.json({ success: false, error: 'Invalid product ID' }, { status: 400 })
      }
    }
    const uniqueProductIds = new Set(productIds)
    if (uniqueProductIds.size !== productIds.length) {
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

    // Reference — same countDocuments pattern the transfers route uses for
    // TXN-, including the retry-on-concurrent-create duplicate-key race so
    // two simultaneous creates don't surface a raw E11000 as a 500.
    let purchaseOrder: any = null
    let reference = ''
    for (let attempt = 0; attempt < 3 && !purchaseOrder; attempt++) {
      const count = await PurchaseOrder.countDocuments({ organization: session.user.organizationId })
      reference = `PO-${String(count + 1).padStart(6, '0')}`
      try {
        purchaseOrder = await PurchaseOrder.create({
          organization: session.user.organizationId,
          reference,
          supplier: supplierId,
          destinationLocation: destinationLocationId,
          status: 'DRAFT',
          lines: lines.map((line) => {
            const product: any = productMap.get(line.productId)
            return {
              product: line.productId,
              productName: product.name,
              sku: product.sku,
              requestedQuantity: line.requestedQuantity,
              receivedQuantity: 0,
              unitCost: typeof line.unitCost === 'number' ? line.unitCost : product.unitCost || 0,
            }
          }),
          notes,
          createdBy: session.user.id,
        })
      } catch (error: any) {
        if (error?.code === 11000 && attempt < 2) continue // reference collision — recount and retry
        throw error
      }
    }

    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'PURCHASE_ORDER_CREATE',
      resourceType: 'purchase_order',
      resourceId: purchaseOrder._id,
      metadata: { reference, supplierId, lines: lines.length },
    })

    await notifyRole({
      organization: session.user.organizationId,
      roles: ['admin', 'inventory_manager'],
      event: 'PO_CREATED',
      title: `Purchase order ${reference} created`,
      body: `${supplier.name} — ${lines.length} line${lines.length === 1 ? '' : 's'}`,
      link: `/dashboard/purchase-orders/${purchaseOrder._id}`,
      actorUserId: session.user.id,
    })

    return NextResponse.json({ success: true, data: purchaseOrder }, { status: 201 })
  } catch (error) {
    console.error('Create purchase order error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
