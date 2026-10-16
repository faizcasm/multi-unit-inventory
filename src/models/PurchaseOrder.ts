import mongoose, { Document, Schema, Types } from 'mongoose'

export type PurchaseOrderStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED'

export interface IPurchaseOrderLine {
  product: Types.ObjectId
  productName: string
  sku: string
  requestedQuantity: number
  receivedQuantity: number
  unitCost: number
}

export interface IPurchaseOrder extends Document {
  organization: Types.ObjectId
  reference: string
  supplier: Types.ObjectId
  destinationLocation: Types.ObjectId
  status: PurchaseOrderStatus
  lines: IPurchaseOrderLine[]
  notes?: string
  createdBy: Types.ObjectId
  sentBy?: Types.ObjectId
  sentAt?: Date
  cancelledBy?: Types.ObjectId
  cancelledAt?: Date
  /** Last user to receive stock against this order. */
  receivedBy?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const PurchaseOrderLineSchema = new Schema<IPurchaseOrderLine>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true, trim: true, maxlength: 200 },
    sku: { type: String, required: true, trim: true, maxlength: 100 },
    requestedQuantity: { type: Number, required: true, min: 1 },
    receivedQuantity: { type: Number, required: true, default: 0, min: 0 },
    unitCost: { type: Number, required: true, default: 0, min: 0 },
  },
  { _id: false }
)

const PurchaseOrderSchema = new Schema<IPurchaseOrder>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    reference: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    destinationLocation: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
    status: {
      type: String,
      enum: ['DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
      required: true,
      default: 'DRAFT',
    },
    lines: {
      type: [PurchaseOrderLineSchema],
      validate: [
        (lines: IPurchaseOrderLine[]) => Array.isArray(lines) && lines.length > 0,
        'At least one line is required',
      ],
    },
    notes: { type: String, trim: true, maxlength: 1000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sentBy: { type: Schema.Types.ObjectId, ref: 'User' },
    sentAt: { type: Date },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: { type: Date },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

PurchaseOrderSchema.index({ organization: 1, createdAt: -1 })
PurchaseOrderSchema.index({ organization: 1, status: 1 })
PurchaseOrderSchema.index({ organization: 1, reference: 1 }, { unique: true })
PurchaseOrderSchema.index({ organization: 1, supplier: 1 })

export const PurchaseOrder =
  mongoose.models.PurchaseOrder || mongoose.model<IPurchaseOrder>('PurchaseOrder', PurchaseOrderSchema)
