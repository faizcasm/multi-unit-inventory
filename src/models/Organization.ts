import mongoose, { Document, Schema, Types } from 'mongoose'

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
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

OrganizationSchema.index({ slug: 1 }, { unique: true })

export const Organization = mongoose.models.Organization || mongoose.model<IOrganization>('Organization', OrganizationSchema)