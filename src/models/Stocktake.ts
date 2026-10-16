import mongoose, { Document, Schema, Types } from 'mongoose'

export type StocktakeStatus = 'OPEN' | 'COUNTED' | 'POSTED' | 'VOID'

export interface IStocktakeLine {
  product: Types.ObjectId
  /** Name snapshot at count-sheet creation time. */
  productName: string
  /** SKU snapshot at count-sheet creation time. */
  sku: string
  /**
   * System quantity as of the moment the line was counted (or, for POSTED
   * stocktakes, the authoritative live quantity re-read at posting time).
   * NOT stored at creation time — it defaults to 0 until a count is saved.
   */
  systemQuantity: number
  /** Present once the line has been physically counted. */
  countedQuantity?: number
  countedBy?: Types.ObjectId
  countedAt?: Date
  notes?: string
}

export interface IStocktake extends Document {
  organization: Types.ObjectId
  reference: string
  location: Types.ObjectId
  status: StocktakeStatus
  lines: IStocktakeLine[]
  createdBy: Types.ObjectId
  postedBy?: Types.ObjectId
  postedAt?: Date
  notes?: string
  createdAt: Date
  updatedAt: Date
}

const StocktakeLineSchema = new Schema<IStocktakeLine>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true },
    systemQuantity: { type: Number, required: true, default: 0, min: 0 },
    countedQuantity: { type: Number, min: 0 },
    countedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    countedAt: { type: Date },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
)

const StocktakeSchema = new Schema<IStocktake>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    reference: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
    location: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
    status: {
      type: String,
      enum: ['OPEN', 'COUNTED', 'POSTED', 'VOID'],
      required: true,
      default: 'OPEN',
    },
    lines: [StocktakeLineSchema],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    postedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    postedAt: { type: Date },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
)

StocktakeSchema.index({ organization: 1, reference: 1 }, { unique: true })
StocktakeSchema.index({ organization: 1, createdAt: -1 })
StocktakeSchema.index({ organization: 1, status: 1 })

export const Stocktake = mongoose.models.Stocktake || mongoose.model<IStocktake>('Stocktake', StocktakeSchema)
