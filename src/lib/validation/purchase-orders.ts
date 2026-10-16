import { z } from 'zod'

const purchaseOrderLineSchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  requestedQuantity: z
    .number()
    .int('Requested quantity must be a whole number')
    .min(1, 'Requested quantity must be at least 1')
    .max(1_000_000, 'Requested quantity is too large'),
  unitCost: z.number().min(0, 'Unit cost cannot be negative').optional(),
})

/** Create — supplier and destination are mandatory, at least one line. */
export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1, 'Supplier is required'),
  destinationLocationId: z.string().min(1, 'Destination location is required'),
  notes: z.string().max(1000).optional(),
  lines: z.array(purchaseOrderLineSchema).min(1, 'At least one line is required'),
})

/** Update — DRAFT only. Everything optional, but `lines` (when present) needs ≥1 entry. */
export const updatePurchaseOrderSchema = z.object({
  supplierId: z.string().min(1, 'Supplier is required').optional(),
  destinationLocationId: z.string().min(1, 'Destination location is required').optional(),
  notes: z.string().max(1000).optional(),
  lines: z.array(purchaseOrderLineSchema).min(1, 'At least one line is required').optional(),
})

/** Receive stock — duplicate product entries are merged by the route. */
export const receivePurchaseOrderSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.string().min(1, 'Product is required'),
        receivedQuantity: z
          .number()
          .int('Received quantity must be a whole number')
          .min(1, 'Received quantity must be at least 1')
          .max(1_000_000, 'Received quantity is too large'),
      })
    )
    .min(1, 'At least one received line is required'),
})

export const cancelPurchaseOrderSchema = z.object({
  reason: z.string().max(500).optional(),
})

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>
export type ReceivePurchaseOrderInput = z.infer<typeof receivePurchaseOrderSchema>
export type CancelPurchaseOrderInput = z.infer<typeof cancelPurchaseOrderSchema>
