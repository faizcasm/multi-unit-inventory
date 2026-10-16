'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowRight, CheckCircle2, Package, RefreshCw, Search, ShieldAlert } from 'lucide-react'
import { PageHeading, Metric, Status, EmptyState, Toast } from '@/components/redesign/ui'
import { apiFetch } from '@/lib/api'
import { useCan, useRole } from '@/hooks/useCan'
import { hasPermission } from '@/lib/permissions/matrix'
import { formatCurrency } from '@/lib/utils/helpers'

interface ReplenishmentItem {
  productId: string
  name: string
  sku: string
  unitOfMeasure: string
  category: string
  available: number
  threshold: number
  reorderQuantity: number
  velocity30d?: number
  velocity7d?: number
  velocity90d?: number
  coverageDays: number | null
  stockoutDate: string | null
  suggestedQty: number
  status: 'below_threshold' | 'at_risk' | 'ok'
  supplier: { name: string } | null
  totalValueOfSuggested: number
}

interface Totals {
  below: number
  atRisk: number
  ok: number
  totalSuggestedQty: number
  totalSuggestedValue: number
}

type StatusTab = 'all' | 'below_threshold' | 'at_risk' | 'ok'

const DAY_OPTIONS = [7, 30, 90]

const TABS: { value: StatusTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'below_threshold', label: 'Below' },
  { value: 'at_risk', label: 'At risk' },
  { value: 'ok', label: 'OK' },
]

/** Maps API status to the closest existing redesign chip classes. */
const statusChip = (item: ReplenishmentItem) => {
  if (item.status === 'below_threshold') return item.available === 0 ? 'Out of stock' : 'Low stock'
  if (item.status === 'at_risk') return 'Needs attention'
  return 'Healthy'
}

