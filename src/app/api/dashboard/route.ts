import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { Product } from '@/models/Product'
import { Location } from '@/models/Location'
import { Inventory } from '@/models/Inventory'
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

    if (!hasPermission(session.user.role, 'inventory:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const orgId = new Types.ObjectId(session.user.organizationId)

    // Build location filter based on permissions
    let locationFilter: any = { organization: orgId }
    if (session.user.locationPermissions.length > 0) {
      locationFilter._id = { $in: session.user.locationPermissions.map((id) => new Types.ObjectId(id)) }
    }

    const [
      activeProducts,
      activeLocations,
      inventoryStats,
      lowStockItems,
      outOfStockItems,
      pendingApprovals,
      inTransitTransfers,
      completedTransfersThisMonth,
      recentMovements,
      transferVolumeData,
      inventoryByLocationData,
      lowStockProductsData,
      movementActivityData,
    ] = await Promise.all([
      // Active products count
      Product.countDocuments({ organization: orgId, isActive: true }),

      // Active locations count
      Location.countDocuments({ organization: orgId, isActive: true }),

      // Inventory aggregates
      Inventory.aggregate([
        { $match: { organization: orgId } },
        {
          $group: {
            _id: null,
            totalAvailable: { $sum: '$availableQuantity' },
            totalReserved: { $sum: '$reservedQuantity' },
            totalInTransit: { $sum: '$inTransitQuantity' },
            totalDamaged: { $sum: '$damagedQuantity' },
          },
        },
      ]),

      // Low stock items
      Inventory.countDocuments({
        organization: orgId,
        $expr: { $and: [{ $gt: ['$product.reorderThreshold', 0] }, { $lte: ['$availableQuantity', '$product.reorderThreshold'] }, { $gt: ['$availableQuantity', 0] }] },
      }),

      // Out of stock items
      Inventory.countDocuments({ organization: orgId, availableQuantity: 0 }),

      // Pending approvals
      StockTransfer.countDocuments({ organization: orgId, status: 'PENDING_APPROVAL' }),

      // In transit transfers
      StockTransfer.countDocuments({ organization: orgId, status: 'IN_TRANSIT' }),

      // Completed transfers this month
      StockTransfer.countDocuments({
        organization: orgId,
        status: 'COMPLETED',
        completedAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      }),

      // Recent movements count
      InventoryMovement.countDocuments({ organization: orgId, createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),

      // Transfer volume over time (last 30 days)
      StockTransfer.aggregate([
        {
          $match: {
            organization: orgId,
            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              status: '$status',
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.date': 1 } },
      ]),

      // Inventory by location
      Inventory.aggregate([
        { $match: { organization: orgId } },
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
          $group: {
            _id: '$location',
            locationName: { $first: '$locationInfo.name' },
            available: { $sum: '$availableQuantity' },
            reserved: { $sum: '$reservedQuantity' },
            inTransit: { $sum: '$inTransitQuantity' },
            damaged: { $sum: '$damagedQuantity' },
          },
        },
        { $sort: { available: -1 } },
        { $limit: 10 },
      ]),

      // Low stock products
      Inventory.aggregate([
        { $match: { organization: orgId, availableQuantity: { $lte: 10 } } },
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
          $match: { $expr: { $and: [{ $gt: ['$productInfo.reorderThreshold', 0] }, { $lte: ['$availableQuantity', '$productInfo.reorderThreshold'] }] } },
        },
        {
          $project: {
            productName: '$productInfo.name',
            sku: '$productInfo.sku',
            locationName: '$locationInfo.name',
            available: '$availableQuantity',
            threshold: '$productInfo.reorderThreshold',
          },
        },
        { $sort: { available: 1 } },
        { $limit: 10 },
      ]),

      // Movement activity (last 14 days)
      InventoryMovement.aggregate([
        {
          $match: {
            organization: orgId,
            createdAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              type: '$movementType',
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.date': 1 } },
      ]),
    ])

    const stats = inventoryStats[0] || { totalAvailable: 0, totalReserved: 0, totalInTransit: 0, totalDamaged: 0 }

    // Format transfer volume data
    const transferVolumeMap = new Map<string, { created: number; completed: number; inTransit: number }>()
    for (const item of transferVolumeData) {
      const date = item._id.date
      if (!transferVolumeMap.has(date)) {
        transferVolumeMap.set(date, { created: 0, completed: 0, inTransit: 0 })
      }
      const entry = transferVolumeMap.get(date)!
      if (item._id.status === 'DRAFT' || item._id.status === 'PENDING_APPROVAL') entry.created += item.count
      if (item._id.status === 'COMPLETED') entry.completed += item.count
      if (item._id.status === 'IN_TRANSIT') entry.inTransit += item.count
    }

    const transferVolume = Array.from(transferVolumeMap.entries())
      .map(([period, value]) => ({ period, ...value }))
      .sort((a, b) => a.period.localeCompare(b.period))

    // Format inventory by location
    const inventoryByLocation = inventoryByLocationData.map((item) => ({
      location: item.locationName,
      available: item.available,
      reserved: item.reserved,
      inTransit: item.inTransit,
      damaged: item.damaged,
    }))

    // Format movement activity
    const movementMap = new Map<string, { dispatches: number; receipts: number; adjustments: number; discrepancies: number }>()
    for (const item of movementActivityData) {
      const date = item._id.date
      if (!movementMap.has(date)) {
        movementMap.set(date, { dispatches: 0, receipts: 0, adjustments: 0, discrepancies: 0 })
      }
      const entry = movementMap.get(date)!
      if (item._id.type === 'DISPATCH') entry.dispatches += item.count
      if (item._id.type === 'RECEIPT') entry.receipts += item.count
      if (item._id.type === 'ADJUSTMENT') entry.adjustments += item.count
      if (item._id.type === 'DISCREPANCY' || item._id.type === 'DAMAGED') entry.discrepancies += item.count
    }

    const movementActivity = Array.from(movementMap.entries())
      .map(([date, value]) => ({ date, ...value }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          activeProducts,
          activeLocations,
          totalAvailableStock: stats.totalAvailable,
          totalReservedStock: stats.totalReserved,
          totalInTransitStock: stats.totalInTransit,
          totalDamagedStock: stats.totalDamaged,
          lowStockItems,
          outOfStockItems,
          pendingApprovals,
          inTransitTransfers,
          completedTransfersThisMonth,
          recentMovements,
        },
        charts: {
          transferVolume,
          inventoryByLocation,
          lowStockProducts: lowStockProductsData,
          movementActivity,
        },
      },
    })
  } catch (error) {
    console.error('Dashboard error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'

