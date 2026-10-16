import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { StockTransfer } from '@/models/StockTransfer'
import { InventoryMovement } from '@/models/InventoryMovement'
import { Membership } from '@/models/Membership'
import { Types } from 'mongoose'
import type { UserRole } from '@/models/User'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

const KNOWN_ROLES: UserRole[] = ['admin', 'inventory_manager', 'approver', 'warehouse_staff']

/** Round to `digits` decimals without float dust (1.0000000000000002 → 1). */
function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** 'YYYY-MM-DD' in UTC. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Monday-start ISO week containing `date` (UTC midnight). */
function weekStart(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
  const dow = d.getUTCDay() // 0=Sun … 6=Sat
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7))
  return d
}

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
    const rangeParam = searchParams.get('range') || '30'
    if (rangeParam !== '30' && rangeParam !== '90') {
      return NextResponse.json(
        { success: false, error: 'Invalid range — expected 30 or 90' },
        { status: 400 }
      )
    }
    const rangeDays = Number(rangeParam)

    const orgId = new Types.ObjectId(session.user.organizationId)
    const since = new Date(Date.now() - rangeDays * DAY_MS)

    // Transfers created within the window — the base for every metric below.
    const created = (await StockTransfer.find({ organization: orgId, createdAt: { $gte: since } })
      .select(
        'reference status createdAt receivedAt sourceLocation destinationLocation requester approver receivedBy'
      )
      .populate('sourceLocation', 'name code')
      .populate('destinationLocation', 'name code')
      .lean()) as any[]

    // --- Metrics -----------------------------------------------------------
    const statusCounts: Record<string, number> = {}
    const cycleDays: number[] = []
    let inFlight = 0

    for (const t of created) {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1
      if (t.status === 'COMPLETED' && t.receivedAt) {
        cycleDays.push((new Date(t.receivedAt).getTime() - new Date(t.createdAt).getTime()) / DAY_MS)
      }
    }

    const totalCreated = created.length
    const completed = statusCounts['COMPLETED'] || 0
    const rejected = statusCounts['REJECTED'] || 0
    const cancelled = statusCounts['CANCELLED'] || 0
    inFlight =
      (statusCounts['PENDING_APPROVAL'] || 0) +
      (statusCounts['APPROVED'] || 0) +
      (statusCounts['IN_TRANSIT'] || 0)

    const decided = completed + rejected + cancelled
    const avgCycleDays = cycleDays.length
      ? round(cycleDays.reduce((sum, d) => sum + d, 0) / cycleDays.length)
      : null
    let medianCycleDays: number | null = null
    if (cycleDays.length > 0) {
      const sorted = [...cycleDays].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      medianCycleDays = round(
        sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
      )
    }

    const metrics = {
      totalCreated,
      completed,
      inFlight,
      rejected,
      cancelled,
      completionRate: decided > 0 ? round((completed / decided) * 100, 1) : null,
      rejectionRate: decided > 0 ? round((rejected / decided) * 100, 1) : null,
      avgCycleDays,
      medianCycleDays,
      transfersPerWeek: round(totalCreated / (rangeDays / 7)),
    }

    // --- Throughput (created by createdAt day, completed by receivedAt) -----
    // Completed = transfers *received* within the window, whatever their
    // creation date — that mirrors what the ops team experienced.
    const completedInRange = (await StockTransfer.find({
      organization: orgId,
      status: 'COMPLETED',
      receivedAt: { $gte: since },
    })
      .select('receivedAt')
      .lean()) as any[]

    const daily = rangeDays === 30
    const bucketKeys: string[] = []
    if (daily) {
      const first = new Date(
        Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate())
      )
      for (let d = first; d <= new Date(); d = new Date(d.getTime() + DAY_MS)) {
        bucketKeys.push(dayKey(d))
      }
    } else {
      const first = weekStart(since)
      for (let d = first; d <= new Date(); d = new Date(d.getTime() + 7 * DAY_MS)) {
        bucketKeys.push(dayKey(d))
      }
    }

    const createdPerBucket: Record<string, number> = {}
    const completedPerBucket: Record<string, number> = {}
    const keyOf = (date: Date) => (daily ? dayKey(date) : dayKey(weekStart(date)))

    for (const t of created) {
      const key = keyOf(new Date(t.createdAt))
      createdPerBucket[key] = (createdPerBucket[key] || 0) + 1
    }
    for (const t of completedInRange) {
      const key = keyOf(new Date(t.receivedAt))
      completedPerBucket[key] = (completedPerBucket[key] || 0) + 1
    }

    const throughput = bucketKeys.map((bucket) => ({
      bucket,
      created: createdPerBucket[bucket] || 0,
      completed: completedPerBucket[bucket] || 0,
    }))

    // --- Status breakdown --------------------------------------------------
    const STATUS_ORDER = [
      'DRAFT',
      'PENDING_APPROVAL',
      'APPROVED',
      'IN_TRANSIT',
      'COMPLETED',
      'REJECTED',
      'CANCELLED',
    ]
    const statusBreakdown = Object.keys(statusCounts)
      .map((status) => ({ status, count: statusCounts[status] }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
      )

    // --- Top routes (populated location names) -----------------------------
    const routeMap = new Map<string, { source: string; destination: string; count: number }>()
    for (const t of created) {
      const src = t.sourceLocation?._id ?? t.sourceLocation
      const dst = t.destinationLocation?._id ?? t.destinationLocation
      const key = `${String(src)}|${String(dst)}`
      const entry = routeMap.get(key) || {
        source: t.sourceLocation?.name || 'Unknown',
        destination: t.destinationLocation?.name || 'Unknown',
        count: 0,
      }
      entry.count++
      routeMap.set(key, entry)
    }
    const topRoutes = Array.from(routeMap.values()).sort((a, b) => b.count - a.count).slice(0, 8)

    // --- Top products by units moved (all movement types, |quantity|) ------
    const topProducts = (await InventoryMovement.aggregate([
      { $match: { organization: orgId, createdAt: { $gte: since } } },
      { $group: { _id: '$product', unitsMoved: { $sum: { $abs: '$quantity' } } } },
      { $sort: { unitsMoved: -1 } },
      { $limit: 8 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productInfo',
        },
      },
      { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          name: '$productInfo.name',
          sku: '$productInfo.sku',
          unitsMoved: 1,
        },
      },
    ])) as { name?: string; sku?: string; unitsMoved: number }[]

    // --- Activity by role (requester / approver / receiver) ----------------
    const memberships = (await Membership.find({ organization: orgId, isActive: true })
      .select('user role')
      .lean()) as any[]
    const roleByUserId = new Map<string, UserRole>()
    for (const m of memberships) roleByUserId.set(String(m.user), m.role as UserRole)

    const byRoleMap = new Map<string, { role: string; requested: number; approved: number; received: number }>()
    for (const role of KNOWN_ROLES) {
      byRoleMap.set(role, { role, requested: 0, approved: 0, received: 0 })
    }
    for (const t of created) {
      const requester = roleByUserId.get(String(t.requester))
      if (requester) byRoleMap.get(requester)!.requested++
      const approver = roleByUserId.get(String(t.approver))
      if (approver) byRoleMap.get(approver)!.approved++
      const receiver = roleByUserId.get(String(t.receivedBy))
      if (receiver) byRoleMap.get(receiver)!.received++
    }
    const byRole = Array.from(byRoleMap.values())
      .filter((r) => r.requested + r.approved + r.received > 0)
      .sort((a, b) => b.requested - a.requested)

    return NextResponse.json({
      success: true,
      data: {
        range: rangeDays,
        granularity: daily ? 'daily' : 'weekly',
        metrics,
        throughput,
        statusBreakdown,
        topRoutes,
        topProducts,
        byRole,
      },
    })
  } catch (error) {
    console.error('Analytics error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
