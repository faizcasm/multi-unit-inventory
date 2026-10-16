'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useCan } from '@/hooks/useCan'
import { AlertCircle, ArrowRight, ClipboardList, Plus, ShieldAlert, Warehouse, X } from 'lucide-react'
import { PageHeading, Metric, EmptyState, Toast } from '@/components/redesign/ui'
import { Pagination } from '@/components/redesign/TableBits'
import { apiFetch, ApiPagination } from '@/lib/api'

interface Stocktake {
  _id: string
  reference: string
  status: string
  location: { _id?: string; name: string; code: string } | null
  createdBy?: { name?: string; email?: string }
  totalLines?: number
  countedLines?: number
  variances?: number
  createdAt: string
}

type Tab = 'All' | 'OPEN' | 'COUNTED' | 'POSTED' | 'VOID'

const TABS: Tab[] = ['All', 'OPEN', 'COUNTED', 'POSTED', 'VOID']

const PAGE_SIZE = 20

/** Maps stocktake statuses onto the existing redesign status-chip classes. */
const CHIP_CLASS: Record<string, string> = {
  OPEN: 'status-draft',
  COUNTED: 'status-pending',
  POSTED: 'status-completed',
  VOID: 'status-cancelled',
}

function StocktakeStatus({ value }: { value: string }) {
  const label = value.charAt(0) + value.slice(1).toLowerCase()
  return (
    <span className={`status ${CHIP_CLASS[value] || ''}`}>
      <i />
      {label}
    </span>
  )
}

