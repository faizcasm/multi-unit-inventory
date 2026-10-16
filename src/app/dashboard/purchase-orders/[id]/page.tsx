'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Package,
  Pencil,
  Send,
  ShieldAlert,
  Truck,
  Warehouse,
  X,
} from 'lucide-react'
import { PageHeading, EmptyState, Toast } from '@/components/redesign/ui'
import { apiFetch } from '@/lib/api'
import { useCan } from '@/hooks/useCan'
import { formatCurrency, formatDateTime } from '@/lib/utils/helpers'

const NO_PERM_TITLE = "Your role can't perform this action"

interface POLine {
  product: string | { _id?: string; name?: string; sku?: string; unitOfMeasure?: string }
  productName: string
  sku: string
  requestedQuantity: number
  receivedQuantity: number
  unitCost: number
}

interface PurchaseOrder {
  _id: string
  reference: string
  status: string
  supplier: { _id?: string; name: string; leadTimeDays?: number; contactName?: string; contactEmail?: string } | null
  destinationLocation: { _id?: string; name: string; code: string } | null
  lines: POLine[]
  notes?: string
  createdBy?: { name?: string; email?: string } | null
  sentBy?: { name?: string; email?: string } | null
  sentAt?: string | null
  receivedBy?: { name?: string; email?: string } | null
  cancelledBy?: { name?: string; email?: string } | null
  cancelledAt?: string | null
  createdAt: string
  updatedAt: string
}

const pid = (line: POLine) =>
  typeof line.product === 'string' ? line.product : line.product?._id || ''

/** Maps PO statuses onto the existing redesign status-chip classes. */
const CHIP_CLASS: Record<string, string> = {
  DRAFT: 'status-draft',
  SENT: 'status-in-transit',
  PARTIALLY_RECEIVED: 'status-pending',
  RECEIVED: 'status-received',
  CANCELLED: 'status-cancelled',
}

