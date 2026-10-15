import { z } from 'zod'

export const organizationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  slug: z.string().min(1, 'Slug is required').max(50, 'Slug must be 50 characters or less').regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
})

export const locationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  code: z.string().min(1, 'Code is required').max(20, 'Code must be 20 characters or less').regex(/^[A-Z0-9-]+$/, 'Code can only contain uppercase letters, numbers, and hyphens'),
  type: z.enum(['warehouse', 'store', 'distribution_center', 'other']),
  address: z.object({
    street: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    postalCode: z.string().max(20).optional(),
    country: z.string().max(100).optional(),
  }).optional(),
  description: z.string().max(500).optional(),
  contactPerson: z.string().max(100).optional(),
  contactPhone: z.string().max(30).optional(),
  contactEmail: z.string().email().max(255).optional().or(z.literal('')),
})

export const productSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name must be 200 characters or less'),
  sku: z.string().min(1, 'SKU is required').max(50, 'SKU must be 50 characters or less').regex(/^[A-Z0-9-_]+$/, 'SKU can only contain uppercase letters, numbers, hyphens, and underscores'),
  description: z.string().max(1000).optional(),
  category: z.string().max(100).optional(),
  unitOfMeasure: z.enum(['pcs', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'box', 'pack', 'roll', 'other']),
  barcode: z.string().max(100).optional(),
  reorderThreshold: z.number().int().min(0).default(0),
  reorderQuantity: z.number().int().min(0).default(0),
})

export const inventoryAdjustmentSchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  locationId: z.string().min(1, 'Location is required'),
  adjustmentQuantity: z.number().int().min(-10000, 'Adjustment too large').max(10000, 'Adjustment too large'),
  reason: z.string().min(1, 'Reason is required').max(500, 'Reason must be 500 characters or less'),
  notes: z.string().max(500).optional(),
})

export const transferLineItemSchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  requestedQuantity: z.number().int().min(1, 'Quantity must be at least 1'),
  notes: z.string().max(500).optional(),
})

export const createTransferSchema = z.object({
  sourceLocationId: z.string().min(1, 'Source location is required'),
  destinationLocationId: z.string().min(1, 'Destination location is required'),
  lineItems: z.array(transferLineItemSchema).min(1, 'At least one product is required'),
  notes: z.string().max(1000).optional(),
}).refine((data) => data.sourceLocationId !== data.destinationLocationId, {
  message: 'Source and destination locations must be different',
  path: ['destinationLocationId'],
})

export const submitTransferSchema = z.object({
  transferId: z.string().min(1, 'Transfer ID is required'),
})

export const approveTransferSchema = z.object({
  transferId: z.string().min(1, 'Transfer ID is required'),
  approvalNotes: z.string().max(500).optional(),
  lineItems: z.array(z.object({
    productId: z.string(),
    approvedQuantity: z.number().int().min(0),
  })).optional(),
})

export const rejectTransferSchema = z.object({
  transferId: z.string().min(1, 'Transfer ID is required'),
  rejectionReason: z.string().min(1, 'Rejection reason is required').max(500, 'Reason must be 500 characters or less'),
})

export const dispatchTransferSchema = z.object({
  transferId: z.string().min(1, 'Transfer ID is required'),
  lineItems: z.array(z.object({
    productId: z.string(),
    dispatchedQuantity: z.number().int().min(0),
  })).min(1, 'At least one line item required'),
})

export const receiveTransferSchema = z.object({
  transferId: z.string().min(1, 'Transfer ID is required'),
  lineItems: z.array(z.object({
    productId: z.string(),
    receivedQuantity: z.number().int().min(0),
    missingQuantity: z.number().int().min(0).default(0),
    damagedQuantity: z.number().int().min(0).default(0),
    notes: z.string().max(500).optional(),
  })).min(1, 'At least one line item required'),
  receiptNotes: z.string().max(500).optional(),
})

export const cancelTransferSchema = z.object({
  transferId: z.string().min(1, 'Transfer ID is required'),
  cancellationReason: z.string().min(1, 'Cancellation reason is required').max(500, 'Reason must be 500 characters or less'),
})

export const userRegistrationSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password too long'),
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  // Required when creating a new workspace; ignored when joining via an invite link.
  organizationName: z.string().min(1).max(100, 'Name must be 100 characters or less').optional(),
  organizationSlug: z.string().min(1).max(50, 'Slug must be 50 characters or less').regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens').optional(),
  // One-time invite token from /register?invite=…
  invite: z.string().min(10).max(300).optional(),
})

export const userLoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const membershipUpdateSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  role: z.enum(['admin', 'inventory_manager', 'approver', 'warehouse_staff']),
  locationPermissions: z.array(z.string()).optional(),
})

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export const filterSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  locationId: z.string().optional(),
  productId: z.string().optional(),
  category: z.string().optional(),
  type: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
})

export type OrganizationInput = z.infer<typeof organizationSchema>
export type LocationInput = z.infer<typeof locationSchema>
export type ProductInput = z.infer<typeof productSchema>
export type InventoryAdjustmentInput = z.infer<typeof inventoryAdjustmentSchema>
export type TransferLineItemInput = z.infer<typeof transferLineItemSchema>
export type CreateTransferInput = z.infer<typeof createTransferSchema>
export type SubmitTransferInput = z.infer<typeof submitTransferSchema>
export type ApproveTransferInput = z.infer<typeof approveTransferSchema>
export type RejectTransferInput = z.infer<typeof rejectTransferSchema>
export type DispatchTransferInput = z.infer<typeof dispatchTransferSchema>
export type ReceiveTransferInput = z.infer<typeof receiveTransferSchema>
export type CancelTransferInput = z.infer<typeof cancelTransferSchema>
export type UserRegistrationInput = z.infer<typeof userRegistrationSchema>
export type UserLoginInput = z.infer<typeof userLoginSchema>
export type MembershipUpdateInput = z.infer<typeof membershipUpdateSchema>
export type PaginationInput = z.infer<typeof paginationSchema>
export type FilterInput = z.infer<typeof filterSchema>