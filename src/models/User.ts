import mongoose, { Document, Schema } from 'mongoose'
import bcrypt from 'bcryptjs'

export type UserRole = 'admin' | 'inventory_manager' | 'approver' | 'warehouse_staff'

export interface IUser extends Document {
  email: string
  passwordHash: string
  name: string
  avatar?: string
  role: UserRole
  isActive: boolean
  emailVerified: Date | null
  lastLoginAt: Date | null
  preferences: {
    theme: 'light' | 'dark' | 'system'
    notifications: {
      email: boolean
      inApp: boolean
    }
    dashboardLayout: 'compact' | 'comfortable'
  }
  createdAt: Date
  updatedAt: Date
  comparePassword(candidatePassword: string): Promise<boolean>
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 255 },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    avatar: { type: String },
    role: { type: String, enum: ['admin', 'inventory_manager', 'approver', 'warehouse_staff'], required: true },
    isActive: { type: Boolean, default: true },
    emailVerified: { type: Date },
    lastLoginAt: { type: Date },
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      notifications: {
        email: { type: Boolean, default: true },
        inApp: { type: Boolean, default: true },
      },
      dashboardLayout: { type: String, enum: ['compact', 'comfortable'], default: 'comfortable' },
    },
  },
  { timestamps: true }
)

UserSchema.index({ email: 1 }, { unique: true })

UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.passwordHash)
}

UserSchema.statics.hashPassword = async function (password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema)