'use client'

import { Fragment, useCallback, useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import {
  AlertCircle,
  Check,
  Copy,
  KeyRound,
  Pencil,
  PlugZap,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react'
import { PageHeading, Metric, EmptyState, Toast } from '@/components/redesign/ui'
import { apiFetch } from '@/lib/api'
import { useCan } from '@/hooks/useCan'
import { WEBHOOK_EVENTS } from '@/lib/webhook-events'

type Tab = 'keys' | 'webhooks'

interface ApiKeyRow {
  _id: string
  name: string
  prefix: string
  isActive: boolean
  expiresAt: string | null
  lastUsedAt: string | null
  createdBy: { _id: string; name?: string } | null
  createdAt: string
}

interface WebhookDeliveryRow {
  _id: string
  event: string
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
  responseStatus: number | null
  error: string | null
  durationMs: number | null
  createdAt: string
}

interface WebhookRow {
  _id: string
  url: string
  events: string[]
  description: string
  isActive: boolean
  stats: {
    delivered: number
    failed: number
    lastStatus: string | null
    lastTriggeredAt: string | null
  }
  lastDelivery: {
    status: string
    responseStatus: number | null
    error: string | null
    createdAt: string
  } | null
  createdAt: string
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Never'
  const d = new Date(value)
  if (isNaN(d.getTime())) return 'Never'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** The one-time secret/key reveal box with a copy button. */
function SecretCopyBox({ label, value, hint }: { label: string; value: string; hint: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Clipboard API can be blocked — fall back to a selectable field.
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2200)
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 1.2,
          color: '#8069dc',
          marginBottom: 7,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          border: '1px solid #e6ddff',
          background: '#f7f4ff',
          borderRadius: 9,
          padding: '10px 11px',
        }}
      >
        <code
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 11,
            color: '#4b3f79',
            wordBreak: 'break-all',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          {value}
        </code>
        <button
          type="button"
          className="button button-secondary"
          style={{ padding: '7px 11px', flexShrink: 0 }}
          onClick={copy}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p style={{ fontSize: 10, color: '#a49bad', margin: '7px 0 0', lineHeight: 1.6 }}>
        {hint}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* API keys tab                                                        */
/* ------------------------------------------------------------------ */

function ApiKeysTab({ canManage, notify }: { canManage: boolean; notify: (msg: string) => void }) {
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [expiresInDays, setExpiresInDays] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)

  const fetchKeys = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<ApiKeyRow[]>('/api/integrations/api-keys')
      if (!res.success) throw new Error(res.error || 'Failed to fetch API keys')
      setKeys(res.data || [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchKeys()
  }, [fetchKeys])

  const openCreate = () => {
    setName('')
    setExpiresInDays('')
    setFormError('')
    setCreatedKey(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setCreatedKey(null)
  }

  const createKey = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      const payload: Record<string, unknown> = { name }
      if (expiresInDays) payload.expiresInDays = parseInt(expiresInDays, 10)
      const res = await apiFetch<{ apiKey: string }>('/api/integrations/api-keys', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (!res.success || !res.data?.apiKey) {
        const details = res.details as Record<string, string[]> | undefined
        setFormError(
          details
            ? Object.values(details).flat()[0] || res.error || 'Failed to create key'
            : res.error || 'Failed to create key'
        )
        return
      }
      setCreatedKey(res.data.apiKey)
      fetchKeys()
    } catch {
      setFormError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const revoke = async (key: ApiKeyRow) => {
    const ok = window.confirm(
      `Revoke "${key.name}"? Requests using ${key.prefix}… stop working immediately.`
    )
    if (!ok) return
    const res = await apiFetch(`/api/integrations/api-keys?id=${key._id}`, { method: 'DELETE' })
    if (!res.success) {
      notify(res.error || 'Could not revoke key')
      return
    }
    notify('API key revoked')
    fetchKeys()
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const curl = `curl -H "X-API-Key: rzk_…" ${origin || 'https://your-app.example'}/api/v1/products`

  return (
    <>
      <section className="panel" style={{ padding: 20, marginBottom: 16 }}>
        <div className="panel-heading" style={{ marginBottom: 10 }}>
          <h2>Read-only REST API</h2>
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.8, margin: '0 0 12px' }}>
          API keys authenticate machine access to the versioned, read-only API at{' '}
          <code style={{ color: '#7358e8' }}>/api/v1</code>. Endpoints: products, inventory,
          locations, transfers, and movements — all paginated, all scoped to this workspace, and
          all gated by the same permissions as your role. Send the key as{' '}
          <code style={{ color: '#7358e8' }}>X-API-Key</code> or{' '}
          <code style={{ color: '#7358e8' }}>Authorization: Bearer</code>.
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: '1px solid #eceaf3',
            background: '#fbfaff',
            borderRadius: 9,
            padding: '10px 11px',
          }}
        >
          <code
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 11,
              color: '#4b3f79',
              wordBreak: 'break-all',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            {curl}
          </code>
        </div>
      </section>

      <section className="panel table-panel inventory-table-panel" style={{ marginBottom: 18 }}>
        <div className="inventory-toolbar">
          <div className="table-tabs">
            <button className="selected">
              <KeyRound size={13} /> API keys
              <span className="tab-count">{keys.length}</span>
            </button>
          </div>
          <div className="table-tools">
            <button className="button button-secondary" onClick={fetchKeys} aria-label="Refresh">
              <RefreshCw size={14} /> Refresh
            </button>
            {canManage && (
              <button className="button button-primary" onClick={openCreate}>
                <Plus size={15} /> New key
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="data-disclaimer" style={{ padding: '0 20px' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <div className="table-scroll">
          {loading ? (
            <div className="empty-state">Loading API keys…</div>
          ) : keys.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="No API keys yet"
              hint={
                canManage
                  ? 'Create a key to start querying /api/v1 from your scripts or tools.'
                  : 'An admin can create keys from this page.'
              }
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key</th>
                  <th>Created by</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => {
                  const expired = !!key.expiresAt && new Date(key.expiresAt) < new Date()
                  return (
                    <tr key={key._id}>
                      <td>
                        <b>{key.name}</b>
                      </td>
                      <td>
                        <code
                          style={{
                            fontSize: 10,
                            color: '#7358e8',
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          }}
                        >
                          {key.prefix}…
                        </code>
                      </td>
                      <td>{key.createdBy?.name || '—'}</td>
                      <td>{formatDate(key.createdAt)}</td>
                      <td>{formatDateTime(key.lastUsedAt)}</td>
                      <td>{key.expiresAt ? formatDate(key.expiresAt) : 'Never'}</td>
                      <td>
                        {!key.isActive ? (
                          <span className="status status-rejected">
                            <i /> Revoked
                          </span>
                        ) : expired ? (
                          <span className="status status-needs-attention">
                            <i /> Expired
                          </span>
                        ) : (
                          <span className="status status-healthy">
                            <i /> Active
                          </span>
                        )}
                      </td>
                      <td>
                        {key.isActive && canManage && (
                          <button className="reject-button" onClick={() => revoke(key)}>
                            <Trash2 size={12} /> Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {modalOpen && (
        <div className="modal-backdrop" onClick={() => !saving && closeModal()}>
          <form className="create-modal" onClick={(e) => e.stopPropagation()} onSubmit={createKey}>
            <div className="modal-heading">
              <div>
                <div className="modal-kicker">{createdKey ? 'KEY CREATED' : 'NEW API KEY'}</div>
                <h2 style={{ fontFamily: 'Manrope', fontSize: 17, margin: '6px 0 0' }}>
                  {createdKey ? 'Copy your API key' : 'Create an API key'}
                </h2>
              </div>
              <button type="button" className="icon-button" onClick={closeModal} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            {createdKey ? (
              <>
                <SecretCopyBox
                  label="API KEY"
                  value={createdKey}
                  hint="You won't see this again — store it somewhere safe. If you lose it, revoke this key and create another."
                />
                <div className="modal-actions" style={{ marginTop: 8 }}>
                  <button type="button" className="button button-primary" onClick={closeModal}>
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="settings-field" style={{ maxWidth: 'none' }}>
                  Key name *
                  <input
                    required
                    placeholder="e.g. Warehouse sync script"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                  />
                  <small>Give it a name you&apos;ll recognise in this list.</small>
                </div>

                <div className="settings-field" style={{ maxWidth: 'none' }}>
                  Expires in (days) <span className="optional">(optional)</span>
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    placeholder="Leave blank for no expiry"
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(e.target.value)}
                  />
                  <small>Between 1 and 3650 days. Revocable at any time.</small>
                </div>

                {formError && (
                  <div
                    className="auth-message"
                    style={{ background: '#fdeef0', borderColor: '#f6d3d9', color: '#a4404f' }}
                  >
                    {formError}
                  </div>
                )}

                <div className="modal-actions" style={{ marginTop: 8 }}>
                  <button type="button" className="button button-secondary" onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="submit" className="button button-primary" disabled={saving}>
                    {saving ? 'Creating…' : 'Create key'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Webhooks tab                                                        */
/* ------------------------------------------------------------------ */

function deliveryChip(delivery: WebhookDeliveryRow | WebhookRow['lastDelivery']) {
  if (!delivery) return <span style={{ color: '#a49bad', fontSize: 10 }}>No deliveries yet</span>
  if (delivery.status === 'SUCCESS') {
    return (
      <span className="status status-healthy">
        <i /> Success{delivery.responseStatus ? ` · ${delivery.responseStatus}` : ''}
      </span>
    )
  }
  if (delivery.status === 'FAILED') {
    return (
      <span className="status status-rejected">
        <i /> Failed{delivery.responseStatus ? ` · ${delivery.responseStatus}` : ''}
      </span>
    )
  }
  return (
    <span className="status status-pending">
      <i /> Pending
    </span>
  )
}

function WebhooksTab({ canManage, notify }: { canManage: boolean; notify: (msg: string) => void }) {
  const [hooks, setHooks] = useState<WebhookRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // create/edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<WebhookRow | null>(null)
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)

  // per-row state
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deliveries, setDeliveries] = useState<Record<string, WebhookDeliveryRow[]>>({})
  const [deliveriesLoading, setDeliveriesLoading] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)

  const fetchHooks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<WebhookRow[]>('/api/webhooks')
      if (!res.success) throw new Error(res.error || 'Failed to fetch webhooks')
      setHooks(res.data || [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load webhooks')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHooks()
  }, [fetchHooks])

  const openCreate = () => {
    setEditing(null)
    setUrl('')
    setDescription('')
    setSelectedEvents(['transfer.created', 'transfer.submitted', 'transfer.approved'])
    setFormError('')
    setCreatedSecret(null)
    setModalOpen(true)
  }

  const openEdit = (hook: WebhookRow) => {
    setEditing(hook)
    setUrl(hook.url)
    setDescription(hook.description || '')
    setSelectedEvents(hook.events)
    setFormError('')
    setCreatedSecret(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
    setCreatedSecret(null)
  }

  const toggleEvent = (value: string) => {
    setSelectedEvents((prev) =>
      prev.includes(value) ? prev.filter((e) => e !== value) : [...prev, value]
    )
  }

  const saveWebhook = async (e: FormEvent) => {
    e.preventDefault()
    if (selectedEvents.length === 0) {
      setFormError('Choose at least one event.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const payload = { url, events: selectedEvents, description: description || undefined }
      const res = editing
        ? await apiFetch<WebhookRow>(`/api/webhooks/${editing._id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiFetch<{ webhook: WebhookRow; secret: string }>('/api/webhooks', {
            method: 'POST',
            body: JSON.stringify(payload),
          })
      if (!res.success) {
        const details = res.details as Record<string, string[]> | undefined
        setFormError(
          details
            ? Object.values(details).flat()[0] || res.error || 'Failed to save webhook'
            : res.error || 'Failed to save webhook'
        )
        return
      }
      if (!editing && res.data && 'secret' in res.data) {
        setCreatedSecret((res.data as { secret: string }).secret)
      } else {
        setModalOpen(false)
        notify('Webhook updated')
      }
      fetchHooks()
    } catch {
      setFormError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (hook: WebhookRow) => {
    const ok = window.confirm(`Delete the webhook for ${hook.url}? Its delivery history goes too.`)
    if (!ok) return
    const res = await apiFetch(`/api/webhooks/${hook._id}`, { method: 'DELETE' })
    if (!res.success) {
      notify(res.error || 'Could not delete webhook')
      return
    }
    notify('Webhook deleted')
    fetchHooks()
  }

  const toggleActive = async (hook: WebhookRow) => {
    const res = await apiFetch<WebhookRow>(`/api/webhooks/${hook._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !hook.isActive }),
    })
    if (!res.success) {
      notify(res.error || 'Could not update webhook')
      return
    }
    notify(hook.isActive ? 'Webhook paused' : 'Webhook activated')
    fetchHooks()
  }

  const sendTest = async (hook: WebhookRow) => {
    setTesting(hook._id)
    try {
      const res = await apiFetch<{ delivery: WebhookDeliveryRow }>(`/api/webhooks/${hook._id}/test`, {
        method: 'POST',
      })
      const delivery = res.data?.delivery
      if (!res.success || !delivery) {
        notify(res.error || 'Test delivery failed')
        return
      }
      notify(
        delivery.status === 'SUCCESS'
          ? `Test delivered — HTTP ${delivery.responseStatus ?? 200}`
          : `Test failed — ${delivery.error || `HTTP ${delivery.responseStatus ?? 'no response'}`}`
      )
      fetchHooks()
      if (expanded === hook._id) loadDeliveries(hook._id)
    } finally {
      setTesting(null)
    }
  }

  const loadDeliveries = async (hookId: string) => {
    setDeliveriesLoading(hookId)
    try {
      const res = await apiFetch<WebhookDeliveryRow[]>(`/api/webhooks/${hookId}/deliveries`)
      if (res.success) {
        setDeliveries((prev) => ({ ...prev, [hookId]: res.data || [] }))
      }
    } finally {
      setDeliveriesLoading(null)
    }
  }

  const toggleDeliveries = (hook: WebhookRow) => {
    if (expanded === hook._id) {
      setExpanded(null)
      return
    }
    setExpanded(hook._id)
    loadDeliveries(hook._id)
  }

  const activeCount = hooks.filter((h) => h.isActive).length
  const deliveredTotal = hooks.reduce((sum, h) => sum + (h.stats?.delivered || 0), 0)
  const failedTotal = hooks.reduce((sum, h) => sum + (h.stats?.failed || 0), 0)

  return (
    <>
      <section className="panel" style={{ padding: 20, marginBottom: 16 }}>
        <div className="panel-heading" style={{ marginBottom: 10 }}>
          <h2>Outgoing webhooks</h2>
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.8, margin: 0 }}>
          Every matching event POSTs a JSON body to your endpoint, signed with HMAC-SHA256 so you
          can verify it. Check the <code style={{ color: '#7358e8' }}>X-Ricoz-Signature</code>{' '}
          header (<code style={{ color: '#7358e8' }}>sha256=…</code>) against your{' '}
          <code style={{ color: '#7358e8' }}>whsec_…</code> secret — it&apos;s shown once at
          creation. Failed deliveries retry nothing; they&apos;re logged below for inspection.
        </p>
      </section>

      <div className="metric-grid compact-metrics">
        <Metric label="Endpoints" value={hooks.length} icon={PlugZap} detail={`${activeCount} active`} />
        <Metric label="Delivered" value={deliveredTotal} icon={Send} tone="mint" detail="all time" />
        <Metric label="Failed" value={failedTotal} icon={AlertCircle} tone="orange" detail="all time" />
        <Metric label="Events" value={WEBHOOK_EVENTS.length} icon={RefreshCw} tone="blue" detail="subscribable" />
      </div>

      <section className="panel table-panel inventory-table-panel" style={{ marginBottom: 18 }}>
        <div className="inventory-toolbar">
          <div className="table-tabs">
            <button className="selected">
              <PlugZap size={13} /> Webhooks
              <span className="tab-count">{hooks.length}</span>
            </button>
          </div>
          <div className="table-tools">
            <button className="button button-secondary" onClick={fetchHooks} aria-label="Refresh">
              <RefreshCw size={14} /> Refresh
            </button>
            {canManage && (
              <button className="button button-primary" onClick={openCreate}>
                <Plus size={15} /> New webhook
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="data-disclaimer" style={{ padding: '0 20px' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <div className="table-scroll">
          {loading ? (
            <div className="empty-state">Loading webhooks…</div>
          ) : hooks.length === 0 ? (
            <EmptyState
              icon={PlugZap}
              title="No webhooks configured"
              hint={
                canManage
                  ? 'Point Ricoz at your endpoint to hear about transfers, products, and stock changes.'
                  : 'An admin can add webhooks from this page.'
              }
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Endpoint</th>
                  <th>Events</th>
                  <th>Delivered</th>
                  <th>Failed</th>
                  <th>Last triggered</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {hooks.map((hook) => (
                  <Fragment key={hook._id}>
                    <tr>
                      <td>
                        <div className="product-cell" style={{ color: 'inherit' }}>
                          <span className="product-thumbnail">
                            <PlugZap size={17} />
                          </span>
                          <span>
                            <b style={{ wordBreak: 'break-all' }}>{hook.url}</b>
                            <small>{hook.description || 'No description'}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 220 }}>
                          {hook.events.map((ev) => (
                            <span
                              key={ev}
                              style={{
                                background: '#f0ecff',
                                color: '#6f54db',
                                borderRadius: 5,
                                padding: '3px 6px',
                                fontSize: 8,
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {ev}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="value-cell">{hook.stats?.delivered ?? 0}</td>
                      <td className="value-cell">{hook.stats?.failed ?? 0}</td>
                      <td>{formatDateTime(hook.stats?.lastTriggeredAt)}</td>
                      <td>
                        <div style={{ display: 'grid', gap: 5, justifyItems: 'start' }}>
                          {hook.isActive ? (
                            <span className="status status-healthy">
                              <i /> Active
                            </span>
                          ) : (
                            <span className="status status-cancelled">
                              <i /> Paused
                            </span>
                          )}
                          {deliveryChip(hook.lastDelivery)}
                        </div>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', gap: 9, alignItems: 'center' }}>
                          {canManage && (
                            <button
                              className="subtle-link"
                              onClick={() => sendTest(hook)}
                              disabled={testing === hook._id}
                            >
                              <Send size={12} />{' '}
                              {testing === hook._id ? 'Sending…' : 'Test'}
                            </button>
                          )}
                          <button className="subtle-link" onClick={() => toggleDeliveries(hook)}>
                            {expanded === hook._id ? 'Hide log' : 'Log'}
                          </button>
                          {canManage && (
                            <button className="subtle-link" onClick={() => openEdit(hook)}>
                              <Pencil size={12} /> Edit
                            </button>
                          )}
                          {canManage && (
                            <button
                              className="subtle-link"
                              onClick={() => toggleActive(hook)}
                              aria-label={hook.isActive ? 'Pause webhook' : 'Activate webhook'}
                            >
                              {hook.isActive ? 'Pause' : 'Resume'}
                            </button>
                          )}
                          {canManage && (
                            <button className="reject-button" onClick={() => remove(hook)}>
                              <Trash2 size={12} />
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                    {expanded === hook._id && (
                      <tr>
                        <td colSpan={7} style={{ background: '#fbfaff', padding: '14px 20px' }}>
                          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2, color: '#8069dc', marginBottom: 10 }}>
                            RECENT DELIVERIES
                          </div>
                          {deliveriesLoading === hook._id ? (
                            <div className="empty-state" style={{ minHeight: 70 }}>
                              Loading deliveries…
                            </div>
                          ) : (deliveries[hook._id] || []).length === 0 ? (
                            <div className="empty-state" style={{ minHeight: 70 }}>
                              No deliveries recorded yet.
                            </div>
                          ) : (
                            <div style={{ display: 'grid', gap: 7 }}>
                              {(deliveries[hook._id] || []).map((d) => (
                                <div
                                  key={d._id}
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: '150px 110px 80px 1fr',
                                    gap: 10,
                                    alignItems: 'center',
                                    border: '1px solid #f0edf7',
                                    background: '#fff',
                                    borderRadius: 7,
                                    padding: '8px 11px',
                                    fontSize: 10,
                                  }}
                                >
                                  <code style={{ color: '#7358e8', fontFamily: 'ui-monospace, monospace' }}>
                                    {d.event}
                                  </code>
                                  <span>{formatDateTime(d.createdAt)}</span>
                                  <span>
                                    {d.durationMs != null ? `${d.durationMs}ms` : '—'}
                                  </span>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {deliveryChip(d)}
                                    {d.error && (
                                      <span style={{ color: '#a4404f', fontSize: 9 }}>{d.error}</span>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {modalOpen && (
        <div className="modal-backdrop" onClick={() => !saving && closeModal()}>
          <form className="create-modal" onClick={(e) => e.stopPropagation()} onSubmit={saveWebhook}>
            <div className="modal-heading">
              <div>
                <div className="modal-kicker">
                  {createdSecret ? 'WEBHOOK CREATED' : editing ? 'EDIT WEBHOOK' : 'NEW WEBHOOK'}
                </div>
                <h2 style={{ fontFamily: 'Manrope', fontSize: 17, margin: '6px 0 0' }}>
                  {createdSecret ? 'Copy your signing secret' : editing ? 'Edit webhook' : 'Add a webhook'}
                </h2>
              </div>
              <button type="button" className="icon-button" onClick={closeModal} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            {createdSecret ? (
              <>
                <SecretCopyBox
                  label="SIGNING SECRET"
                  value={createdSecret}
                  hint="You won't see this again — store it in your endpoint's environment. Use it to verify the X-Ricoz-Signature header on every delivery."
                />
                <div className="modal-actions" style={{ marginTop: 8 }}>
                  <button type="button" className="button button-primary" onClick={closeModal}>
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="settings-field" style={{ maxWidth: 'none' }}>
                  Endpoint URL *
                  <input
                    required
                    type="url"
                    placeholder="https://example.com/hooks/ricoz"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    maxLength={500}
                  />
                  <small>We POST a signed JSON body to this URL.</small>
                </div>

                <div className="settings-field" style={{ maxWidth: 'none' }}>
                  Description <span className="optional">(optional)</span>
                  <input
                    placeholder="What listens to these events?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={500}
                  />
                </div>

                <div style={{ margin: '4px 0 12px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#57516a' }}>
                      Events * ({selectedEvents.length} selected)
                    </span>
                    <button
                      type="button"
                      className="subtle-link"
                      onClick={() =>
                        setSelectedEvents(
                          selectedEvents.length === WEBHOOK_EVENTS.length
                            ? []
                            : WEBHOOK_EVENTS.map((e) => e.value)
                        )
                      }
                    >
                      {selectedEvents.length === WEBHOOK_EVENTS.length ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {WEBHOOK_EVENTS.map((event) => {
                      const checked = selectedEvents.includes(event.value)
                      return (
                        <label
                          key={event.value}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            border: '1px solid #eceaf3',
                            borderRadius: 7,
                            padding: '8px 10px',
                            fontSize: 10,
                            color: checked ? '#5b45c4' : '#777188',
                            background: checked ? '#f7f4ff' : '#fff',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleEvent(event.value)}
                            style={{ accentColor: '#7c61e7' }}
                          />
                          <span style={{ minWidth: 0 }}>
                            <b style={{ display: 'block', fontSize: 10 }}>{event.label}</b>
                            <code style={{ fontSize: 8, color: '#a49bad' }}>{event.value}</code>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                {formError && (
                  <div
                    className="auth-message"
                    style={{ background: '#fdeef0', borderColor: '#f6d3d9', color: '#a4404f' }}
                  >
                    {formError}
                  </div>
                )}

                <div className="modal-actions" style={{ marginTop: 8 }}>
                  <button type="button" className="button button-secondary" onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="submit" className="button button-primary" disabled={saving}>
                    {saving ? 'Saving…' : editing ? 'Save changes' : 'Create webhook'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function IntegrationsPage() {
  const { status } = useSession()
  const [tab, setTab] = useState<Tab>('keys')
  const [toast, setToast] = useState('')

  const canRead = useCan('integrations:read')
  const canManage = useCan('integrations:manage')

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3500)
  }

  if (status === 'loading') {
    return <div className="empty-state" style={{ minHeight: 260 }}>Checking your permissions…</div>
  }

  if (!canRead) {
    return (
      <>
        <PageHeading
          eyebrow="PERMISSION REQUIRED"
          title="Integrations"
          subtitle="API keys and webhooks are limited to workspace admins."
        />
        <div
          className="panel"
          style={{ padding: 28, display: 'grid', gap: 11, justifyItems: 'center', textAlign: 'center' }}
        >
          <ShieldAlert size={26} style={{ color: '#d5556a' }} />
          <b style={{ fontSize: 13 }}>Your role can&apos;t manage integrations</b>
          <p style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 400, lineHeight: 1.7, margin: 0 }}>
            Ask a workspace admin for the Admin role if you need API keys or webhooks. You can still
            work with products, inventory, and transfers as usual.
          </p>
          <Link href="/dashboard" className="button button-secondary">
            Back to dashboard
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeading
        eyebrow="DEVELOPER PLATFORM"
        title="Integrations"
        subtitle="Connect Ricoz to your scripts and systems with API keys and webhooks."
      />

      <div className="panel" style={{ padding: 6, display: 'flex', gap: 4, marginBottom: 16 }}>
        <button
          className={tab === 'keys' ? 'selected' : ''}
          onClick={() => setTab('keys')}
          style={{
            flex: 1,
            border: 0,
            borderRadius: 8,
            padding: '11px 13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 11,
            fontWeight: 700,
            background: tab === 'keys' ? '#f0ecff' : 'transparent',
            color: tab === 'keys' ? '#6f54db' : '#898498',
            cursor: 'pointer',
          }}
        >
          <KeyRound size={14} /> API keys
        </button>
        <button
          className={tab === 'webhooks' ? 'selected' : ''}
          onClick={() => setTab('webhooks')}
          style={{
            flex: 1,
            border: 0,
            borderRadius: 8,
            padding: '11px 13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 11,
            fontWeight: 700,
            background: tab === 'webhooks' ? '#f0ecff' : 'transparent',
            color: tab === 'webhooks' ? '#6f54db' : '#898498',
            cursor: 'pointer',
          }}
        >
          <PlugZap size={14} /> Webhooks
        </button>
      </div>

      {tab === 'keys' ? (
        <ApiKeysTab canManage={canManage} notify={notify} />
      ) : (
        <WebhooksTab canManage={canManage} notify={notify} />
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </>
  )
}
export const dynamic = 'force-dynamic'
