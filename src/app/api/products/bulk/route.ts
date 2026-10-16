import { NextRequest, NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { connectDB } from '@/lib/db/mongodb'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { Product } from '@/models/Product'
import { AuditEvent } from '@/models/AuditEvent'

export const dynamic = 'force-dynamic'

const MAX_BULK_IDS = 100

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
