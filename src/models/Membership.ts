import mongoose, { Document, Schema, Types } from 'mongoose'
import { UserRole } from './User'

export interface IMembership extends Document {
  user: Types.ObjectId
  organization: Types.ObjectId
  role: UserRole
  locationPermissions: Types.ObjectId[] // Empty = all locations
  isActive: boolean
  joinedAt: Date
  createdAt: Date
  updatedAt: Date
}

const MembershipSchema = new Schema<IMembership>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    role: { type: String, enum: ['admin', 'inventory_manager', 'approver', 'warehouse_staff'], required: true },
    locationPermissions: [{ type: Schema.Types.ObjectId, ref: 'Location' }],
    isActive: { type: Boolean, default: true },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

MembershipSchema.index({ user: 1, organization: 1 }, { unique: true })
MembershipSchema.index({ organization: 1, isActive: 1 })
MembershipSchema.index({ user: 1, isActive: 1 })

export const Membership = mongoose.models.Membership || mongoose.model<IMembership>('Membership', MembershipSchema)