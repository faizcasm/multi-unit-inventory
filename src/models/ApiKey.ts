import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IApiKey extends Document {
  organization: Types.ObjectId
  name: string
  /** SHA-256 hex of the full key — never returned by any API. */
  keyHash: string
  /** First 12 chars of the key (e.g. `rzk_a1b2c3d4`) — safe for display. */
  prefix: string
  createdBy: Types.ObjectId
  lastUsedAt?: Date | null
  expiresAt?: Date | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const ApiKeySchema = new Schema<IApiKey>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    keyHash: { type: String, required: true },
    prefix: { type: String, required: true, maxlength: 12 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lastUsedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

ApiKeySchema.index({ organization: 1, createdAt: -1 })
ApiKeySchema.index({ keyHash: 1 }, { unique: true })

export const ApiKey = mongoose.models.ApiKey || mongoose.model<IApiKey>('ApiKey', ApiKeySchema)
