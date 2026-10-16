'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, ChevronLeft, ClipboardList, Package, ShieldAlert, X } from 'lucide-react'
import { PageHeading, EmptyState, Toast } from '@/components/redesign/ui'
import { apiFetch } from '@/lib/api'
import { useCan } from '@/hooks/useCan'
import { formatDateTime } from '@/lib/utils/helpers'

const NO_PERM_TITLE = "Your role can't perform this action"

interface CountLine {
  product: string | { _id?: string; name?: string; sku?: string }
  productName: string
  sku: string
  systemQuantity: number
  countedQuantity?: number | null
  countedBy?: { name?: string; email?: string } | null
  countedAt?: string | null
  notes?: string
}

interface Stocktake {
  _id: string
  reference: string
  status: string
  location: { _id?: string; name: string; code: string }
  lines: CountLine[]
  createdBy?: { name?: string; email?: string } | null
  postedBy?: { name?: string; email?: string } | null
  postedAt?: string | null
  notes?: string
  createdAt: string
  updatedAt: string
  summary: { totalLines: number; countedLines: number; variances: number }
}

const pid = (line: CountLine) =>
  typeof line.product === 'string' ? line.product : line.product?._id || ''

/** Maps stocktake statuses onto the existing redesign status-chip classes. */
const CHIP_CLASS: Record<string, string> = {
  OPEN: 'status-draft',
  COUNTED: 'status-pending',
  POSTED: 'status-completed',
  VOID: 'status-cancelled',
}

function StatusChip({ value }: { value: string }) {
  const label = value.charAt(0) + value.slice(1).toLowerCase()
  return (
    <span className={`status ${CHIP_CLASS[value] || ''}`}>
      <i />
      {label}
    </span>
  )
}

function VarianceChip({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="status status-draft">
        <i /> 0
      </span>
    )
  }
  const positive = value > 0
  return (
    <span
      className="status"
      style={{
        background: positive ? '#eaf7ef' : '#fdeef0',
        color: positive ? '#1f8a4c' : '#a4404f',
      }}
    >
      <i /> {positive ? `+${value}` : value}
    </span>
  )
}

