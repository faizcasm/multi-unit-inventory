import mongoose, { Document, Schema, Types } from 'mongoose'

export interface ITransferComment extends Document {
  organization: Types.ObjectId
  transfer: Types.ObjectId
  user: Types.ObjectId
  body: string
  createdAt: Date
  updatedAt: Date
}

const TransferCommentSchema = new Schema<ITransferComment>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    transfer: { type: Schema.Types.ObjectId, ref: 'StockTransfer', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
)

TransferCommentSchema.index({ transfer: 1, createdAt: 1 })
TransferCommentSchema.index({ organization: 1, createdAt: -1 })

export const TransferComment =
  mongoose.models.TransferComment ||
  mongoose.model<ITransferComment>('TransferComment', TransferCommentSchema)
