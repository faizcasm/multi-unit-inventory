import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { Inventory } from '@/models/Inventory'
import { Product } from '@/models/Product'
import { InventoryMovement } from '@/models/InventoryMovement'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { computeVelocity, computeCoverageDays, suggestedOrderQty, classifyStock, MovementLike } from '@/lib/planning'
import { Types } from 'mongoose'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'inventory:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    // Trailing window in days: default 30, clamped to 7–90.
    const { searchParams } = new URL(request.url)
    const rawDays = Number(searchParams.get('days'))
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(90, Math.max(7, Math.round(rawDays))) : 30
    const velocityField = `velocity${days}d`

    const orgId = new Types.ObjectId(session.user.organizationId)
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    // One pass per collection; the per-product math lives in src/lib/planning.ts.
    // The models are registered via the `mongoose.models.X ||` fallback so lean()
    // results come back weakly typed — narrow them to the fields we consume.
    interface LeanProduct {
      _id: Types.ObjectId
      name: string
      sku: string
      unitOfMeasure: string
      category?: string
      unitCost: number
      reorderThreshold: number
      reorderQuantity: number
      supplier?: { name?: string } | null
    }
    interface LeanMovement extends MovementLike {
      product: Types.ObjectId
    }

    const [rawProducts, availableByProduct, rawMovements] = await Promise.all([
      Product.find({ organization: orgId, isActive: true })
        .populate('supplier', 'name')
        .lean(),
      Inventory.aggregate([
        { $match: { organization: orgId } },
        { $group: { _id: '$product', available: { $sum: '$availableQuantity' } } },
      ]),
      // Only demand-type movements; planning.computeVelocity applies the
      // per-type sign rules (DISPATCH positive, RETURN only when negative).
      InventoryMovement.find(
        { organization: orgId, createdAt: { $gte: cutoff }, movementType: { $in: ['DISPATCH', 'RETURN'] } },
        'product movementType quantity createdAt'
      ).lean(),
    ])
    const products = rawProducts as unknown as LeanProduct[]
    const movements = rawMovements as unknown as LeanMovement[]

    const availableMap = new Map<string, number>()
    for (const row of availableByProduct) availableMap.set(String(row._id), row.available || 0)

    const movementsByProduct = new Map<string, MovementLike[]>()
    for (const m of movements) {
      const key = String(m.product)
      const list = movementsByProduct.get(key)
      if (list) list.push(m)
      else movementsByProduct.set(key, [m])
    }

    const items: any[] = []

    for (const product of products) {
      const pid = String(product._id)
      const available = availableMap.get(pid) ?? 0
      const hasInventory = availableMap.has(pid)
      const threshold = product.reorderThreshold || 0

      // Include products with any inventory record, or below-threshold ones
      // (which covers zero-stock products that have no inventory rows at all).
      const belowThreshold = threshold > 0 && available <= threshold
      if (!hasInventory && !belowThreshold) continue

      const velocity = computeVelocity(movementsByProduct.get(pid) ?? [], days)
      const coverage = computeCoverageDays(available, velocity)
      const classified = classifyStock(available, threshold, coverage)
      const status = classified === 'below' ? 'below_threshold' : classified
      const suggestedQty = suggestedOrderQty(product, available, velocity)
      const unitCost = product.unitCost || 0
      const supplier = product.supplier

      items.push({
        productId: pid,
        name: product.name,
        sku: product.sku,
        unitOfMeasure: product.unitOfMeasure,
        category: product.category || '',
        available,
        threshold,
        reorderQuantity: product.reorderQuantity || 0,
        [velocityField]: velocity,
        coverageDays: coverage,
        stockoutDate: coverage !== null && coverage > 0 ? new Date(Date.now() + coverage * 24 * 60 * 60 * 1000).toISOString() : null,
        suggestedQty,
        status,
        supplier: supplier?.name ? { name: supplier.name } : null,
        totalValueOfSuggested: Math.round(suggestedQty * unitCost * 100) / 100,
      })
    }

    // Sort: below threshold first, then at-risk by soonest stockout (null
    // coverage last), then healthy alphabetically.
    const statusRank: Record<string, number> = { below_threshold: 0, at_risk: 1, ok: 2 }
    items.sort((a, b) => {
      const rank = statusRank[a.status] - statusRank[b.status]
      if (rank !== 0) return rank
      if (a.status === 'at_risk') {
        const ca = a.coverageDays ?? Number.POSITIVE_INFINITY
        const cb = b.coverageDays ?? Number.POSITIVE_INFINITY
        if (ca !== cb) return ca - cb
      }
      return a.name.localeCompare(b.name)
    })

    // Totals cover the actionable rows only (below + at risk) — suggesting
    // orders for healthy products would just be noise.
    const totals = items.reduce(
      (acc, item) => {
        if (item.status === 'below_threshold') acc.below += 1
        else if (item.status === 'at_risk') acc.atRisk += 1
        else acc.ok += 1
        if (item.status !== 'ok') {
          acc.totalSuggestedQty += item.suggestedQty
          acc.totalSuggestedValue += item.totalValueOfSuggested
        }
        return acc
      },
      { below: 0, atRisk: 0, ok: 0, totalSuggestedQty: 0, totalSuggestedValue: 0 }
    )
    totals.totalSuggestedValue = Math.round(totals.totalSuggestedValue * 100) / 100

    return NextResponse.json({
      success: true,
      data: {
        days,
        velocityField,
        items,
        totals,
      },
    })
  } catch (error) {
    console.error('Replenishment error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
export const dynamic = 'force-dynamic'
