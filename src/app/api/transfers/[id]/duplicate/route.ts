import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { auth } from '@/lib/auth/auth'
import { StockTransfer } from '@/models/StockTransfer'
import { hasPermission } from '@/lib/permissions'
import { AuditEvent } from '@/models/AuditEvent'
import { Types } from 'mongoose'

/**
 * POST /api/transfers/[id]/duplicate
 * Copies an existing transfer into a fresh DRAFT with only the requested
 * quantities (approved/dispatched/received state is dropped).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'transfers:create')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid transfer ID' }, { status: 400 })
    }

    await connectDB()

    const source = await StockTransfer.findOne({
      _id: id,
      organization: session.user.organizationId,
    })
    if (!source) {
      return NextResponse.json({ success: false, error: 'Transfer not found' }, { status: 404 })
    }

    // Check location permissions — same guard as POST /api/transfers.
    if (session.user.locationPermissions.length > 0) {
      const sourceId = String(source.sourceLocation)
      const destinationId = String(source.destinationLocation)
      const hasSourceAccess = session.user.locationPermissions.includes(sourceId)
      const hasDestAccess = session.user.locationPermissions.includes(destinationId)
      if (!hasSourceAccess || !hasDestAccess) {
        return NextResponse.json({ success: false, error: 'Forbidden: No access to one or both locations' }, { status: 403 })
      }
    }

    // Generate reference — same mechanism as POST /api/transfers, including
    // the retry on concurrent-create duplicate-key races so two simultaneous
    // duplicates don't surface a raw E11000 as a 500.
    const notes = `Duplicated from ${source.reference}`
    const now = new Date()

    let transfer: any = null
    let reference = ''
    for (let attempt = 0; attempt < 3 && !transfer; attempt++) {
      const count = await StockTransfer.countDocuments({ organization: session.user.organizationId })
      reference = `TXN-${String(count + 1).padStart(6, '0')}`
      try {
        transfer = await StockTransfer.create({
          organization: session.user.organizationId,
          reference,
          sourceLocation: source.sourceLocation,
          destinationLocation: source.destinationLocation,
          lineItems: source.lineItems.map((item) => ({
            product: item.product,
            requestedQuantity: item.requestedQuantity,
            notes: item.notes,
          })),
          status: 'DRAFT',
          requester: session.user.id,
          statusHistory: [
            {
              status: 'DRAFT',
              changedBy: session.user.id,
              changedAt: now,
              notes,
            },
          ],
          notes,
        })
      } catch (error: any) {
        if (error?.code === 11000 && attempt < 2) continue // reference collision — recount and retry
        throw error
      }
    }

    // Audit log
    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'TRANSFER_DUPLICATE',
      resourceType: 'transfer',
      resourceId: transfer._id,
      metadata: {
        from: source._id,
        fromReference: source.reference,
        newReference: reference,
      },
    })

    return NextResponse.json({ success: true, data: transfer }, { status: 201 })
  } catch (error) {
    console.error('Duplicate transfer error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
