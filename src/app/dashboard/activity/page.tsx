'use client'

import { useCallback, useEffect, useState, CSSProperties } from 'react'
import { useSession } from 'next-auth/react'
import {
  ScrollText,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useCan } from '@/hooks/useCan'
import { PageHeading, EmptyState } from '@/components/redesign/ui'

interface AuditRow {
  _id: string
  action: string
  resourceType?: string
  resourceId?: string
  metadata?: Record<string, unknown>
  createdAt: string
  user?: { name?: string; email?: string } | null
}

/** Human labels — mirrors the notification feed in AppShell. */
const ACTION_LABELS: Record<string, string> = {
  USER_LOGIN: 'Signed in',
  USER_LOGOUT: 'Signed out',
  USER_REGISTER: 'New member registered',
  ORG_CREATE: 'Workspace created',
  ORG_UPDATE: 'Workspace settings updated',
  LOCATION_CREATE: 'Location added',
  LOCATION_UPDATE: 'Location updated',
  LOCATION_DEACTIVATE: 'Location deactivated',
  PRODUCT_CREATE: 'Product created',
  PRODUCT_UPDATE: 'Product updated',
  PRODUCT_DEACTIVATE: 'Product deactivated',
  INVENTORY_ADJUST: 'Stock adjusted',
  TRANSFER_CREATE: 'Transfer draft created',
  TRANSFER_SUBMIT: 'Transfer submitted for approval',
  TRANSFER_APPROVE: 'Transfer approved',
  TRANSFER_REJECT: 'Transfer rejected',
  TRANSFER_DISPATCH: 'Transfer dispatched',
  TRANSFER_RECEIVE: 'Transfer received',
  TRANSFER_CANCEL: 'Transfer cancelled',
  TRANSFER_COMPLETE: 'Transfer completed',
  MEMBERSHIP_CREATE: 'Member added',
  MEMBERSHIP_UPDATE: 'Member updated',
  MEMBERSHIP_REMOVE: 'Member removed',
  SETTINGS_UPDATE: 'Settings updated',
  SUPPLIER_CREATE: 'Supplier added',
  SUPPLIER_UPDATE: 'Supplier updated',
  SUPPLIER_DEACTIVATE: 'Supplier deactivated',
  PURCHASE_ORDER_CREATE: 'Purchase order created',
  PURCHASE_ORDER_UPDATE: 'Purchase order updated',
  PURCHASE_ORDER_RECEIVE: 'Purchase order received',
  PURCHASE_ORDER_CANCEL: 'Purchase order cancelled',
  STOCKTAKE_CREATE: 'Count sheet created',
  STOCKTAKE_UPDATE: 'Count sheet updated',
  STOCKTAKE_COUNT: 'Counts saved',
  STOCKTAKE_POST: 'Stocktake posted',
  STOCKTAKE_VOID: 'Stocktake voided',
  PRODUCT_IMPORT: 'Products imported from CSV',
  LOCATION_IMPORT: 'Locations imported from CSV',
  INVENTORY_RESERVE: 'Stock reserved',
  INVENTORY_RELEASE: 'Reservation released',
  TRANSFER_DUPLICATE: 'Transfer duplicated',
  TRANSFER_COMMENT: 'Comment added to transfer',
  WEBHOOK_CREATE: 'Webhook added',
  WEBHOOK_UPDATE: 'Webhook updated',
  WEBHOOK_DELETE: 'Webhook removed',
  WEBHOOK_TEST: 'Webhook test sent',
  APIKEY_CREATE: 'API key created',
  APIKEY_DELETE: 'API key revoked',
  DEMO_DATA_CREATE: 'Demo data seeded',
}

type GroupKey =
  | 'TRANSFER'
  | 'INVENTORY'
  | 'PRODUCT'
  | 'LOCATION'
  | 'PURCHASE_ORDER'
  | 'STOCKTAKE'
  | 'SUPPLIER'
  | 'USER'
  | 'MEMBERSHIP'
  | 'ORG'
  | 'SETTINGS'
  | 'OTHER'

/** Prefix order matters only for clarity — no prefix is a prefix of another. */
const GROUP_PREFIXES: GroupKey[] = [
  'TRANSFER',
  'INVENTORY',
  'PRODUCT',
  'LOCATION',
  'PURCHASE_ORDER',
  'STOCKTAKE',
  'SUPPLIER',
  'MEMBERSHIP',
  'USER',
  'ORG',
  'SETTINGS',
]

/** Group display labels + chip tones built from the redesign.css design tokens (dark-mode safe). */
const GROUP_TONE: Record<GroupKey, { label: string; chip: CSSProperties }> = {
  TRANSFER: { label: 'Transfers', chip: { background: 'var(--blue-soft)', color: 'var(--blue)' } },
  INVENTORY: { label: 'Inventory', chip: { background: 'var(--green-soft)', color: 'var(--green)' } },
  PRODUCT: { label: 'Products', chip: { background: 'var(--violet-soft)', color: 'var(--violet)' } },
  LOCATION: { label: 'Locations', chip: { background: 'var(--orange-soft)', color: 'var(--orange)' } },
  PURCHASE_ORDER: { label: 'Purchasing', chip: { background: 'var(--violet-soft)', color: 'var(--violet)' } },
  STOCKTAKE: { label: 'Stocktakes', chip: { background: 'var(--blue-soft)', color: 'var(--blue)' } },
  SUPPLIER: { label: 'Suppliers', chip: { background: 'var(--orange-soft)', color: 'var(--orange)' } },
  USER: { label: 'People', chip: { background: 'var(--line)', color: 'var(--muted)' } },
  MEMBERSHIP: { label: 'People', chip: { background: 'var(--line)', color: 'var(--muted)' } },
  ORG: {
    label: 'Settings',
    chip: { background: 'transparent', color: 'var(--muted)', boxShadow: 'inset 0 0 0 1px var(--line)' },
  },
  SETTINGS: {
    label: 'Settings',
    chip: { background: 'transparent', color: 'var(--muted)', boxShadow: 'inset 0 0 0 1px var(--line)' },
  },
  OTHER: {
    label: 'Other',
    chip: { background: 'transparent', color: 'var(--muted)', boxShadow: 'inset 0 0 0 1px var(--line)' },
  },
}

