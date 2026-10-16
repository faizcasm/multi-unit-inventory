import { Types } from 'mongoose'
import { Notification } from '@/models/Notification'
import { Membership } from '@/models/Membership'
import { User } from '@/models/User'
import type { UserRole } from '@/models/User'

type RecipientId = string | Types.ObjectId

interface NotificationInput {
  organization: string | Types.ObjectId
  /** Free-form event key, e.g. TRANSFER_SUBMITTED, TRANSFER_COMMENT, LOW_STOCK. */
  event: string
  title: string
  body?: string
  link?: string
  recipients: RecipientId[]
  actorUserId?: RecipientId | null
}

interface RoleNotificationInput extends Omit<NotificationInput, 'recipients'> {
  roles: UserRole[]
}

async function toObjectIds(ids: RecipientId[]): Promise<Types.ObjectId[]> {
  return ids
    .map((id) => (Types.ObjectId.isValid(String(id)) ? new Types.ObjectId(String(id)) : null))
    .filter((id): id is Types.ObjectId => id !== null)
}

/**
 * Create in-app notifications for a set of users. Respects each recipient's
 * preferences.notifications.inApp toggle (opted-out users are skipped).
 * Never throws — notification delivery must not break the triggering action.
 */
export async function createNotification(input: NotificationInput): Promise<void> {
  try {
    const orgId = new Types.ObjectId(String(input.organization))
    const recipients = await toObjectIds(input.recipients)
    if (recipients.length === 0) return

    const optedIn = await User.find({
      _id: { $in: recipients },
      isActive: true,
      'preferences.notifications.inApp': { $ne: false },
    })
      .select('_id')
      .lean()

    if (optedIn.length === 0) return

    await Notification.insertMany(
      optedIn.map((u) => ({
        organization: orgId,
        user: u._id,
        event: input.event,
        title: input.title,
        body: input.body,
        link: input.link,
        actorUser: input.actorUserId ? new Types.ObjectId(String(input.actorUserId)) : null,
        readAt: null,
      }))
    )
  } catch (error) {
    console.error('[notify] createNotification failed:', error)
  }
}

/** Create in-app notifications for every active member holding one of `roles`. */
export async function notifyRole(input: RoleNotificationInput): Promise<void> {
  try {
    const orgId = new Types.ObjectId(String(input.organization))
    const memberships = await Membership.find({
      organization: orgId,
      role: { $in: input.roles },
      isActive: true,
    })
      .select('user')
      .lean()

    if (memberships.length === 0) return

    await createNotification({
      ...input,
      recipients: memberships.map((m) => String(m.user)),
    })
  } catch (error) {
    console.error('[notify] notifyRole failed:', error)
  }
}
