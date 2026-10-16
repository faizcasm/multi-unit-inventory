import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { Stocktake } from '@/models/Stocktake'
import { auth } from '@/lib/auth/auth'
import { canUserPerformAction } from '@/lib/permissions'
import { stocktakeActionSchema } from '@/lib/validation/stocktakes'
import { AuditEvent } from '@/models/AuditEvent'
import { Types } from 'mongoose'

export async function POST(
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
    const parsed = stocktakeActionSchema.safeParse(body)

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

    // Location access
    if (
      session.user.locationPermissions.length > 0 &&
      !session.user.locationPermissions.map(String).includes(String(stocktake.location))
    ) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    if (stocktake.status !== 'OPEN' && stocktake.status !== 'COUNTED') {
      return NextResponse.json(
        { success: false, error: 'Only open or counted stocktakes can be voided' },
        { status: 400 }
      )
    }

    stocktake.status = 'VOID'
    await stocktake.save()

    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'STOCKTAKE_VOID',
      resourceType: 'Stocktake',
      resourceId: stocktake._id,
      metadata: { stocktakeId: id, reference: stocktake.reference },
    })

    return NextResponse.json({ success: true, data: stocktake })
  } catch (error) {
    console.error('Void stocktake error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'
