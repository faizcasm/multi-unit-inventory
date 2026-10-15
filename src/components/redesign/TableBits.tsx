'use client'

import * as React from 'react'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Toast } from '@/components/redesign/ui'

/** Small self-contained spinner (no CSS keyframes needed — animates via SMIL). */
function Spinner({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.9s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  )
}

/**
 * Table footer with real server-side paging controls.
 * Renders inside the existing `.table-footer` styling from redesign.css
 * (which already styles its buttons + disabled state).
 */
export function Pagination({
  page,
  totalPages,
  total,
  onPage,
  noun,
  hint,
}: {
  page: number
  totalPages: number
  total: number
  onPage: (p: number) => void
  noun: string
  /** Optional trailing note, e.g. "Newest first". */
  hint?: React.ReactNode
}) {
  const pages = Math.max(totalPages, 1)
  const current = Math.min(Math.max(page, 1), pages)
  return (
    <div className="table-footer">
      <span>
        Showing <b>{total}</b> {noun}
        {hint ? <> · {hint}</> : null}
      </span>
      <div>
        <button
          type="button"
          aria-label="Previous page"
          disabled={current <= 1}
          onClick={() => onPage(current - 1)}
        >
          <ChevronLeft size={13} />
        </button>
        <span>
          Page <b>{current}</b> of <b>{pages}</b>
        </span>
        <button
          type="button"
          aria-label="Next page"
          disabled={current >= pages}
          onClick={() => onPage(current + 1)}
        >
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}

/** RFC4180 CSV serialization with header row. */
export function toCsv(
  columns: { key: string; header: string }[],
  rows: Record<string, any>[]
): string {
  const escape = (value: any): string => {
    if (value === null || value === undefined) return ''
    const str = String(value)
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
  }
  const lines = [columns.map((c) => escape(c.header)).join(',')]
  for (const row of rows) {
    lines.push(columns.map((c) => escape(row[c.key])).join(','))
  }
  return lines.join('\r\n')
}

/**
 * Button that exports the current (filtered) list as a CSV file.
 * Fetches every matching row (page=1&limit=10000) so the export is not
 * limited to the visible page. Any `page`/`limit` already present in
 * `path` are overridden.
 */
export function CsvExportButton({
  path,
  filename,
  columns,
  mapRow,
  noun = 'rows',
}: {
  path: string
  filename: string
  columns: { key: string; header: string }[]
  mapRow: (row: any) => Record<string, any>
  noun?: string
}) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    setError('')
    try {
      const url = new URL(path, window.location.origin)
      url.searchParams.set('page', '1')
      url.searchParams.set('limit', '10000')
      const res = await apiFetch<any>(`${url.pathname}${url.search}`)
      if (!res.success) throw new Error(res.error || `Failed to export ${noun}`)
      const rows: Record<string, any>[] = (Array.isArray(res.data) ? res.data : []).map(mapRow)
      const csv = `\uFEFF${toCsv(columns, rows)}`
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const downloadUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 10)
      anchor.href = downloadUrl
      anchor.download = `${filename}-${stamp}.csv`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(downloadUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to export ${noun}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <button className="button button-secondary" type="button" onClick={handleExport} disabled={exporting}>
        {exporting ? <Spinner /> : <Download size={15} />}
        {exporting ? 'Exporting…' : 'Export CSV'}
      </button>
      <Toast message={error} onClose={() => setError('')} />
    </>
  )
}
