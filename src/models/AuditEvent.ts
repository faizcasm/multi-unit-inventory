import mongoose, { Document, Schema, Types } from 'mongoose'

export type AuditAction =
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'USER_REGISTER'
  | 'ORG_CREATE'
  | 'ORG_UPDATE'
  | 'LOCATION_CREATE'
  | 'LOCATION_UPDATE'
  | 'LOCATION_DEACTIVATE'
  | 'PRODUCT_CREATE'
  | 'PRODUCT_UPDATE'
  | 'PRODUCT_DEACTIVATE'
  | 'INVENTORY_ADJUST'
  | 'TRANSFER_CREATE'
  | 'TRANSFER_SUBMIT'
  | 'TRANSFER_APPROVE'
  | 'TRANSFER_REJECT'
  | 'TRANSFER_DISPATCH'
  | 'TRANSFER_RECEIVE'
  | 'TRANSFER_CANCEL'
  | 'TRANSFER_COMPLETE'
  | 'MEMBERSHIP_CREATE'
  | 'MEMBERSHIP_UPDATE'
  | 'MEMBERSHIP_REMOVE'
  | 'SETTINGS_UPDATE'
  | 'SUPPLIER_CREATE'
  | 'SUPPLIER_UPDATE'
  | 'SUPPLIER_DEACTIVATE'
  | 'PURCHASE_ORDER_CREATE'
  | 'PURCHASE_ORDER_UPDATE'
  | 'PURCHASE_ORDER_RECEIVE'
  | 'PURCHASE_ORDER_CANCEL'
  | 'STOCKTAKE_CREATE'
  | 'STOCKTAKE_UPDATE'
  | 'STOCKTAKE_COUNT'
  | 'STOCKTAKE_POST'
  | 'STOCKTAKE_VOID'
  | 'PRODUCT_IMPORT'
  | 'LOCATION_IMPORT'
  | 'INVENTORY_RESERVE'
  | 'INVENTORY_RELEASE'
  | 'TRANSFER_DUPLICATE'
  | 'TRANSFER_COMMENT'
  | 'WEBHOOK_CREATE'
  | 'WEBHOOK_UPDATE'
  | 'WEBHOOK_DELETE'
  | 'WEBHOOK_TEST'
  | 'APIKEY_CREATE'
  | 'APIKEY_DELETE'
  | 'DEMO_DATA_CREATE'

export interface IAuditEvent extends Document {
  organization: Types.ObjectId
  user: Types.ObjectId
  action: AuditAction
  resourceType: string
  resourceId?: Types.ObjectId
  metadata: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
  createdAt: Date
}

const AuditEventSchema = new Schema<IAuditEvent>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: {
      type: String,
      enum: [
        'USER_LOGIN',
        'USER_LOGOUT',
        'USER_REGISTER',
        'ORG_CREATE',
        'ORG_UPDATE',
        'LOCATION_CREATE',
        'LOCATION_UPDATE',
        'LOCATION_DEACTIVATE',
        'PRODUCT_CREATE',
        'PRODUCT_UPDATE',
        'PRODUCT_DEACTIVATE',
        'INVENTORY_ADJUST',
        'TRANSFER_CREATE',
        'TRANSFER_SUBMIT',
        'TRANSFER_APPROVE',
        'TRANSFER_REJECT',
        'TRANSFER_DISPATCH',
        'TRANSFER_RECEIVE',
        'TRANSFER_CANCEL',
        'TRANSFER_COMPLETE',
        'MEMBERSHIP_CREATE',
        'MEMBERSHIP_UPDATE',
        'MEMBERSHIP_REMOVE',
        'SETTINGS_UPDATE',
        'SUPPLIER_CREATE',
        'SUPPLIER_UPDATE',
        'SUPPLIER_DEACTIVATE',
        'PURCHASE_ORDER_CREATE',
        'PURCHASE_ORDER_UPDATE',
        'PURCHASE_ORDER_RECEIVE',
        'PURCHASE_ORDER_CANCEL',
        'STOCKTAKE_CREATE',
        'STOCKTAKE_UPDATE',
        'STOCKTAKE_COUNT',
        'STOCKTAKE_POST',
        'STOCKTAKE_VOID',
        'PRODUCT_IMPORT',
        'LOCATION_IMPORT',
        'INVENTORY_RESERVE',
        'INVENTORY_RELEASE',
        'TRANSFER_DUPLICATE',
        'TRANSFER_COMMENT',
        'WEBHOOK_CREATE',
        'WEBHOOK_UPDATE',
        'WEBHOOK_DELETE',
        'WEBHOOK_TEST',
        'APIKEY_CREATE',
        'APIKEY_DELETE',
        'DEMO_DATA_CREATE',
      ],
      required: true,
    },
    resourceType: { type: String, required: true, maxlength: 50 },
    resourceId: { type: Schema.Types.ObjectId },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, maxlength: 45 },
    userAgent: { type: String, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

AuditEventSchema.index({ organization: 1, createdAt: -1 })
AuditEventSchema.index({ organization: 1, user: 1, createdAt: -1 })
AuditEventSchema.index({ organization: 1, action: 1, createdAt: -1 })
AuditEventSchema.index({ organization: 1, resourceType: 1, resourceId: 1 })

export const AuditEvent = mongoose.models.AuditEvent || mongoose.model<IAuditEvent>('AuditEvent', AuditEventSchema)