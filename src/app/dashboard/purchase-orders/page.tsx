'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useCan } from '@/hooks/useCan'
import { AlertCircle, ArrowRight, PackageCheck, Plus, Search, ShieldAlert, ShoppingCart, Truck, Wallet } from 'lucide-react'
import { PageHeading, Metric, EmptyState, Toast } from '@/components/redesign/ui'
import { Pagination, CsvExportButton } from '@/components/redesign/TableBits'
import { apiFetch, ApiPagination } from '@/lib/api'
import { formatCurrency } from '@/lib/utils/helpers'

interface PurchaseOrderRow {
  _id: string
  reference: string
  status: string
  supplier: { _id?: string; name: string; leadTimeDays?: number } | null
  destinationLocation: { _id?: string; name: string; code: string } | null
  createdBy?: { name?: string; email?: string } | null
  totalLines: number
  totalOrdered: number
  totalReceived: number
  createdAt: string
}

interface POSummary {
  open: number
  awaiting: number
  received: number
  totalValue: number
}

type Tab = 'All' | 'Draft' | 'Sent' | 'Awaiting' | 'Received' | 'Cancelled'

const TABS: { label: Tab; status: string }[] = [
  { label: 'All', status: '' },
  { label: 'Draft', status: 'DRAFT' },
  { label: 'Sent', status: 'SENT' },
  { label: 'Awaiting', status: 'PARTIALLY_RECEIVED' },
  { label: 'Received', status: 'RECEIVED' },
  { label: 'Cancelled', status: 'CANCELLED' },
]

const PAGE_SIZE = 20

/** Maps PO statuses onto the existing redesign status-chip classes. */
const CHIP_CLASS: Record<string, string> = {
  DRAFT: 'status-draft',
  SENT: 'status-in-transit',
  PARTIALLY_RECEIVED: 'status-pending',
  RECEIVED: 'status-received',
  CANCELLED: 'status-cancelled',
}

function PurchaseOrderStatus({ value }: { value: string }) {
  const label = value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
  return (
    <span className={`status ${CHIP_CLASS[value] || ''}`}>
      <i />
      {label}
    </span>
  )
}

/** Small received/ordered progress bar (inline styles — no new CSS). */
function ReceiveBar({ received, ordered }: { received: number; ordered: number }) {
  const pct = ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} title={`${received} of ${ordered} units received`}>
      <span
        style={{
          display: 'block',
          width: 64,
          height: 5,
          background: '#eeeaf5',
          borderRadius: 4,
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            display: 'block',
            height: '100%',
            width: `${pct}%`,
            background: pct >= 100 ? '#3a9b71' : '#7257de',
            borderRadius: 4,
          }}
        />
      </span>
      <small style={{ fontSize: 9, color: '#a09bad', whiteSpace: 'nowrap' }}>
        {received}/{ordered}
      </small>
    </div>
  )
}

