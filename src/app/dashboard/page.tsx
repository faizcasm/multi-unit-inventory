'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  ClipboardCheck,
  Download,
  Package,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  Warehouse,
  X,
} from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { PageHeading, Metric, Status, Toast } from '@/components/redesign/ui'
import { useCan } from '@/hooks/useCan'
import { apiFetch } from '@/lib/api'
import { defaultWidgets, isFullWidthWidget, mergeWidgets, widgetLabel, type WidgetPref } from './widget-catalog'

interface Stats {
  activeProducts: number
  activeLocations: number
  totalAvailableStock: number
  totalReservedStock: number
  totalInTransitStock: number
  totalDamagedStock: number
  lowStockItems: number
  outOfStockItems: number
  pendingApprovals: number
  inTransitTransfers: number
  completedTransfersThisMonth: number
  recentMovements: number
}
interface Charts {
  transferVolume: { period: string; created: number; completed: number; inTransit: number }[]
  inventoryByLocation: { location: string; available: number; reserved: number; inTransit: number; damaged: number }[]
  lowStockProducts: { productName: string; sku: string; available: number }[]
  movementActivity: { date: string; dispatches: number; receipts: number; adjustments: number; discrepancies: number }[]
}
interface RecentTransfer {
  _id: string
  reference: string
  sourceLocation: { name: string }
  destinationLocation: { name: string }
  status: string
  createdAt: string
}
interface OnboardingStep {
  key: string
  label: string
  done: boolean
  href: string
  cta: string
}
interface Onboarding {
  dismissed: boolean
  complete: boolean
  steps: OnboardingStep[]
}

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [charts, setCharts] = useState<Charts | null>(null)
  const [recent, setRecent] = useState<RecentTransfer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Widget personalization (effective list = saved prefs merged with defaults)
  const [widgets, setWidgets] = useState<WidgetPref[]>(defaultWidgets)
  const [customizeOpen, setCustomizeOpen] = useState(false)

  // Onboarding checklist + demo data
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null)
  const [emptyWorkspace, setEmptyWorkspace] = useState(false)
  const [seeding, setSeeding] = useState(false)

  const [toast, setToast] = useState('')

  const canCreateTransfer = useCan('transfers:create')
  const canCreateLocation = useCan('locations:create')
  const canCreateProduct = useCan('products:create')
  const canSeedDemo = canCreateLocation && canCreateProduct

  // Debounced "layout saved" machinery
  const lastSavedWidgetsRef = useRef<WidgetPref[]>(defaultWidgets())
  const pendingWidgetsRef = useRef<WidgetPref[] | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3200)
  }

  const persistWidgets = async (payload: WidgetPref[]) => {
    const res = await apiFetch('/api/settings', {
      method: 'PATCH',
      body: {
        userPreferences: {
          widgets: payload.map(({ id, visible, order }) => ({ id, visible, order })),
        },
      },
    })
    if (!res.success) throw new Error(res.error || 'Failed to save layout')
  }

  const flushWidgetSave = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const payload = pendingWidgetsRef.current
    if (!payload) return
    pendingWidgetsRef.current = null
    try {
      await persistWidgets(payload)
      lastSavedWidgetsRef.current = payload
      notify('Layout saved')
    } catch (err) {
      // Revert to the last known-good layout
      setWidgets(lastSavedWidgetsRef.current)
      notify(err instanceof Error ? err.message : 'Failed to save layout')
    }
  }

  const scheduleWidgetSave = (next: WidgetPref[]) => {
    setWidgets(next)
    pendingWidgetsRef.current = next
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void flushWidgetSave()
    }, 500)
  }

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const response = await fetch('/api/dashboard')
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Failed to fetch dashboard')
        setStats(data.data.stats)
        setCharts(data.data.charts)
        const prefs = data.data.preferences ?? data.preferences
        if (Array.isArray(prefs?.widgets)) {
          const merged = mergeWidgets(prefs.widgets)
          setWidgets(merged)
          lastSavedWidgetsRef.current = merged
        }
        setOnboarding(data.data.onboarding ?? data.onboarding ?? null)
        const isEmpty = data.data.emptyWorkspace ?? data.emptyWorkspace
        if (typeof isEmpty === 'boolean') setEmptyWorkspace(isEmpty)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    }
    fetchDashboard()
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      // Fire-and-forget any debounced layout save still pending on unmount.
      const pending = pendingWidgetsRef.current
      if (pending) {
        pendingWidgetsRef.current = null
        void apiFetch('/api/settings', {
          method: 'PATCH',
          body: { userPreferences: { widgets: pending.map(({ id, visible, order }) => ({ id, visible, order })) } },
        }).catch(() => {})
      }
    }
  }, [])

  useEffect(() => {
    const fetchRecent = async () => {
      try {
        const response = await fetch('/api/transfers?limit=4')
        const data = await response.json()
        if (response.ok) setRecent((data.data || []).slice(0, 4))
      } catch {}
    }
    fetchRecent()
  }, [])

  const toggleWidget = (id: string) => {
    scheduleWidgetSave(widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)))
  }

  const moveWidget = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= widgets.length) return
    const next = [...widgets]
    ;[next[index], next[target]] = [next[target], next[index]]
    scheduleWidgetSave(next.map((w, i) => ({ ...w, order: i })))
  }

  const resetWidgets = () => scheduleWidgetSave(defaultWidgets())

  const toggleCustomize = () => {
    if (customizeOpen) {
      // Persist any pending change when the panel closes
      void flushWidgetSave()
    }
    setCustomizeOpen((open) => !open)
  }

  const dismissOnboarding = async () => {
    const res = await apiFetch('/api/settings', {
      method: 'PATCH',
      body: { userPreferences: { onboardingDismissed: true } },
    })
    if (res.success) {
      setOnboarding((prev) => (prev ? { ...prev, dismissed: true } : prev))
      notify('Checklist hidden')
    } else {
      notify(res.error || 'Failed to hide checklist')
    }
  }

  const loadDemoData = async () => {
    if (!window.confirm('Create demo locations, products, stock and transfers in this workspace?')) return
    setSeeding(true)
    try {
      const res = await apiFetch('/api/demo-seed', { method: 'POST' })
      if (!res.success) throw new Error(res.error || 'Failed to create demo data')
      notify('Demo workspace created')
      window.setTimeout(() => window.location.reload(), 700)
    } catch (err) {
      // 409 ("Workspace already has data") and friends land here
      notify(err instanceof Error ? err.message : 'Failed to create demo data')
    } finally {
      setSeeding(false)
    }
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  if (error) {
    return (
      <>
        <PageHeading eyebrow="WORKSPACE OVERVIEW" title="Overview" subtitle="Here's what's happening across your inventory today." />
        <section className="panel" style={{ padding: 24 }}>
          <div className="empty-state">
            <AlertCircle size={24} />
            <b>Could not load the dashboard</b>
            <p>{error}</p>
            <button className="button button-primary button-small" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        </section>
      </>
    )
  }

  const visibleWidgets = widgets.filter((w) => w.visible)
  const showChecklist = !!onboarding && !onboarding.dismissed && !onboarding.complete
  const showCelebration = !!onboarding && !onboarding.dismissed && onboarding.complete
  const showChecklistCard = showChecklist || showCelebration
  const doneSteps = onboarding?.steps.filter((s) => s.done).length ?? 0
  const totalSteps = onboarding?.steps.length ?? 5

  /** Each widget is wrapped so hidden ones simply disappear from the grid. */
  const renderWidget = (id: string) => {
    switch (id) {
      case 'metrics':
        return (
          <div className="metric-grid">
            <Metric
              label="Active products"
              value={loading ? '—' : stats?.activeProducts ?? 0}
              icon={Package}
              detail="in your catalog"
            />
            <Metric
              label="Stock on hand"
              value={loading ? '—' : (stats?.totalAvailableStock ?? 0).toLocaleString()}
              icon={Boxes}
              tone="mint"
              detail={`across ${stats?.activeLocations ?? 0} locations`}
            />
            <Metric
              label="In transit"
              value={loading ? '—' : stats?.inTransitTransfers ?? 0}
              icon={Truck}
              tone="blue"
              detail="transfers on the move"
            />
            <Metric
              label="Low stock items"
              value={loading ? '—' : stats?.lowStockItems ?? 0}
              icon={AlertCircle}
              tone="orange"
              detail="need a replenishment check"
            />
          </div>
        )
      case 'transfer-volume':
        return (
          <section className="panel movement-panel">
            <div className="panel-heading">
              <div>
                <h2>Transfer volume</h2>
                <p>Created, completed, and in-transit transfers</p>
              </div>
            </div>
            <div style={{ height: 260, marginTop: 8 }}>
              {charts?.transferVolume && charts.transferVolume.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={charts.transferVolume}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="period" fontSize={11} stroke="var(--muted)" />
                    <YAxis fontSize={11} stroke="var(--muted)" />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="created" stroke="#8066ed" name="Created" strokeWidth={2} />
                    <Line type="monotone" dataKey="completed" stroke="#23835c" name="Completed" strokeWidth={2} />
                    <Line type="monotone" dataKey="inTransit" stroke="#3f6fbe" name="In Transit" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state">No transfer activity yet</div>
              )}
            </div>
          </section>
        )
      case 'inventory-by-location':
        return (
          <section className="panel table-panel">
            <div className="panel-heading">
              <div>
                <h2>Inventory by location</h2>
                <p>Stock distribution across your network</p>
              </div>
              <Link href="/dashboard/reports" className="subtle-link">
                View reports <ArrowRight size={14} />
              </Link>
            </div>
            <div style={{ height: 260, padding: '0 20px 20px' }}>
              {charts?.inventoryByLocation && charts.inventoryByLocation.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.inventoryByLocation}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="location" fontSize={11} stroke="var(--muted)" />
                    <YAxis fontSize={11} stroke="var(--muted)" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="available" fill="#23835c" name="Available" stackId="a" />
                    <Bar dataKey="reserved" fill="#3f6fbe" name="Reserved" stackId="a" />
                    <Bar dataKey="inTransit" fill="#7358e8" name="In Transit" stackId="a" />
                    <Bar dataKey="damaged" fill="#c55c50" name="Damaged" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state">No inventory recorded yet</div>
              )}
            </div>
          </section>
        )
      case 'movement-activity':
        return (
          <section className="panel table-panel">
            <div className="panel-heading">
              <div>
                <h2>Movement activity</h2>
                <p>Dispatches, receipts and adjustments over the last 14 days</p>
              </div>
            </div>
            <div style={{ height: 260, padding: '0 20px 20px' }}>
              {charts?.movementActivity && charts.movementActivity.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.movementActivity}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="date" fontSize={11} stroke="var(--muted)" />
                    <YAxis fontSize={11} stroke="var(--muted)" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="dispatches" fill="#3f6fbe" name="Dispatches" />
                    <Bar dataKey="receipts" fill="#23835c" name="Receipts" />
                    <Bar dataKey="adjustments" fill="#8066ed" name="Adjustments" />
                    <Bar dataKey="discrepancies" fill="#c55c50" name="Discrepancies" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state">No movement activity yet</div>
              )}
            </div>
          </section>
        )
      case 'low-stock':
        return (
          <section className="panel table-panel">
            <div className="panel-heading">
              <div>
                <h2>Low stock products</h2>
                <p>Products below reorder threshold</p>
              </div>
              <Link href="/dashboard/inventory" className="subtle-link">
                Open inventory <ArrowRight size={14} />
              </Link>
            </div>
            {charts?.lowStockProducts && charts.lowStockProducts.length > 0 ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Available</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {charts.lowStockProducts.slice(0, 6).map((p, i) => (
                      <tr key={i}>
                        <td>
                          <b>{p.productName || p.sku}</b>
                        </td>
                        <td>
                          <span className="transfer-id">{p.sku}</span>
                        </td>
                        <td>
                          <b className="stock-number">{p.available}</b>
                        </td>
                        <td>
                          <Status value={p.available === 0 ? 'Out of stock' : 'Low stock'} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <CheckCircle2 size={24} />
                <b>Everything is stocked</b>
                <p>No products are below their reorder point.</p>
              </div>
            )}
          </section>
        )
      case 'recent-transfers':
        return (
          <section className="panel table-panel">
            <div className="panel-heading">
              <div>
                <h2>Recent transfers</h2>
                <p>Track the latest stock movements</p>
              </div>
              <Link href="/dashboard/transfers" className="subtle-link">
                View all <ArrowRight size={14} />
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="empty-state">
                <Truck size={24} />
                <b>No transfers yet</b>
                <p>Create your first transfer to get started.</p>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Transfer</th>
                      <th>Route</th>
                      <th>Status</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((t) => (
                      <tr key={t._id}>
                        <td>
                          <b className="transfer-id">{t.reference}</b>
                        </td>
                        <td>
                          <div className="route-cell">
                            <span>{t.sourceLocation?.name}</span>
                            <ArrowRight size={13} />
                            <span>{t.destinationLocation?.name}</span>
                          </div>
                        </td>
                        <td>
                          <Status value={t.status} />
                        </td>
                        <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      default:
        return null
    }
  }

  return (
    <>
      <PageHeading
        eyebrow={today.toUpperCase()}
        title={`${greeting()}${stats ? '' : ''}`}
        subtitle="Here's what's happening across your inventory today."
        action={
          <>
            <button className="button button-secondary button-small" onClick={toggleCustomize} aria-expanded={customizeOpen}>
              <SlidersHorizontal size={14} /> Customize
            </button>
            <button className="button button-secondary" onClick={() => window.location.reload()}>
              <Download size={15} /> Refresh
            </button>
            {canCreateTransfer && (
              <Link href="/dashboard/transfers/new" className="button button-primary">
                <Plus size={16} /> New transfer
              </Link>
            )}
          </>
        }
      />

      {customizeOpen && (
        <section className="panel" style={{ padding: 18, marginBottom: 18 }}>
          <div className="panel-heading" style={{ padding: 0 }}>
            <div>
              <h2>Customize your dashboard</h2>
              <p>Show, hide and reorder the widgets on this page</p>
            </div>
            <button className="button button-secondary button-small" onClick={resetWidgets}>
              Reset to defaults
            </button>
          </div>
          <div style={{ marginTop: 6 }}>
            {widgets.map((w, i) => (
              <div
                key={w.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 0',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <input
                  id={`widget-${w.id}`}
                  type="checkbox"
                  checked={w.visible}
                  onChange={() => toggleWidget(w.id)}
                  style={{ width: 16, height: 16, accentColor: '#7358e8' }}
                />
                <label htmlFor={`widget-${w.id}`} style={{ flex: 1, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  {widgetLabel(w.id)}
                </label>
                <button
                  className="button button-secondary button-small"
                  onClick={() => moveWidget(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${widgetLabel(w.id)} up`}
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  className="button button-secondary button-small"
                  onClick={() => moveWidget(i, 1)}
                  disabled={i === widgets.length - 1}
                  aria-label={`Move ${widgetLabel(w.id)} down`}
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {showChecklist && onboarding && (
        <section className="panel" style={{ padding: 20, marginBottom: 18 }}>
          <div className="panel-heading" style={{ padding: 0 }}>
            <div>
              <h2>Get your workspace ready</h2>
              <p>
                {doneSteps} of {totalSteps} steps complete
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {emptyWorkspace && canSeedDemo && (
                <button className="button button-secondary button-small" onClick={loadDemoData} disabled={seeding}>
                  <Download size={14} /> {seeding ? 'Creating…' : 'Load demo data'}
                </button>
              )}
              <button className="button button-secondary button-small" onClick={dismissOnboarding} aria-label="Dismiss checklist">
                <X size={14} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 4px' }}>
            <div
              role="progressbar"
              aria-valuenow={doneSteps}
              aria-valuemin={0}
              aria-valuemax={totalSteps}
              style={{ flex: 1, height: 8, borderRadius: 99, background: 'var(--line)', overflow: 'hidden' }}
            >
              <div
                style={{
                  width: `${totalSteps ? (doneSteps / totalSteps) * 100 : 0}%`,
                  height: '100%',
                  borderRadius: 99,
                  background: 'linear-gradient(135deg,#8066ed,#6b50df)',
                  transition: 'width .25s ease',
                }}
              />
            </div>
            <b style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
              {doneSteps}/{totalSteps}
            </b>
          </div>

          {onboarding.steps.map((step) => (
            <div
              key={step.key}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: '1px solid var(--line)' }}
            >
              {step.done ? (
                <CheckCircle2 size={17} style={{ color: '#23835c', flexShrink: 0 }} />
              ) : (
                <Circle size={17} style={{ color: '#b2acc2', flexShrink: 0 }} />
              )}
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: 600,
                  ...(step.done ? { color: 'var(--muted)', textDecoration: 'line-through' } : {}),
                }}
              >
                {step.label}
              </span>
              {!step.done && (
                <Link href={step.href} className="button button-secondary button-small" title={step.cta} aria-label={step.cta}>
                  Start
                </Link>
              )}
            </div>
          ))}
        </section>
      )}

      {showCelebration && onboarding && (
        <section
          className="panel"
          style={{
            padding: 20,
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            gap: 13,
            background: 'var(--green-soft, #eaf8f0)',
            borderColor: '#cfeadb',
          }}
        >
          <span
            style={{
              width: 43,
              height: 43,
              borderRadius: 12,
              display: 'grid',
              placeItems: 'center',
              background: '#d8f3e5',
              color: '#23835c',
              flexShrink: 0,
            }}
          >
            <CheckCircle2 size={21} />
          </span>
          <div style={{ flex: 1 }}>
            <b>Workspace ready 🎉</b>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted)' }}>
              All {totalSteps} setup steps are done — you&apos;re ready to go.
            </p>
          </div>
          <button className="button button-secondary button-small" onClick={dismissOnboarding}>
            Hide
          </button>
        </section>
      )}

      {/* Demo-data shortcut for empty workspaces once the checklist is out of the way */}
      {!showChecklistCard && emptyWorkspace && canSeedDemo && (
        <section className="panel" style={{ padding: 16, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 13 }}>Empty workspace</b>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--muted)' }}>
              Seed two locations, six products, stock levels and sample transfers.
            </p>
          </div>
          <button className="button button-secondary button-small" onClick={loadDemoData} disabled={seeding}>
            <Download size={14} /> {seeding ? 'Creating…' : 'Load demo data'}
          </button>
        </section>
      )}

      <div className="dashboard-grid">
        {visibleWidgets.map((w) => (
          <div key={w.id} style={isFullWidthWidget(w.id) ? { gridColumn: '1 / -1' } : undefined}>
            {renderWidget(w.id)}
          </div>
        ))}
      </div>

      <section className="panel attention-panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading">
          <div>
            <h2>Needs attention</h2>
            <p>Items that may need a closer look</p>
          </div>
          <span className="count-badge">{(stats?.lowStockItems ?? 0) + (stats?.pendingApprovals ?? 0)}</span>
        </div>
        <div className="attention-list">
          <div className="attention-item">
            <span className="attention-icon orange">
              <AlertCircle size={16} />
            </span>
            <div>
              <b>Low stock levels</b>
              <small>{stats?.lowStockItems ?? 0} products below reorder threshold</small>
            </div>
            <Link href="/dashboard/inventory" aria-label="Open inventory">
              <ChevronRight size={16} />
            </Link>
          </div>
          <div className="attention-item">
            <span className="attention-icon purple">
              <ClipboardCheck size={16} />
            </span>
            <div>
              <b>Pending approvals</b>
              <small>{stats?.pendingApprovals ?? 0} transfers need a decision</small>
            </div>
            <Link href="/dashboard/transfers" aria-label="Open transfers">
              <ChevronRight size={16} />
            </Link>
          </div>
          <div className="attention-item">
            <span className="attention-icon blue">
              <Truck size={16} />
            </span>
            <div>
              <b>In-transit transfers</b>
              <small>{stats?.inTransitTransfers ?? 0} transfers on the move</small>
            </div>
            <Link href="/dashboard/transfers" aria-label="Open transfers">
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
        <div className="attention-footer">
          <ShieldCheck size={15} /> Review actions before confirming stock changes.
        </div>
      </section>

      <section className="location-strip">
        <div className="location-strip-title">
          <div>
            <h2>Location snapshot</h2>
            <p>Quick view of your operating network</p>
          </div>
          <Link href="/dashboard/locations" className="subtle-link">
            Manage locations <ArrowRight size={14} />
          </Link>
        </div>
        <div className="location-mini-grid">
          <div className="location-mini">
            <span className="location-avatar lavender">
              <Warehouse size={17} />
            </span>
            <div>
              <b>{stats?.activeLocations ?? 0} locations</b>
              <small>Warehouses, stores &amp; hubs</small>
            </div>
            <div className="mini-stock">
              <b>{(stats?.totalAvailableStock ?? 0).toLocaleString()}</b>
              <small>units</small>
            </div>
          </div>
          <div className="location-mini">
            <span className="location-avatar mint">
              <Package size={17} />
            </span>
            <div>
              <b>{stats?.activeProducts ?? 0} products</b>
              <small>Active catalog items</small>
            </div>
            <div className="mini-stock">
              <b>{stats?.completedTransfersThisMonth ?? 0}</b>
              <small>done this month</small>
            </div>
          </div>
          <div className="location-mini">
            <span className="location-avatar peach">
              <ArrowUpRight size={17} />
            </span>
            <div>
              <b>{stats?.recentMovements ?? 0} movements</b>
              <small>Last 7 days</small>
            </div>
            <div className="mini-stock">
              <b>{stats?.outOfStockItems ?? 0}</b>
              <small>out of stock</small>
            </div>
          </div>
        </div>
      </section>

      <Toast message={toast} onClose={() => setToast('')} />
    </>
  )
}
export const dynamic = 'force-dynamic'
