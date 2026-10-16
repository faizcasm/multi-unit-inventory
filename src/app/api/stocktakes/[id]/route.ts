import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { Stocktake } from '@/models/Stocktake'
import { Inventory } from '@/models/Inventory'
import { auth } from '@/lib/auth/auth'
import { hasPermission, canUserPerformAction } from '@/lib/permissions'
import { updateStocktakeSchema } from '@/lib/validation/stocktakes'
import { AuditEvent } from '@/models/AuditEvent'
import { Types } from 'mongoose'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'stocktakes:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid stocktake ID' }, { status: 400 })
    }

    await connectDB()

    const stocktake = await Stocktake.findOne({ _id: id, organization: session.user.organizationId })
      .populate('location', 'name code')
      .populate('createdBy', 'name email')
      .populate('postedBy', 'name email')
      .populate('lines.countedBy', 'name email')
      .lean() as any

    if (!stocktake) {
      return NextResponse.json({ success: false, error: 'Stocktake not found' }, { status: 404 })
    }

    // Check location permissions
    if (
      session.user.locationPermissions.length > 0 &&
      !session.user.locationPermissions.map(String).includes(String(stocktake.location?._id ?? stocktake.location))
    ) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    // Current inventory at this location is the authoritative system quantity.
    const inventory = await Inventory.find({
      organization: session.user.organizationId,
      location: stocktake.location._id ?? stocktake.location,
    }).lean() as any
    const currentByProduct = new Map<string, number>(
      (inventory as any[]).map((inv) => [String(inv.product), inv.availableQuantity || 0])
    )

    const lines = ((stocktake.lines as any[]) || []).map((line) => ({
      ...line,
      systemQuantity: currentByProduct.get(String(line.product)) ?? line.systemQuantity ?? 0,
    }))

    const countedLines = lines.filter((l) => l.countedQuantity !== undefined && l.countedQuantity !== null)
    const variances = countedLines.filter((l) => l.countedQuantity !== l.systemQuantity)

    return NextResponse.json({
      success: true,
      data: {
        ...stocktake,
        lines,
        summary: {
          totalLines: lines.length,
          countedLines: countedLines.length,
          variances: variances.length,
        },
      },
    })
  } catch (error) {
    console.error('Get stocktake error:', error)
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

    if (!canUserPerformAction(session.user.role, session.user.locationPermissions, 'stocktakes:update')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid stocktake ID' }, { status: 400 })
    }

    await connectDB()

    const body = await request.json()
    const parsed = updateStocktakeSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const stocktake = await Stocktake.findOne({ _id: id, organization: session.user.organizationId })
    if (!stocktake) {
      return NextResponse.json({ success: false, error: 'Stocktake not found' }, { status: 404 })
    }

    if (
      session.user.locationPermissions.length > 0 &&
      !session.user.locationPermissions.map(String).includes(String(stocktake.location))
    ) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    // Only notes (a status-independent field) can be edited, and only while the
    // count sheet is still open — counts are changed through /count instead.
    if (stocktake.status !== 'OPEN') {
      return NextResponse.json({ success: false, error: 'Only open stocktakes can be edited' }, { status: 400 })
    }

    if (parsed.data.notes !== undefined) {
      stocktake.notes = parsed.data.notes
    }
    await stocktake.save()

    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'STOCKTAKE_UPDATE',
      resourceType: 'Stocktake',
      resourceId: stocktake._id,
      metadata: { reference: stocktake.reference, notes: parsed.data.notes ?? null },
    })

    return NextResponse.json({ success: true, data: stocktake })
  } catch (error) {
    console.error('Update stocktake error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'
