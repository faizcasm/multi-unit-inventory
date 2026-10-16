/**
 * Dashboard widget catalog + preference helpers.
 *
 * The greeting/hero on the dashboard is intentionally NOT a widget — it is
 * always visible. Every entry here must map to a renderable section in
 * `src/app/dashboard/page.tsx`.
 */

export interface WidgetPref {
  id: string
  visible: boolean
  order: number
}

export interface WidgetDef {
  id: string
  label: string
  /** Full-width sections span the whole dashboard grid; others share a row. */
  fullWidth: boolean
}

export const WIDGET_CATALOG: WidgetDef[] = [
  { id: 'metrics', label: 'Key metrics', fullWidth: true },
  { id: 'transfer-volume', label: 'Transfer volume', fullWidth: true },
  { id: 'inventory-by-location', label: 'Inventory by location', fullWidth: true },
  { id: 'low-stock', label: 'Low stock', fullWidth: false },
  { id: 'movement-activity', label: 'Movement activity', fullWidth: false },
  { id: 'recent-transfers', label: 'Recent transfers', fullWidth: false },
]

export const CATALOG_IDS = WIDGET_CATALOG.map((w) => w.id)

/** Fresh default layout: every widget visible, catalog order. */
export function defaultWidgets(): WidgetPref[] {
  return WIDGET_CATALOG.map((w, i) => ({ id: w.id, visible: true, order: i }))
}

export function widgetLabel(id: string): string {
  return WIDGET_CATALOG.find((w) => w.id === id)?.label || id
}

export function isFullWidthWidget(id: string): boolean {
  return WIDGET_CATALOG.find((w) => w.id === id)?.fullWidth ?? false
}

/**
 * Merge saved preferences with the catalog. Unknown ids are ignored,
 * duplicate ids keep their first occurrence, catalog widgets missing from the
 * saved list are appended after the highest saved order (visible by default),
 * and the result is sorted by order.
 */
export function mergeWidgets(saved?: WidgetPref[] | null): WidgetPref[] {
  const merged: WidgetPref[] = []
  const seen = new Set<string>()

  for (const item of saved ?? []) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      typeof item.visible !== 'boolean' ||
      typeof item.order !== 'number' ||
      !CATALOG_IDS.includes(item.id) ||
      seen.has(item.id)
    ) {
      continue
    }
    seen.add(item.id)
    merged.push({ id: item.id, visible: item.visible, order: item.order })
  }

  let nextOrder = merged.reduce((max, w) => Math.max(max, w.order), -1) + 1
  for (const def of WIDGET_CATALOG) {
    if (!seen.has(def.id)) {
      merged.push({ id: def.id, visible: true, order: nextOrder++ })
    }
  }

  return merged.sort((a, b) => a.order - b.order)
}