export default function StocktakesPage() {
  const { status: sessionStatus } = useSession()
  const canRead = useCan('stocktakes:read')
  const canCreate = useCan('stocktakes:create')

  const [stocktakes, setStocktakes] = useState<Stocktake[]>([])
  const [tab, setTab] = useState<Tab>('All')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<ApiPagination>({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 })
  const [counts, setCounts] = useState({ all: 0, open: 0, counted: 0, posted: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  // New count modal
  const [showCreate, setShowCreate] = useState(false)
  const [locations, setLocations] = useState<{ _id: string; name: string; code: string }[]>([])
  const [locationId, setLocationId] = useState('')
  const [notes, setNotes] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3200)
  }

  const buildQuery = () => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(PAGE_SIZE))
    if (tab !== 'All') params.set('status', tab)
    return params.toString()
  }

  const fetchCounts = async () => {
    try {
      const [all, open, counted, posted] = await Promise.all([
        apiFetch('/api/stocktakes?limit=1'),
        apiFetch('/api/stocktakes?status=OPEN&limit=1'),
        apiFetch('/api/stocktakes?status=COUNTED&limit=1'),
        apiFetch('/api/stocktakes?status=POSTED&limit=1'),
      ])
      setCounts({
        all: all.pagination?.total ?? 0,
        open: open.pagination?.total ?? 0,
        counted: counted.pagination?.total ?? 0,
        posted: posted.pagination?.total ?? 0,
      })
    } catch {}
  }

  const fetchStocktakes = async () => {
    setLoading(true)
    try {
      const res = await apiFetch<Stocktake[]>(`/api/stocktakes?${buildQuery()}`)
      if (!res.success) throw new Error(res.error || 'Failed to fetch stocktakes')
      const rows = res.data || []
      setStocktakes(rows)
      const pg = res.pagination
      setPagination(pg || { page, limit: PAGE_SIZE, total: rows.length, totalPages: 1 })
      // If the data shrank and we're past the end, jump to the last page.
      if (pg && pg.totalPages > 0 && pg.page > pg.totalPages) {
        setPage(pg.totalPages)
      }
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stocktakes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (sessionStatus === 'loading' || !canRead) return
    fetchStocktakes()
    fetchCounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, canRead, tab, page])

  useEffect(() => {
    if (!showCreate) return
    ;(async () => {
      try {
        const res = await fetch('/api/locations')
        const data = await res.json()
        if (res.ok) setLocations(data.data || [])
      } catch {}
    })()
  }, [showCreate])

  const createStocktake = async (e: FormEvent) => {
    e.preventDefault()
    if (!locationId) {
      setCreateError('Choose a location to count.')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      const res = await apiFetch<Stocktake>('/api/stocktakes', {
        method: 'POST',
        body: { locationId, notes: notes || undefined },
      })
      if (!res.success) throw new Error(res.error || 'Failed to create count sheet')
      setShowCreate(false)
      setNotes('')
      setLocationId('')
      notify(`Count sheet ${(res.data as any)?.reference || ''} created`)
      setPage(1)
      await Promise.all([fetchStocktakes(), fetchCounts()])
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create count sheet')
    } finally {
      setCreating(false)
    }
  }

  if (sessionStatus === 'loading') {
    return <div className="empty-state" style={{ minHeight: 260 }}>Loading stocktakes…</div>
  }

  if (!canRead) {
    return (
      <>
        <PageHeading
          eyebrow="PERMISSION REQUIRED"
          title="Cycle counts"
          subtitle="Stocktake access is limited by your role."
        />
        <div
          className="panel"
          style={{ padding: 28, display: 'grid', gap: 11, justifyItems: 'center', textAlign: 'center' }}
        >
          <ShieldAlert size={26} style={{ color: '#d5556a' }} />
          <b style={{ fontSize: 13 }}>Your role can&apos;t view stocktakes</b>
          <p style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 400, lineHeight: 1.7, margin: 0 }}>
            Ask a workspace admin for stocktake permissions if you need to run cycle counts.
            You can still browse stock in the meantime.
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
        eyebrow="CYCLE COUNTING"
        title="Stocktakes"
        subtitle="Count stock location by location and post variances to inventory."
        action={
          canCreate && (
            <button className="button button-primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> New count
            </button>
          )
        }
      />

      <div className="metric-grid compact-metrics">
        <Metric label="Open counts" value={counts.open} icon={ClipboardList} detail="not counted yet" />
        <Metric label="Pending post" value={counts.counted} icon={AlertCircle} tone="orange" detail="counted, awaiting posting" />
        <Metric label="Posted" value={counts.posted} icon={ClipboardList} tone="mint" detail="variances applied" />
        <Metric label="Total counts" value={counts.all} icon={ClipboardList} tone="blue" detail="in this workspace" />
      </div>

      <section className="panel table-panel">
        <div className="inventory-toolbar">
          <div className="table-tabs">
            {TABS.map((t) => (
              <button
                key={t}
                className={tab === t ? 'selected' : ''}
                onClick={() => {
                  setTab(t)
                  setPage(1)
                }}
              >
                {t === 'All' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="data-disclaimer" style={{ padding: '0 20px' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <div className="table-scroll">
          {loading ? (
            <div className="empty-state">Loading stocktakes…</div>
          ) : stocktakes.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No stocktakes in this view"
              hint={canCreate ? 'Create a count sheet to start a cycle count.' : 'Nothing has been counted yet.'}
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Lines</th>
                  <th>Variances</th>
                  <th>Created by</th>
                  <th>Date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {stocktakes.map((s) => (
                  <tr key={s._id}>
                    <td>
                      <b className="transfer-id">{s.reference}</b>
                    </td>
                    <td>
                      <span className="table-location">{s.location?.name}</span>
                    </td>
                    <td>
                      <StocktakeStatus value={s.status} />
                    </td>
                    <td className="value-cell">{s.totalLines ?? 0}</td>
                    <td className="value-cell">{s.variances ?? 0}</td>
                    <td>
                      <span className="person-cell">
                        <span className="person-dot">
                          {(s.createdBy?.name || '?')
                            .split(' ')
                            .map((part) => part[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                        {s.createdBy?.name || 'Unknown'}
                      </span>
                    </td>
                    <td>{new Date(s.createdAt).toLocaleDateString()}</td>
                    <td>
                      <Link href={`/dashboard/stocktakes/${s._id}`} className="subtle-link">
                        Open <ArrowRight size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {!loading && stocktakes.length > 0 && (
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPage={setPage}
            noun="stocktakes"
            hint="Newest first"
          />
        )}
      </section>

      {showCreate && (
        <div className="modal-backdrop" onClick={() => !creating && setShowCreate(false)}>
          <form className="create-modal" style={{ width: 'min(480px, 100%)' }} onClick={(e) => e.stopPropagation()} onSubmit={createStocktake}>
            <div className="modal-heading">
              <div>
                <div className="modal-kicker">NEW COUNT</div>
                <h2 style={{ fontFamily: 'Manrope', fontSize: 17, margin: '6px 0 0' }}>Start a cycle count</h2>
                <p>A count sheet is created for every product stocked at the chosen location.</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowCreate(false)} aria-label="Close" disabled={creating}>
                <X size={16} />
              </button>
            </div>

            <label className="settings-field" style={{ maxWidth: 'none' }}>
              Location
              <div className="field-wrap">
                <Warehouse size={16} />
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  required
                  style={{ border: 0, outline: 0, width: '100%', background: 'transparent', color: 'var(--ink)' }}
                >
                  <option value="">Select location…</option>
                  {locations.map((l) => (
                    <option key={l._id} value={l._id}>
                      {l.name} ({l.code})
                    </option>
                  ))}
                </select>
              </div>
            </label>

            <label className="settings-field" style={{ maxWidth: 'none' }}>
              Notes <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span>
              <div className="field-wrap" style={{ height: 'auto', padding: '10px 12px' }}>
                <textarea
                  rows={3}
                  placeholder="e.g. Monthly count for the main warehouse"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={1000}
                  style={{ border: 0, outline: 0, width: '100%', background: 'transparent', resize: 'vertical', font: 'inherit', color: 'var(--ink)' }}
                />
              </div>
            </label>

            {createError && (
              <div className="auth-message" style={{ background: '#fdeef0', borderColor: '#f6d3d9', color: '#a4404f' }}>
                {createError}
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setShowCreate(false)} disabled={creating}>
                Cancel
              </button>
              <button type="submit" className="button button-primary" disabled={creating}>
                {creating ? 'Creating…' : 'Create count sheet'}
              </button>
            </div>
          </form>
        </div>
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </>
  )
}
export const dynamic = 'force-dynamic'
