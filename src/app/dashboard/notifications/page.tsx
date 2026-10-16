'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  CheckCheck,
  CheckCircle2,
  CircleAlert,
  MessageSquare,
  RefreshCw,
  Truck,
  UserPlus,
} from 'lucide-react'
import { PageHeading, Metric, EmptyState, Toast } from '@/components/redesign/ui'
import { apiFetch } from '@/lib/api'

interface NotificationItem {
  _id: string
  event: string
  title: string
  body?: string
  link?: string
  readAt: string | null
  actorUser: { _id: string; name: string } | null
  createdAt: string
}

type Filter = 'all' | 'unread'

/**
 * `apiFetch` JSON-stringifies plain-object bodies at runtime, but its options
 * are typed as `RequestInit` whose `body` is a `BodyInit` union — cast past it.
 */
const jsonBody = (value: unknown): BodyInit => value as unknown as BodyInit

/** Icon per event family — unknown events fall back to the bell. */
const EVENT_ICON: Record<string, React.ElementType> = {
  TRANSFER_SUBMITTED: ArrowLeftRight,
  TRANSFER_APPROVED: CheckCircle2,
  TRANSFER_REJECTED: CircleAlert,
  TRANSFER_DISPATCHED: Truck,
  TRANSFER_RECEIVED: Truck,
  TRANSFER_DISPATCH: Truck,
  TRANSFER_RECEIVE: Truck,
  TRANSFER_COMMENT: MessageSquare,
  LOW_STOCK: AlertTriangle,
  REPLENISHMENT: AlertTriangle,
  INVITE: UserPlus,
}

const iconFor = (event: string) => EVENT_ICON[event] || Bell

/** Relative timestamp — mirrors the activity page helper. */
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

export default function NotificationsPage() {
  const router = useRouter()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (filter === 'unread') params.set('unreadOnly', '1')
      const res = await apiFetch<NotificationItem[]>(`/api/notifications?${params.toString()}`)
      if (!res.success) throw new Error(res.error || 'Failed to load notifications')
      setItems(res.data ?? [])
      setUnreadCount(typeof res.unreadCount === 'number' ? res.unreadCount : 0)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  const openItem = async (item: NotificationItem) => {
    if (!item.readAt) {
      try {
        const res = await apiFetch<{ updated: number }>('/api/notifications', {
          method: 'PATCH',
          body: jsonBody({ read: true, ids: [item._id] }),
        })
        if (res.success) {
          if (typeof res.unreadCount === 'number') setUnreadCount(res.unreadCount)
          setItems((prev) => prev.map((n) => (n._id === item._id ? { ...n, readAt: new Date().toISOString() } : n)))
        }
      } catch {
        // Navigation still works if marking read fails.
      }
    }
    if (item.link) router.push(item.link)
  }

  const markAllRead = async () => {
    if (unreadCount === 0 || busy) return
    setBusy(true)
    try {
      const res = await apiFetch<{ updated: number }>('/api/notifications', {
        method: 'PATCH',
        body: jsonBody({ read: true, all: true }),
      })
      if (!res.success) throw new Error(res.error || 'Failed to mark notifications as read')
      notify('All notifications marked as read')
      await load()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to mark notifications as read')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="STAY IN THE LOOP"
        title="Notifications"
        subtitle="Everything that needs your attention, in one place."
      />

      <div className="metric-grid compact-metrics">
        <Metric
          label="Unread"
          value={unreadCount}
          icon={Bell}
          detail={unreadCount === 1 ? 'notification waiting for you' : 'notifications waiting for you'}
        />
      </div>

      <section className="panel table-panel">
        <div className="inventory-toolbar">
          <div className="table-tabs">
            <button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>
              All
            </button>
            <button className={filter === 'unread' ? 'selected' : ''} onClick={() => setFilter('unread')}>
              Unread
            </button>
          </div>
          <div className="table-tools" style={{ display: 'flex', gap: 8 }}>
            <button
              className="button button-secondary button-small"
              onClick={markAllRead}
              disabled={unreadCount === 0 || busy}
              title={unreadCount === 0 ? 'No unread notifications' : 'Mark every notification as read'}
            >
              <CheckCheck size={14} /> {busy ? 'Working…' : 'Mark all read'}
            </button>
            <button className="button button-secondary button-small" onClick={load} disabled={loading}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="data-disclaimer" style={{ padding: '0 20px' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <div>
          {loading ? (
            <div>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="animate-pulse"
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    padding: '15px 20px',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--line)', flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', height: 10, width: '45%', background: 'var(--line)', borderRadius: 5, marginBottom: 8 }} />
                    <span style={{ display: 'block', height: 8, width: '70%', background: 'var(--line)', borderRadius: 4 }} />
                  </span>
                </div>
              ))}
            </div>
          ) : error && items.length === 0 ? (
            <div className="empty-state">
              <AlertCircle size={24} />
              <b>Could not load notifications</b>
              <p>{error}</p>
              <button className="button button-secondary button-small" onClick={load}>
                Retry
              </button>
            </div>
          ) : items.length === 0 ? (
            filter === 'unread' ? (
              <EmptyState
                icon={CheckCircle2}
                title="You're all caught up"
                hint="No unread notifications — switch to All to review what you've seen."
              />
            ) : (
              <EmptyState
                icon={Bell}
                title="No notifications yet"
                hint="Mentions, approvals and stock alerts will show up here."
              />
            )
          ) : (
            items.map((item) => {
              const Icon = iconFor(item.event)
              const unread = !item.readAt
              return (
                <button
                  key={item._id}
                  onClick={() => openItem(item)}
                  style={{
                    display: 'flex',
                    gap: 12,
                    width: '100%',
                    textAlign: 'left',
                    alignItems: 'flex-start',
                    padding: '15px 20px',
                    background: unread ? 'var(--violet-soft)' : 'transparent',
                    border: 0,
                    borderBottom: '1px solid var(--line)',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      background: unread ? '#7c5cff' : 'var(--line)',
                      color: unread ? '#fff' : 'var(--muted)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                    aria-hidden
                  >
                    <Icon size={16} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        fontSize: 13,
                        fontFamily: 'Manrope, sans-serif',
                      }}
                    >
                      {unread && (
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: '#7c5cff',
                            display: 'inline-block',
                            flexShrink: 0,
                          }}
                          aria-label="Unread"
                        />
                      )}
                      {item.title}
                    </b>
                    {item.body && (
                      <span
                        style={{
                          display: 'block',
                          fontSize: 12,
                          color: 'var(--muted)',
                          marginTop: 3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.body}
                      </span>
                    )}
                    <small style={{ display: 'block', fontSize: 10, color: 'var(--muted)', marginTop: 5 }}>
                      {timeAgo(item.createdAt)}
                      {item.actorUser?.name ? ` · ${item.actorUser.name}` : ''}
                      {item.link ? ' · click to open' : ''}
                    </small>
                  </span>
                </button>
              )
            })
          )}
        </div>
      </section>

      <Toast message={toast} onClose={() => setToast('')} />
    </>
  )
}
export const dynamic = 'force-dynamic'
