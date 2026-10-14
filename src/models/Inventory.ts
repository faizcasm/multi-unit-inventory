import mongoose, { Document, Schema, Types } from 'mongoose'

export interface IInventory extends Document {
  organization: Types.ObjectId
  product: Types.ObjectId
  location: Types.ObjectId
  availableQuantity: number
  reservedQuantity: number
  inTransitQuantity: number
  damagedQuantity: number
  lastMovementAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const InventorySchema = new Schema<IInventory>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    location: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
    availableQuantity: { type: Number, required: true, default: 0, min: 0 },
    reservedQuantity: { type: Number, required: true, default: 0, min: 0 },
    inTransitQuantity: { type: Number, required: true, default: 0, min: 0 },
    damagedQuantity: { type: Number, required: true, default: 0, min: 0 },
    lastMovementAt: { type: Date },
  },
  { timestamps: true }
)

InventorySchema.index({ organization: 1, product: 1, location: 1 }, { unique: true })
InventorySchema.index({ organization: 1, location: 1 })
InventorySchema.index({ organization: 1, product: 1 })
InventorySchema.index({ organization: 1, availableQuantity: 1 })

export const Inventory = mongoose.models.Inventory || mongoose.model<IInventory>('Inventory', InventorySchema)