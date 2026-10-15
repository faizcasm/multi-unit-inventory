import { sendEmail } from '@/lib/email'
import { StockTransfer } from '@/models/StockTransfer'
import { Membership } from '@/models/Membership'
import { User } from '@/models/User'

export type TransferEmailEvent =
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'DISPATCHED'
  | 'RECEIVED'
  | 'CANCELLED'

type EventCopy = {
  verb: string
  blurb: string
  cta: string
}

const EVENT_COPY: Record<TransferEmailEvent, EventCopy> = {
  SUBMITTED: {
    verb: 'submitted for approval',
    blurb: 'A new transfer is waiting for review. Approve or reject it to keep stock moving.',
    cta: 'Review transfer',
  },
  APPROVED: {
    verb: 'approved',
    blurb: 'Your transfer was approved. It is ready to be dispatched from the source location.',
    cta: 'View transfer',
  },
  REJECTED: {
    verb: 'was rejected',
    blurb: 'Your transfer was rejected. You can review the notes and submit a new request.',
    cta: 'View transfer',
  },
  DISPATCHED: {
    verb: 'has been dispatched',
    blurb: 'Stock is on the move. The destination team can receive it when it arrives.',
    cta: 'Track transfer',
  },
  RECEIVED: {
    verb: 'has been received',
    blurb: 'Stock arrived at the destination and the transfer is complete. Discrepancies, if any, are recorded.',
    cta: 'View transfer',
  },
  CANCELLED: {
    verb: 'was cancelled',
    blurb: 'This transfer was cancelled and no longer needs action.',
    cta: 'View transfer',
  },
}

function appOrigin(): string {
  const raw = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || ''
  return raw.replace(/\/$/, '')
}

function renderTransferEmail(opts: {
  event: TransferEmailEvent
  recipientName?: string
  reference: string
  route: string
  itemSummary: string
  transferUrl: string
}): { html: string; text: string } {
  const copy = EVENT_COPY[opts.event]
  const heading = `Transfer ${opts.reference} ${copy.verb}`
  const html = `
  <div style="font-family:'DM Sans',Arial,sans-serif;background:#f8f7fb;padding:34px 20px;color:#201c33">
    <div style="max-width:440px;margin:0 auto;background:#fff;border:1px solid #eceaf3;border-radius:16px;overflow:hidden">
      <div style="padding:26px 28px 0;display:flex;align-items:center;gap:10px">
        <span style="width:36px;height:36px;border-radius:12px;display:grid;place-items:center;color:#fff;background:linear-gradient(145deg,#987df6,#6e53e5);font-weight:800">R</span>
        <b style="font-family:Manrope,Arial,sans-serif;font-size:17px;letter-spacing:-.5px">ricoz <span style="font-weight:500;color:#8e8aa0">inventory</span></b>
      </div>
      <div style="padding:22px 28px 28px">
        <p style="font-size:10px;font-weight:800;letter-spacing:1.5px;color:#8069dc;margin:0 0 12px">TRANSFER UPDATE</p>
        <h1 style="font-family:Manrope,Arial,sans-serif;font-size:20px;letter-spacing:-.8px;margin:0 0 10px">${heading}</h1>
        <p style="font-size:13px;line-height:1.8;color:#77758a;margin:0 0 16px">
          Hi ${opts.recipientName || 'there'}, ${copy.blurb}
        </p>
        <div style="border:1px solid #eceaf3;border-radius:12px;padding:14px 16px;margin:0 0 20px;background:#fcfbff">
          <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:8px">
            <span style="font-size:10px;color:#9a94a8">Transfer</span>
            <b style="font-size:11px;font-family:Manrope,Arial,sans-serif">${opts.reference}</b>
          </div>
          <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:8px">
            <span style="font-size:10px;color:#9a94a8">Route</span>
            <b style="font-size:11px">${opts.route}</b>
          </div>
          <div style="display:flex;justify-content:space-between;gap:12px">
            <span style="font-size:10px;color:#9a94a8">Items</span>
            <b style="font-size:11px;text-align:right">${opts.itemSummary}</b>
          </div>
        </div>
        <a href="${opts.transferUrl}" style="display:inline-block;background:linear-gradient(135deg,#8066ed,#6b50df);color:#fff;text-decoration:none;font-weight:700;font-size:13px;border-radius:10px;padding:13px 18px">
          ${copy.cta}
        </a>
        ${opts.transferUrl ? `<p style="font-size:10px;color:#aaa5b5;line-height:1.7;margin:22px 0 0">Link: <span style="color:#7358e8;word-break:break-all">${opts.transferUrl}</span></p>` : ''}
      </div>
    </div>
    <p style="text-align:center;font-size:9px;color:#aaa5b5;margin-top:16px">© 2026 Ricoz Inventory · You receive this because email notifications are enabled in your preferences.</p>
  </div>`

  const text = `${heading}

Hi ${opts.recipientName || 'there'}, ${copy.blurb}

Transfer: ${opts.reference}
Route: ${opts.route}
Items: ${opts.itemSummary}

${opts.transferUrl}`

  return { html, text }
}

