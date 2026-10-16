import mongoose, { Document, Schema, Types } from 'mongoose'

export type LoginStatus = 'success' | 'failed'

export interface ILoginEvent extends Document {
  organization?: Types.ObjectId | null
  user?: Types.ObjectId | null
  email: string
  ipAddress?: string
  userAgent?: string
  status: LoginStatus
  createdAt: Date
}

const LoginEventSchema = new Schema<ILoginEvent>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization' },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    ipAddress: { type: String, maxlength: 45 },
    userAgent: { type: String, maxlength: 500 },
    status: { type: String, enum: ['success', 'failed'], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

LoginEventSchema.index({ email: 1, createdAt: -1 })
LoginEventSchema.index({ user: 1, createdAt: -1 })
LoginEventSchema.index({ organization: 1, createdAt: -1 })

export const LoginEvent =
  mongoose.models.LoginEvent || mongoose.model<ILoginEvent>('LoginEvent', LoginEventSchema)
