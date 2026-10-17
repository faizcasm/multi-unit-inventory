import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { PurchaseOrder } from '@/models/PurchaseOrder'
import { Inventory } from '@/models/Inventory'
import { InventoryMovement } from '@/models/InventoryMovement'
import { Product } from '@/models/Product'
import { Location } from '@/models/Location'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'
import { notifyRole } from '@/lib/notify'
import { receivePurchaseOrderSchema } from '@/lib/validation/purchase-orders'
import { Types } from 'mongoose'

const RECEIVABLE_STATUSES = ['DRAFT', 'SENT', 'PARTIALLY_RECEIVED']

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'purchase_orders:receive')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid purchase order ID' }, { status: 400 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = receivePurchaseOrderSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const purchaseOrder = await PurchaseOrder.findOne({
      _id: id,
      organization: session.user.organizationId,
    })
    if (!purchaseOrder) {
      return NextResponse.json({ success: false, error: 'Purchase order not found' }, { status: 404 })
    }

    if (!RECEIVABLE_STATUSES.includes(purchaseOrder.status)) {
      return NextResponse.json(
        { success: false, error: `Cannot receive stock against a ${purchaseOrder.status} purchase order` },
        { status: 400 }
      )
    }

    // Merge duplicate product entries in the payload.
    const payload = new Map<string, number>()
    for (const entry of parsed.data.lines) {
      if (!Types.ObjectId.isValid(entry.productId)) {
        return NextResponse.json({ success: false, error: 'Invalid product ID' }, { status: 400 })
      }
      payload.set(entry.productId, (payload.get(entry.productId) || 0) + entry.receivedQuantity)
    }

    // Resolve product names so over-receipt errors can name the product.
    const products = await Product.find({
      _id: { $in: Array.from(payload.keys()) },
      organization: session.user.organizationId,
    }).select('name sku')
    const productNames = new Map(products.map((p: any) => [p._id.toString(), p.name]))

    // Validate every payload line against the order before touching anything.
    for (const [productId, qty] of Array.from(payload.entries())) {
      const line = purchaseOrder.lines.find((l: any) => l.product.toString() === productId)
      const productName = line?.productName || productNames.get(productId) || productId
      if (!line) {
        return NextResponse.json(
          { success: false, error: `${productName} is not on this purchase order` },
          { status: 400 }
        )
      }
      const newReceived = (line.receivedQuantity || 0) + qty
      if (newReceived > line.requestedQuantity) {
        return NextResponse.json(
          {
            success: false,
            error: `Over-receipt blocked for ${productName}: ${newReceived} would exceed ordered quantity ${line.requestedQuantity} (already received ${line.receivedQuantity || 0})`,
          },
          { status: 400 }
        )
      }
    }

    // Guard: the destination must still be an active location and every
    // product being received must still be active — either could have
    // changed since the PO was created.
    const destination = await Location.findOne({
      _id: purchaseOrder.destinationLocation,
      organization: session.user.organizationId,
      isActive: true,
    })
    if (!destination) {
      return NextResponse.json({ success: false, error: 'Cannot receive into an inactive location' }, { status: 400 })
    }

    const activeProducts = await Product.find({
      _id: { $in: Array.from(payload.keys()) },
      organization: session.user.organizationId,
      isActive: true,
    })
      .select('_id')
      .lean()
    const activeProductIds = new Set(activeProducts.map((p: any) => String(p._id)))
    for (const productId of Array.from(payload.keys())) {
      if (!activeProductIds.has(productId)) {
        const productName = productNames.get(productId) || productId
        return NextResponse.json(
          { success: false, error: `Cannot receive an inactive product: ${productName}` },
          { status: 400 }
        )
      }
    }

    // Same transaction structure as the adjust / stocktake-post routes.
    const mongoSession = await Inventory.startSession()
    mongoSession.startTransaction()

    try {
      const now = new Date()

      // Re-read the PO inside the transaction so the over-receipt guard
      // below sees receives that committed after the pre-transaction
      // validation (TOCTOU), not the stale outer snapshot.
      const freshPO = await PurchaseOrder.findOne({
        _id: purchaseOrder._id,
        organization: session.user.organizationId,
      }).session(mongoSession)
      if (!freshPO) {
        await mongoSession.abortTransaction()
        return NextResponse.json({ success: false, error: 'Purchase order not found' }, { status: 404 })
      }

      for (const [productId, qty] of Array.from(payload.entries())) {
        const line = freshPO.lines.find((l: any) => l.product.toString() === productId)

        // Re-check over-receipt right before mutating: a concurrent receive
        // may have advanced receivedQuantity past the ordered quantity.
        if (line && line.receivedQuantity + qty > line.requestedQuantity) {
          await mongoSession.abortTransaction()
          return NextResponse.json(
            {
              success: false,
              error: `Over-receipt detected on concurrent receive for ${line.productName || productId}`,
            },
            { status: 400 }
          )
        }

        const existing = await Inventory.findOne({
          organization: session.user.organizationId,
          product: productId,
          location: purchaseOrder.destinationLocation,
        }).session(mongoSession)

        const beforeQuantity = {
          available: existing?.availableQuantity || 0,
          reserved: existing?.reservedQuantity || 0,
          inTransit: existing?.inTransitQuantity || 0,
          damaged: existing?.damagedQuantity || 0,
        }

        const inventory = await Inventory.findOneAndUpdate(
          {
            organization: session.user.organizationId,
            product: productId,
            location: purchaseOrder.destinationLocation,
          },
          {
            $inc: { availableQuantity: qty },
            $set: { lastMovementAt: now },
            $setOnInsert: { reservedQuantity: 0, inTransitQuantity: 0, damagedQuantity: 0 },
          },
          { new: true, upsert: true, session: mongoSession }
        )

        const afterQuantity = {
          available: inventory.availableQuantity,
          reserved: inventory.reservedQuantity,
          inTransit: inventory.inTransitQuantity,
          damaged: inventory.damagedQuantity,
        }

        await InventoryMovement.create(
          [
            {
              organization: session.user.organizationId,
              product: productId,
              location: purchaseOrder.destinationLocation,
              movementType: 'RECEIPT',
              quantity: qty,
              referenceType: 'PURCHASE_ORDER',
              referenceId: purchaseOrder._id,
              responsibleUser: session.user.id,
              reason: `Purchase order ${purchaseOrder.reference} received`,
              beforeQuantity,
              afterQuantity,
              notes: line?.productName,
            },
          ],
          { session: mongoSession }
        )

        line.receivedQuantity = (line.receivedQuantity || 0) + qty
      }

      freshPO.receivedBy = session.user.id as any
      const fullyReceived = freshPO.lines.every(
        (l: any) => (l.receivedQuantity || 0) >= l.requestedQuantity
      )
      freshPO.status = fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED'
      await freshPO.save({ session: mongoSession })

      // Keep the outer snapshot in sync for the response / notifications.
      purchaseOrder.lines = freshPO.lines
      purchaseOrder.status = freshPO.status

      await mongoSession.commitTransaction()

      const received = Array.from(payload.entries()).map(([productId, qty]) => ({ productId, qty }))

      await AuditEvent.create({
        organization: session.user.organizationId,
        user: session.user.id,
        action: 'PURCHASE_ORDER_RECEIVE',
        resourceType: 'purchase_order',
        resourceId: purchaseOrder._id,
        metadata: { reference: purchaseOrder.reference, received },
      })

      await notifyRole({
        organization: session.user.organizationId,
        roles: ['admin', 'inventory_manager'],
        event: 'PO_RECEIVED',
        title: `PO ${purchaseOrder.reference} received`,
        body: `${purchaseOrder.status === 'RECEIVED' ? 'Fully received' : 'Partially received'} at destination`,
        link: `/dashboard/purchase-orders/${purchaseOrder._id}`,
        actorUserId: session.user.id,
      })

      return NextResponse.json({
        success: true,
        data: {
          status: purchaseOrder.status,
          lines: purchaseOrder.lines.map((l: any) => ({
            productId: l.product.toString(),
            productName: l.productName,
            requestedQuantity: l.requestedQuantity,
            receivedQuantity: l.receivedQuantity || 0,
            remaining: l.requestedQuantity - (l.receivedQuantity || 0),
          })),
        },
      })
    } catch (error) {
      await mongoSession.abortTransaction()
      throw error
    } finally {
      await mongoSession.endSession()
    }
  } catch (error) {
    console.error('Receive purchase order error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
