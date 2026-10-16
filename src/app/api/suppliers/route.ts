import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { Supplier } from '@/models/Supplier'
import { Product } from '@/models/Product'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'
import { Types } from 'mongoose'
import { supplierCreateSchema } from '@/lib/validation/catalog'

export const dynamic = 'force-dynamic'

/** Escape user input before building a regex literal. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'suppliers:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20))
    const search = searchParams.get('search') || ''
    const active = searchParams.get('active') || 'active'

    const query: any = { organization: session.user.organizationId }

    if (search) {
      const escaped = escapeRegex(search)
      query.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { contactName: { $regex: escaped, $options: 'i' } },
      ]
    }

    if (active === 'active') query.isActive = true
    else if (active === 'inactive') query.isActive = false

    const total = await Supplier.countDocuments(query)
    const suppliers = await Supplier.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean() as any

    // Product count per supplier (active products only) in one aggregation.
    const supplierIds = suppliers.map((s: any) => s._id)
    const counts = supplierIds.length
      ? await Product.aggregate([
          {
            $match: {
              organization: new Types.ObjectId(session.user.organizationId),
              supplier: { $in: supplierIds },
              isActive: true,
            },
          },
          { $group: { _id: '$supplier', count: { $sum: 1 } } },
        ])
      : []
    const countMap = new Map(counts.map((c: any) => [c._id.toString(), c.count]))

    const data = suppliers.map((s: any) => ({
      ...s,
      productCount: countMap.get(s._id.toString()) || 0,
    }))

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Get suppliers error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'suppliers:create')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = supplierCreateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // Duplicate name check (case-insensitive, within the org).
    const escapedName = escapeRegex(parsed.data.name)
    const existing = await Supplier.findOne({
      organization: session.user.organizationId,
      name: { $regex: `^${escapedName}$`, $options: 'i' },
    })
    if (existing) {
      return NextResponse.json({ success: false, error: 'Supplier name already exists' }, { status: 409 })
    }

    const supplier = await Supplier.create({
      ...parsed.data,
      contactName: parsed.data.contactName || undefined,
      contactEmail: parsed.data.contactEmail || undefined,
      phone: parsed.data.phone || undefined,
      website: parsed.data.website || undefined,
      address: parsed.data.address || undefined,
      notes: parsed.data.notes || undefined,
      organization: session.user.organizationId,
    })

    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'SUPPLIER_CREATE',
      resourceType: 'supplier',
      resourceId: supplier._id,
      metadata: { name: supplier.name, leadTimeDays: supplier.leadTimeDays },
    })

    return NextResponse.json({ success: true, data: supplier }, { status: 201 })
  } catch (error) {
    console.error('Create supplier error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
