'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Download,
  Package,
  Plus,
  ShieldCheck,
  Truck,
  Warehouse,
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
import { PageHeading, Metric, Status } from '@/components/redesign/ui'
import { useCan } from '@/hooks/useCan'

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

  const canCreateTransfer = useCan('transfers:create')

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const response = await fetch('/api/dashboard')
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Failed to fetch dashboard')
        setStats(data.data.stats)
        setCharts(data.data.charts)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    }
    fetchDashboard()
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

  return (
    <>
      <PageHeading
        eyebrow={today.toUpperCase()}
        title={`${greeting()}${stats ? '' : ''}`}
        subtitle="Here's what's happening across your inventory today."
        action={
          <>
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

      <div className="dashboard-grid">
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

        <section className="panel attention-panel">
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
      </div>

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

      <div className="dashboard-grid">
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
      </div>

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
    </>
  )
}
export const dynamic = 'force-dynamic'