export default function ReplenishmentPage() {
  const [days, setDays] = useState(30)
  const [tab, setTab] = useState<StatusTab>('all')
  const [items, setItems] = useState<ReplenishmentItem[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const canRead = useCan('inventory:read')
  const canOrder = useCan('purchase_orders:create')
  const role = useRole()
  // Once the session has loaded, a role without inventory:read gets the fallback.
  const denied = role !== undefined && !hasPermission(role, 'inventory:read')

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3200)
  }

  const fetchSuggestions = useCallback(
    async (manual = false) => {
      setLoading(true)
      try {
        const res = await apiFetch<{ items: ReplenishmentItem[]; totals: Totals }>(`/api/replenishment?days=${days}`)
        if (!res.success) {
          if (res.error === 'Forbidden') {
            setError('You do not have permission to view replenishment suggestions.')
            return
          }
          throw new Error(res.error || 'Failed to load suggestions')
        }
        const nextItems = res.data?.items || []
        setItems(nextItems)
        setTotals(res.data?.totals || null)
        setError('')
        if (manual) notify(`Suggestions refreshed — ${nextItems.length} products`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load suggestions')
      } finally {
        setLoading(false)
      }
    },
    [days]
  )

  useEffect(() => {
    if (canRead) fetchSuggestions()
    else setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, days])

  const velocityOf = (item: ReplenishmentItem) =>
    (days === 7 ? item.velocity7d : days === 90 ? item.velocity90d : item.velocity30d) ?? 0

  const filtered = tab === 'all' ? items : items.filter((item) => item.status === tab)

  const orderHref = (item: ReplenishmentItem) =>
    `/dashboard/purchase-orders/new?productId=${item.productId}&quantity=${item.suggestedQty}`

  if (denied) {
    return (
      <>
        <PageHeading
          eyebrow="REPLENISHMENT"
          title="Replenishment"
          subtitle="Suggested orders based on stock levels and recent demand."
        />
        <section className="panel" style={{ padding: 24 }}>
          <EmptyState
            icon={ShieldAlert}
            title="You don't have permission to view this page"
            hint="Ask your administrator for the inventory:read permission."
          />
        </section>
      </>
    )
  }

  return (
    <>
      <PageHeading
        eyebrow="REPLENISHMENT"
        title="Replenishment"
        subtitle="Suggested orders based on stock levels and recent demand."
        action={
          <>
            <select
              className="filter-button"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              aria-label="Velocity window (days)"
              style={{ height: 36 }}
            >
              {DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  Last {d} days
                </option>
              ))}
            </select>
            <button className="button button-secondary" onClick={() => fetchSuggestions(true)} disabled={loading}>
              <RefreshCw size={15} /> Refresh
            </button>
          </>
        }
      />

      <div className="metric-grid">
        <Metric
          label="Below threshold"
          value={loading ? '—' : totals?.below ?? 0}
          icon={AlertCircle}
          tone="orange"
          detail="products at or under reorder point"
        />
        <Metric
          label="At risk"
          value={loading ? '—' : totals?.atRisk ?? 0}
          icon={Search}
          tone="blue"
          detail="≤ 14 days of stock cover"
        />
        <Metric
          label="Suggested order value"
          value={loading ? '—' : formatCurrency(totals?.totalSuggestedValue ?? 0)}
          icon={Package}
          tone="purple"
          detail={`${totals?.totalSuggestedQty ?? 0} units suggested`}
        />
      </div>

      <section className="panel table-panel inventory-table-panel">
        <div className="inventory-toolbar">
          <div className="table-tabs">
            {TABS.map((t) => (
              <button key={t.value} className={tab === t.value ? 'selected' : ''} onClick={() => setTab(t.value)}>
                {t.label}
                {tab === t.value && (
                  <span className="tab-count">
                    {t.value === 'all' ? items.length : items.filter((i) => i.status === t.value).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="data-disclaimer" style={{ padding: '0 20px' }}>
            <AlertCircle size={14} /> {error}{' '}
            <button className="subtle-link" onClick={() => fetchSuggestions(true)}>
              Retry
            </button>
          </div>
        )}

        <div className="table-scroll">
          {loading ? (
            <div className="empty-state">Calculating suggestions…</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title={items.length === 0 ? 'All stocked up' : 'Nothing in this view'}
              hint={
                items.length === 0
                  ? 'No products need replenishment right now.'
                  : `No products match the "${TABS.find((t) => t.value === tab)?.label}" filter.`
              }
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Available</th>
                  <th>Reorder at</th>
                  <th>Velocity</th>
                  <th>Coverage</th>
                  <th>Stockout est.</th>
                  <th>Suggested qty</th>
                  <th>Supplier</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.productId}>
                    <td>
                      <Link
                        href={`/dashboard/products/${item.productId}`}
                        className="product-cell"
                        style={{ color: 'inherit', textDecoration: 'none' }}
                        title={`Open ${item.name}`}
                      >
                        <span className="product-thumbnail">
                          <Package size={17} />
                        </span>
                        <span>
                          <b>{item.name}</b>
                          <small>{item.sku}</small>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <b className="stock-number">{item.available}</b>
                      <small className="stock-reorder"> {item.unitOfMeasure}</small>
                    </td>
                    <td className="value-cell">{item.threshold}</td>
                    <td>
                      <b className="stock-number">{velocityOf(item).toFixed(2)}</b>
                      <small className="stock-reorder"> /d</small>
                    </td>
                    <td>
                      <Status value={statusChip(item)} />
                    </td>
                    <td>{item.stockoutDate ? new Date(item.stockoutDate).toLocaleDateString() : '—'}</td>
                    <td>
                      <b className="stock-number">{item.suggestedQty}</b>
                      <small className="stock-reorder"> {item.unitOfMeasure}</small>
                    </td>
                    <td>{item.supplier?.name || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        {canOrder && (
                          <Link
                            href={orderHref(item)}
                            className="button button-primary button-small"
                            title={`Create purchase order for ${item.suggestedQty} × ${item.name}`}
                          >
                            Order
                          </Link>
                        )}
                        <Link href={`/dashboard/products/${item.productId}`} className="subtle-link">
                          View product <ArrowRight size={13} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!loading && filtered.length > 0 && (
          <div className="table-footer">
            <span>
              Showing <b>{filtered.length}</b> of {items.length} products ({days}-day velocity window)
            </span>
            <span>Suggested orders link straight into purchase orders</span>
          </div>
        )}
      </section>

      <Toast message={toast} onClose={() => setToast('')} />
    </>
  )
}
export const dynamic = 'force-dynamic'
