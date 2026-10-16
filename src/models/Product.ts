import mongoose, { Document, Schema, Types } from 'mongoose'

export type UnitOfMeasure = 'pcs' | 'kg' | 'g' | 'l' | 'ml' | 'm' | 'cm' | 'box' | 'pack' | 'roll' | 'other'

export interface IProduct extends Document {
  organization: Types.ObjectId
  name: string
  sku: string
  description?: string
  category?: string
  unitOfMeasure: UnitOfMeasure
  barcode?: string
  image?: string
  supplier?: Types.ObjectId
  unitCost: number
  reorderThreshold: number
  reorderQuantity: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const ProductSchema = new Schema<IProduct>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 50 },
    description: { type: String, trim: true, maxlength: 1000 },
    category: { type: String, trim: true, maxlength: 100 },
    unitOfMeasure: { type: String, enum: ['pcs', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'box', 'pack', 'roll', 'other'], required: true, default: 'pcs' },
    barcode: { type: String, trim: true, maxlength: 100 },
    image: { type: String },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    unitCost: { type: Number, default: 0, min: 0 },
    reorderThreshold: { type: Number, default: 0, min: 0 },
    reorderQuantity: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

ProductSchema.index({ organization: 1, sku: 1 }, { unique: true })
ProductSchema.index({ organization: 1, isActive: 1 })
ProductSchema.index({ organization: 1, category: 1 })
ProductSchema.index({ organization: 1, supplier: 1 })
ProductSchema.index({ organization: 1, name: 'text', description: 'text', sku: 'text' })

export const Product = mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema)