import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { Supplier } from '@/models/Supplier'
import { Product } from '@/models/Product'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'
import { supplierUpdateSchema } from '@/lib/validation/catalog'
import { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

/** Escape user input before building a regex literal. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'suppliers:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid supplier ID' }, { status: 400 })
    }

    await connectDB()

    const supplier = await Supplier.findOne({
      _id: id,
      organization: session.user.organizationId,
    }).lean() as any
    if (!supplier) {
      return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 })
    }

    const productCount = await Product.countDocuments({
      organization: session.user.organizationId,
      supplier: id,
      isActive: true,
    })

    return NextResponse.json({
      success: true,
      data: { ...supplier, productCount },
    })
  } catch (error) {
    console.error('Get supplier error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'suppliers:update')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid supplier ID' }, { status: 400 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = supplierUpdateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // Duplicate name check (case-insensitive, within the org) when renaming.
    if (parsed.data.name) {
      const escapedName = escapeRegex(parsed.data.name)
      const existing = await Supplier.findOne({
        organization: session.user.organizationId,
        name: { $regex: `^${escapedName}$`, $options: 'i' },
        _id: { $ne: id },
      })
      if (existing) {
        return NextResponse.json({ success: false, error: 'Supplier name already exists' }, { status: 409 })
      }
    }

    const updates: Record<string, unknown> = { ...parsed.data }
    // An empty string clears the optional contact fields (null unsets them).
    for (const field of ['contactName', 'contactEmail', 'phone', 'website', 'address', 'notes']) {
      if (updates[field] === '') updates[field] = null
    }

    const supplier = await Supplier.findOneAndUpdate(
      { _id: id, organization: session.user.organizationId },
      { $set: updates },
      { new: true, runValidators: true }
    ).lean() as any

    if (!supplier) {
      return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 })
    }

    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'SUPPLIER_UPDATE',
      resourceType: 'supplier',
      resourceId: supplier._id,
      metadata: { fields: Object.keys(updates), name: supplier.name },
    })

    return NextResponse.json({ success: true, data: supplier })
  } catch (error) {
    console.error('Update supplier error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'suppliers:deactivate')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid supplier ID' }, { status: 400 })
    }

    await connectDB()

    const supplier = await Supplier.findOneAndUpdate(
      { _id: id, organization: session.user.organizationId },
      { $set: { isActive: false } },
      { new: true }
    ).lean() as any

    if (!supplier) {
      return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 })
    }

    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'SUPPLIER_DEACTIVATE',
      resourceType: 'supplier',
      resourceId: supplier._id,
      metadata: { name: supplier.name },
    })

    return NextResponse.json({ success: true, data: supplier })
  } catch (error) {
    console.error('Deactivate supplier error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
