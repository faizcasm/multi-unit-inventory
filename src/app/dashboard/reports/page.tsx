'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CalendarDays, Download, FileText, Search, Boxes, Package, Gauge, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { PageHeading, EmptyState, Toast, Metric } from '@/components/redesign/ui'
import { formatCurrency } from '@/lib/utils/helpers'

const reportTypes = [
  { value: 'stock', label: 'Current stock by location' },
  { value: 'low-stock', label: 'Low stock products' },
  { value: 'transfers', label: 'Transfer history' },
  { value: 'discrepancies', label: 'Transfer discrepancies' },
  { value: 'movements', label: 'Inventory movement history' },
  { value: 'valuation', label: 'Inventory valuation' },
  { value: 'forecast', label: 'Demand forecast' },
]

export default function ReportsPage() {
  const [reportType, setReportType] = useState('stock')
  const [format, setFormat] = useState('json')
  const [locationId, setLocationId] = useState('')
  const [locations, setLocations] = useState<{ _id: string; name: string; code: string }[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<any[]>([])
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3200)
  }

  useEffect(() => {
    ;(async () => {
      try {
        const response = await fetch('/api/locations')
        const data = await response.json()
        if (response.ok) setLocations(data.data || [])
      } catch {}
    })()
  }, [])

  const buildParams = (fmt: string) => {
    const params = new URLSearchParams()
    params.set('type', reportType)
    params.set('format', fmt)
    if (locationId) params.set('locationId', locationId)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    return params
  }

  const generateReport = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/reports?${buildParams('json').toString()}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to generate report')
      setReportData(data.data || [])
      notify(`Report ready — ${(data.data || []).length} records`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  const exportCsv = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/reports?${buildParams('csv').toString()}`)
      if (!response.ok) throw new Error('CSV export failed')
      const blob = await response.blob()
      if (blob.size === 0) {
        notify('No data to export')
        return
      }
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${reportType}-report-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      notify('CSV downloaded')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV export failed')
    } finally {
      setLoading(false)
    }
  }

  const keys = reportData.length > 0 ? Object.keys(reportData[0]) : []

  // Client-side rollups for the valuation report.
  const valuationStats =
    reportType === 'valuation'
      ? {
          totalValue: reportData.reduce((sum, row) => sum + (Number(row.totalValue) || 0), 0),
          onHand: reportData.reduce((sum, row) => sum + (Number(row.onHand) || 0), 0),
          skus: new Set(reportData.map((row) => row.sku).filter(Boolean)).size,
        }
      : null

  // Client-side rollups for the demand forecast report (the API keeps its
  // row-based contract so CSV export stays unchanged — totals are computed here).
  const forecastStats =
    reportType === 'forecast' && reportData.length > 0
      ? (() => {
          const projectedTotal = reportData.reduce((sum, row) => sum + (Number(row.projected30d) || 0), 0)
          const trends = reportData
            .map((row) => (row.trendPct === null || row.trendPct === undefined ? null : Number(row.trendPct)))
            .filter((t): t is number => t !== null && Number.isFinite(t))
          return {
            tracked: reportData.length,
            below: reportData.filter((row) => row.status === 'below').length,
            projectedTotal,
            avgTrend: trends.length ? Math.round((trends.reduce((a, b) => a + b, 0) / trends.length) * 10) / 10 : null,
          }
        })()
      : null

  // Top 10 products by projected 30-day demand for the bar chart.
  const forecastChart = forecastStats
    ? reportData
        .slice()
        .sort((a, b) => (Number(b.projected30d) || 0) - (Number(a.projected30d) || 0))
        .slice(0, 10)
        .map((row) => ({ label: String(row.sku || row.name).slice(0, 12), units: Number(row.projected30d) || 0 }))
    : []

  return (
    <>
      <PageHeading
        eyebrow="REPORTING & INSIGHTS"
        title="Reports"
        subtitle="Generate operational reports and export them for your records."
        action={
          <button className="button button-secondary" onClick={exportCsv} disabled={loading}>
            <Download size={15} /> Export CSV
          </button>
        }
      />

      <section className="panel" style={{ padding: 22, marginBottom: 18 }}>
        <div className="settings-panel-heading">
          <div>
            <h2>Report configuration</h2>
            <p>Select a report type, optional filters, then generate or export.</p>
          </div>
        </div>

        <div className="modal-route-grid" style={{ marginBottom: 16 }}>
          <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
            Report type
            <div className="field-wrap">
              <FileText size={16} />
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                style={{ border: 0, outline: 0, width: '100%', background: 'transparent', color: 'var(--ink)' }}
              >
                {reportTypes.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <span className="modal-route-icon" aria-hidden>
            /
          </span>
          <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
            Location
            <div className="field-wrap">
              <Search size={16} />
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                style={{ border: 0, outline: 0, width: '100%', background: 'transparent', color: 'var(--ink)' }}
              >
                <option value="">All locations</option>
                {locations.map((l) => (
                  <option key={l._id} value={l._id}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>

        <div className="modal-route-grid" style={{ marginBottom: 16 }}>
          <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
            From date
            <div className="field-wrap">
              <CalendarDays size={16} />
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
          </label>
          <span className="modal-route-icon" aria-hidden>
            →
          </span>
          <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
            To date
            <div className="field-wrap">
              <CalendarDays size={16} />
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </label>
        </div>

        <div className="modal-actions">
          <button className="button button-secondary" onClick={exportCsv} disabled={loading}>
            <Download size={15} /> Download CSV
          </button>
          <button className="button button-primary" onClick={generateReport} disabled={loading}>
            {loading ? 'Generating…' : 'Generate report'}
          </button>
        </div>

        {error && (
          <div className="data-disclaimer">
            <AlertCircle size={14} /> {error}
          </div>
        )}
      </section>

      {valuationStats && (
        <div className="metric-grid compact-metrics">
          <Metric
            label="Total valuation"
            value={formatCurrency(valuationStats.totalValue)}
            icon={Boxes}
            tone="purple"
            detail="across all listed stock"
          />
          <Metric
            label="Total on-hand units"
            value={valuationStats.onHand.toLocaleString()}
            icon={Package}
            tone="blue"
            detail="available + reserved + in transit + damaged"
          />
          <Metric
            label="SKU count"
            value={valuationStats.skus}
            icon={Gauge}
            tone="mint"
            detail="distinct products valued"
          />
        </div>
      )}

      {forecastStats && (
        <>
          <div className="metric-grid compact-metrics">
            <Metric
              label="Products tracked"
              value={forecastStats.tracked.toLocaleString()}
              icon={Package}
              tone="purple"
              detail="active products in this forecast"
            />
            <Metric
              label="Below threshold"
              value={forecastStats.below.toLocaleString()}
              icon={AlertCircle}
              tone="orange"
              detail="at or under reorder point"
            />
            <Metric
              label="Projected demand 30d"
              value={forecastStats.projectedTotal.toLocaleString()}
              icon={Boxes}
              tone="blue"
              detail="units expected over the next month"
            />
            <Metric
              label="Avg trend"
              value={forecastStats.avgTrend === null ? '—' : `${forecastStats.avgTrend > 0 ? '+' : ''}${forecastStats.avgTrend}%`}
              icon={TrendingUp}
              tone="mint"
              detail="30d vs. previous 30d window"
            />
          </div>

          <section className="panel table-panel">
            <div className="panel-heading">
              <div>
                <h2>Projected demand — top 10 products</h2>
                <p>Expected 30-day unit demand based on recent velocity</p>
              </div>
            </div>
            <div style={{ height: 260, padding: '0 20px 20px' }}>
              {forecastChart.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={forecastChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="label" fontSize={11} stroke="var(--muted)" />
                    <YAxis fontSize={11} stroke="var(--muted)" />
                    <Tooltip />
                    <Bar dataKey="units" fill="#8066ed" name="Projected units" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state">No demand data yet</div>
              )}
            </div>
          </section>
        </>
      )}

      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h2>Report results</h2>
            <p>{reportData.length > 0 ? `${reportData.length} records found` : 'Run a report to see results here'}</p>
          </div>
          {reportData.length > 0 && (
            <button className="subtle-link" onClick={exportCsv}>
              <Download size={14} /> Export
            </button>
          )}
        </div>

        {reportData.length === 0 ? (
          <EmptyState icon={FileText} title="No report generated yet" hint="Choose a report type and press Generate." />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {keys.map((key) => (
                    <th key={key}>{key.replace(/([A-Z])/g, ' $1').trim()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reportData.slice(0, 50).map((row, i) => (
                  <tr key={i}>
                    {keys.map((key, j) => {
                      const val = row[key]
                      return (
                        <td key={j}>
                          {typeof val === 'object' && val !== null
                            ? JSON.stringify(val)
                            : String(val ?? '-')}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {reportData.length > 50 && (
          <div className="table-footer">
            <span>
              Showing first <b>50</b> of {reportData.length} records
            </span>
            <span>Export CSV for the full set</span>
          </div>
        )}
      </section>

      <Toast message={toast} onClose={() => setToast('')} />
    </>
  )
}
export const dynamic = 'force-dynamic'
