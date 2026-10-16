import mongoose, { Document, Schema, Types } from 'mongoose'

export interface ISupplier extends Document {
  organization: Types.ObjectId
  name: string
  contactName?: string
  contactEmail?: string
  phone?: string
  website?: string
  address?: string
  leadTimeDays: number
  notes?: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const SupplierSchema = new Schema<ISupplier>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    contactName: { type: String, trim: true, maxlength: 120 },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 255 },
    phone: { type: String, trim: true, maxlength: 30 },
    website: { type: String, trim: true, maxlength: 255 },
    address: { type: String, trim: true, maxlength: 300 },
    leadTimeDays: { type: Number, default: 3, min: 0, max: 365 },
    notes: { type: String, trim: true, maxlength: 1000 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

SupplierSchema.index({ organization: 1, createdAt: -1 })
SupplierSchema.index({ organization: 1, isActive: 1 })

export const Supplier = mongoose.models.Supplier || mongoose.model<ISupplier>('Supplier', SupplierSchema)
