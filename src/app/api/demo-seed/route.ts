import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'
import { Location } from '@/models/Location'
import { Product } from '@/models/Product'
import { Inventory } from '@/models/Inventory'
import { InventoryMovement } from '@/models/InventoryMovement'
import { StockTransfer } from '@/models/StockTransfer'
import { Types } from 'mongoose'

interface SeedCounts {
  locations: number
  products: number
  transfers: number
  movements: number
}

/** Standalone mongo (no replica set) rejects transactions — fall back to sequential writes. */
function isTransactionUnsupported(err: unknown): boolean {
  const code = (err as { code?: number })?.code
  const message = err instanceof Error ? err.message : String(err)
  return (
    code === 20 ||
    /transaction numbers are only allowed|does not support (?:transactions|replica set)|transactions are not supported|transaction api is not supported/i.test(
      message
    )
  )
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Seeding creates locations AND products — require both permissions.
    if (
      !hasPermission(session.user.role, 'locations:create') ||
      !hasPermission(session.user.role, 'products:create')
    ) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const orgId = new Types.ObjectId(session.user.organizationId)
    const userId = new Types.ObjectId(String(session.user.id))

    const [productCount, locationCount] = await Promise.all([
      Product.countDocuments({ organization: orgId }),
      Location.countDocuments({ organization: orgId }),
    ])

    if (productCount >= 1 || locationCount > 1) {
      return NextResponse.json({ success: false, error: 'Workspace already has data' }, { status: 409 })
    }

    const runSeed = async (txnSession: any): Promise<SeedCounts> => {
      const opts = txnSession ? { session: txnSession } : {}
      const now = new Date()

      // --- Locations ---
      const [northHub, southStore] = await Location.insertMany(
        [
          {
            organization: orgId,
            name: 'North Hub',
            code: 'NORTH',
            type: 'warehouse',
            address: { city: 'Austin' },
            capacity: 500,
            isActive: true,
          },
          {
            organization: orgId,
            name: 'South Store',
            code: 'SOUTH',
            type: 'store',
            address: { city: 'Miami' },
            capacity: 200,
            isActive: true,
          },
        ],
        opts
      )

      // --- Products ---
      const products = await Product.insertMany(
        [
          { organization: orgId, name: 'Wireless Mouse', sku: 'WM-220', unitOfMeasure: 'pcs', unitCost: 12.5, reorderThreshold: 20, reorderQuantity: 40, isActive: true },
          { organization: orgId, name: 'Mechanical Keyboard', sku: 'KB-440', unitOfMeasure: 'pcs', unitCost: 34, reorderThreshold: 15, reorderQuantity: 30, isActive: true },
          { organization: orgId, name: 'USB-C Hub', sku: 'HUB-110', unitOfMeasure: 'pcs', unitCost: 22, reorderThreshold: 10, reorderQuantity: 25, isActive: true },
          { organization: orgId, name: '27" Monitor', sku: 'MON-270', unitOfMeasure: 'pcs', unitCost: 145, reorderThreshold: 5, reorderQuantity: 10, isActive: true },
          { organization: orgId, name: 'Laptop Stand', sku: 'STD-090', unitOfMeasure: 'pcs', unitCost: 28, reorderThreshold: 12, reorderQuantity: 20, isActive: true },
          { organization: orgId, name: 'HDMI Cable 2m', sku: 'HDMI-2M', unitOfMeasure: 'pcs', unitCost: 6.5, reorderThreshold: 30, reorderQuantity: 60, isActive: true },
        ],
        opts
      )

      // --- Inventory: full stock at North Hub, a little at South Store for 3 products ---
      const northQuantities = [120, 80, 45, 12, 60, 150]
      const southQuantities = [30, 25, 40]

      const inventoryRows = [
        ...products.map((product, i) => ({
          organization: orgId,
          product: product._id,
          location: northHub._id,
          availableQuantity: northQuantities[i],
          reservedQuantity: 0,
          inTransitQuantity: 0,
          damagedQuantity: 0,
          lastMovementAt: now,
        })),
        ...products.slice(0, 3).map((product, i) => ({
          organization: orgId,
          product: product._id,
          location: southStore._id,
          availableQuantity: southQuantities[i],
          reservedQuantity: 0,
          inTransitQuantity: 0,
          damagedQuantity: 0,
          lastMovementAt: now,
        })),
      ]

      const inventories = await Inventory.insertMany(inventoryRows, opts)

      // --- One ADJUSTMENT movement per inventory doc so charts aren't empty ---
      const movements = await InventoryMovement.insertMany(
        inventories.map((inventory) => ({
          organization: orgId,
          product: inventory.product,
          location: inventory.location,
          movementType: 'ADJUSTMENT',
          quantity: inventory.availableQuantity,
          referenceType: 'ADJUSTMENT',
          referenceId: inventory._id,
          responsibleUser: userId,
          reason: 'Demo data seed',
          beforeQuantity: { available: 0, reserved: 0, inTransit: 0, damaged: 0 },
          afterQuantity: {
            available: inventory.availableQuantity,
            reserved: 0,
            inTransit: 0,
            damaged: 0,
          },
        })),
        opts
      )

      // --- Transfers (references follow the transfers-route count pattern) ---
      const transferCountQuery = StockTransfer.countDocuments({ organization: orgId })
      if (txnSession) transferCountQuery.session(txnSession)
      const existingTransfers = await transferCountQuery

      const historyAt = (step: number) => new Date(now.getTime() + step)

      await StockTransfer.insertMany(
        [
          {
            organization: orgId,
            reference: `TXN-${String(existingTransfers + 1).padStart(6, '0')}`,
            sourceLocation: northHub._id,
            destinationLocation: southStore._id,
            lineItems: [
              { product: products[0]._id, requestedQuantity: 10, approvedQuantity: 10, dispatchedQuantity: 10, receivedQuantity: 10 },
              { product: products[1]._id, requestedQuantity: 5, approvedQuantity: 5, dispatchedQuantity: 5, receivedQuantity: 5 },
            ],
            status: 'COMPLETED',
            requester: userId,
            approver: userId,
            approvedAt: historyAt(1),
            dispatchedBy: userId,
            dispatchedAt: historyAt(2),
            receivedBy: userId,
            receivedAt: historyAt(3),
            statusHistory: [
              { status: 'DRAFT', changedBy: userId, changedAt: now, notes: 'Transfer created as draft' },
              { status: 'APPROVED', changedBy: userId, changedAt: historyAt(1) },
              { status: 'IN_TRANSIT', changedBy: userId, changedAt: historyAt(2) },
              { status: 'COMPLETED', changedBy: userId, changedAt: historyAt(3), notes: 'Demo data seed' },
            ],
            notes: 'Demo data seed',
          },
        ],
        opts
      )

      await StockTransfer.insertMany(
        [
          {
            organization: orgId,
            reference: `TXN-${String(existingTransfers + 2).padStart(6, '0')}`,
            sourceLocation: southStore._id,
            destinationLocation: northHub._id,
            lineItems: [{ product: products[2]._id, requestedQuantity: 8 }],
            status: 'DRAFT',
            requester: userId,
            statusHistory: [{ status: 'DRAFT', changedBy: userId, changedAt: now, notes: 'Transfer created as draft' }],
            notes: 'Demo draft transfer',
          },
        ],
        opts
      )

      return { locations: 2, products: 6, transfers: 2, movements: movements.length }
    }

    let counts: SeedCounts

    const mongoSession = await Inventory.startSession()
    try {
      mongoSession.startTransaction()
      try {
        counts = await runSeed(mongoSession)
        await mongoSession.commitTransaction()
      } catch (error) {
        try {
          await mongoSession.abortTransaction()
        } catch {
          /* transaction never started (unsupported) — nothing to roll back */
        }
        if (!isTransactionUnsupported(error)) throw error
        // Transactions unavailable (e.g. standalone mongo) → plain sequential writes.
        counts = await runSeed(null)
      }
    } finally {
      await mongoSession.endSession()
    }

    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'DEMO_DATA_CREATE',
      resourceType: 'Organization',
      resourceId: orgId,
      metadata: counts,
    })

    return NextResponse.json({ success: true, data: counts }, { status: 201 })
  } catch (error) {
    console.error('Demo seed error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
export const dynamic = 'force-dynamic'
