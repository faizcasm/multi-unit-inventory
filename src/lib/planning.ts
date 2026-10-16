/**
 * Shared replenishment / demand-forecast math.
 *
 * Both the /api/replenishment route and the `forecast` report case build their
 * numbers from these helpers so the two features never drift apart.
 *
 * Movement sign conventions (verified against the write paths):
 * - DISPATCH  → the transfer dispatch route stores a POSITIVE quantity for
 *               units leaving available stock (`availableQuantity -= dispatched`,
 *               `movementType: 'DISPATCH', quantity: dispatched`). Always outbound.
 * - ADJUSTMENT → the inventory adjust route stores the SIGNED delta
 *               (`quantity: adjustmentQuantity`, negative reduces available).
 *               Deliberately EXCLUDED from velocity: adjustments are stock
 *               corrections/count fixes, not customer demand — counting them
 *               would inflate or deflate the demand signal with one-off events.
 * - DAMAGED / DISCREPANCY → shrinkage and count mismatches. EXCLUDED: they
 *               remove units but represent loss, not demand to plan against.
 * - RECEIPT / RESERVATION / RELEASE_RESERVATION → inbound or internal moves.
 * - RETURN    → no route currently writes these; if one ever does with a
 *               negative quantity (units leaving saleable stock, e.g. a
 *               supplier return), count it as outbound. Positive-stored
 *               RETURNs are ignored because their sign would double-count
 *               RECEIPT-style inflows.
 *
 * Velocity is a simple average over the whole window (days with zero movement
 * count as zero) — standard for small/medium catalogs.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface MovementLike {
  movementType: string
  quantity: number
  createdAt: Date | string
}

export interface ProductLike {
  reorderThreshold: number
  reorderQuantity: number
}

/** Movement types that represent demand (units leaving saleable stock). */
const OUTBOUND_TYPES = new Set(['DISPATCH', 'RETURN'])

/**
 * Net outbound units per day over the trailing `days`-day window ending at
 * `now` (defaults to the current time; override to compute a previous window,
 * e.g. the 30 days before the current one for trend comparisons).
 * Zero-movement days count as zero (plain average over `days`).
 */
export function computeVelocity(movements: readonly MovementLike[], days: number, now: number = Date.now()): number {
  if (days <= 0) return 0
  const cutoff = now - days * MS_PER_DAY
  let outbound = 0
  for (const m of movements) {
    if (!OUTBOUND_TYPES.has(m.movementType)) continue
    const created = m.createdAt instanceof Date ? m.createdAt.getTime() : new Date(m.createdAt).getTime()
    if (created < cutoff || created >= now) continue
    // DISPATCH stores a positive magnitude → abs() is a no-op that also
    // survives a hypothetical negative-stored dispatch. RETURN only counts
    // when stored negative (outbound); see header comment.
    if (m.movementType === 'DISPATCH') outbound += Math.abs(m.quantity)
    else outbound += Math.max(-m.quantity, 0)
  }
  const rounded = outbound / days
  return Math.round(rounded * 100) / 100
}

/** Days of stock left at the current velocity; null = no recent demand. */
export function computeCoverageDays(available: number, velocity: number): number | null {
  if (velocity <= 0) return null
  return Math.round((available / velocity) * 10) / 10
}

/**
 * Suggested order quantity for one product.
 * - A configured reorderQuantity always wins (supplier/MOQ-defined pack size).
 * - Otherwise cover: up to 2× threshold, at least the threshold itself, and
 *   at least 2 weeks of demand — floored at 1 unit.
 */
export function suggestedOrderQty(product: ProductLike, available: number, velocity30: number): number {
  if (product.reorderQuantity > 0) return product.reorderQuantity
  const threshold = product.reorderThreshold
  return Math.max(threshold * 2 - available, threshold, Math.ceil(velocity30 * 14), 1)
}

/** below → at_risk (≤ 14 days of cover) → ok. threshold must be > 0 to flag below. */
export function classifyStock(
  available: number,
  threshold: number,
  coverageDays: number | null
): 'below' | 'at_risk' | 'ok' {
  if (threshold > 0 && available <= threshold) return 'below'
  if (coverageDays !== null && coverageDays <= 14) return 'at_risk'
  return 'ok'
}
