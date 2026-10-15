'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Truck, Search, Plus, ArrowRight, CalendarDays, AlertCircle } from 'lucide-react'
import { PageHeading, Metric, Status, EmptyState } from '@/components/redesign/ui'

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

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('All')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const statusParam =
    tab === 'Needs review' ? 'PENDING_APPROVAL' : tab === 'Completed' ? 'COMPLETED' : ''

  const fetchTransfers = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusParam) params.set('status', statusParam)

      const response = await fetch(`/api/transfers?${params.toString()}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to fetch transfers')
      let rows: Transfer[] = data.data || []
      if (tab === 'In progress') rows = rows.filter((t) => inProgress.includes(t.status))
      setTransfers(rows)
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
  }, [tab])

  const filtered = transfers.filter(
    (t) =>
      !search ||
      t.reference.toLowerCase().includes(search.toLowerCase()) ||
      t.sourceLocation?.name?.toLowerCase().includes(search.toLowerCase()) ||
      t.destinationLocation?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const totalUnits = (t: Transfer) =>
    t.lineItems?.reduce((sum, li) => sum + (li.requestedQuantity || 0), 0) ?? 0

  const counts = {
    all: transfers.length,
    progress: transfers.filter((t) => inProgress.includes(t.status)).length,
    completed: transfers.filter((t) => t.status === 'COMPLETED').length,
    review: transfers.filter((t) => t.status === 'PENDING_APPROVAL').length,
  }

  return (
    <>
      <PageHeading
        eyebrow="STOCK MOVEMENT"
        title="Transfers"
        subtitle="Track every stock movement from request to receipt."
        action={
          <Link href="/dashboard/transfers/new" className="button button-primary">
            <Plus size={16} /> New transfer
          </Link>
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
              <button key={t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>
          <div className="table-tools">
            <label className="table-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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
          <div className="table-footer">
            <span>
              Showing <b>{filtered.length}</b> transfers
            </span>
            <span>Newest first</span>
          </div>
        )}
      </section>
    </>
  )
}
export const dynamic = 'force-dynamic'
