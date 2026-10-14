import mongoose, { Document, Schema, Types } from 'mongoose'

export type TransferStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'IN_TRANSIT' | 'COMPLETED' | 'REJECTED' | 'CANCELLED'

export type MovementType = 'DISPATCH' | 'RECEIPT' | 'ADJUSTMENT' | 'DISCREPANCY' | 'RESERVATION' | 'RELEASE_RESERVATION'

export interface ITransferLineItem {
  product: Types.ObjectId
  requestedQuantity: number
  approvedQuantity?: number
  dispatchedQuantity?: number
  receivedQuantity?: number
  missingQuantity?: number
  damagedQuantity?: number
  notes?: string
}

export interface IStockTransfer extends Document {
  organization: Types.ObjectId
  reference: string
  sourceLocation: Types.ObjectId
  destinationLocation: Types.ObjectId
  lineItems: ITransferLineItem[]
  status: TransferStatus
  requester: Types.ObjectId
  approver?: Types.ObjectId
  approvedAt?: Date
  approvalNotes?: string
  rejectionReason?: string
  dispatchedBy?: Types.ObjectId
  dispatchedAt?: Date
  receivedBy?: Types.ObjectId
  receivedAt?: Date
  receiptNotes?: string
  cancelledBy?: Types.ObjectId
  cancelledAt?: Date
  cancellationReason?: string
  notes?: string
  statusHistory: {
    status: TransferStatus
    changedBy: Types.ObjectId
    changedAt: Date
    notes?: string
  }[]
  createdAt: Date
  updatedAt: Date
}

const TransferLineItemSchema = new Schema<ITransferLineItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    requestedQuantity: { type: Number, required: true, min: 1 },
    approvedQuantity: { type: Number, min: 0 },
    dispatchedQuantity: { type: Number, min: 0 },
    receivedQuantity: { type: Number, min: 0 },
    missingQuantity: { type: Number, min: 0 },
    damagedQuantity: { type: Number, min: 0 },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
)

const StatusHistorySchema = new Schema(
  {
    status: { type: String, enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_TRANSIT', 'COMPLETED', 'REJECTED', 'CANCELLED'], required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
)

const StockTransferSchema = new Schema<IStockTransfer>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    reference: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
    sourceLocation: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
    destinationLocation: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
    lineItems: [TransferLineItemSchema],
    status: {
      type: String,
      enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_TRANSIT', 'COMPLETED', 'REJECTED', 'CANCELLED'],
      required: true,
      default: 'DRAFT',
    },
    requester: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approver: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    approvalNotes: { type: String, trim: true, maxlength: 500 },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
    dispatchedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    dispatchedAt: { type: Date },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    receivedAt: { type: Date },
    receiptNotes: { type: String, trim: true, maxlength: 500 },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: { type: Date },
    cancellationReason: { type: String, trim: true, maxlength: 500 },
    notes: { type: String, trim: true, maxlength: 1000 },
    statusHistory: [StatusHistorySchema],
  },
  { timestamps: true }
)

StockTransferSchema.index({ organization: 1, reference: 1 }, { unique: true })
StockTransferSchema.index({ organization: 1, status: 1 })
StockTransferSchema.index({ organization: 1, sourceLocation: 1 })
StockTransferSchema.index({ organization: 1, destinationLocation: 1 })
StockTransferSchema.index({ organization: 1, requester: 1 })
StockTransferSchema.index({ organization: 1, createdAt: -1 })
StockTransferSchema.index({ organization: 1, status: 1, createdAt: -1 })

export const StockTransfer = mongoose.models.StockTransfer || mongoose.model<IStockTransfer>('StockTransfer', StockTransferSchema)