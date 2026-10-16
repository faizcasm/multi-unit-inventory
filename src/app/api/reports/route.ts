import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { Inventory } from '@/models/Inventory'
import { Product } from '@/models/Product'
import { Location } from '@/models/Location'
import { StockTransfer } from '@/models/StockTransfer'
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

    if (!hasPermission(session.user.role, 'reports:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const { searchParams } = new URL(request.url)
    const reportType = searchParams.get('type') || 'stock'
    const locationId = searchParams.get('locationId') || ''
    const category = searchParams.get('category') || ''
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''
    const format = searchParams.get('format') || 'json'

    const orgId = new Types.ObjectId(session.user.organizationId)

    // Build location filter
    let locationFilter: any = { organization: orgId }
    if (session.user.locationPermissions.length > 0) {
      locationFilter._id = { $in: session.user.locationPermissions.map((id) => new Types.ObjectId(id)) }
    }
    if (locationId && Types.ObjectId.isValid(locationId)) {
      locationFilter._id = new Types.ObjectId(locationId)
    }

    let data: any[] = []
    let filename = 'report'

    switch (reportType) {
      case 'stock': {
        // Current stock by location
        const pipeline: any[] = [
          { $match: { organization: orgId } },
          {
            $lookup: {
              from: 'products',
              localField: 'product',
              foreignField: '_id',
              as: 'productInfo',
            },
          },
          { $unwind: '$productInfo' },
          {
            $lookup: {
              from: 'locations',
              localField: 'location',
              foreignField: '_id',
              as: 'locationInfo',
            },
          },
          { $unwind: '$locationInfo' },
        ]

        if (locationId) {
          pipeline.push({ $match: { location: new Types.ObjectId(locationId) } })
        }
        if (category) {
          pipeline.push({ $match: { 'productInfo.category': category } })
        }

        pipeline.push({
          $project: {
            location: '$locationInfo.name',
            locationCode: '$locationInfo.code',
            product: '$productInfo.name',
            sku: '$productInfo.sku',
            category: '$productInfo.category',
            unitOfMeasure: '$productInfo.unitOfMeasure',
            available: '$availableQuantity',
            reserved: '$reservedQuantity',
            inTransit: '$inTransitQuantity',
            damaged: '$damagedQuantity',
            reorderThreshold: '$productInfo.reorderThreshold',
          },
        })

        data = await Inventory.aggregate(pipeline)
        filename = 'stock-report'
        break
      }

      case 'low-stock': {
        const pipeline: any[] = [
          { $match: { organization: orgId } },
          {
            $lookup: {
              from: 'products',
              localField: 'product',
              foreignField: '_id',
              as: 'productInfo',
            },
          },
          { $unwind: '$productInfo' },
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
            $match: {
              $expr: {
                $and: [
                  { $gt: ['$productInfo.reorderThreshold', 0] },
                  { $lte: ['$availableQuantity', '$productInfo.reorderThreshold'] },
                ],
              },
            },
          },
          {
            $project: {
              location: '$locationInfo.name',
              locationCode: '$locationInfo.code',
              product: '$productInfo.name',
              sku: '$productInfo.sku',
              category: '$productInfo.category',
              unitOfMeasure: '$productInfo.unitOfMeasure',
              available: '$availableQuantity',
              threshold: '$productInfo.reorderThreshold',
              status: { $cond: [{ $eq: ['$availableQuantity', 0] }, 'OUT_OF_STOCK', 'LOW_STOCK'] },
            },
          },
          { $sort: { available: 1 } },
        ]

        data = await Inventory.aggregate(pipeline)
        filename = 'low-stock-report'
        break
      }

      case 'transfers': {
        const match: any = { organization: orgId }
        if (dateFrom) match.createdAt = { ...match.createdAt, $gte: new Date(dateFrom) }
        if (dateTo) match.createdAt = { ...match.createdAt, $lte: new Date(dateTo) }

        data = await StockTransfer.aggregate([
          { $match: match },
          {
            $lookup: {
              from: 'locations',
              localField: 'sourceLocation',
              foreignField: '_id',
              as: 'sourceInfo',
            },
          },
          { $unwind: '$sourceInfo' },
          {
            $lookup: {
              from: 'locations',
              localField: 'destinationLocation',
              foreignField: '_id',
              as: 'destInfo',
            },
          },
          { $unwind: '$destInfo' },
          {
            $lookup: {
              from: 'users',
              localField: 'requester',
              foreignField: '_id',
              as: 'requesterInfo',
            },
          },
          { $unwind: '$requesterInfo' },
          {
            $project: {
              reference: 1,
              status: 1,
              sourceLocation: '$sourceInfo.name',
              sourceCode: '$sourceInfo.code',
              destinationLocation: '$destInfo.name',
              destCode: '$destInfo.code',
              requester: '$requesterInfo.name',
              lineItemsCount: { $size: '$lineItems' },
              totalRequested: { $sum: '$lineItems.requestedQuantity' },
              createdAt: 1,
              approvedAt: 1,
              dispatchedAt: 1,
              receivedAt: 1,
            },
          },
          { $sort: { createdAt: -1 } },
        ])
        filename = 'transfer-history-report'
        break
      }

      case 'discrepancies': {
        const match: any = { organization: orgId }
        if (dateFrom) match.createdAt = { ...match.createdAt, $gte: new Date(dateFrom) }
        if (dateTo) match.createdAt = { ...match.createdAt, $lte: new Date(dateTo) }

        data = await InventoryMovement.aggregate([
          { $match: { ...match, movementType: { $in: ['DISCREPANCY', 'DAMAGED'] } } },
          {
            $lookup: {
              from: 'products',
              localField: 'product',
              foreignField: '_id',
              as: 'productInfo',
            },
          },
          { $unwind: '$productInfo' },
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
            $lookup: {
              from: 'users',
              localField: 'responsibleUser',
              foreignField: '_id',
              as: 'userInfo',
            },
          },
          { $unwind: '$userInfo' },
          {
            $project: {
              date: '$createdAt',
              product: '$productInfo.name',
              sku: '$productInfo.sku',
              location: '$locationInfo.name',
              movementType: 1,
              quantity: 1,
              reason: 1,
              responsibleUser: '$userInfo.name',
              notes: 1,
            },
          },
          { $sort: { createdAt: -1 } },
        ])
        filename = 'discrepancy-report'
        break
      }

      case 'movements': {
        const match: any = { organization: orgId }
        if (dateFrom) match.createdAt = { ...match.createdAt, $gte: new Date(dateFrom) }
        if (dateTo) match.createdAt = { ...match.createdAt, $lte: new Date(dateTo) }

        data = await InventoryMovement.aggregate([
          { $match: match },
          {
            $lookup: {
              from: 'products',
              localField: 'product',
              foreignField: '_id',
              as: 'productInfo',
            },
          },
          { $unwind: '$productInfo' },
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
            $lookup: {
              from: 'users',
              localField: 'responsibleUser',
              foreignField: '_id',
              as: 'userInfo',
            },
          },
          { $unwind: '$userInfo' },
          {
            $project: {
              date: '$createdAt',
              product: '$productInfo.name',
              sku: '$productInfo.sku',
              location: '$locationInfo.name',
              movementType: 1,
              quantity: 1,
              referenceType: 1,
              referenceId: 1,
              reason: 1,
              responsibleUser: '$userInfo.name',
              beforeAvailable: '$beforeQuantity.available',
              afterAvailable: '$afterQuantity.available',
              notes: 1,
            },
          },
          { $sort: { createdAt: -1 } },
        ])
        filename = 'movement-history-report'
        break
      }

      case 'valuation': {
        // Per product × location inventory valuation. unitCost comes from the
        // product record (0 when the product has no cost set).
        const pipeline: any[] = [
          { $match: { organization: orgId } },
          {
            $lookup: {
              from: 'products',
              localField: 'product',
              foreignField: '_id',
              as: 'productInfo',
            },
          },
          { $unwind: '$productInfo' },
          { $match: { 'productInfo.isActive': true } },
          {
            $lookup: {
              from: 'locations',
              localField: 'location',
              foreignField: '_id',
              as: 'locationInfo',
            },
          },
          { $unwind: '$locationInfo' },
        ]

        if (locationId) {
          pipeline.push({ $match: { location: new Types.ObjectId(locationId) } })
        }
        if (category) {
          pipeline.push({ $match: { 'productInfo.category': category } })
        }

        const onHandExpr = {
          $add: ['$availableQuantity', '$reservedQuantity', '$inTransitQuantity', '$damagedQuantity'],
        }
        const unitCostExpr = { $ifNull: ['$productInfo.unitCost', 0] }

        pipeline.push({
          $project: {
            sku: '$productInfo.sku',
            name: '$productInfo.name',
            category: '$productInfo.category',
            unitOfMeasure: '$productInfo.unitOfMeasure',
            location: '$locationInfo.name',
            available: '$availableQuantity',
            reserved: '$reservedQuantity',
            damaged: '$damagedQuantity',
            inTransit: '$inTransitQuantity',
            onHand: onHandExpr,
            unitCost: unitCostExpr,
            totalValue: { $multiply: [onHandExpr, unitCostExpr] },
          },
        })
        pipeline.push({ $sort: { name: 1, location: 1 } })

        data = await Inventory.aggregate(pipeline)
        filename = 'valuation-report'
        break
      }

      case 'forecast': {
        // Demand forecast per active product. All math (velocity sign rules,
        // coverage, suggested qty, classification) comes from src/lib/planning.ts.
        // locationId is intentionally ignored — the forecast works on the
        // org-wide product catalog; `category` still narrows the row set.
        const now = Date.now()
        const cutoff90 = new Date(now - 90 * 24 * 60 * 60 * 1000)
        const cutoff30 = now - 30 * 24 * 60 * 60 * 1000

        const productFilter: any = { organization: orgId, isActive: true }
        if (category) productFilter.category = category

        // Lean results are weakly typed via the `mongoose.models.X ||` model
        // fallback — narrow them to the fields this case consumes.
        interface LeanProduct {
          _id: Types.ObjectId
          name: string
          sku: string
          unitOfMeasure: string
          category?: string
          reorderThreshold: number
          reorderQuantity: number
        }
        interface LeanMovement extends MovementLike {
          product: Types.ObjectId
        }

        const [rawProducts, availableByProduct, rawMovements] = await Promise.all([
          Product.find(productFilter).lean(),
          Inventory.aggregate([
            { $match: { organization: orgId } },
            { $group: { _id: '$product', available: { $sum: '$availableQuantity' } } },
          ]),
          // 90 days of movements covers velocity90d AND the previous 30-day
          // window (days 30–60 back) needed for trendPct.
          InventoryMovement.find(
            { organization: orgId, createdAt: { $gte: cutoff90 }, movementType: { $in: ['DISPATCH', 'RETURN'] } },
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

        data = products.map((product) => {
          const pid = String(product._id)
          const available = availableMap.get(pid) ?? 0
          const productMovements = movementsByProduct.get(pid) ?? []

          const velocity7d = computeVelocity(productMovements, 7, now)
          const velocity30d = computeVelocity(productMovements, 30, now)
          const velocity90d = computeVelocity(productMovements, 90, now)
          // Previous 30-day window: the same helper with the window shifted
          // back 30 days (its `now` upper bound excludes the current window).
          const velocityPrev30d = computeVelocity(productMovements, 30, cutoff30)

          // Trend of the current 30d window vs. the previous one; null when
          // there is no previous demand to compare against.
          const trendPct =
            velocityPrev30d > 0 ? Math.round(((velocity30d - velocityPrev30d) / velocityPrev30d) * 100 * 10) / 10 : null

          const coverage = computeCoverageDays(available, velocity30d)
          const classified = classifyStock(available, product.reorderThreshold || 0, coverage)

          return {
            sku: product.sku,
            name: product.name,
            category: product.category || '',
            unitOfMeasure: product.unitOfMeasure,
            available,
            velocity7d,
            velocity30d,
            velocity90d,
            trendPct,
            projected30d: Math.ceil(velocity30d * 30),
            coverageDays: coverage,
            suggestedQty: suggestedOrderQty(product, available, velocity30d),
            status: classified,
          }
        })
        filename = 'forecast-report'
        break
      }

      default:
        return NextResponse.json({ success: false, error: 'Invalid report type' }, { status: 400 })
    }

    if (format === 'csv') {
      // Always honor the format contract: format=csv ⇒ text/csv (even with no
      // rows) so the browser never saves a JSON blob under a .csv filename.
      const headers = data.length > 0 ? Object.keys(data[0]) : []
      const csvRows = [
        headers.join(','),
        ...data.map((row) =>
          headers.map((h) => {
            const val = row[h]
            if (val === null || val === undefined) return ''
            if (typeof val === 'object') return JSON.stringify(val)
            const str = String(val)
            return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str
          }).join(',')
        ),
      ]
      const csv = data.length > 0 ? csvRows.join('\n') : ''

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      })
    }

    return NextResponse.json({ success: true, data, count: data.length })
  } catch (error) {
    console.error('Reports error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'

