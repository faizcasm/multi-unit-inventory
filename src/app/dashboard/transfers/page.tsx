'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Truck, Search, Plus, ArrowRight, CalendarDays, AlertCircle } from 'lucide-react'
import { PageHeading, Metric, Status, EmptyState } from '@/components/redesign/ui'
import { Pagination, CsvExportButton } from '@/components/redesign/TableBits'
import { apiFetch, ApiPagination } from '@/lib/api'
import { useCan } from '@/hooks/useCan'

interface Transfer {
  _id: string
  reference: string
  sourceLocation: { name: string; code: string }
  destinationLocation: { name: string; code: string }
  status: string
  requester: { name: string }
  lineItems: { product: { name: string; sku: string }; requestedQuantity: number }[]
  createdAt: string
  updatedAt: string
}

type Tab = 'All' | 'In progress' | 'Completed' | 'Needs review'

const inProgress = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_TRANSIT']

const PAGE_SIZE = 20

/** Human-readable status label for exports. */
const statusLabel = (status: string) =>
  status
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('All')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<ApiPagination>({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 })
  const [counts, setCounts] = useState({ all: 0, progress: 0, completed: 0, review: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const canCreate = useCan('transfers:create')

  // The API only accepts a single status, so "In progress" (a group of
  // statuses) stays a client-side filter over the fetched page.
  const statusParam =
    tab === 'Needs review' ? 'PENDING_APPROVAL' : tab === 'Completed' ? 'COMPLETED' : ''

  /** Query string for the current tab filter. */
  const buildQuery = () => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(PAGE_SIZE))
    if (statusParam) params.set('status', statusParam)
    return params.toString()
  }

  // Metric-card counts, fetched once with tiny (limit=1) requests.
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [all, completed, review, rejected, cancelled] = await Promise.all([
          apiFetch('/api/transfers?limit=1'),
          apiFetch('/api/transfers?status=COMPLETED&limit=1'),
          apiFetch('/api/transfers?status=PENDING_APPROVAL&limit=1'),
          apiFetch('/api/transfers?status=REJECTED&limit=1'),
          apiFetch('/api/transfers?status=CANCELLED&limit=1'),
        ])
        const total = all.pagination?.total ?? 0
        const done = completed.pagination?.total ?? 0
        const rev = review.pagination?.total ?? 0
        const rej = rejected.pagination?.total ?? 0
        const canc = cancelled.pagination?.total ?? 0
        setCounts({
          all: total,
          // In progress = everything that is not completed/rejected/cancelled.
          progress: Math.max(total - done - rev - rej - canc, 0),
          completed: done,
          review: rev,
        })
      } catch {}
    }
    fetchCounts()
  }, [])

  const fetchTransfers = async () => {
    setLoading(true)
    try {
      const res = await apiFetch<Transfer[]>(`/api/transfers?${buildQuery()}`)
      if (!res.success) throw new Error(res.error || 'Failed to fetch transfers')
      let rows: Transfer[] = res.data || []
      if (tab === 'In progress') rows = rows.filter((t) => inProgress.includes(t.status))
      setTransfers(rows)
      const pg = res.pagination
      setPagination(pg || { page, limit: PAGE_SIZE, total: rows.length, totalPages: 1 })
      // If the data shrank and we're past the end, jump to the last page.
      if (pg && pg.totalPages > 0 && pg.page > pg.totalPages) {
        setPage(pg.totalPages)
      }
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transfers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTransfers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page])

  const filtered = transfers.filter(
    (t) =>
      !search ||
      t.reference.toLowerCase().includes(search.toLowerCase()) ||
      t.sourceLocation?.name?.toLowerCase().includes(search.toLowerCase()) ||
      t.destinationLocation?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const totalUnits = (t: Transfer) =>
    t.lineItems?.reduce((sum, li) => sum + (li.requestedQuantity || 0), 0) ?? 0

  return (
    <>
      <PageHeading
        eyebrow="STOCK MOVEMENT"
        title="Transfers"
        subtitle="Track every stock movement from request to receipt."
        action={
          <>
            <CsvExportButton
              path={`/api/transfers?${statusParam ? `status=${statusParam}` : ''}`}
              filename="transfers"
              noun="transfers"
              columns={[
                { key: 'reference', header: 'Reference' },
                { key: 'status', header: 'Status' },
                { key: 'source', header: 'Source' },
                { key: 'destination', header: 'Destination' },
                { key: 'items', header: 'Items' },
                { key: 'requester', header: 'Requester' },
                { key: 'created', header: 'Created' },
              ]}
              mapRow={(row) => ({
                reference: row.reference,
                status: statusLabel(row.status),
                source: row.sourceLocation?.name || '',
                destination: row.destinationLocation?.name || '',
                items: row.lineItems?.length ?? 0,
                requester: row.requester?.name || '',
                created: row.createdAt ? new Date(row.createdAt).toISOString() : '',
              })}
            />
            {canCreate && (
              <Link href="/dashboard/transfers/new" className="button button-primary">
                <Plus size={16} /> New transfer
              </Link>
            )}
          </>
        }
      />

      <div className="metric-grid compact-metrics">
        <Metric label="Total transfers" value={counts.all} icon={Truck} detail="in this workspace" />
        <Metric label="In progress" value={counts.progress} icon={ArrowRight} tone="blue" detail="awaiting receipt or action" />
        <Metric label="Needs approval" value={counts.review} icon={CalendarDays} tone="orange" detail="waiting for review" />
        <Metric label="Completed" value={counts.completed} icon={Truck} tone="mint" detail="fully received" />
      </div>

      <section className="panel table-panel">
        <div className="inventory-toolbar">
          <div className="table-tabs">
            {(['All', 'In progress', 'Completed', 'Needs review'] as Tab[]).map((t) => (
              <button
                key={t}
                className={tab === t ? 'selected' : ''}
                onClick={() => {
                  setTab(t)
                  setPage(1)
                }}
              >
                {t}
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
                placeholder="Search reference or location"
                aria-label="Search transfers"
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
            <div className="empty-state">Loading transfers…</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No transfers in this view"
              hint="Create your first transfer to get started."
            />
          ) : (
            <table className="data-table transfer-data-table">
              <thead>
                <tr>
                  <th>Transfer ID</th>
                  <th>Route</th>
                  <th>Items / Qty</th>
                  <th>Requested by</th>
                  <th>Updated</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((transfer) => (
                  <tr key={transfer._id}>
                    <td>
                      <b className="transfer-id">{transfer.reference}</b>
                    </td>
                    <td>
                      <div className="route-cell">
                        <span>{transfer.sourceLocation?.name}</span>
                        <ArrowRight size={13} />
                        <span>{transfer.destinationLocation?.name}</span>
                      </div>
                    </td>
                    <td>
                      <b>{transfer.lineItems?.length ?? 0} items</b>
                      <small className="stock-reorder"> {totalUnits(transfer)} units</small>
                    </td>
                    <td>
                      <span className="person-cell">
                        <span className="person-dot">
                          {(transfer.requester?.name || '?')
                            .split(' ')
                            .map((s) => s[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                        {transfer.requester?.name || 'Unknown'}
                      </span>
                    </td>
                    <td>{new Date(transfer.updatedAt || transfer.createdAt).toLocaleDateString()}</td>
                    <td>
                      <Status value={transfer.status} />
                    </td>
                    <td>
                      <Link href={`/dashboard/transfers/${transfer._id}`} className="subtle-link">
                        Open <ArrowRight size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {!loading && filtered.length > 0 && (
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPage={setPage}
            noun="transfers"
            hint="Newest first"
          />
        )}
      </section>
    </>
  )
}
export const dynamic = 'force-dynamic'
