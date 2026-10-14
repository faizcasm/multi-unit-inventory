import mongoose, { Document, Schema, Types } from 'mongoose'

export type MovementType = 'DISPATCH' | 'RECEIPT' | 'ADJUSTMENT' | 'DISCREPANCY' | 'RESERVATION' | 'RELEASE_RESERVATION' | 'DAMAGED' | 'RETURN'

export interface IInventoryMovement extends Document {
  organization: Types.ObjectId
  product: Types.ObjectId
  location: Types.ObjectId
  movementType: MovementType
  quantity: number
  referenceType: 'TRANSFER' | 'ADJUSTMENT'
  referenceId: Types.ObjectId
  referenceLineItemId?: Types.ObjectId
  responsibleUser: Types.ObjectId
  reason?: string
  beforeQuantity: {
    available: number
    reserved: number
    inTransit: number
    damaged: number
  }
  afterQuantity: {
    available: number
    reserved: number
    inTransit: number
    damaged: number
  }
  notes?: string
  createdAt: Date
}

const InventoryMovementSchema = new Schema<IInventoryMovement>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    location: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
    movementType: {
      type: String,
      enum: ['DISPATCH', 'RECEIPT', 'ADJUSTMENT', 'DISCREPANCY', 'RESERVATION', 'RELEASE_RESERVATION', 'DAMAGED', 'RETURN'],
      required: true,
    },
    quantity: { type: Number, required: true },
    referenceType: { type: String, enum: ['TRANSFER', 'ADJUSTMENT'], required: true },
    referenceId: { type: Schema.Types.ObjectId, required: true },
    referenceLineItemId: { type: Schema.Types.ObjectId },
    responsibleUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, trim: true, maxlength: 500 },
    beforeQuantity: {
      available: { type: Number, required: true },
      reserved: { type: Number, required: true },
      inTransit: { type: Number, required: true },
      damaged: { type: Number, required: true },
    },
    afterQuantity: {
      available: { type: Number, required: true },
      reserved: { type: Number, required: true },
      inTransit: { type: Number, required: true },
      damaged: { type: Number, required: true },
    },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

InventoryMovementSchema.index({ organization: 1, createdAt: -1 })
InventoryMovementSchema.index({ organization: 1, product: 1, createdAt: -1 })
InventoryMovementSchema.index({ organization: 1, location: 1, createdAt: -1 })
InventoryMovementSchema.index({ organization: 1, referenceType: 1, referenceId: 1 })
InventoryMovementSchema.index({ organization: 1, movementType: 1, createdAt: -1 })

export const InventoryMovement = mongoose.models.InventoryMovement || mongoose.model<IInventoryMovement>('InventoryMovement', InventoryMovementSchema)