export default function StocktakeDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [stocktake, setStocktake] = useState<Stocktake | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const [action, setAction] = useState<null | 'post' | 'void'>(null)

  /** Unsaved per-line edits, keyed by line index. */
  const [entered, setEntered] = useState<Record<number, { qty?: string; notes?: string }>>({})

  const canCount = useCan('stocktakes:count')
  const canPost = useCan('stocktakes:post')
  const canUpdate = useCan('stocktakes:update')

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3500)
  }

  const fetchStocktake = useCallback(async () => {
    if (!id) return
    try {
      const res = await apiFetch<Stocktake>(`/api/stocktakes/${id}`)
      if (!res.success) throw new Error(res.error || 'Failed to load stocktake')
      setStocktake(res.data as Stocktake)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stocktake')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchStocktake()
  }, [fetchStocktake])

  const lines = stocktake?.lines || []
  const isOpen = stocktake?.status === 'OPEN'
  const isCounted = stocktake?.status === 'COUNTED'
  const canSaveNow = (isOpen || isCounted) && canCount
  const canPostNow = isCounted && canPost
  const canVoidNow = (isOpen || isCounted) && canUpdate

  const rows = lines.map((line, i) => {
    const edit = entered[i]
    const display =
      edit?.qty !== undefined
        ? edit.qty
        : line.countedQuantity !== undefined && line.countedQuantity !== null
          ? String(line.countedQuantity)
          : ''
    const trimmed = display.trim()
    const counted = trimmed !== '' && /^\d+$/.test(trimmed)
    const quantity = counted ? parseInt(trimmed, 10) : null
    const variance = counted ? quantity! - (line.systemQuantity || 0) : null
    return {
      line,
      i,
      display,
      counted,
      variance,
      notes: edit?.notes !== undefined ? edit.notes : line.notes || '',
    }
  })

  const countedRows = rows.filter((r) => r.counted)
  const varianceRows = countedRows.filter((r) => r.variance !== 0)
  /** Rows the user edited (counted quantity or notes) since the last save. */
  const touchedRows = rows.filter((r) => r.counted && r.i in entered)
  const dirty = Object.keys(entered).length > 0

  const saveCountTitle = !canCount
    ? NO_PERM_TITLE
    : !(isOpen || isCounted)
      ? 'Counts are locked once the stocktake is posted or voided'
      : touchedRows.length === 0
        ? 'Enter counted quantities first'
        : ''
  const postTitle = !canPost
    ? NO_PERM_TITLE
    : !isCounted
      ? 'Only counted stocktakes can be posted'
      : ''
  const voidTitle = !canUpdate
    ? NO_PERM_TITLE
    : !(isOpen || isCounted)
      ? 'Only open or counted stocktakes can be voided'
      : ''

  const saveCount = async () => {
    if (busy) return
    const payload = touchedRows.map((r) => ({
      productId: pid(r.line),
      countedQuantity: parseInt(r.display, 10),
      notes: r.notes ? r.notes : undefined,
    }))
    if (payload.length === 0) {
      notify('Enter at least one counted quantity')
      return
    }
    setBusy(true)
    try {
      const res = await apiFetch(`/api/stocktakes/${id}/count`, {
        method: 'POST',
        body: { stocktakeId: id, lines: payload },
      })
      if (!res.success) throw new Error(res.error || 'Failed to save count')
      setEntered({})
      notify(`Count saved — ${payload.length} line${payload.length === 1 ? '' : 's'}`)
      await fetchStocktake()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to save count')
    } finally {
      setBusy(false)
    }
  }

  const runAction = async () => {
    if (!action || busy) return
    setBusy(true)
    try {
      const res = await apiFetch(`/api/stocktakes/${id}/${action}`, {
        method: 'POST',
        body: { stocktakeId: id },
      })
      if (!res.success) throw new Error(res.error || 'Action failed')
      if (action === 'post') {
        const summary = (res.data as any)?.summary
        const applied = summary?.variances ?? 0
        notify(applied > 0 ? `Posted — ${applied} variance${applied === 1 ? '' : 's'} applied` : 'Posted — no variances to apply')
      } else {
        notify('Stocktake voided')
      }
      setAction(null)
      await fetchStocktake()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="empty-state" style={{ minHeight: 260 }}>Loading stocktake…</div>
  }

  if (error || !stocktake) {
    return (
      <>
        <div className="back-row">
          <Link href="/dashboard/stocktakes">
            <ChevronLeft size={15} /> Back to stocktakes
          </Link>
        </div>
        <div className="panel" style={{ padding: 28, display: 'grid', gap: 11, justifyItems: 'center', textAlign: 'center' }}>
          <ShieldAlert size={26} style={{ color: '#d5556a' }} />
          <b style={{ fontSize: 13 }}>{error || 'Stocktake not found'}</b>
          <Link href="/dashboard/stocktakes" className="button button-secondary">
            Back to stocktakes
          </Link>
        </div>
      </>
    )
  }

  const latestCount = lines
    .filter((l) => l.countedAt)
    .sort((a, b) => new Date(b.countedAt!).getTime() - new Date(a.countedAt!).getTime())[0]

  return (
    <>
      <div className="back-row">
        <Link href="/dashboard/stocktakes">
          <ChevronLeft size={15} /> Back to stocktakes
        </Link>
        <span> / {stocktake.reference}</span>
      </div>

      <PageHeading
        eyebrow="CYCLE COUNT"
        title={stocktake.reference}
        subtitle={`${stocktake.location?.name || 'Unknown location'}${stocktake.notes ? ` · ${stocktake.notes}` : ''}`}
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusChip value={stocktake.status} />
            <button
              className="button button-secondary"
              onClick={saveCount}
              disabled={busy || !canSaveNow || touchedRows.length === 0}
              title={saveCountTitle}
            >
              Save count
            </button>
            <button
              className="button button-primary"
              onClick={() => setAction('post')}
              disabled={busy || !canPostNow}
              title={postTitle}
            >
              Post variances
            </button>
            <button
              className="button button-secondary"
              onClick={() => setAction('void')}
              disabled={busy || !canVoidNow}
              title={voidTitle}
            >
              Void
            </button>
          </div>
        }
      />

      <div
        className="panel"
        style={{ padding: '14px 18px', marginBottom: 18, display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          Lines <b style={{ color: 'var(--ink)' }}>{rows.length}</b>
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          Counted <b style={{ color: 'var(--ink)' }}>{countedRows.length}</b>
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          Variances <b style={{ color: 'var(--ink)' }}>{varianceRows.length}</b>
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
          {isOpen && 'Open — enter counts and save when ready'}
          {isCounted && 'Counted — review variances and post'}
          {stocktake.status === 'POSTED' && 'Posted — inventory has been updated'}
          {stocktake.status === 'VOID' && 'Voided — no stock was changed'}
        </span>
      </div>

      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h2>Counting sheet</h2>
            <p>System quantities are read live from inventory at {stocktake.location?.name}.</p>
          </div>
          {dirty && (
            <button className="subtle-link" onClick={() => setEntered({})} disabled={busy}>
              Discard edits
            </button>
          )}
        </div>

        {lines.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Nothing to count here yet"
            hint={`No stock records exist at ${stocktake.location?.name || 'this location'}. Add inventory first, or pick another location.`}
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>System (live)</th>
                  <th>Counted</th>
                  <th>Variance</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.i}>
                    <td>
                      <b>{r.line.productName}</b>
                    </td>
                    <td>
                      <span className="category-text">{r.line.sku}</span>
                    </td>
                    <td>
                      <b className="stock-number">{r.line.systemQuantity || 0}</b>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={1000000}
                        placeholder="0"
                        value={r.display}
                        onChange={(e) =>
                          setEntered((prev) => ({
                            ...prev,
                            [r.i]: {
                              ...prev[r.i],
                              qty: e.target.value,
                              notes: prev[r.i]?.notes ?? r.line.notes ?? '',
                            },
                          }))
                        }
                        disabled={busy || !canSaveNow}
                        aria-label={`Counted quantity for ${r.line.productName}`}
                        style={{
                          width: 92,
                          height: 34,
                          borderRadius: 8,
                          border: '1px solid var(--line)',
                          background: 'var(--surface)',
                          color: 'var(--ink)',
                          padding: '0 10px',
                        }}
                      />
                    </td>
                    <td>{r.variance !== null ? <VarianceChip value={r.variance} /> : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>}</td>
                    <td>
                      <input
                        type="text"
                        placeholder="Optional note"
                        value={r.notes}
                        onChange={(e) =>
                          setEntered((prev) => ({
                            ...prev,
                            [r.i]: { ...prev[r.i], notes: e.target.value, qty: prev[r.i]?.qty },
                          }))
                        }
                        disabled={busy || !canSaveNow}
                        maxLength={500}
                        aria-label={`Notes for ${r.line.productName}`}
                        style={{
                          width: 170,
                          height: 34,
                          borderRadius: 8,
                          border: '1px solid var(--line)',
                          background: 'var(--surface)',
                          color: 'var(--ink)',
                          padding: '0 10px',
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lines.length > 0 && (
          <div className="table-footer">
            <span>
              {countedRows.length} of <b>{rows.length}</b> lines counted · {varianceRows.length} variance
              {varianceRows.length === 1 ? '' : 's'}
            </span>
            <span>{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
          </div>
        )}
      </section>

      <section className="panel" style={{ padding: 22, marginTop: 18 }}>
        <div className="panel-heading">
          <div>
            <h2>History</h2>
            <p>Who did what, and when.</p>
          </div>
        </div>
        <div className="movement-list">
          <div>
            <span className="movement-icon purple">
              <ClipboardList size={16} />
            </span>
            <div>
              <b>Created</b>
              <small>{stocktake.createdBy?.name || 'Unknown'}</small>
            </div>
            <time>{formatDateTime(stocktake.createdAt)}</time>
          </div>
          {latestCount && (
            <div>
              <span className="movement-icon purple">
                <ClipboardList size={16} />
              </span>
              <div>
                <b>Counted</b>
                <small>{latestCount.countedBy?.name || 'Unknown'}</small>
              </div>
              <time>{formatDateTime(latestCount.countedAt!)}</time>
            </div>
          )}
          {stocktake.postedAt && (
            <div>
              <span className="movement-icon purple">
                <ClipboardList size={16} />
              </span>
              <div>
                <b>Posted</b>
                <small>{stocktake.postedBy?.name || 'Unknown'}</small>
              </div>
              <time>{formatDateTime(stocktake.postedAt)}</time>
            </div>
          )}
        </div>
        {error && (
          <div className="data-disclaimer" style={{ marginTop: 12 }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}
      </section>

      {action && (
        <div className="modal-backdrop" onClick={() => !busy && setAction(null)}>
          <div className="create-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(460px, 100%)' }}>
            <div className="modal-heading">
              <div>
                <div className="modal-kicker">{action.toUpperCase()}</div>
                <h2 style={{ fontFamily: 'Manrope', fontSize: 17, margin: '6px 0 0' }}>
                  {action === 'post' ? 'Post these variances?' : 'Void this stocktake?'}
                </h2>
              </div>
              <button className="icon-button" onClick={() => setAction(null)} aria-label="Close" disabled={busy}>
                <X size={16} />
              </button>
            </div>

            {action === 'post' ? (
              <div className="data-disclaimer" style={{ margin: 0 }}>
                <AlertCircle size={14} />{' '}
                {varianceRows.length} of {rows.length} counted line{rows.length === 1 ? '' : 's'} differ from live
                stock. Posting applies {varianceRows.length} variance{varianceRows.length === 1 ? '' : 's'} to
                inventory and records an adjustment movement. This cannot be undone.
              </div>
            ) : (
              <div className="data-disclaimer" style={{ margin: 0 }}>
                <AlertCircle size={14} /> The count sheet will be marked as void and no stock will change.
              </div>
            )}

            <div className="modal-actions">
              <button className="button button-secondary" onClick={() => setAction(null)} disabled={busy}>
                Cancel
              </button>
              <button className="button button-primary" onClick={runAction} disabled={busy}>
                {busy ? 'Working…' : action === 'post' ? 'Post variances' : 'Void stocktake'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </>
  )
}
export const dynamic = 'force-dynamic'
