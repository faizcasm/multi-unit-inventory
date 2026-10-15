'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  Package,
  ShieldCheck,
  Truck,
  Warehouse,
  X,
} from 'lucide-react'
import { PageHeading, Status, Toast } from '@/components/redesign/ui'
import { useCan } from '@/hooks/useCan'

const NO_PERM_TITLE = "Your role can't perform this action"

interface LineItem {
  product: { _id: string; name: string; sku: string; unitOfMeasure?: string } | string
  requestedQuantity: number
  approvedQuantity?: number
  dispatchedQuantity?: number
  receivedQuantity?: number
  missingQuantity?: number
  damagedQuantity?: number
}

interface Transfer {
  _id: string
  reference: string
  status: string
  sourceLocation: { _id: string; name: string; code: string }
  destinationLocation: { _id: string; name: string; code: string }
  requester: { name: string; email: string }
  approver?: { name: string } | null
  dispatchedBy?: { name: string } | null
  receivedBy?: { name: string } | null
  notes?: string
  lineItems: LineItem[]
  createdAt: string
  updatedAt: string
  statusHistory?: { status: string; changedAt: string; changedBy?: { name: string }; notes?: string }[]
}

const pid = (item: LineItem) =>
  typeof item.product === 'string' ? item.product : item.product?._id

const pname = (item: LineItem) =>
  typeof item.product === 'string' ? item.product : item.product?.name || 'Product'

const psku = (item: LineItem) =>
  typeof item.product === 'string' ? '' : item.product?.sku || ''

