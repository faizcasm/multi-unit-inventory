'use client'

import { CSSProperties, ReactNode, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Plus,
  ShieldAlert,
  Truck,
  XCircle,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { apiFetch } from '@/lib/api'
import { useCan } from '@/hooks/useCan'
import { PageHeading, Metric } from '@/components/redesign/ui'

interface Metrics {
  totalCreated: number
  completed: number
  inFlight: number
  rejected: number
  cancelled: number
  completionRate: number | null
  rejectionRate: number | null
  avgCycleDays: number | null
  medianCycleDays: number | null
  transfersPerWeek: number
}

interface AnalyticsData {
  range: number
  granularity: 'daily' | 'weekly'
  metrics: Metrics
  throughput: { bucket: string; created: number; completed: number }[]
  statusBreakdown: { status: string; count: number }[]
  topRoutes: { source: string; destination: string; count: number }[]
  topProducts: { name?: string; sku?: string; unitsMoved: number }[]
  byRole: { role: string; requested: number; approved: number; received: number }[]
}

const CHART_HEIGHT = 250

/** '2026-01-05' → '01-05' for compact chart axes. */
const shortBucket = (bucket: string) => bucket.slice(5)

/** 'PENDING_APPROVAL' → 'Pending approval' */
const humanStatus = (status: string) =>
  status
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

const humanRole = (role: string) =>
  role === 'inventory_manager'
    ? 'Inventory manager'
    : role.replace(/\b\w/g, (c) => c.toUpperCase())

const fmtPct = (v: number | null | undefined) => (v == null ? '—' : `${v}%`)
const fmtDays = (v: number | null | undefined) => (v == null ? '—' : `${v}d`)

const chartCardStyle: CSSProperties = { display: 'grid', gap: 4 }

function ChartCard({
  title,
  subtitle,
  linkHref,
  linkLabel,
  children,
}: {
  title: string
  subtitle: string
  linkHref?: string
  linkLabel?: string
  children: ReactNode
}) {
  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {linkHref && (
          <Link href={linkHref} className="subtle-link">
            {linkLabel} <ArrowRight size={14} />
          </Link>
        )}
      </div>
      <div style={{ height: CHART_HEIGHT, padding: '0 20px 20px', ...chartCardStyle }}>
        {children}
      </div>
    </section>
  )
}

