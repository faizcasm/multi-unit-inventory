import { z } from 'zod'
import { productSchema, locationSchema } from './schemas'

/**
 * Catalog extensions (suppliers + product/location catalog fields).
 * The shared `schemas.ts` module stays untouched — routes that need the
 * extended fields import from here instead.
 */

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export const supplierCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or less'),
  contactName: z.string().trim().max(120).optional(),
  contactEmail: z.string().trim().email('Invalid email address').max(255).optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  website: z.string().trim().max(255).optional().or(z.literal('')),
  address: z.string().trim().max(300).optional().or(z.literal('')),
  leadTimeDays: z.coerce.number().int().min(0, 'Lead time must be 0 or more').max(365, 'Lead time must be 365 or less').default(3),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
  isActive: z.boolean().optional(),
})

export const supplierUpdateSchema = supplierCreateSchema.partial()

export type SupplierCreateInput = z.infer<typeof supplierCreateSchema>
export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>

// ---------------------------------------------------------------------------
// Products — shared contract: optional `supplier` ref + `unitCost`
// ---------------------------------------------------------------------------

export const productCreateSchema = productSchema.extend({
  // Validated against the Supplier collection (same org) in the route.
  supplier: z.string().nullable().optional(),
  unitCost: z.number().min(0, 'Unit cost must be 0 or more').optional(),
})

export const productUpdateSchema = productCreateSchema.partial()

export type ProductCreateInput = z.infer<typeof productCreateSchema>
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>

// ---------------------------------------------------------------------------
// Locations — shared contract: optional `capacity`
// ---------------------------------------------------------------------------

export const locationCreateSchema = locationSchema.extend({
  // `null` (or an empty string) clears an existing capacity; strings coerce.
  capacity: z.preprocess(
    (value) => (value === '' ? null : value),
    z.union([z.null(), z.coerce.number().min(0, 'Capacity must be 0 or more')]).optional()
  ),
})

export const locationUpdateSchema = locationCreateSchema.partial()

export type LocationCreateInput = z.infer<typeof locationCreateSchema>
export type LocationUpdateInput = z.infer<typeof locationUpdateSchema>
