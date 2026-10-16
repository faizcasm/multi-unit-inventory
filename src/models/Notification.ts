import mongoose, { Document, Schema, Types } from 'mongoose'

export interface INotification extends Document {
  organization: Types.ObjectId
  user: Types.ObjectId
  event: string
  title: string
  body?: string
  link?: string
  actorUser?: Types.ObjectId | null
  readAt?: Date | null
  createdAt: Date
}

const NotificationSchema = new Schema<INotification>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    event: { type: String, required: true, maxlength: 64 },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, maxlength: 500 },
    link: { type: String, maxlength: 500 },
    actorUser: { type: Schema.Types.ObjectId, ref: 'User' },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

NotificationSchema.index({ user: 1, readAt: 1, createdAt: -1 })
NotificationSchema.index({ organization: 1, createdAt: -1 })

export const Notification =
  mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema)
