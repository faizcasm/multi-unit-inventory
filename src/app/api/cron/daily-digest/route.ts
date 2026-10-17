import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { Types } from 'mongoose'
import { connectDB } from '@/lib/db/mongodb'
import { Organization } from '@/models/Organization'
import { Product } from '@/models/Product'
import { Inventory } from '@/models/Inventory'
import { StockTransfer } from '@/models/StockTransfer'
import { Membership } from '@/models/Membership'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

// Give the digest loop (N orgs × queries × email sends) room on Vercel.
export const maxDuration = 60

const SEND_TIMEOUT_MS = 10000
const LOW_STOCK_LIMIT = 20
const PENDING_LIMIT = 20
const INVITE_WINDOW_MS = 48 * 60 * 60 * 1000

/** Constant-time comparison so the secret can't be guessed byte-by-byte. */
function secretMatches(header: string | null, secret: string): boolean {
  const a = Buffer.from(header || '')
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Vercel crons send `Authorization: Bearer $CRON_SECRET`. Never echoes the secret. */
function checkCronAuth(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET is not configured' },
      { status: 500 }
    )
  }

  if (!secretMatches(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

function appOrigin(): string {
  const raw = process.env.NEXTAUTH_URL || process.env.AUTH_URL || 'http://localhost:3000'
  return raw.replace(/\/$/, '')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

type LowStockRow = { name: string; sku: string; available: number; threshold: number }
type PendingRow = { reference: string; requester: string; items: number; createdAt: Date }
type InviteRow = { role: string; email: string | null; expiresAt: Date }

function renderSection(
  kicker: string,
  title: string,
  rows: string[],
  emptyNote: string,
  ctaLabel: string,
  ctaHref: string
): string {
  const body =
    rows.length > 0
      ? `<div style="border:1px solid #eceaf3;border-radius:12px;overflow:hidden;margin:0 0 14px">
          ${rows.join('')}
        </div>
        <a href="${ctaHref}" style="display:inline-block;background:linear-gradient(135deg,#8066ed,#6b50df);color:#fff;text-decoration:none;font-weight:700;font-size:13px;border-radius:10px;padding:11px 16px;margin:0 0 22px">${ctaLabel}</a>`
      : `<p style="font-size:13px;line-height:1.8;color:#77758a;margin:0 0 22px">${emptyNote}</p>`

  return `
    <p style="font-size:10px;font-weight:800;letter-spacing:1.5px;color:#8069dc;margin:0 0 8px">${kicker}</p>
    <h2 style="font-family:Manrope,Arial,sans-serif;font-size:16px;letter-spacing:-.5px;margin:0 0 12px">${title}</h2>
    ${body}`
}

function row(label: string, value: string, sub?: string): string {
  return `<div style="display:flex;justify-content:space-between;gap:12px;padding:11px 14px;border-bottom:1px solid #f2f0f8">
      <span style="font-size:12px;color:#77758a">${label}</span>
      <span style="font-size:12px;font-family:Manrope,Arial,sans-serif;font-weight:700;text-align:right;color:#201c33">${value}${sub ? `<br/><span style="font-size:10px;font-weight:500;color:#9a94a8">${sub}</span>` : ''}</span>
    </div>`
}

function renderDigestEmail(input: {
  recipientName: string
  orgName: string
  date: string
  origin: string
  lowStock: LowStockRow[]
  pending: PendingRow[]
  invites: InviteRow[]
}): { html: string; text: string } {
  const { recipientName, orgName, date, origin } = input

  const lowRows = input.lowStock.map((p) =>
    row(escapeHtml(p.name), `${p.available} left`, `below ${p.threshold} · ${escapeHtml(p.sku)}`)
  )
  const pendingRows = input.pending.map((t) =>
    row(escapeHtml(t.reference), `by ${escapeHtml(t.requester)}`, `${t.items} item${t.items === 1 ? '' : 's'} · ${fmtDate(t.createdAt)}`)
  )
  const inviteRows = input.invites.map((i) =>
    row(escapeHtml(i.role.replace(/_/g, ' ')), i.email ? escapeHtml(i.email) : 'Invite link', `expires ${fmtDate(i.expiresAt)}`)
  )

  const html = `
  <div style="font-family:'DM Sans',Arial,sans-serif;background:#f8f7fb;padding:34px 20px;color:#201c33">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #eceaf3;border-radius:16px;overflow:hidden">
      <div style="padding:26px 28px 0;display:flex;align-items:center;gap:10px">
        <span style="width:36px;height:36px;border-radius:12px;display:grid;place-items:center;color:#fff;background:linear-gradient(145deg,#987df6,#6e53e5);font-weight:800">R</span>
        <b style="font-family:Manrope,Arial,sans-serif;font-size:17px;letter-spacing:-.5px">ricoz <span style="font-weight:500;color:#8e8aa0">inventory</span></b>
      </div>
      <div style="padding:22px 28px 28px">
        <p style="font-size:10px;font-weight:800;letter-spacing:1.5px;color:#8069dc;margin:0 0 12px">DAILY DIGEST</p>
        <h1 style="font-family:Manrope,Arial,sans-serif;font-size:22px;letter-spacing:-.8px;margin:0 0 10px">Hi ${escapeHtml(recipientName || 'there')}, here&apos;s ${escapeHtml(date)}</h1>
        <p style="font-size:13px;line-height:1.8;color:#77758a;margin:0 0 22px">
          A quick snapshot of <b>${escapeHtml(orgName)}</b> — what&apos;s running low, what&apos;s waiting on approval, and what&apos;s about to expire.
        </p>
        ${renderSection(
          'LOW STOCK',
          `${input.lowStock.length} product${input.lowStock.length === 1 ? '' : 's'} at or below reorder point`,
          lowRows,
          'Everything is comfortably above its reorder threshold today.',
          'Open inventory',
          `${origin}/dashboard/inventory`
        )}
        ${renderSection(
          'PENDING APPROVAL',
          `${input.pending.length} transfer${input.pending.length === 1 ? '' : 's'} waiting on a decision`,
          pendingRows,
          'No transfers are waiting for approval right now.',
          'Review transfers',
          `${origin}/dashboard/transfers`
        )}
        ${renderSection(
          'INVITES EXPIRING',
          `${input.invites.length} invite${input.invites.length === 1 ? '' : 's'} expiring within 48 hours`,
          inviteRows,
          'No invites are expiring in the next 48 hours.',
          'Manage team',
          `${origin}/dashboard/settings`
        )}
      </div>
    </div>
    <p style="text-align:center;font-size:9px;color:#aaa5b5;margin-top:16px">© 2026 Ricoz Inventory · You receive this because you&apos;re an admin or inventory manager.</p>
  </div>`

  const text = `Daily digest for ${orgName} — ${date}

LOW STOCK (${input.lowStock.length})
${input.lowStock.map((p) => `- ${p.name} (${p.sku}): ${p.available} left, threshold ${p.threshold}`).join('\n') || '- Nothing is below its reorder point.'}

PENDING APPROVAL (${input.pending.length})
${input.pending.map((t) => `- ${t.reference} by ${t.requester} — ${t.items} item(s)`).join('\n') || '- No transfers waiting for approval.'}

INVITES EXPIRING (${input.invites.length})
${input.invites.map((i) => `- ${i.role}${i.email ? ` (${i.email})` : ''} expires ${fmtDate(i.expiresAt)}`).join('\n') || '- No invites expiring soon.'}

${origin}/dashboard`

  return { html, text }
}

export async function GET(request: NextRequest) {
  const unauthorized = checkCronAuth(request)
  if (unauthorized) return unauthorized

  try {
    await connectDB()

    const now = new Date()
    const date = fmtDate(now)
    const inviteCutoff = new Date(now.getTime() + INVITE_WINDOW_MS)
    const origin = appOrigin()

    const orgs = (await Organization.find({ isActive: true }).select('name slug invites').lean()) as any[]

    let orgsProcessed = 0
    let emailsSent = 0
    let failed = 0

    for (const org of orgs) {
      // Per-org isolation: one bad org (query error, bad data) must not
      // abort the digest loop for every other org.
      try {
        const orgId = new Types.ObjectId(org._id)

        // 1. Products with a reorder threshold whose stock anywhere is at/below it.
        const thresholdProducts = (await Product.find({
          organization: orgId,
          isActive: true,
          reorderThreshold: { $gt: 0 },
        })
          .select('name sku reorderThreshold')
          .limit(200)
          .lean()) as any[]

        // Sum available stock across locations per threshold product.
        const stockTotals = thresholdProducts.length
          ? ((await Inventory.aggregate([
              {
                $match: {
                  organization: orgId,
                  product: { $in: thresholdProducts.map((p) => p._id) },
                },
              },
              { $group: { _id: '$product', available: { $sum: '$availableQuantity' } } },
            ])) as any[])
          : []

        const availableByProduct = new Map<string, number>()
        stockTotals.forEach((s) => availableByProduct.set(String(s._id), s.available))

        const lowStock: LowStockRow[] = thresholdProducts
          .map((p) => ({
            name: p.name,
            sku: p.sku,
            available: availableByProduct.get(String(p._id)) ?? 0,
            threshold: p.reorderThreshold,
          }))
          .filter((p) => p.available <= p.threshold)
          .sort((a, b) => a.available - b.available)
          .slice(0, LOW_STOCK_LIMIT)

        // 2. Transfers waiting for an approval decision.
        const pendingDocs = (await StockTransfer.find({
          organization: orgId,
          status: 'PENDING_APPROVAL',
        })
          .sort({ createdAt: 1 })
          .limit(PENDING_LIMIT)
          .select('reference requester lineItems createdAt')
          .populate('requester', 'name')
          .lean()) as any[]

        const pending: PendingRow[] = pendingDocs.map((t) => ({
          reference: t.reference,
          requester: t.requester?.name || 'Unknown',
          items: (t.lineItems || []).length,
          createdAt: t.createdAt,
        }))

        // 3. Registration invites expiring within 48 hours (not yet accepted).
        const invites: InviteRow[] = (org.invites || [])
          .filter(
            (i: any) =>
              !i.acceptedAt &&
              i.expiresAt &&
              new Date(i.expiresAt) <= inviteCutoff &&
              new Date(i.expiresAt) > now
          )
          .map((i: any) => ({
            role: i.role,
            email: i.email || null,
            expiresAt: new Date(i.expiresAt),
          }))
          .slice(0, 20)

        if (lowStock.length === 0 && pending.length === 0 && invites.length === 0) {
          console.log(
            `[cron] daily-digest org=${org.slug} low=0 pending=0 invites=0 recipients=0 delivered=0`
          )
          continue
        }

        // Recipients: active admins + inventory managers who haven't opted out.
        const memberships = (await Membership.find({
          organization: orgId,
          role: { $in: ['admin', 'inventory_manager'] },
          isActive: true,
        }).populate('user', 'name email preferences isActive')) as any[]

        const seen = new Set<string>()
        const recipients: { name: string; email: string }[] = []
        for (const m of memberships) {
          const u = m.user
          if (!u?.email || u.isActive === false) continue
          if (u.preferences?.notifications?.email === false) continue
          const key = String(u._id)
          if (seen.has(key)) continue
          seen.add(key)
          recipients.push({ name: u.name, email: u.email })
        }

        if (recipients.length === 0) {
          console.log(
            `[cron] daily-digest org=${org.slug} low=${lowStock.length} pending=${pending.length} invites=${invites.length} recipients=0 delivered=0`
          )
          continue
        }

        const subject = `Ricoz daily digest — ${date}`
        const sends = recipients.map((r) => {
          const rendered = renderDigestEmail({
            recipientName: r.name,
            orgName: org.name,
            date,
            origin,
            lowStock,
            pending,
            invites,
          })
          return sendEmail({ to: r.email, subject, html: rendered.html, text: rendered.text })
        })

        const outcome = await Promise.race([
          Promise.allSettled(sends),
          new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), SEND_TIMEOUT_MS)),
        ])

        const delivered =
          outcome === 'timeout'
            ? 0
            : outcome.filter((r) => r.status === 'fulfilled' && r.value === true).length

        if (outcome === 'timeout') {
          console.log(
            `[cron] daily-digest org=${org.slug}: sends still in flight after ${SEND_TIMEOUT_MS}ms`
          )
        }

        orgsProcessed += 1
        emailsSent += delivered
        console.log(
          `[cron] daily-digest org=${org.slug} low=${lowStock.length} pending=${pending.length} invites=${invites.length} recipients=${recipients.length} delivered=${delivered}`
        )
      } catch (error) {
        failed += 1
        console.error(`[cron] daily-digest org=${org.slug} failed:`, error)
      }
    }

    return NextResponse.json({ success: true, data: { orgsProcessed, emailsSent, failed } })
  } catch (error) {
    console.error('[cron] daily-digest failed:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