function StatusChip({ value }: { value: string }) {
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

type ReceiveConfirm =
  | { mode: 'line'; productId: string }
  | { mode: 'batch'; items: { productId: string; qty: number; name: string }[] }

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const { status: sessionStatus } = useSession()

  const [po, setPo] = useState<PurchaseOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)

  const canRead = useCan('purchase_orders:read')
  const canUpdate = useCan('purchase_orders:update')
  const canReceive = useCan('purchase_orders:receive')
  const canCancel = useCan('purchase_orders:cancel')

  // Receive inputs (keyed by product id); empty state falls back to "remaining".
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({})
  const [receiveChecked, setReceiveChecked] = useState<Record<string, boolean>>({})
  const [receiveConfirm, setReceiveConfirm] = useState<ReceiveConfirm | null>(null)

  // Edit modal (DRAFT only): notes + requested quantity per line.
  const [showEdit, setShowEdit] = useState(false)
  const [editNotes, setEditNotes] = useState('')
  const [editQtys, setEditQtys] = useState<Record<string, string>>({})

  // Cancel modal with optional reason.
  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3500)
  }

  const fetchPo = useCallback(async () => {
    if (!id) return
    try {
      const res = await apiFetch<PurchaseOrder>(`/api/purchase-orders/${id}`)
      if (!res.success) throw new Error(res.error || 'Failed to load purchase order')
      setPo(res.data as PurchaseOrder)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load purchase order')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (sessionStatus === 'loading' || !canRead) return
    fetchPo()
  }, [sessionStatus, canRead, fetchPo])

  const lines = po?.lines || []
  const status = po?.status || ''
  const isOpenForReceipt = status === 'DRAFT' || status === 'SENT' || status === 'PARTIALLY_RECEIVED'
  const canReceiveNow = canReceive && isOpenForReceipt
  const canEditNow = canUpdate && status === 'DRAFT'
  const canSendNow = canUpdate && status === 'DRAFT'
  const canCancelNow = canCancel && isOpenForReceipt

  const remainingOf = (line: POLine) =>
    Math.max(0, (line.requestedQuantity || 0) - (line.receivedQuantity || 0))

  const orderedUnits = lines.reduce((sum, l) => sum + (l.requestedQuantity || 0), 0)
  const receivedUnits = lines.reduce((sum, l) => sum + (l.receivedQuantity || 0), 0)
  const remainingUnits = Math.max(0, orderedUnits - receivedUnits)
  const orderValue = lines.reduce((sum, l) => sum + (l.requestedQuantity || 0) * (l.unitCost || 0), 0)

  const displayQty = (line: POLine) => {
    const key = pid(line)
    if (key in receiveQty) return receiveQty[key]
    return String(remainingOf(line))
  }

  const isChecked = (line: POLine) => receiveChecked[pid(line)] ?? true

  const sendTitle = !canUpdate ? NO_PERM_TITLE : status !== 'DRAFT' ? 'Only draft orders can be sent' : ''
  const editTitle = !canUpdate ? NO_PERM_TITLE : status !== 'DRAFT' ? 'Only draft orders can be edited' : ''
  const cancelTitle = !canCancel
    ? NO_PERM_TITLE
    : !isOpenForReceipt
      ? `Cannot cancel a ${status.replaceAll('_', ' ').toLowerCase()} order`
      : ''

  const runPatch = async (body: Record<string, unknown>, successMessage: string) => {
    if (busy) return
    setBusy(true)
    try {
      const res = await apiFetch(`/api/purchase-orders/${id}`, { method: 'PATCH', body })
      if (!res.success) throw new Error(res.error || 'Update failed')
      notify(successMessage)
      setShowEdit(false)
      await fetchPo()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  const sendPo = () => runPatch({ status: 'SENT' }, 'Marked as sent to supplier')

  const openEdit = () => {
    if (!po) return
    setEditNotes(po.notes || '')
    setEditQtys(Object.fromEntries(lines.map((l) => [pid(l), String(l.requestedQuantity)])))
    setShowEdit(true)
  }

  const saveEdit = async () => {
    if (!po || busy) return
    const parsedLines = lines.map((l) => ({
      productId: pid(l),
      requestedQuantity: parseInt(editQtys[pid(l)] ?? '', 10),
    }))
    if (parsedLines.length === 0) {
      notify('A purchase order needs at least one line')
      return
    }
    if (parsedLines.some((l) => !Number.isInteger(l.requestedQuantity) || l.requestedQuantity < 1)) {
      notify('Every line needs a whole quantity of at least 1')
      return
    }
    await runPatch(
      { notes: editNotes, lines: parsedLines },
      'Purchase order updated'
    )
  }

  const runCancel = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await apiFetch(`/api/purchase-orders/${id}/cancel`, {
        method: 'POST',
        body: { reason: cancelReason || undefined },
      })
      if (!res.success) throw new Error(res.error || 'Cancel failed')
      setShowCancel(false)
      setCancelReason('')
      notify('Purchase order cancelled')
      await fetchPo()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Cancel failed')
    } finally {
      setBusy(false)
    }
  }

  const submitReceive = async (items: { productId: string; qty: number }[]) => {
    if (busy || items.length === 0) return
    setBusy(true)
    try {
      const res = await apiFetch<{ status: string }>(`/api/purchase-orders/${id}/receive`, {
        method: 'POST',
        body: { lines: items.map((i) => ({ productId: i.productId, receivedQuantity: i.qty })) },
      })
      if (!res.success) throw new Error(res.error || 'Receive failed')
      setReceiveConfirm(null)
      setReceiveQty({})
      const newStatus = (res.data as any)?.status
      notify(
        newStatus === 'RECEIVED'
          ? 'Stock received — purchase order fully received'
          : `Stock received${newStatus ? ` — ${newStatus.replaceAll('_', ' ').toLowerCase()}` : ''}`
      )
      await fetchPo()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Receive failed')
    } finally {
      setBusy(false)
    }
  }

  const receiveOne = (line: POLine) => {
    const key = pid(line)
    const remaining = remainingOf(line)
    const qty = parseInt(displayQty(line), 10)
    if (!Number.isInteger(qty) || qty < 1) {
      notify('Enter a quantity of at least 1')
      return
    }
    if (qty > remaining) {
      notify(`Cannot receive more than the ${remaining} remaining for ${line.productName}`)
      return
    }
    setReceiveConfirm({ mode: 'line', productId: key })
  }

  const batchItems = () =>
    lines
      .filter((l) => isChecked(l) && remainingOf(l) > 0)
      .map((l) => ({ productId: pid(l), qty: parseInt(displayQty(l), 10) || 0, name: l.productName }))
      .filter((i) => i.qty > 0)

  const openBatchReceive = () => {
    const items = batchItems()
    if (items.length === 0) {
      notify('Tick at least one line with a quantity to receive')
      return
    }
    setReceiveConfirm({ mode: 'batch', items })
  }

  const confirmReceive = () => {
    const confirm = receiveConfirm
    if (!confirm) return
    if (confirm.mode === 'line') {
      const targetId = confirm.productId
      const line = lines.find((l) => pid(l) === targetId)
      if (!line) return
      const qty = parseInt(displayQty(line), 10)
      if (!Number.isInteger(qty) || qty < 1 || qty > remainingOf(line)) {
        setReceiveConfirm(null)
        notify('Quantity is no longer valid — it may have been received already')
        fetchPo()
        return
      }
      submitReceive([{ productId: targetId, qty }])
    } else {
      submitReceive(confirm.items)
    }
  }

  if (sessionStatus === 'loading') {
    return <div className="empty-state" style={{ minHeight: 260 }}>Loading purchase order…</div>
  }

  if (!canRead) {
    return (
      <>
        <div className="back-row">
          <Link href="/dashboard/purchase-orders">
            <ChevronLeft size={15} /> Back to purchase orders
          </Link>
        </div>
        <div className="panel" style={{ padding: 28, display: 'grid', gap: 11, justifyItems: 'center', textAlign: 'center' }}>
          <ShieldAlert size={26} style={{ color: '#d5556a' }} />
          <b style={{ fontSize: 13 }}>Your role can&apos;t view purchase orders</b>
          <Link href="/dashboard/purchase-orders" className="button button-secondary">
            Back to purchase orders
          </Link>
        </div>
      </>
    )
  }

  if (loading) {
    return <div className="empty-state" style={{ minHeight: 260 }}>Loading purchase order…</div>
  }

  if (error || !po) {
    return (
      <>
        <div className="back-row">
          <Link href="/dashboard/purchase-orders">
            <ChevronLeft size={15} /> Back to purchase orders
          </Link>
        </div>
        <div className="panel" style={{ padding: 28, display: 'grid', gap: 11, justifyItems: 'center', textAlign: 'center' }}>
          <ShieldAlert size={26} style={{ color: '#d5556a' }} />
          <b style={{ fontSize: 13 }}>{error || 'Purchase order not found'}</b>
          <Link href="/dashboard/purchase-orders" className="button button-secondary">
            Back to purchase orders
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="back-row">
        <Link href="/dashboard/purchase-orders">
          <ChevronLeft size={15} /> Back to purchase orders
        </Link>
        <span> / {po.reference}</span>
      </div>

      <PageHeading
        eyebrow="PURCHASE ORDER"
        title={po.reference}
        subtitle={`${po.supplier?.name || 'Unknown supplier'} → ${po.destinationLocation?.name || 'Unknown location'}${
          po.notes ? ` · ${po.notes}` : ''
        }`}
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusChip value={po.status} />
            <button
              className="button button-secondary"
              onClick={sendPo}
              disabled={busy || !canSendNow}
              title={sendTitle}
            >
              <Send size={14} /> Mark as sent
            </button>
            <button
              className="button button-secondary"
              onClick={openEdit}
              disabled={busy || !canEditNow}
              title={editTitle}
            >
              <Pencil size={14} /> Edit
            </button>
            <button
              className="button button-secondary"
              onClick={() => setShowCancel(true)}
              disabled={busy || !canCancelNow}
              title={cancelTitle}
            >
              Cancel
            </button>
          </div>
        }
      />

      {/* Supplier / destination / status summary */}
      <div
        className="panel"
        style={{ padding: '16px 20px', marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 18 }}
      >
        <div>
          <span className="page-eyebrow" style={{ marginBottom: 6 }}>SUPPLIER</span>
          <b style={{ display: 'block', fontSize: 12 }}>{po.supplier?.name || 'Unknown'}</b>
          <small style={{ fontSize: 10, color: 'var(--muted)' }}>
            {po.supplier?.leadTimeDays != null ? `${po.supplier.leadTimeDays} day lead time` : 'Lead time unknown'}
            {po.supplier?.contactName ? ` · ${po.supplier.contactName}` : ''}
          </small>
        </div>
        <div>
          <span className="page-eyebrow" style={{ marginBottom: 6 }}>DELIVER TO</span>
          <b style={{ display: 'block', fontSize: 12 }}>
            {po.destinationLocation?.name || 'Unknown'}
            {po.destinationLocation?.code ? ` (${po.destinationLocation.code})` : ''}
          </b>
          <small style={{ fontSize: 10, color: 'var(--muted)' }}>Received stock lands here</small>
        </div>
        <div>
          <span className="page-eyebrow" style={{ marginBottom: 6 }}>NOTES</span>
          <b style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
            {po.notes ? po.notes : <span style={{ color: 'var(--muted)', fontWeight: 400 }}>No notes</span>}
          </b>
          <small style={{ fontSize: 10, color: 'var(--muted)' }}>
            Created by {po.createdBy?.name || 'Unknown'} · {formatDateTime(po.createdAt)}
          </small>
        </div>
      </div>

      {/* Totals */}
      <div className="metric-grid compact-metrics">
        <MetricBox label="Ordered units" value={String(orderedUnits)} detail={`${lines.length} line${lines.length === 1 ? '' : 's'}`} />
        <MetricBox label="Received units" value={String(receivedUnits)} detail={orderedUnits > 0 ? `${Math.round((receivedUnits / orderedUnits) * 100)}% of ordered` : 'nothing yet'} />
        <MetricBox label="Remaining units" value={String(remainingUnits)} detail="still to receive" />
        <MetricBox label="Order value" value={formatCurrency(orderValue)} detail="ordered × unit cost" />
      </div>

      {/* Lines + receiving */}
      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h2>Order lines</h2>
            <p>
              {canReceiveNow
                ? 'Enter quantities and receive stock into the destination location.'
                : status === 'RECEIVED'
                  ? 'All ordered stock has been received.'
                  : status === 'CANCELLED'
                    ? 'This order was cancelled — received quantities (if any) remain on the books.'
                    : 'Ordered products and their receipt progress.'}
            </p>
          </div>
          {canReceiveNow && (
            <button className="button button-primary" onClick={openBatchReceive} disabled={busy}>
              Receive checked quantities
            </button>
          )}
        </div>

        {lines.length === 0 ? (
          <EmptyState icon={Package} title="No lines on this order" hint="Edit the order to add products." />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {canReceiveNow && <th style={{ width: 32 }} />}
                  <th>Product</th>
                  <th>Ordered</th>
                  <th>Received</th>
                  <th>Remaining</th>
                  <th>Unit cost</th>
                  <th>Line value</th>
                  {canReceiveNow && <th>Receive</th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const key = pid(line)
                  const remaining = remainingOf(line)
                  const fullyReceived = remaining === 0
                  return (
                    <tr key={key || line.productName}>
                      {canReceiveNow && (
                        <td>
                          <input
                            type="checkbox"
                            checked={isChecked(line)}
                            onChange={(e) => setReceiveChecked((prev) => ({ ...prev, [key]: e.target.checked }))}
                            disabled={busy || fullyReceived}
                            aria-label={`Select ${line.productName}`}
                          />
                        </td>
                      )}
                      <td>
                        <div className="product-cell">
                          <span className="product-thumbnail">
                            <Package size={15} />
                          </span>
                          <div>
                            <b>{line.productName}</b>
                            <small>{line.sku}</small>
                          </div>
                        </div>
                      </td>
                      <td className="value-cell">{line.requestedQuantity}</td>
                      <td className="value-cell">{line.receivedQuantity || 0}</td>
                      <td>{remaining}</td>
                      <td>{formatCurrency(line.unitCost || 0)}</td>
                      <td className="value-cell">
                        {formatCurrency((line.requestedQuantity || 0) * (line.unitCost || 0))}
                      </td>
                      {canReceiveNow && (
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              type="number"
                              min={1}
                              max={Math.max(remaining, 1)}
                              value={fullyReceived ? '' : displayQty(line)}
                              placeholder={fullyReceived ? 'Done' : ''}
                              disabled={busy || fullyReceived}
                              onChange={(e) => setReceiveQty((prev) => ({ ...prev, [key]: e.target.value }))}
                              aria-label={`Quantity to receive for ${line.productName}`}
                              style={{
                                width: 74,
                                height: 32,
                                borderRadius: 8,
                                border: '1px solid var(--line)',
                                background: 'var(--surface)',
                                color: 'var(--ink)',
                                padding: '0 8px',
                              }}
                            />
                            <button
                              className="button button-secondary button-small"
                              onClick={() => receiveOne(line)}
                              disabled={busy || fullyReceived}
                              title={
                                fullyReceived
                                  ? 'Fully received'
                                  : !canReceive
                                    ? NO_PERM_TITLE
                                    : `Receive ${line.productName}`
                              }
                            >
                              Receive
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {lines.length > 0 && (
          <div className="table-footer">
            <span>
              <b>{lines.length}</b> line{lines.length === 1 ? '' : 's'} · <b>{orderedUnits}</b> ordered ·{' '}
              <b>{receivedUnits}</b> received · <b>{formatCurrency(orderValue)}</b>
            </span>
            <span>
              {status === 'CANCELLED'
                ? 'Cancelled — no further receipt is possible'
                : status === 'RECEIVED'
                  ? 'Fully received'
                  : `${remainingUnits} units remaining`}
            </span>
          </div>
        )}
      </section>

      {/* Status timeline */}
      <section className="panel" style={{ padding: 22, marginTop: 18 }}>
        <div className="panel-heading">
          <div>
            <h2>Status timeline</h2>
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
              <small>{po.createdBy?.name || 'Unknown'}</small>
            </div>
            <time>{formatDateTime(po.createdAt)}</time>
          </div>
          {po.sentAt && (
            <div>
              <span className="movement-icon purple">
                <Send size={16} />
              </span>
              <div>
                <b>Sent to supplier</b>
                <small>{po.sentBy?.name || 'Unknown'}</small>
              </div>
              <time>{formatDateTime(po.sentAt)}</time>
            </div>
          )}
          {po.receivedBy && (
            <div>
              <span className="movement-icon purple">
                <Truck size={16} />
              </span>
              <div>
                <b>Received{status === 'RECEIVED' ? ' (complete)' : ' (latest receipt)'}</b>
                <small>{po.receivedBy?.name || 'Unknown'}</small>
              </div>
              <time>{formatDateTime(po.updatedAt)}</time>
            </div>
          )}
          {po.cancelledAt && (
            <div>
              <span className="movement-icon purple">
                <X size={16} />
              </span>
              <div>
                <b>Cancelled</b>
                <small>{po.cancelledBy?.name || 'Unknown'}</small>
              </div>
              <time>{formatDateTime(po.cancelledAt)}</time>
            </div>
          )}
          {status === 'RECEIVED' && !po.receivedBy && (
            <div>
              <span className="movement-icon purple">
                <CheckCircle2 size={16} />
              </span>
              <div>
                <b>Received</b>
                <small>Completed</small>
              </div>
              <time>{formatDateTime(po.updatedAt)}</time>
            </div>
          )}
        </div>
        <div className="data-disclaimer" style={{ marginTop: 12 }}>
          <AlertCircle size={14} /> Status: {status.replaceAll('_', ' ').toLowerCase()}
        </div>
      </section>

      {/* Receive confirmation */}
      {receiveConfirm && (
        <div className="modal-backdrop" onClick={() => !busy && setReceiveConfirm(null)}>
          <div className="create-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(480px, 100%)' }}>
            <div className="modal-heading">
              <div>
                <div className="modal-kicker">RECEIVE STOCK</div>
                <h2 style={{ fontFamily: 'Manrope', fontSize: 17, margin: '6px 0 0' }}>
                  Receive into {po.destinationLocation?.name || 'destination'}?
                </h2>
              </div>
              <button className="icon-button" onClick={() => setReceiveConfirm(null)} aria-label="Close" disabled={busy}>
                <X size={16} />
              </button>
            </div>

            <div className="data-disclaimer" style={{ margin: '0 0 12px' }}>
              <AlertCircle size={14} />
              {receiveConfirm.mode === 'line'
                ? (() => {
                    const line = lines.find((l) => pid(l) === receiveConfirm.productId)
                    return line
                      ? `${displayQty(line)} × ${line.productName} will be added to stock at ${
                          po.destinationLocation?.name || 'the destination'
                        }. This cannot be undone.`
                      : 'Stock will be added to the destination location.'
                  })()
                : receiveConfirm.items
                    .map((i) => `${i.qty} × ${i.name}`)
                    .join(', ') +
                  ` will be added to stock at ${po.destinationLocation?.name || 'the destination'}. This cannot be undone.`}
            </div>

            <div className="modal-actions">
              <button className="button button-secondary" onClick={() => setReceiveConfirm(null)} disabled={busy}>
                Back
              </button>
              <button className="button button-primary" onClick={confirmReceive} disabled={busy}>
                {busy ? 'Receiving…' : 'Receive stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal (DRAFT only) */}
      {showEdit && (
        <div className="modal-backdrop" onClick={() => !busy && setShowEdit(false)}>
          <form
            className="create-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              saveEdit()
            }}
            style={{ width: 'min(560px, 100%)' }}
          >
            <div className="modal-heading">
              <div>
                <div className="modal-kicker">EDIT ORDER</div>
                <h2 style={{ fontFamily: 'Manrope', fontSize: 17, margin: '6px 0 0' }}>Edit {po.reference}</h2>
                <p>Adjust ordered quantities and notes. Stock cannot have been received yet.</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowEdit(false)} aria-label="Close" disabled={busy}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#625c73' }}>Requested quantities</span>
              {lines.map((line) => (
                <label
                  key={pid(line)}
                  className="settings-field"
                  style={{ maxWidth: 'none', marginBottom: 0, alignItems: 'center' }}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {line.productName}
                    </span>
                    <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{line.sku}</span>
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={1000000}
                    value={editQtys[pid(line)] ?? ''}
                    onChange={(e) => setEditQtys((prev) => ({ ...prev, [pid(line)]: e.target.value }))}
                    aria-label={`Requested quantity for ${line.productName}`}
                  />
                </label>
              ))}
            </div>

            <label className="settings-field" style={{ maxWidth: 'none' }}>
              Notes <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span>
              <div className="field-wrap" style={{ height: 'auto', padding: '10px 12px' }}>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  maxLength={1000}
                  placeholder="Anything the supplier or receiving team should know"
                  style={{
                    border: 0,
                    outline: 0,
                    width: '100%',
                    background: 'transparent',
                    resize: 'vertical',
                    color: 'var(--ink)',
                    font: 'inherit',
                  }}
                />
              </div>
            </label>

            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setShowEdit(false)} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="button button-primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Cancel modal */}
      {showCancel && (
        <div className="modal-backdrop" onClick={() => !busy && setShowCancel(false)}>
          <form
            className="create-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              runCancel()
            }}
            style={{ width: 'min(460px, 100%)' }}
          >
            <div className="modal-heading">
              <div>
                <div className="modal-kicker">CANCEL</div>
                <h2 style={{ fontFamily: 'Manrope', fontSize: 17, margin: '6px 0 0' }}>
                  Cancel {po.reference}?
                </h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowCancel(false)} aria-label="Close" disabled={busy}>
                <X size={16} />
              </button>
            </div>

            <div className="data-disclaimer" style={{ margin: '0 0 12px' }}>
              <AlertCircle size={14} /> The open balance will be cancelled. Any stock already received
              ({receivedUnits} unit{receivedUnits === 1 ? '' : 's'}) stays on the books.
            </div>

            <label className="settings-field" style={{ maxWidth: 'none' }}>
              Reason <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span>
              <div className="field-wrap">
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  maxLength={500}
                  placeholder="e.g. Supplier can't fulfil this order"
                />
              </div>
            </label>

            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setShowCancel(false)} disabled={busy}>
                Keep order
              </button>
              <button type="submit" className="button button-primary" disabled={busy}>
                {busy ? 'Cancelling…' : 'Cancel order'}
              </button>
            </div>
          </form>
        </div>
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </>
  )
}

function MetricBox({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon blue">
          <Warehouse size={17} />
        </span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-bottom">
        <span>{detail}</span>
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'
