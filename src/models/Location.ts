import mongoose, { Document, Schema, Types } from 'mongoose'

export type LocationType = 'warehouse' | 'store' | 'distribution_center' | 'other'

export interface ILocation extends Document {
  organization: Types.ObjectId
  name: string
  code: string
  type: LocationType
  address?: {
    street?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
  }
  description?: string
  contactPerson?: string
  contactPhone?: string
  contactEmail?: string
  capacity?: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const LocationSchema = new Schema<ILocation>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    type: { type: String, enum: ['warehouse', 'store', 'distribution_center', 'other'], required: true },
    address: {
      street: { type: String, trim: true, maxlength: 200 },
      city: { type: String, trim: true, maxlength: 100 },
      state: { type: String, trim: true, maxlength: 100 },
      postalCode: { type: String, trim: true, maxlength: 20 },
      country: { type: String, trim: true, maxlength: 100 },
    },
    description: { type: String, trim: true, maxlength: 500 },
    contactPerson: { type: String, trim: true, maxlength: 100 },
    contactPhone: { type: String, trim: true, maxlength: 30 },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 255 },
    capacity: { type: Number, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

LocationSchema.index({ organization: 1, code: 1 }, { unique: true })
LocationSchema.index({ organization: 1, isActive: 1 })
LocationSchema.index({ organization: 1, type: 1 })

export const Location = mongoose.models.Location || mongoose.model<ILocation>('Location', LocationSchema)