export default function AnalyticsPage() {
  const { status } = useSession()
  const canSee = useCan('reports:read')
  const canCreateTransfer = useCan('transfers:create')

  const [range, setRange] = useState<30 | 90>(30)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch<AnalyticsData>(`/api/analytics?range=${range}`)
      if (!res.success) {
        setError(res.error || 'Failed to load analytics')
        return
      }
      if (!res.data) throw new Error('Failed to load analytics')
      setData(res.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    if (status === 'loading' || !canSee) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, canSee, range])

  const denied = status !== 'loading' && !canSee

  const rangeToggle = (
    <div className="table-tabs">
      <button className={range === 30 ? 'selected' : ''} onClick={() => setRange(30)}>
        Last 30 days
      </button>
      <button className={range === 90 ? 'selected' : ''} onClick={() => setRange(90)}>
        Last 90 days
      </button>
    </div>
  )

  if (denied) {
    return (
      <>
        <PageHeading
          eyebrow="ANALYTICS"
          title="Analytics"
          subtitle="Transfer throughput, cycle times and movement volume."
        />
        <section className="panel" style={{ padding: 24 }}>
          <div className="empty-state" style={{ minHeight: 220 }}>
            <ShieldAlert size={24} />
            <b>You don&apos;t have access to analytics</b>
            <p>Ask a workspace admin for the Reports permission to see these insights.</p>
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      <style>{`
        @keyframes ricoz-analytics-pulse{0%,100%{opacity:.5}50%{opacity:1}}
        .ricoz-analytics-pulse{animation:ricoz-analytics-pulse 1.4s ease-in-out infinite}
      `}</style>

      <PageHeading
        eyebrow="TRANSFER ANALYTICS"
        title="Analytics"
        subtitle="Throughput, cycle times and movement volume across your workspace."
        action={rangeToggle}
      />

      {error ? (
        <section className="panel" style={{ padding: 24 }}>
          <div className="empty-state" style={{ minHeight: 220 }}>
            <AlertCircle size={24} />
            <b>Could not load analytics</b>
            <p>{error}</p>
            <button className="button button-secondary button-small" onClick={load}>
              Retry
            </button>
          </div>
        </section>
      ) : loading || !data ? (
        <>
          <div className="metric-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="metric-card ricoz-analytics-pulse" style={{ animationDelay: `${i * 120}ms` }}>
                <div style={{ width: '46%', height: 9, borderRadius: 5, background: 'var(--line)' }} />
                <div style={{ width: '32%', height: 22, borderRadius: 6, background: 'var(--line)', margin: '14px 0 10px' }} />
                <div style={{ width: '58%', height: 8, borderRadius: 4, background: 'var(--line)' }} />
              </div>
            ))}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: 15,
            }}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <section key={i} className="panel ricoz-analytics-pulse" style={{ height: 320, animationDelay: `${i * 100}ms` }} />
            ))}
          </div>
        </>
      ) : data.metrics.totalCreated === 0 ? (
        <section className="panel" style={{ padding: 24 }}>
          <div className="empty-state" style={{ minHeight: 240 }}>
            <Truck size={24} />
            <b>No transfers yet</b>
            <p>
              Analytics will appear once transfers are created in the last {data.range} days.
            </p>
            {canCreateTransfer && (
              <Link href="/dashboard/transfers/new" className="button button-primary button-small">
                <Plus size={14} /> New transfer
              </Link>
            )}
          </div>
        </section>
      ) : (
        <>
          <div className="metric-grid">
            <Metric
              label="Avg cycle time"
              value={fmtDays(data.metrics.avgCycleDays)}
              icon={Clock}
              tone="purple"
              detail={
                data.metrics.medianCycleDays != null
                  ? `median ${data.metrics.medianCycleDays}d`
                  : 'request → receipt'
              }
            />
            <Metric
              label="Completion rate"
              value={fmtPct(data.metrics.completionRate)}
              icon={CheckCircle2}
              tone="mint"
              detail={`${data.metrics.completed} of ${data.metrics.totalCreated} created`}
            />
            <Metric
              label="Rejection rate"
              value={fmtPct(data.metrics.rejectionRate)}
              icon={XCircle}
              tone="orange"
              detail={`${data.metrics.rejected} rejected · ${data.metrics.cancelled} cancelled`}
            />
            <Metric
              label="Transfers created"
              value={data.metrics.totalCreated}
              icon={Truck}
              tone="blue"
              detail={`${data.metrics.transfersPerWeek} per week · ${data.metrics.inFlight} in flight`}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: 15,
              marginBottom: 18,
            }}
          >
            <ChartCard
              title="Throughput"
              subtitle={`Created vs completed — ${data.granularity}`}
              linkHref="/dashboard/transfers"
              linkLabel="View transfers"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.throughput}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis
                    dataKey="bucket"
                    fontSize={10}
                    stroke="var(--muted)"
                    tickFormatter={shortBucket}
                    minTickGap={18}
                  />
                  <YAxis fontSize={10} stroke="var(--muted)" allowDecimals={false} width={28} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="created" stroke="#8066ed" name="Created" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="completed" stroke="#23835c" name="Completed" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Top routes"
              subtitle="Most travelled source → destination pairs"
              linkHref="/dashboard/transfers"
              linkLabel="View transfers"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.topRoutes.map((r) => ({ ...r, route: `${r.source} → ${r.destination}` }))}
                  layout="vertical"
                  margin={{ left: 4, right: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis type="number" fontSize={10} stroke="var(--muted)" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="route"
                    fontSize={10}
                    stroke="var(--muted)"
                    width={150}
                    tickFormatter={(v: string) => (v.length > 24 ? `${v.slice(0, 23)}…` : v)}
                  />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8066ed" name="Transfers" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top products" subtitle="Units moved in the selected range">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topProducts} margin={{ left: -18, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis
                    dataKey="name"
                    fontSize={9}
                    stroke="var(--muted)"
                    interval={0}
                    angle={-18}
                    textAnchor="end"
                    height={56}
                    tickFormatter={(v: string) => (v && v.length > 14 ? `${v.slice(0, 13)}…` : v)}
                  />
                  <YAxis fontSize={10} stroke="var(--muted)" allowDecimals={false} width={34} />
                  <Tooltip />
                  <Bar dataKey="unitsMoved" fill="#23835c" name="Units moved" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Status breakdown"
              subtitle="Transfers created in range, by current status"
              linkHref="/dashboard/activity"
              linkLabel="View activity"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.statusBreakdown} margin={{ left: -18, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis
                    dataKey="status"
                    fontSize={9}
                    stroke="var(--muted)"
                    interval={0}
                    angle={-18}
                    textAnchor="end"
                    height={56}
                    tickFormatter={(v: string) => humanStatus(v)}
                  />
                  <YAxis fontSize={10} stroke="var(--muted)" allowDecimals={false} width={34} />
                  <Tooltip labelFormatter={(v) => humanStatus(String(v))} />
                  <Bar dataKey="count" fill="#3f6fbe" name="Transfers" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {data.byRole.length > 0 && (
            <section className="panel table-panel">
              <div className="panel-heading">
                <div>
                  <h2>Activity by role</h2>
                  <p>Who requested, approved and received transfers in range</p>
                </div>
                <span className="count-badge">{data.byRole.length}</span>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Requested</th>
                      <th>Approved</th>
                      <th>Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byRole.map((r) => (
                      <tr key={r.role}>
                        <td>
                          <b>{humanRole(r.role)}</b>
                        </td>
                        <td>
                          <b className="stock-number">{r.requested}</b>
                        </td>
                        <td>
                          <b className="stock-number">{r.approved}</b>
                        </td>
                        <td>
                          <b className="stock-number">{r.received}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </>
  )
}

export const dynamic = 'force-dynamic'
