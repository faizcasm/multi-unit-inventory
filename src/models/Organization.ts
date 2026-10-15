import mongoose, { Document, Schema, Types } from 'mongoose'

export type InviteRole = 'admin' | 'inventory_manager' | 'approver' | 'warehouse_staff'

export interface IOrganizationInvite {
  tokenHash: string
  role: InviteRole
  email?: string
  expiresAt: Date
  acceptedAt?: Date | null
  createdBy?: Types.ObjectId
}

export interface IOrganization extends Document {
  name: string
  slug: string
  description?: string
  logo?: string
  settings: {
    timezone: string
    currency: string
    dateFormat: string
    separationOfDuties: boolean
    lowStockThreshold: number
  }
  invites: IOrganizationInvite[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const OrganizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9-]+$/, maxlength: 50 },
    description: { type: String, trim: true, maxlength: 500 },
    logo: { type: String },
    settings: {
      timezone: { type: String, default: 'UTC' },
      currency: { type: String, default: 'USD' },
      dateFormat: { type: String, default: 'YYYY-MM-DD' },
      separationOfDuties: { type: Boolean, default: true },
      lowStockThreshold: { type: Number, default: 10 },
    },
    // One-time, expiring registration invites (tokens stored as SHA-256 hashes).
    invites: {
      type: [
        new Schema(
          {
            tokenHash: { type: String, required: true },
            role: { type: String, enum: ['admin', 'inventory_manager', 'approver', 'warehouse_staff'], required: true },
            email: { type: String, lowercase: true, trim: true, maxlength: 255 },
            expiresAt: { type: Date, required: true },
            acceptedAt: { type: Date, default: null },
            createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

OrganizationSchema.index({ slug: 1 }, { unique: true })

export const Organization = mongoose.models.Organization || mongoose.model<IOrganization>('Organization', OrganizationSchema)