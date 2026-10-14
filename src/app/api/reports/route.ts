import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { Inventory } from '@/models/Inventory'
import { Product } from '@/models/Product'
import { Location } from '@/models/Location'
import { StockTransfer } from '@/models/StockTransfer'
import { InventoryMovement } from '@/models/InventoryMovement'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
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

      default:
        return NextResponse.json({ success: false, error: 'Invalid report type' }, { status: 400 })
    }

    if (format === 'csv') {
      if (data.length === 0) {
        return NextResponse.json({ success: true, data: 'No data to export' })
      }

      const headers = Object.keys(data[0])
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
      const csv = csvRows.join('\n')

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

