import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { Product } from '@/models/Product'
import { Location } from '@/models/Location'
import { StockTransfer } from '@/models/StockTransfer'

export const dynamic = 'force-dynamic'

const MAX_MATCHES = 10

/** Escape user input for a safe case-insensitive exact-match regex. */
function exactRegex(value: string): RegExp {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'inventory:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') || '').trim()
    if (!q) {
      return NextResponse.json({ success: false, error: 'Query parameter q is required' }, { status: 400 })
    }

    await connectDB()
    const organization = session.user.organizationId
    const pattern = exactRegex(q)

    const [products, locations, transfers] = await Promise.all([
      Product.find({ organization, $or: [{ barcode: pattern }, { sku: pattern }] })
        .limit(MAX_MATCHES)
        .lean() as unknown as Promise<any[]>,
      Location.find({ organization, code: pattern }).limit(MAX_MATCHES).lean() as unknown as Promise<any[]>,
      StockTransfer.find({ organization, reference: pattern })
        .limit(MAX_MATCHES)
        .populate('sourceLocation', 'name')
        .populate('destinationLocation', 'name')
        .lean() as unknown as Promise<any[]>,
    ])

    const matches: Array<{
      type: 'product' | 'location' | 'transfer'
      id: string
      label: string
      sublabel: string
      href: string
    }> = []

    for (const product of products) {
      if (matches.length >= MAX_MATCHES) break
      matches.push({
        type: 'product',
        id: product._id.toString(),
        label: product.name || 'Product',
        sublabel: `Product · ${product.sku}${product.barcode ? ` · ${product.barcode}` : ''}`,
        href: `/dashboard/products/${product._id}`,
      })
    }
    for (const location of locations) {
      if (matches.length >= MAX_MATCHES) break
      matches.push({
        type: 'location',
        id: location._id.toString(),
        label: location.name || 'Location',
        sublabel: `Location · ${location.code}${location.type ? ` · ${location.type}` : ''}`,
        href: `/dashboard/locations/${location._id}`,
      })
    }
    for (const transfer of transfers) {
      if (matches.length >= MAX_MATCHES) break
      const source = (transfer.sourceLocation as any)?.name
      const destination = (transfer.destinationLocation as any)?.name
      matches.push({
        type: 'transfer',
        id: transfer._id.toString(),
        label: transfer.reference || 'Transfer',
        sublabel: `Transfer · ${transfer.status}${source && destination ? ` · ${source} → ${destination}` : ''}`,
        href: `/dashboard/transfers/${transfer._id}`,
      })
    }

    return NextResponse.json({ success: true, data: { matches } })
  } catch (error) {
    console.error('Scan lookup error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