export default function TransferDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id

  const [transfer, setTransfer] = useState<Transfer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)

  // role permissions (additive to status-based eligibility)
  const canSubmit = useCan('transfers:submit')
  const canApprove = useCan('transfers:approve')
  const canReject = useCan('transfers:reject')
  const canDispatch = useCan('transfers:dispatch')
  const canReceive = useCan('transfers:receive')
  const canCancel = useCan('transfers:cancel')
  const can: Record<string, boolean> = {
    submit: canSubmit,
    approve: canApprove,
    reject: canReject,
    dispatch: canDispatch,
    receive: canReceive,
    cancel: canCancel,
  }

  // action dialogs
  const [action, setAction] = useState<null | 'submit' | 'approve' | 'reject' | 'dispatch' | 'receive' | 'cancel'>(null)
  const [reason, setReason] = useState('')
  const [recvQty, setRecvQty] = useState<Record<string, number>>({})
  const [approvalQty, setApprovalQty] = useState<Record<string, string>>({})
  const [approvalNotes, setApprovalNotes] = useState('')

  const approvalErrorFor = (li: LineItem): string | null => {
    const raw = (approvalQty[pid(li)] ?? '').trim()
    if (!/^\d+$/.test(raw)) return 'Enter a whole number'
    if (Number(raw) > li.requestedQuantity) return `Cannot exceed requested (${li.requestedQuantity})`
    return null
  }

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3500)
  }

  const fetchTransfer = useCallback(async () => {
    if (!id) return
    try {
      const response = await fetch(`/api/transfers/${id}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to load transfer')
      setTransfer(data.data)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transfer')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchTransfer()
  }, [fetchTransfer])

  const postAction = async (path: string, body: Record<string, unknown>, successMsg: string) => {
    setBusy(true)
    try {
      const response = await fetch(`/api/transfers/${id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) {
        const firstDetail = data?.details ? Object.values(data.details).flat()[0] : null
        notify(firstDetail || data?.error || 'Action failed')
      } else {
        notify(successMsg)
        setAction(null)
        setReason('')
        await fetchTransfer()
      }
    } catch {
      notify('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const runAction = async () => {
    if (!transfer) return
    if (action && !can[action]) return notify(NO_PERM_TITLE)
    switch (action) {
      case 'submit':
        await postAction('submit', { transferId: transfer._id }, 'Transfer submitted for approval')
        break
      case 'approve': {
        const invalidLines = transfer.lineItems.filter((li) => approvalErrorFor(li))
        if (invalidLines.length > 0) return notify('Fix the highlighted quantities before approving')
        const notes = approvalNotes.trim()
        await postAction(
          'approve',
          {
            transferId: transfer._id,
            ...(notes ? { approvalNotes: notes } : {}),
            lineItems: transfer.lineItems.map((li) => ({
              productId: pid(li),
              approvedQuantity: Number((approvalQty[pid(li)] ?? '').trim()),
            })),
          },
          'Transfer approved'
        )
        break
      }
      case 'reject':
        if (!reason.trim()) return notify('A rejection reason is required')
        await postAction('reject', { transferId: transfer._id, rejectionReason: reason }, 'Transfer rejected')
        break
      case 'cancel':
        if (!reason.trim()) return notify('A cancellation reason is required')
        await postAction('cancel', { transferId: transfer._id, cancellationReason: reason }, 'Transfer cancelled')
        break
      case 'dispatch':
        await postAction(
          'dispatch',
          {
            transferId: transfer._id,
            lineItems: transfer.lineItems.map((li) => ({
              productId: pid(li),
              dispatchedQuantity: li.approvedQuantity ?? li.requestedQuantity,
            })),
          },
          'Stock dispatched'
        )
        break
      case 'receive':
        await postAction(
          'receive',
          {
            transferId: transfer._id,
            lineItems: transfer.lineItems.map((li) => {
              const received = recvQty[pid(li)] ?? li.receivedQuantity ?? li.dispatchedQuantity ?? li.requestedQuantity
              const expected = li.dispatchedQuantity ?? li.requestedQuantity
              const missing = Math.max(0, expected - received)
              return {
                productId: pid(li),
                receivedQuantity: received,
                missingQuantity: missing,
                damagedQuantity: 0,
              }
            }),
          },
          'Receipt recorded'
        )
        break
      default:
        break
    }
  }

  if (loading) {
    return <div className="empty-state">Loading transfer…</div>
  }

  if (error || !transfer) {
    return (
      <>
        <div className="back-row">
          <Link href="/dashboard/transfers">
            <ChevronLeft size={15} /> Back to transfers
          </Link>
        </div>
        <section className="panel" style={{ padding: 24 }}>
          <div className="empty-state">
            <AlertCircle size={24} />
            <b>Could not load this transfer</b>
            <p>{error || 'Transfer not found'}</p>
            <button className="button button-primary button-small" onClick={() => router.refresh()}>
              Retry
            </button>
          </div>
        </section>
      </>
    )
  }

  const s = transfer.status
  const totalQty = transfer.lineItems.reduce((sum, li) => sum + (li.requestedQuantity || 0), 0)

  const nextAction = (): { key: typeof action; label: string; icon: React.ElementType } | null => {
    switch (s) {
      case 'DRAFT':
        return { key: 'submit', label: 'Submit for approval', icon: ClipboardCheck }
      case 'PENDING_APPROVAL':
        return { key: 'approve', label: 'Approve transfer', icon: CheckCircle2 }
      case 'APPROVED':
        return { key: 'dispatch', label: 'Confirm dispatch', icon: Truck }
      case 'IN_TRANSIT':
      case 'DISPATCHED':
        return { key: 'receive', label: 'Confirm receipt', icon: Warehouse }
      default:
        return null
    }
  }

  const next = nextAction()
  const nextKey = next?.key
  const nextAllowed = !nextKey || can[nextKey]
  const approvalInvalid = transfer.lineItems.some((li) => approvalErrorFor(li))
  const actionAllowed = !action || can[action]

  return (
    <>
      <div className="back-row">
        <Link href="/dashboard/transfers">
          <ChevronLeft size={15} /> Back to transfers
        </Link>
        <span> / {transfer.reference}</span>
      </div>

      <PageHeading
        eyebrow="TRANSFER RECORD"
        title={transfer.reference}
        subtitle={`${transfer.sourceLocation?.name} → ${transfer.destinationLocation?.name} · requested by ${transfer.requester?.name || 'unknown'}`}
        action={<Status value={transfer.status} />}
      />

      <div className="product-detail-grid">
        <section className="panel product-overview">
          <div className="product-hero-icon">
            <Truck size={38} />
          </div>
          <div className="product-overview-title">
            <h2>{transfer.reference}</h2>
            <span className="muted">
              {transfer.lineItems.length} products · {totalQty} units
            </span>
            <Status value={transfer.status} />
          </div>
          <div className="detail-separator" />
          <div className="detail-kv">
            <span>Source</span>
            <b>
              {transfer.sourceLocation?.name} ({transfer.sourceLocation?.code})
            </b>
          </div>
          <div className="detail-kv">
            <span>Destination</span>
            <b>
              {transfer.destinationLocation?.name} ({transfer.destinationLocation?.code})
            </b>
          </div>
          <div className="detail-kv">
            <span>Requested</span>
            <b>{new Date(transfer.createdAt).toLocaleString()}</b>
          </div>
          <div className="detail-kv">
            <span>Last updated</span>
            <b>{new Date(transfer.updatedAt).toLocaleString()}</b>
          </div>
          {transfer.notes && (
            <div className="detail-kv">
              <span>Notes</span>
              <b style={{ fontWeight: 500 }}>{transfer.notes}</b>
            </div>
          )}
        </section>

        <section className="panel dispatch-detail">
          <div className="panel-heading">
            <div>
              <h2>Workflow</h2>
              <p>Move this transfer to its next step</p>
            </div>
            <span className="count-badge">
              {s === 'COMPLETED' ? '✓' : s === 'DRAFT' ? '1' : s === 'PENDING_APPROVAL' ? '2' : s === 'APPROVED' ? '3' : '4'}
            </span>
          </div>

          <div className="receive-progress">
            <span className={s !== 'DRAFT' ? 'current' : ''} />
            <span className={['APPROVED', 'IN_TRANSIT', 'DISPATCHED', 'COMPLETED'].includes(s) ? 'current' : ''} />
            <span className={['IN_TRANSIT', 'DISPATCHED', 'COMPLETED'].includes(s) ? 'current' : ''} />
            <span className={s === 'COMPLETED' ? 'current' : ''} />
          </div>
          <div className="receive-progress-labels">
            <span>Requested</span>
            <span>Approved</span>
            <span>Dispatched</span>
            <span>Received</span>
          </div>

          {['REJECTED', 'CANCELLED'].includes(s) ? (
            <div className="data-disclaimer" style={{ marginTop: 18 }}>
              <AlertCircle size={14} /> This transfer was {s.toLowerCase()} and can no longer move forward.
            </div>
          ) : s === 'COMPLETED' ? (
            <div className="decision-result" style={{ marginTop: 18 }}>
              <CheckCircle2 size={15} /> Completed — stock has been reconciled at the destination.
            </div>
          ) : (
            <>
              {next && (
                <button
                  className="button button-primary full-width"
                  style={{ marginTop: 18 }}
                  disabled={!nextAllowed}
                  title={nextAllowed ? undefined : NO_PERM_TITLE}
                  onClick={() => {
                    setReason('')
                    if (next.key === 'receive') {
                      const init: Record<string, number> = {}
                      transfer.lineItems.forEach((li) => {
                        init[pid(li)] = li.dispatchedQuantity ?? li.requestedQuantity
                      })
                      setRecvQty(init)
                    }
                    if (next.key === 'approve') {
                      const init: Record<string, string> = {}
                      transfer.lineItems.forEach((li) => {
                        init[pid(li)] = String(li.requestedQuantity)
                      })
                      setApprovalQty(init)
                      setApprovalNotes('')
                    }
                    setAction(next.key)
                  }}
                >
                  <next.icon size={16} /> {next.label}
                </button>
              )}
              {s === 'PENDING_APPROVAL' && canReject && (
                <button
                  className="reject-button full-width"
                  style={{ marginTop: 8, width: '100%', minHeight: 40, borderRadius: 10, fontWeight: 700, fontSize: 12 }}
                  onClick={() => {
                    setReason('')
                    setAction('reject')
                  }}
                >
                  Reject request
                </button>
              )}
              {['DRAFT', 'PENDING_APPROVAL'].includes(s) && canCancel && (
                <button
                  className="button button-secondary full-width"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    setReason('')
                    setAction('cancel')
                  }}
                >
                  Cancel transfer
                </button>
              )}
            </>
          )}

          <div className="dispatch-info" style={{ display: 'flex', gap: 7, marginTop: 16 }}>
            <ShieldCheck size={15} />
            <span>Every state change is recorded in your audit history.</span>
          </div>
        </section>
      </div>

      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h2>Line items</h2>
            <p>Products included in this transfer</p>
          </div>
          <Link href="/dashboard/inventory" className="subtle-link">
            Open inventory <ArrowRight size={14} />
          </Link>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Requested</th>
                {transfer.lineItems[0]?.approvedQuantity !== undefined && <th>Approved</th>}
                {transfer.lineItems[0]?.dispatchedQuantity !== undefined && <th>Dispatched</th>}
                {transfer.lineItems[0]?.receivedQuantity !== undefined && <th>Received</th>}
                {transfer.lineItems[0]?.damagedQuantity !== undefined && <th>Damaged</th>}
              </tr>
            </thead>
            <tbody>
              {transfer.lineItems.map((li) => (
                <tr key={pid(li)}>
                  <td>
                    <span className="product-cell">
                      <span className="product-thumbnail">
                        <Package size={17} />
                      </span>
                      <span>
                        <b>{pname(li)}</b>
                        <small>{psku(li)}</small>
                      </span>
                    </span>
                  </td>
                  <td>
                    <b className="stock-number">{li.requestedQuantity}</b>
                  </td>
                  {transfer.lineItems[0]?.approvedQuantity !== undefined && <td>{li.approvedQuantity}</td>}
                  {transfer.lineItems[0]?.dispatchedQuantity !== undefined && <td>{li.dispatchedQuantity}</td>}
                  {transfer.lineItems[0]?.receivedQuantity !== undefined && <td>{li.receivedQuantity}</td>}
                  {transfer.lineItems[0]?.damagedQuantity !== undefined && <td>{li.damagedQuantity}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {transfer.statusHistory && transfer.statusHistory.length > 0 && (
        <section className="panel table-panel">
          <div className="panel-heading">
            <div>
              <h2>Status history</h2>
              <p>Chronological record of this transfer</p>
            </div>
          </div>
          <div className="movement-list">
            {transfer.statusHistory.map((h, i) => (
              <div key={i}>
                <span className="movement-icon purple">
                  <ArrowRight size={16} />
                </span>
                <div>
                  <b>{h.status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</b>
                  <small>
                    {h.changedBy?.name || 'System'}
                    {h.notes ? ` · ${h.notes}` : ''}
                  </small>
                </div>
                <time>{new Date(h.changedAt).toLocaleString()}</time>
              </div>
            ))}
          </div>
        </section>
      )}

      {action && (
        <div className="modal-backdrop" onClick={() => !busy && setAction(null)}>
          <div className="create-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(480px, 100%)' }}>
            <div className="modal-heading">
              <div>
                <div className="modal-kicker">{action.toUpperCase()}</div>
                <h2 style={{ fontFamily: 'Manrope', fontSize: 17, margin: '6px 0 0' }}>
                  {action === 'submit' && 'Submit for approval?'}
                  {action === 'approve' && 'Approve this transfer?'}
                  {action === 'dispatch' && 'Dispatch the stock?'}
                  {action === 'receive' && 'Confirm received quantities'}
                  {action === 'reject' && 'Reject this request'}
                  {action === 'cancel' && 'Cancel this transfer'}
                </h2>
              </div>
              <button className="icon-button" onClick={() => setAction(null)} aria-label="Close" disabled={busy}>
                <X size={16} />
              </button>
            </div>

            {(action === 'reject' || action === 'cancel') && (
              <label className="settings-field" style={{ maxWidth: 'none' }}>
                {action === 'reject' ? 'Rejection reason' : 'Cancellation reason'}
                <div className="field-wrap" style={{ height: 'auto', padding: '10px 12px' }}>
                  <textarea
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Explain why…"
                    maxLength={500}
                    required
                    style={{ border: 0, outline: 0, width: '100%', background: 'transparent', resize: 'vertical', font: 'inherit', color: 'var(--ink)' }}
                  />
                </div>
              </label>
            )}

            {action === 'receive' && (
              <div>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 10px' }}>
                  Adjust the received quantity per product — missing units are recorded automatically.
                </p>
                {transfer.lineItems.map((li) => (
                  <div
                    key={pid(li)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line)' }}
                  >
                    <div style={{ flex: 1 }}>
                      <b style={{ fontSize: 12, display: 'block' }}>{pname(li)}</b>
                      <small style={{ fontSize: 10, color: 'var(--muted)' }}>
                        sent {li.dispatchedQuantity ?? li.requestedQuantity}
                      </small>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={li.dispatchedQuantity ?? li.requestedQuantity}
                      value={recvQty[pid(li)] ?? 0}
                      onChange={(e) =>
                        setRecvQty((prev) => ({ ...prev, [pid(li)]: parseInt(e.target.value) || 0 }))
                      }
                      aria-label={`Received quantity for ${pname(li)}`}
                      style={{
                        width: 80,
                        height: 36,
                        borderRadius: 8,
                        border: '1px solid var(--line)',
                        background: 'var(--surface)',
                        color: 'var(--ink)',
                        padding: '0 10px',
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {action === 'dispatch' && (
              <div className="data-disclaimer" style={{ margin: 0 }}>
                <Truck size={14} /> Dispatching moves these quantities from available to in-transit stock at{' '}
                {transfer.sourceLocation?.name}.
              </div>
            )}
            {action === 'approve' && (
              <div>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 10px' }}>
                  Review the approved quantity per product — values default to the requested amount.
                </p>
                {transfer.lineItems.map((li) => {
                  const qtyError = approvalErrorFor(li)
                  return (
                    <div
                      key={pid(li)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line)' }}
                    >
                      <div style={{ flex: 1 }}>
                        <b style={{ fontSize: 12, display: 'block' }}>{pname(li)}</b>
                        <small style={{ fontSize: 10, color: 'var(--muted)' }}>
                          {psku(li) ? `${psku(li)} · ` : ''}requested {li.requestedQuantity}
                        </small>
                        {qtyError && (
                          <small style={{ fontSize: 10, color: '#d9534f', display: 'block', marginTop: 2 }}>{qtyError}</small>
                        )}
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={li.requestedQuantity}
                        step={1}
                        value={approvalQty[pid(li)] ?? String(li.requestedQuantity)}
                        onChange={(e) => setApprovalQty((prev) => ({ ...prev, [pid(li)]: e.target.value }))}
                        aria-label={`Approved quantity for ${pname(li)}`}
                        style={{
                          width: 80,
                          height: 36,
                          borderRadius: 8,
                          border: `1px solid ${qtyError ? '#d9534f' : 'var(--line)'}`,
                          background: 'var(--surface)',
                          color: 'var(--ink)',
                          padding: '0 10px',
                        }}
                      />
                    </div>
                  )
                })}
                <label className="settings-field" style={{ maxWidth: 'none', marginTop: 12 }}>
                  Approval notes (optional)
                  <div className="field-wrap" style={{ height: 'auto', padding: '10px 12px' }}>
                    <textarea
                      rows={2}
                      value={approvalNotes}
                      onChange={(e) => setApprovalNotes(e.target.value)}
                      placeholder="Add a note for the requester…"
                      maxLength={500}
                      style={{ border: 0, outline: 0, width: '100%', background: 'transparent', resize: 'vertical', font: 'inherit', color: 'var(--ink)' }}
                    />
                  </div>
                </label>
                <div className="data-disclaimer" style={{ margin: 0 }}>
                  <CheckCircle2 size={14} /> Approval unlocks dispatching for this transfer.
                </div>
              </div>
            )}
            {action === 'submit' && (
              <div className="data-disclaimer" style={{ margin: 0 }}>
                <ClipboardCheck size={14} /> An approver in your workspace will review this request.
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: 18 }}>
              <button className="button button-secondary" onClick={() => setAction(null)} disabled={busy}>
                Back
              </button>
              <button
                className="button button-primary"
                onClick={runAction}
                disabled={busy || !actionAllowed || (action === 'approve' && approvalInvalid)}
                title={actionAllowed ? (action === 'approve' && approvalInvalid ? 'Fix the highlighted quantities' : undefined) : NO_PERM_TITLE}
              >
                {busy
                  ? 'Working…'
                  : action === 'submit'
                    ? 'Submit'
                    : action === 'approve'
                      ? 'Approve'
                      : action === 'dispatch'
                        ? 'Dispatch'
                        : action === 'receive'
                          ? 'Confirm receipt'
                          : action === 'reject'
                            ? 'Reject'
                            : 'Cancel transfer'}
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