export default function PurchaseOrdersPage() {
  const { status: sessionStatus } = useSession()
  const canRead = useCan('purchase_orders:read')
  const canCreate = useCan('purchase_orders:create')

  const [orders, setOrders] = useState<PurchaseOrderRow[]>([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('All')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<ApiPagination>({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 })
  const [summary, setSummary] = useState<POSummary>({ open: 0, awaiting: 0, received: 0, totalValue: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3500)
  }

  const statusParam = TABS.find((t) => t.label === tab)?.status || ''

  /** Query string for the current tab + search filter. */
  const buildQuery = (includePaging = true) => {
    const params = new URLSearchParams()
    if (includePaging) {
      params.set('page', String(page))
      params.set('limit', String(PAGE_SIZE))
    }
    if (statusParam) params.set('status', statusParam)
    if (search) params.set('search', search)
    return params.toString()
  }

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const res = await apiFetch<PurchaseOrderRow[]>(`/api/purchase-orders?${buildQuery()}`)
      if (!res.success) throw new Error(res.error || 'Failed to fetch purchase orders')
      const rows = res.data || []
      setOrders(rows)
      const pg = res.pagination
      setPagination(pg || { page, limit: PAGE_SIZE, total: rows.length, totalPages: 1 })
      // If the data shrank and we're past the end, jump to the last page.
      if (pg && pg.totalPages > 0 && pg.page > pg.totalPages) {
        setPage(pg.totalPages)
      }
      const s = (res as any).summary as POSummary | undefined
      if (s) setSummary(s)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load purchase orders')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (sessionStatus === 'loading' || !canRead) return
    // Debounce so typing in search doesn't fire a request per keystroke.
    const timer = window.setTimeout(fetchOrders, search ? 300 : 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, canRead, tab, page, search])

  if (sessionStatus === 'loading') {
    return <div className="empty-state" style={{ minHeight: 260 }}>Loading purchase orders…</div>
  }

  if (!canRead) {
    return (
      <>
        <PageHeading
          eyebrow="PERMISSION REQUIRED"
          title="Purchase orders"
          subtitle="Purchase order access is limited by your role."
        />
        <div
          className="panel"
          style={{ padding: 28, display: 'grid', gap: 11, justifyItems: 'center', textAlign: 'center' }}
        >
          <ShieldAlert size={26} style={{ color: '#d5556a' }} />
          <b style={{ fontSize: 13 }}>Your role can&apos;t view purchase orders</b>
          <p style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 400, lineHeight: 1.7, margin: 0 }}>
            Ask a workspace admin for purchase order permissions if you need to order stock.
            You can still browse inventory in the meantime.
          </p>
          <Link href="/dashboard/inventory" className="button button-secondary">
            Back to inventory
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeading
        eyebrow="PROCUREMENT"
        title="Purchase orders"
        subtitle="Order stock from suppliers and receive it into a location."
        action={
          <>
            <CsvExportButton
              path={`/api/purchase-orders?${buildQuery(false)}`}
              filename="purchase-orders"
              noun="purchase orders"
              columns={[
                { key: 'reference', header: 'Reference' },
                { key: 'status', header: 'Status' },
                { key: 'supplier', header: 'Supplier' },
                { key: 'destination', header: 'Destination' },
                { key: 'lines', header: 'Lines' },
                { key: 'ordered', header: 'Units ordered' },
                { key: 'received', header: 'Units received' },
                { key: 'createdBy', header: 'Created by' },
                { key: 'created', header: 'Created' },
              ]}
              mapRow={(row) => ({
                reference: row.reference,
                status: row.status.replaceAll('_', ' '),
                supplier: row.supplier?.name || '',
                destination: row.destinationLocation?.name || '',
                lines: row.totalLines ?? row.lines?.length ?? 0,
                ordered: row.totalOrdered ?? 0,
                received: row.totalReceived ?? 0,
                createdBy: row.createdBy?.name || '',
                created: row.createdAt ? new Date(row.createdAt).toISOString() : '',
              })}
            />
            {canCreate && (
              <Link href="/dashboard/purchase-orders/new" className="button button-primary">
                <Plus size={16} /> New purchase order
              </Link>
            )}
          </>
        }
      />

      <div className="metric-grid compact-metrics">
        <Metric label="Open orders" value={summary.open} icon={ShoppingCart} detail="draft or sent" />
        <Metric label="Awaiting receipt" value={summary.awaiting} icon={Truck} tone="orange" detail="partially received" />
        <Metric label="Received" value={summary.received} icon={PackageCheck} tone="mint" detail="fully received" />
        <Metric
          label="Total PO value"
          value={formatCurrency(summary.totalValue)}
          icon={Wallet}
          tone="blue"
          detail="ordered quantity × unit cost"
        />
      </div>

      <section className="panel table-panel">
        <div className="inventory-toolbar">
          <div className="table-tabs">
            {TABS.map((t) => (
              <button
                key={t.label}
                className={tab === t.label ? 'selected' : ''}
                onClick={() => {
                  setTab(t.label)
                  setPage(1)
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="table-tools">
            <label className="table-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Search reference or supplier"
                aria-label="Search purchase orders"
              />
            </label>
          </div>
        </div>

        {error && (
          <div className="data-disclaimer" style={{ padding: '0 20px' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <div className="table-scroll">
          {loading ? (
            <div className="empty-state">Loading purchase orders…</div>
          ) : orders.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="No purchase orders in this view"
              hint={canCreate ? 'Create a purchase order to restock from a supplier.' : 'Nothing has been ordered yet.'}
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Supplier</th>
                  <th>Destination</th>
                  <th>Lines</th>
                  <th>Received / ordered</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((po) => (
                  <tr key={po._id}>
                    <td>
                      <b className="transfer-id">{po.reference}</b>
                    </td>
                    <td>
                      <span className="table-location">{po.supplier?.name || 'Unknown supplier'}</span>
                    </td>
                    <td>
                      <span className="table-location">
                        {po.destinationLocation?.name || '—'}
                        {po.destinationLocation?.code ? (
                          <small style={{ fontSize: 9, color: '#aaa5b5' }}> {po.destinationLocation.code}</small>
                        ) : null}
                      </span>
                    </td>
                    <td className="value-cell">{po.totalLines ?? 0}</td>
                    <td>
                      <ReceiveBar received={po.totalReceived ?? 0} ordered={po.totalOrdered ?? 0} />
                    </td>
                    <td>
                      <PurchaseOrderStatus value={po.status} />
                    </td>
                    <td>
                      {new Date(po.createdAt).toLocaleDateString()}
                      <small style={{ display: 'block', fontSize: 9, color: '#a29dae' }}>
                        {po.createdBy?.name || ''}
                      </small>
                    </td>
                    <td>
                      <Link href={`/dashboard/purchase-orders/${po._id}`} className="subtle-link">
                        View <ArrowRight size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {!loading && orders.length > 0 && (
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPage={setPage}
            noun="purchase orders"
            hint="Newest first"
          />
        )}
      </section>

      <Toast message={toast} onClose={() => setToast('')} />
    </>
  )
}
export const dynamic = 'force-dynamic'
