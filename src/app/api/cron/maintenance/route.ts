import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { Organization } from '@/models/Organization'
import { WebhookDelivery } from '@/models/Webhook'
import { ApiKey } from '@/models/ApiKey'

export const dynamic = 'force-dynamic'

const DELIVERY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/** Vercel crons send `Authorization: Bearer $CRON_SECRET`. Never echoes the secret. */
function checkCronAuth(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET is not configured' },
      { status: 500 }
    )
  }

  const header = request.headers.get('authorization') || ''
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export async function GET(request: NextRequest) {
  const unauthorized = checkCronAuth(request)
  if (unauthorized) return unauthorized

  try {
    await connectDB()

    // 1. Drop registration invites that expired without being accepted.
    let invitesPruned = 0
    const orgs = (await Organization.find({
      isActive: true,
      'invites.acceptedAt': null,
      'invites.expiresAt': { $lte: new Date() },
    })
      .select('slug invites')
      .lean()) as any[]

    for (const org of orgs) {
      const before = (org.invites || []).length
      await Organization.updateOne(
        { _id: org._id },
        { $pull: { invites: { acceptedAt: null, expiresAt: { $lte: new Date() } } } }
      )
      // `modifiedCount` only says the doc changed, not how many subdocs went;
      // recount from the post-pull document for an accurate number.
      const after = (await Organization.findById(org._id).select('invites').lean()) as any
      invitesPruned += Math.max(0, before - (after?.invites?.length || 0))
      console.log(`[cron] maintenance pruned invites for org=${org.slug}`)
    }

    // 2. Keep the webhook delivery log to a 30-day window.
    const deliveryCutoff = new Date(Date.now() - DELIVERY_RETENTION_MS)
    const deliveryResult = await WebhookDelivery.deleteMany({ createdAt: { $lt: deliveryCutoff } })
    const deliveriesDeleted = deliveryResult.deletedCount || 0

    // 3. Deactivate API keys past their expiry (revoke in place, keep the audit trail).
    const keyResult = await ApiKey.updateMany(
      { isActive: true, expiresAt: { $ne: null, $lte: new Date() } },
      { $set: { isActive: false } }
    )
    const keysDeactivated = keyResult.modifiedCount || 0

    console.log(
      `[cron] maintenance invitesPruned=${invitesPruned} deliveriesDeleted=${deliveriesDeleted} keysDeactivated=${keysDeactivated}`
    )

    return NextResponse.json({
      success: true,
      data: { invitesPruned, deliveriesDeleted, keysDeactivated },
    })
  } catch (error) {
    console.error('[cron] maintenance failed:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
