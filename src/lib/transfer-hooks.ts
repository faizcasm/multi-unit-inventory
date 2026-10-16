import { dispatchWebhook } from '@/lib/webhooks'
import { createNotification, notifyRole } from '@/lib/notify'
import type { UserRole } from '@/models/User'

/**
 * Transfer lifecycle side effects — fires the matching webhook event and fans
 * out in-app notifications. Called from the transfer API routes right next to
 * the existing audit + email hooks. Never throws (both helpers swallow their
 * own errors), so a webhook/notify failure can never fail the request.
 */

type TransferLike = {
  _id: unknown
  reference: string
  status: string
  requester?: unknown
  sourceLocation?: unknown
  destinationLocation?: unknown
}

export type TransferHookEvent =
  | 'transfer.created'
  | 'transfer.submitted'
  | 'transfer.approved'
  | 'transfer.rejected'
  | 'transfer.dispatched'
  | 'transfer.received'
  | 'transfer.cancelled'

const EVENT_TITLES: Record<TransferHookEvent, (ref: string) => string> = {
  'transfer.created': (ref) => `Transfer ${ref} drafted`,
  'transfer.submitted': (ref) => `${ref} is awaiting approval`,
  'transfer.approved': (ref) => `${ref} was approved`,
  'transfer.rejected': (ref) => `${ref} was rejected`,
  'transfer.dispatched': (ref) => `${ref} was dispatched`,
  'transfer.received': (ref) => `${ref} was received`,
  'transfer.cancelled': (ref) => `${ref} was cancelled`,
}

/** Location refs are either populated docs or bare ids depending on the route. */
function locationRef(value: unknown): string | { id: string; name?: string } {
  if (!value) return ''
  if (typeof value === 'object' && value !== null && '_id' in (value as Record<string, unknown>)) {
    const doc = value as { _id: unknown; name?: unknown }
    return { id: String(doc._id), name: typeof doc.name === 'string' ? doc.name : undefined }
  }
  return String(value)
}

export async function fireTransferHooks(input: {
  organization: string
  event: TransferHookEvent
  transfer: TransferLike
  actorUserId: string
  /** In-app notification roles (in addition to / instead of the requester). */
  notifyRoles?: UserRole[]
  /** Notify the transfer requester (default true; false for create/submit). */
  notifyRequester?: boolean
  /** Extra webhook payload fields (e.g. rejectionReason). */
  extraPayload?: Record<string, unknown>
}): Promise<void> {
  const { organization, event, transfer, actorUserId } = input
  const transferId = String(transfer._id)
  const link = `/dashboard/transfers/${transferId}`
  const requesterId = transfer.requester ? String(transfer.requester) : ''

  await Promise.all([
    dispatchWebhook({
      organization,
      event,
      payload: {
        transferId,
        reference: transfer.reference,
        status: transfer.status,
        sourceLocation: locationRef(transfer.sourceLocation),
        destinationLocation: locationRef(transfer.destinationLocation),
        requester: requesterId,
        triggeredBy: actorUserId,
        ...(input.extraPayload ?? {}),
      },
    }),
    input.notifyRequester !== false && requesterId
      ? createNotification({
          organization,
          event: event.toUpperCase().replace(/\./g, '_'),
          title: EVENT_TITLES[event](transfer.reference),
          body: `Transfer ${transfer.reference} · ${transfer.status.replaceAll('_', ' ').toLowerCase()}`,
          link,
          recipients: [requesterId],
          actorUserId,
        })
      : Promise.resolve(),
    input.notifyRoles?.length
      ? notifyRole({
          organization,
          event: event.toUpperCase().replace(/\./g, '_'),
          title: EVENT_TITLES[event](transfer.reference),
          body: `Transfer ${transfer.reference} · ${transfer.status.replaceAll('_', ' ').toLowerCase()}`,
          link,
          roles: input.notifyRoles,
          actorUserId,
        })
      : Promise.resolve(),
  ])
}
