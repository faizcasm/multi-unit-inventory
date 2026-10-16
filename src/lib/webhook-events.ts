/**
 * Webhook event catalogue — client-safe (no mongoose/model imports) so the
 * integrations dashboard can render labels without pulling the server bundle
 * into the browser. The Webhook model re-exports these for API-side use.
 */
export const WEBHOOK_EVENTS = [
  { value: 'transfer.created', label: 'Transfer created' },
  { value: 'transfer.submitted', label: 'Transfer submitted' },
  { value: 'transfer.approved', label: 'Transfer approved' },
  { value: 'transfer.rejected', label: 'Transfer rejected' },
  { value: 'transfer.dispatched', label: 'Transfer dispatched' },
  { value: 'transfer.received', label: 'Transfer received' },
  { value: 'transfer.cancelled', label: 'Transfer cancelled' },
  { value: 'product.created', label: 'Product created' },
  { value: 'product.updated', label: 'Product updated' },
  { value: 'inventory.adjusted', label: 'Inventory adjusted' },
  { value: 'webhook.test', label: 'Webhook test' },
] as const

export const WEBHOOK_EVENT_VALUES: string[] = WEBHOOK_EVENTS.map((e) => e.value)

export const WEBHOOK_EVENT_LABELS: Record<string, string> = Object.fromEntries(
  WEBHOOK_EVENTS.map((e) => [e.value, e.label])
)
