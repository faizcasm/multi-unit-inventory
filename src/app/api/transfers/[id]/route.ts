import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { StockTransfer } from '@/models/StockTransfer'
import { Location } from '@/models/Location'
import { Product } from '@/models/Product'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
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

    if (!hasPermission(session.user.role, 'transfers:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid transfer ID' }, { status: 400 })
    }

    await connectDB()

    const transfer = await StockTransfer.findOne({ _id: id, organization: session.user.organizationId })
      .populate('sourceLocation', 'name code address')
      .populate('destinationLocation', 'name code address')
      .populate('requester', 'name email')
      .populate('approver', 'name email')
      .populate('dispatchedBy', 'name email')
      .populate('receivedBy', 'name email')
      .populate('cancelledBy', 'name email')
      .populate('lineItems.product', 'name sku unitOfMeasure barcode image')
      .populate('statusHistory.changedBy', 'name email')
      .lean() as any

    if (!transfer) {
      return NextResponse.json({ success: false, error: 'Transfer not found' }, { status: 404 })
    }

    // Check location permissions
    if (session.user.locationPermissions.length > 0) {
      const hasSourceAccess = session.user.locationPermissions.includes(transfer.sourceLocation._id.toString())
      const hasDestAccess = session.user.locationPermissions.includes(transfer.destinationLocation._id.toString())
      if (!hasSourceAccess && !hasDestAccess) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
      }
    }

    return NextResponse.json({ success: true, data: transfer })
  } catch (error) {
    console.error('Get transfer error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}export const dynamic = 'force-dynamic'