/** Group filter tabs → `actionGroup` query param (People → USER). */
const GROUP_FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'TRANSFER', label: 'Transfers' },
  { key: 'INVENTORY', label: 'Inventory' },
  { key: 'PRODUCT', label: 'Products' },
  { key: 'LOCATION', label: 'Locations' },
  { key: 'PURCHASE_ORDER', label: 'Purchasing' },
  { key: 'STOCKTAKE', label: 'Stocktakes' },
  { key: 'SUPPLIER', label: 'Suppliers' },
  { key: 'USER', label: 'People' },
  { key: 'SETTINGS', label: 'Settings' },
]

function groupOf(action: string): GroupKey {
  return GROUP_PREFIXES.find((g) => action.startsWith(g)) ?? 'OTHER'
}

/** Relative timestamp — mirrors the AppShell notification feed. */
function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** "StockTransfer" / "INVENTORY_ADJUST" → "Stock Transfer" / "Inventory Adjust" */
function humanize(value?: string): string {
  if (!value) return ''
  const spaced = value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase())
}

function initialsOf(name?: string): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default function ActivityPage() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [page, setPage] = useState(1)
  const [actionGroup, setActionGroup] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  const { status } = useSession()
  const canSee = useCan('audit:read')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' })
      if (actionGroup) params.set('actionGroup', actionGroup)

      const res = await apiFetch<AuditRow[]>(`/api/audit?${params.toString()}`)
      if (!res.success) {
        setError(res.error || 'Failed to load activity')
        return
      }
      setRows(res.data ?? [])
      setTotal(res.pagination?.total ?? 0)
      setTotalPages(res.pagination?.totalPages ?? 1)
    } catch {
      setError('Failed to load activity')
    } finally {
      setLoading(false)
    }
  }, [page, actionGroup])

  useEffect(() => {
    if (status === 'loading' || !canSee) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, canSee, load])

  const selectGroup = (key: string) => {
    setActionGroup(key)
    setPage(1)
  }

  const denied = status !== 'loading' && !canSee

  return (
    <>
      <PageHeading
        eyebrow="AUDIT TRAIL"
        title="Activity"
        subtitle="Every action across your workspace, in chronological order."
      />

      {denied ? (
        <section className="panel" style={{ padding: 24 }}>
          <div className="empty-state" style={{ minHeight: 220 }}>
            <ShieldAlert size={24} />
            <b>You don&apos;t have access to the audit trail</b>
            <p>Ask a workspace admin for the Activity permission to review what&apos;s happened here.</p>
          </div>
        </section>
      ) : (
        <section className="panel table-panel">
          <div className="inventory-toolbar">
            <div className="table-tabs">
              {GROUP_FILTERS.map((f) => (
                <button
                  key={f.key || 'all'}
                  className={actionGroup === f.key ? 'selected' : ''}
                  onClick={() => selectGroup(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="table-scroll">
            {loading ? (
              <div className="empty-state">Loading activity…</div>
            ) : error ? (
              <div className="empty-state">
                <AlertCircle size={24} />
                <b>Could not load activity</b>
                <p>{error}</p>
                <button className="button button-secondary button-small" onClick={load}>
                  Retry
                </button>
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={ScrollText}
                title="No activity in this view"
                hint="Actions taken across your workspace will show up here."
              />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Resource</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const tone = GROUP_TONE[groupOf(row.action)]
                    const reference =
                      typeof row.metadata?.reference === 'string' ? row.metadata.reference : ''
                    const resource = humanize(row.resourceType)
                    return (
                      <tr key={row._id}>
                        <td>
                          <div className="person-cell">
                            <span className="person-dot">{initialsOf(row.user?.name)}</span>
                            <div>
                              <b>{row.user?.name || 'Unknown user'}</b>
                              {row.user?.email && (
                                <small style={{ display: 'block', fontSize: 9, marginTop: 3, color: 'var(--muted)' }}>
                                  {row.user.email}
                                </small>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <b>{ACTION_LABELS[row.action] || humanize(row.action)}</b>
                          <span className="status" style={{ ...tone.chip, marginLeft: 7, verticalAlign: 'middle' }}>
                            <i />
                            {tone.label}
                          </span>
                          <small>{row.action}</small>
                        </td>
                        <td>
                          <b>{resource || '—'}</b>
                          <small>{reference || (row.resourceId ? `…${row.resourceId.slice(-6)}` : '')}</small>
                        </td>
                        <td title={new Date(row.createdAt).toLocaleString()}>{timeAgo(row.createdAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {!loading && !error && total > 0 && (
            <div className="table-footer">
              <span>
                Showing <b>{rows.length}</b> of <b>{total}</b> actions
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={13} />
                </button>
                <span>
                  Page {page} of {Math.max(totalPages, 1)}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages}
                  aria-label="Next page"
                >
                  <ChevronRight size={13} />
                </button>
              </span>
            </div>
          )}
        </section>
      )}
    </>
  )
}
export const dynamic = 'force-dynamic'
