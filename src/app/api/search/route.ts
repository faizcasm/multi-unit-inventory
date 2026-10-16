import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { Product } from '@/models/Product'
import { Location } from '@/models/Location'
import { StockTransfer } from '@/models/StockTransfer'
import { Membership } from '@/models/Membership'
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

/** Max items returned per group — keeps the global search snappy. */
const GROUP_LIMIT = 8

const GROUP_TYPES = ['all', 'products', 'locations', 'transfers', 'members'] as const
type GroupType = (typeof GROUP_TYPES)[number]

const TRANSFER_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'IN_TRANSIT',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
]

interface SearchItem {
  id: string
  label: string
  sublabel: string
  href: string
  meta: string
}

interface SearchGroup {
  type: string
  label: string
  total: number
  items: SearchItem[]
}

/** Escape user input before it goes into a RegExp (blocks regex injection / ReDoS). */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') || '').trim()
    const type = (searchParams.get('type') || 'all') as GroupType

    if (q.length < 1 || q.length > 100) {
      return NextResponse.json(
        { success: false, error: 'Query must be between 1 and 100 characters' },
        { status: 400 }
      )
    }

    if (!GROUP_TYPES.includes(type)) {
      return NextResponse.json({ success: false, error: 'Invalid search type' }, { status: 400 })
    }

    const orgId = new Types.ObjectId(session.user.organizationId)
    const rx = new RegExp(escapeRegex(q), 'i')
    const statusRx = q.toUpperCase()
    const role = session.user.role

    const groups: SearchGroup[] = []

    // --- Products (products:read) -----------------------------------------
    if ((type === 'all' || type === 'products') && hasPermission(role, 'products:read')) {
      const query = {
        organization: orgId,
        $or: [{ name: rx }, { sku: rx }, { barcode: rx }, { description: rx }],
      }
      const total = await Product.countDocuments(query)
      const rows = (await Product.find(query)
        .sort({ name: 1 })
        .limit(GROUP_LIMIT)
        .lean()) as any[]

      groups.push({
        type: 'products',
        label: 'Products',
        total,
        items: rows.map((p) => ({
          id: String(p._id),
          label: p.name,
          sublabel: p.sku,
          href: `/dashboard/products/${p._id}`,
          meta: p.category || '',
        })),
      })
    }

    // --- Locations (locations:read) ---------------------------------------
    if ((type === 'all' || type === 'locations') && hasPermission(role, 'locations:read')) {
      const query = {
        organization: orgId,
        $or: [{ name: rx }, { code: rx }, { 'address.city': rx }],
      }
      const total = await Location.countDocuments(query)
      const rows = (await Location.find(query)
        .sort({ name: 1 })
        .limit(GROUP_LIMIT)
        .lean()) as any[]

      groups.push({
        type: 'locations',
        label: 'Locations',
        total,
        items: rows.map((l) => ({
          id: String(l._id),
          label: l.name,
          sublabel: `${l.code} · ${String(l.type).replace(/_/g, ' ')}`,
          href: `/dashboard/locations/${l._id}`,
          meta: l.address?.city || '',
        })),
      })
    }

    // --- Transfers (transfers:read) ---------------------------------------
    if ((type === 'all' || type === 'transfers') && hasPermission(role, 'transfers:read')) {
      const or: Record<string, unknown>[] = [{ reference: rx }, { notes: rx }]
      // Exact status match (case-insensitive) — e.g. "in_transit" finds IN_TRANSIT.
      if (TRANSFER_STATUSES.includes(statusRx)) or.push({ status: statusRx })

      const query = { organization: orgId, $or: or }
      const total = await StockTransfer.countDocuments(query)
      const rows = (await StockTransfer.find(query)
        .sort({ createdAt: -1 })
        .limit(GROUP_LIMIT)
        .populate('sourceLocation', 'name code')
        .populate('destinationLocation', 'name code')
        .lean()) as any[]

      groups.push({
        type: 'transfers',
        label: 'Transfers',
        total,
        items: rows.map((t) => ({
          id: String(t._id),
          label: t.reference,
          sublabel: `${t.sourceLocation?.name ?? 'Unknown'} → ${t.destinationLocation?.name ?? 'Unknown'}`,
          href: `/dashboard/transfers/${t._id}`,
          meta: t.status,
        })),
      })
    }

    // --- Members (users:read) ---------------------------------------------
    if ((type === 'all' || type === 'members') && hasPermission(role, 'users:read')) {
      const base: any[] = [
        { $match: { organization: orgId, isActive: true } },
        { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userInfo' } },
        { $unwind: '$userInfo' },
        { $match: { $or: [{ 'userInfo.name': rx }, { 'userInfo.email': rx }] } },
      ]

      const countRows = await Membership.aggregate([...base, { $count: 'total' }])
      const total: number = countRows[0]?.total ?? 0

      const rows = await Membership.aggregate([
        ...base,
        { $project: { name: '$userInfo.name', email: '$userInfo.email', role: 1 } },
        { $sort: { name: 1 } },
        { $limit: GROUP_LIMIT },
      ])

      groups.push({
        type: 'members',
        label: 'Members',
        total,
        items: rows.map((m: any) => ({
          id: String(m.user ?? m.email),
          label: m.name,
          sublabel: m.email,
          href: '/dashboard/users',
          meta: m.role,
        })),
      })
    }

    const total = groups.reduce((sum, g) => sum + g.total, 0)

    return NextResponse.json({ success: true, data: { groups, total } })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