/**
 * Notifies the right people about a transfer lifecycle event, respecting each
 * recipient's email notification preference. Never throws — email failures must
 * not break the transfer action itself. Capped at SEND_TIMEOUT_MS so a slow or
 * dead SMTP server cannot stall the API response.
 */
// Generous enough for Gmail's handshake + delivery, still bounded so SMTP
// can never stall a transfer action indefinitely.
const SEND_TIMEOUT_MS = 10000

export async function sendTransferNotification(
  transferId: string,
  event: TransferEmailEvent,
  actorId?: string
): Promise<void> {
  try {
    const transfer = (await StockTransfer.findById(transferId)
      .populate('sourceLocation', 'name code')
      .populate('destinationLocation', 'name code')
      .populate('requester', 'name email')
      .populate({ path: 'lineItems.product', select: 'name sku' })
      .lean()) as any

    if (!transfer) return

    const route = `${transfer.sourceLocation?.name || 'Source'} → ${transfer.destinationLocation?.name || 'Destination'}`
    const shown = (transfer.lineItems || []).slice(0, 3)
    const extra = (transfer.lineItems?.length || 0) - shown.length
    const itemSummary =
      shown
        .map((li: any) => `${li.requestedQuantity}× ${li.product?.name || 'item'}`)
        .join(', ') + (extra > 0 ? ` +${extra} more` : '')

    type Recipient = { id: string; name?: string; email: string; wantsEmail: boolean }
    let recipients: Recipient[] = []

    if (event === 'SUBMITTED') {
      // Approvers (admins + approvers) decide what happens next.
      const memberships = (await Membership.find({
        organization: transfer.organization,
        role: { $in: ['admin', 'approver'] },
        isActive: true,
      }).populate('user', 'name email preferences')) as any[]

      recipients = memberships
        .filter((m) => m.user?.email)
        .map((m) => ({
          id: String(m.user._id),
          name: m.user.name,
          email: m.user.email,
          wantsEmail: m.user.preferences?.notifications?.email !== false,
        }))
    } else {
      // Everyone else hears about their own transfer.
      const requester = (await User.findById(transfer.requester)
        .select('name email preferences')
        .lean()) as any

      if (requester?.email) {
        recipients = [
          {
            id: String(requester._id),
            name: requester.name,
            email: requester.email,
            wantsEmail: requester.preferences?.notifications?.email !== false,
          },
        ]
      }
    }

    const origin = appOrigin()
    const transferUrl = origin ? `${origin}/dashboard/transfers/${transfer._id}` : ''

    const sends = recipients
      .filter((r) => r.wantsEmail && (!actorId || r.id !== String(actorId)))
      .map(async (r) => {
        const personalized = renderTransferEmail({
          event,
          recipientName: r.name,
          reference: transfer.reference,
          route,
          itemSummary,
          transferUrl,
        })
        return sendEmail({
          to: r.email,
          subject: `Transfer ${transfer.reference} ${EVENT_COPY[event].verb}`,
          html: personalized.html,
          text: personalized.text,
        })
      })

    if (sends.length === 0) return

    // Cap the wait so a slow SMTP server never blocks the API response path.
    const outcome = await Promise.race([
      Promise.allSettled(sends),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), SEND_TIMEOUT_MS)),
    ])
    if (outcome === 'timeout') {
      console.log(`[transfer-email] ${event} ${transfer.reference}: send still in flight after ${SEND_TIMEOUT_MS}ms`)
    } else {
      const delivered = outcome.filter((r) => r.status === 'fulfilled' && r.value === true).length
      console.log(`[transfer-email] ${event} ${transfer.reference}: ${delivered}/${sends.length} delivered`)
    }
  } catch (error) {
    console.error('Transfer notification failed:', error)
  }
}
