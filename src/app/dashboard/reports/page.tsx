'use client'

import { useState } from 'react'
import { Download, FileText, Package, Truck, AlertTriangle, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
// import { toast } from 'react-hot-toast'

const reportTypes = [
  { value: 'stock', label: 'Current Stock by Location' },
  { value: 'low-stock', label: 'Low Stock Products' },
  { value: 'transfers', label: 'Transfer History' },
  { value: 'discrepancies', label: 'Transfer Discrepancies' },
  { value: 'movements', label: 'Inventory Movement History' },
]

export default function ReportsPage() {
  const [reportType, setReportType] = useState('stock')
  const [format, setFormat] = useState('json')
  const [locationId, setLocationId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<any[]>([])

  const generateReport = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('type', reportType)
      params.set('format', format)
      if (locationId) params.set('locationId', locationId)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)

      const response = await fetch(`/api/reports?${params.toString()}`)
      
      if (format === 'csv') {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${reportType}-report-${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      } else {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Failed to generate report')
        setReportData(data.data || [])
      }
    } catch (err) {
      console.error('Report generation error:', err)
    } finally {
      setLoading(false)
    }
  }

  const exportCsv = async () => {
    const params = new URLSearchParams()
    params.set('type', reportType)
    params.set('format', 'csv')
    if (locationId) params.set('locationId', locationId)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)

    setLoading(true)
    try {
      const response = await fetch(`/api/reports?${params.toString()}`)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${reportType}-report-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('CSV export error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports & Exports</h1>
        <p className="text-muted-foreground">Generate reports and export data</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report Configuration</CardTitle>
          <CardDescription>Select report type and filters</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label>Report Type</Label>
              <Select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                options={reportTypes}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Format</Label>
              <Select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                options={[
                  { value: 'json', label: 'JSON' },
                  { value: 'csv', label: 'CSV' },
                ]}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Location</Label>
              <Input
                placeholder="Location ID (optional)"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>From Date</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>To Date</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={generateReport} loading={loading} className="flex-1">
                Generate Report
              </Button>
              <Button onClick={exportCsv} variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {reportData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Report Results</CardTitle>
            <CardDescription>{reportData.length} records found</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    {Object.keys(reportData[0] || {}).map((key) => (
                      <th key={key} className="text-left p-3 font-medium capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportData.slice(0, 50).map((row, i) => (
                    <tr key={i} className="border-b hover:bg-muted/50">
                      {Object.values(row).map((val: any, j) => (
                        <td key={j} className="p-3">
                          {typeof val === 'object' ? JSON.stringify(val) : String(val ?? '-')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {reportData.length > 50 && (
                <p className="text-center text-muted-foreground py-3 text-sm">
                  Showing first 50 of {reportData.length} records
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
export const dynamic = 'force-dynamic'
