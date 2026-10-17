import { NextRequest, NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { connectDB } from '@/lib/db/mongodb'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { Product } from '@/models/Product'
import { Inventory } from '@/models/Inventory'
import { StockTransfer } from '@/models/StockTransfer'
import { PurchaseOrder } from '@/models/PurchaseOrder'
import { AuditEvent } from '@/models/AuditEvent'

export const dynamic = 'force-dynamic'

const MAX_BULK_IDS = 100

/** Statuses that count as an open transfer / PO for the deactivate guard. */
const OPEN_TRANSFER_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_TRANSIT']
const OPEN_PO_STATUSES = ['DRAFT', 'SENT', 'PARTIALLY_RECEIVED']

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'products:deactivate')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })
    }

    const { ids, action } = body as { ids?: unknown; action?: unknown }

    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
      return NextResponse.json(
        { success: false, error: 'ids must be a non-empty array of strings' },
        { status: 400 }
      )
    }
    if (ids.length > MAX_BULK_IDS) {
      return NextResponse.json(
        { success: false, error: `Too many ids — a maximum of ${MAX_BULK_IDS} is allowed` },
        { status: 400 }
      )
    }
    if (ids.some((id) => !Types.ObjectId.isValid(id))) {
      return NextResponse.json({ success: false, error: 'One or more ids are invalid' }, { status: 400 })
    }
    if (action !== 'activate' && action !== 'deactivate') {
      return NextResponse.json(
        { success: false, error: "action must be 'activate' or 'deactivate'" },
        { status: 400 }
      )
    }

    await connectDB()

    if (action === 'deactivate') {
      // Mirror the single-product DELETE guards: refuse to deactivate
      // products that still hold stock or sit on open transfers / POs.
      const candidates = await Product.find({
        organization: session.user.organizationId,
        _id: { $in: ids },
        isActive: true,
      })
        .select('name')
        .lean()

      const candidateIds = candidates.map((p: any) => String(p._id))
      if (candidateIds.length > 0) {
        const idObjects = candidateIds.map((id) => new Types.ObjectId(id))
        const blocked = new Set<string>()

        // Non-zero available inventory at any location.
        const withStock = await Inventory.find({
          organization: session.user.organizationId,
          product: { $in: idObjects },
          availableQuantity: { $gt: 0 },
        })
          .select('product')
          .lean()
        for (const inv of withStock as any[]) {
          blocked.add(String(inv.product))
        }

        // Referenced by an open transfer.
        const openTransfers = await StockTransfer.find({
          organization: session.user.organizationId,
          status: { $in: OPEN_TRANSFER_STATUSES },
          'lineItems.product': { $in: idObjects },
        })
          .select('lineItems.product')
          .lean()
        for (const transfer of openTransfers as any[]) {
          for (const item of transfer.lineItems || []) {
            blocked.add(String(item.product))
          }
        }

        // Referenced by an open purchase order.
        const openPOs = await PurchaseOrder.find({
          organization: session.user.organizationId,
          status: { $in: OPEN_PO_STATUSES },
          'lines.product': { $in: idObjects },
        })
          .select('lines.product')
          .lean()
        for (const po of openPOs as any[]) {
          for (const line of po.lines || []) {
            blocked.add(String(line.product))
          }
        }

        if (blocked.size > 0) {
          const names = candidates
            .filter((p: any) => blocked.has(String(p._id)))
            .map((p: any) => p.name)
          const shown = names.slice(0, 3)
          const extra = names.length - shown.length
          const label = extra > 0 ? `${shown.join(', ')} and ${extra} more` : shown.join(', ')
          return NextResponse.json(
            { success: false, error: `Cannot deactivate: ${label} have stock or open orders` },
            { status: 400 }
          )
        }
      }
    }

    const result = await Product.updateMany(
      { organization: session.user.organizationId, _id: { $in: ids } },
      { $set: { isActive: action === 'activate' } }
    )

    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'PRODUCT_UPDATE',
      resourceType: 'Product',
      metadata: { bulk: true, action, count: result.modifiedCount, sample: ids.slice(0, 20) },
    })

    return NextResponse.json({ success: true, data: { updated: result.modifiedCount } })
  } catch (error) {
    console.error('Bulk product update error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
