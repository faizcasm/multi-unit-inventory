'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CalendarDays, Download, FileText, Search } from 'lucide-react'
import { PageHeading, EmptyState, Toast } from '@/components/redesign/ui'

const reportTypes = [
  { value: 'stock', label: 'Current stock by location' },
  { value: 'low-stock', label: 'Low stock products' },
  { value: 'transfers', label: 'Transfer history' },
  { value: 'discrepancies', label: 'Transfer discrepancies' },
  { value: 'movements', label: 'Inventory movement history' },
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
