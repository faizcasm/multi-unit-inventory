import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { auth } from '@/lib/auth/auth'
import { Notification } from '@/models/Notification'
import { Types } from 'mongoose'

/**
 * GET  /api/notifications?limit=20&page=1&unreadOnly=1
 *   → { success, data: [...], pagination: {page,limit,total,totalPages}, unreadCount }
 *   Self-scoped: only the signed-in user's notifications (org also matched).
 *   Any authenticated user may read their own notifications.
 *
 * PATCH /api/notifications  body { read: boolean, ids?: string[], all?: boolean }
 *   → { success, data: { updated }, unreadCount }
 *   Marks only the CURRENT USER's notifications (all:true = all their unread,
 *   ids: subset; without ids defaults to every notification in that read state).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const { searchParams } = new URL(request.url)
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 50)
    const unreadOnly = searchParams.get('unreadOnly') === '1'

    const baseQuery = { user: session.user.id, organization: session.user.organizationId }
    const query: any = { ...baseQuery }
    if (unreadOnly) query.readAt = null

    const [items, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .select('event title body link readAt actorUser createdAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('actorUser', 'name')
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({ ...baseQuery, readAt: null }),
    ])

    return NextResponse.json({
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      unreadCount,
    })
  } catch (error) {
    console.error('Get notifications error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const body = await request.json().catch(() => null)
    if (!body || typeof body.read !== 'boolean') {
      return NextResponse.json({ success: false, error: 'read (boolean) is required' }, { status: 400 })
    }

    const read = body.read === true
    const idsProvided = Array.isArray(body.ids)
    const ids: string[] = idsProvided
      ? body.ids.filter((id: unknown): id is string => typeof id === 'string' && Types.ObjectId.isValid(id))
      : []

    // Always scoped to the current user's notifications in this organization.
    const query: any = { user: session.user.id, organization: session.user.organizationId }
    if (idsProvided) {
      // Explicit subset (valid ids only; invalid ids simply match nothing).
      query._id = { $in: ids }
    } else if (read) {
      // `all: true` (or no ids) → every unread notification of this user.
      query.readAt = null
    } else {
      // Unmarking without ids → every read notification of this user.
      query.readAt = { $ne: null }
    }

    const result = await Notification.updateMany(query, {
      $set: { readAt: read ? new Date() : null },
    })

    const unreadCount = await Notification.countDocuments({
      user: session.user.id,
      organization: session.user.organizationId,
      readAt: null,
    })

    return NextResponse.json({
      success: true,
      data: { updated: result.modifiedCount },
      unreadCount,
    })
  } catch (error) {
    console.error('Update notifications error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
