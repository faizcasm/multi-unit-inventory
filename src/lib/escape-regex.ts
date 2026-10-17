/**
 * Escape user-provided input before interpolating it into a RegExp or a
 * MongoDB `$regex` operator. Prevents regex injection / ReDoS from search
 * parameters.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
