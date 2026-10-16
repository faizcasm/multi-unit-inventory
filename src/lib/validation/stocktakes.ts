import { z } from 'zod'

export const createStocktakeSchema = z.object({
  locationId: z.string().min(1, 'Location is required'),
  notes: z.string().max(1000).optional(),
})

export const countStocktakeSchema = z.object({
  stocktakeId: z.string().min(1, 'Stocktake ID is required'),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1, 'Product is required'),
        countedQuantity: z
          .number()
          .int('Counted quantity must be a whole number')
          .min(0, 'Counted quantity cannot be negative')
          .max(1_000_000, 'Counted quantity is too large'),
        notes: z.string().max(500).optional(),
      })
    )
    .min(1, 'At least one counted line is required'),
})

export const stocktakeActionSchema = z.object({
  stocktakeId: z.string().min(1, 'Stocktake ID is required'),
})

export const updateStocktakeSchema = z.object({
  notes: z.string().max(1000).optional(),
})

/** Inventory reservation / release (available ⇄ reserved buckets). */
export const reserveStockSchema = z.object({
  inventoryId: z.string().min(1, 'Inventory ID is required'),
  quantity: z
    .number()
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .max(1_000_000, 'Quantity is too large'),
})

export type CreateStocktakeInput = z.infer<typeof createStocktakeSchema>
export type CountStocktakeInput = z.infer<typeof countStocktakeSchema>
export type StocktakeActionInput = z.infer<typeof stocktakeActionSchema>
export type UpdateStocktakeInput = z.infer<typeof updateStocktakeSchema>
export type ReserveStockInput = z.infer<typeof reserveStockSchema>
