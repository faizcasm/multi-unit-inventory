'use client'

import { ChangeEvent, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  FileUp,
  Package,
  Upload,
  Warehouse,
} from 'lucide-react'
import { PageHeading, Metric, EmptyState, Toast } from '@/components/redesign/ui'
import { useCan } from '@/hooks/useCan'

type Target = 'products' | 'locations'

interface ImportRowError {
  line: number
  row: Record<string, string>
  errors: string[]
}

interface ImportDuplicate {
  line: number
  code: string
}

interface DryRunData {
  target: Target
  totalRows: number
  valid: number
  invalid: ImportRowError[]
  duplicates: ImportDuplicate[]
  preview: Record<string, string | number>[]
}

interface CommitData {
  imported: number
  invalid: number
  duplicates: number
}

const PRODUCT_PREVIEW_COLUMNS: { key: string; header: string }[] = [
  { key: 'name', header: 'Name' },
  { key: 'sku', header: 'SKU' },
  { key: 'category', header: 'Category' },
  { key: 'unitOfMeasure', header: 'Unit' },
  { key: 'barcode', header: 'Barcode' },
  { key: 'reorderThreshold', header: 'Reorder at' },
  { key: 'reorderQuantity', header: 'Reorder qty' },
]

const LOCATION_PREVIEW_COLUMNS: { key: string; header: string }[] = [
  { key: 'name', header: 'Name' },
  { key: 'code', header: 'Code' },
  { key: 'type', header: 'Type' },
  { key: 'city', header: 'City' },
  { key: 'country', header: 'Country' },
  { key: 'description', header: 'Description' },
]

const EXPECTED_COLUMNS: Record<Target, string> = {
  products: 'name, sku, description, category, unitOfMeasure, barcode, reorderThreshold, reorderQuantity',
  locations: 'name, code, type, city, country, description, capacity',
}

export default function ImportCsvPage() {
  const [target, setTarget] = useState<Target>('products')
  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState('')
  const [validating, setValidating] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [result, setResult] = useState<DryRunData | null>(null)
  const [committed, setCommitted] = useState<CommitData | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canCreateProducts = useCan('products:create')
  const canCreateLocations = useCan('locations:create')
  const canImport = target === 'products' ? canCreateProducts : canCreateLocations

  const reset = () => {
    setCsv('')
    setFileName('')
    setResult(null)
    setCommitted(null)
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const switchTarget = (next: Target) => {
    if (next === target) return
    setTarget(next)
    reset()
  }

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError('')
    setResult(null)
    setCommitted(null)
    const reader = new FileReader()
    reader.onload = () => setCsv(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => setError('Could not read that file. Try pasting the CSV instead.')
    reader.readAsText(file)
  }

  const validate = async () => {
    if (!csv.trim() || validating) return
    setValidating(true)
    setError('')
    setResult(null)
    setCommitted(null)
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, csv, dryRun: true }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Validation failed')
      setResult(json.data as DryRunData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed. Please check your CSV.')
    } finally {
      setValidating(false)
    }
  }

  const commit = async () => {
    if (!result || committing || !canImport) return
    setCommitting(true)
    setError('')
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, csv, dryRun: false }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Import failed')
      setCommitted(json.data as CommitData)
      setResult(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed. Please try again.')
    } finally {
      setCommitting(false)
    }
  }

  const previewColumns = target === 'products' ? PRODUCT_PREVIEW_COLUMNS : LOCATION_PREVIEW_COLUMNS
  const importCount = result ? result.valid : 0
  const listHref = target === 'products' ? '/dashboard/products' : '/dashboard/locations'

  return (
    <>
      <div className="back-row">
        <Link href={listHref}>
          <ArrowLeft size={15} /> Back to {target === 'products' ? 'products' : 'locations'}
        </Link>
        <span> / Import CSV</span>
      </div>

      <PageHeading
        eyebrow="BULK IMPORT"
        title="Import CSV"
        subtitle={`Add ${target === 'products' ? 'products' : 'locations'} in bulk from a spreadsheet export.`}
      />

      {committed ? (
        <>
          <div className="metric-grid" style={{ marginBottom: 16 }}>
            <Metric label="Imported" value={committed.imported} icon="check" tone="mint" detail="rows created" />
            <Metric label="Skipped (invalid)" value={committed.invalid} icon="alert-triangle" tone="orange" detail="rows failed validation" />
            <Metric label="Skipped (duplicates)" value={committed.duplicates} icon="swap" tone="blue" detail="already existed" />
          </div>
          <div className="panel" style={{ padding: 28, display: 'grid', gap: 12, justifyItems: 'center', textAlign: 'center' }}>
            <CheckCircle2 size={28} style={{ color: '#3fa981' }} />
            <b style={{ fontSize: 14 }}>Import complete</b>
            <p style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 420, lineHeight: 1.7, margin: 0 }}>
              {committed.imported} {target === 'products' ? 'product' : 'location'}
              {committed.imported === 1 ? '' : 's'} added to your workspace.
              {committed.invalid + committed.duplicates > 0 && (
                <> {committed.invalid + committed.duplicates} row(s) were skipped — run a validation pass to see why.</>
              )}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Link href={listHref} className="button button-primary">
                View {target === 'products' ? 'products' : 'locations'}
              </Link>
              <button className="button button-secondary" onClick={reset}>
                Import another file
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Target toggle */}
          <section className="panel" style={{ padding: 16, marginBottom: 16 }}>
            <div className="table-tabs" style={{ marginBottom: 14 }}>
              <button className={target === 'products' ? 'selected' : ''} onClick={() => switchTarget('products')}>
                <Package size={14} /> Products
              </button>
              <button className={target === 'locations' ? 'selected' : ''} onClick={() => switchTarget('locations')}>
                <Warehouse size={14} /> Locations
              </button>
            </div>

            {!canImport && (
              <div className="data-disclaimer" style={{ marginBottom: 12 }}>
                <AlertTriangle size={14} /> Your role can&apos;t create {target === 'products' ? 'products' : 'locations'},
                so you can validate a file but not import it.
              </div>
            )}

            <label className="settings-field" style={{ maxWidth: 'none' }}>
              Upload a CSV file
              <div className="field-wrap">
                <FileUp size={16} />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={onFile}
                  style={{ fontSize: 11 }}
                />
              </div>
              <small style={{ fontWeight: 400, color: 'var(--muted)' }}>
                {fileName ? `Loaded ${fileName}` : 'Or paste your CSV below.'} Expected columns — {EXPECTED_COLUMNS[target]}
              </small>
            </label>

            <label className="settings-field" style={{ maxWidth: 'none' }}>
              Paste CSV
              <div className="field-wrap" style={{ height: 'auto', padding: '10px 12px' }}>
                <textarea
                  rows={6}
                  placeholder={`name,sku,unitOfMeasure\nWidget,WID-1,pcs`}
                  value={csv}
                  onChange={(e) => {
                    setCsv(e.target.value)
                    setResult(null)
                    setCommitted(null)
                    setError('')
                  }}
                  spellCheck={false}
                  style={{
                    border: 0,
                    outline: 0,
                    width: '100%',
                    background: 'transparent',
                    resize: 'vertical',
                    font: 'inherit',
                    fontSize: 11,
                    color: 'var(--ink)',
                  }}
                />
              </div>
            </label>

            {error && (
              <div className="auth-message" style={{ background: '#fdeef0', borderColor: '#f6d3d9', color: '#a4404f', marginTop: 12 }}>
                {error}
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button type="button" className="button button-secondary" onClick={reset} disabled={validating || committing}>
                Clear
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={validate}
                disabled={!csv.trim() || validating || committing}
              >
                <Upload size={15} />
                {validating ? 'Validating…' : 'Validate'}
              </button>
            </div>
          </section>

          {result && (
            <>
              <div className="metric-grid" style={{ marginBottom: 16 }}>
                <Metric label="Rows in file" value={result.totalRows} icon="file" tone="purple" detail="excluding header" />
                <Metric label="Valid" value={result.valid} icon="check" tone="mint" detail="ready to import" />
                <Metric label="Invalid" value={result.invalid.length} icon="alert-triangle" tone="orange" detail="failed validation" />
                <Metric label="Duplicates" value={result.duplicates.length} icon="swap" tone="blue" detail="already in workspace" />
              </div>

              <section className="panel table-panel" style={{ marginBottom: 16 }}>
                <div className="inventory-toolbar">
                  <div>
                    <b style={{ fontSize: 12 }}>Preview — first {Math.min(result.preview.length, 10)} valid rows</b>
                    <small style={{ display: 'block', fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
                      Normalized values as they will be stored.
                    </small>
                  </div>
                  <div className="table-tools">
                    {result.valid > 0 && (
                      <button className="button button-primary" onClick={commit} disabled={committing || !canImport}>
                        {committing ? 'Importing…' : `Import ${importCount} row${importCount === 1 ? '' : 's'}`}
                      </button>
                    )}
                  </div>
                </div>
                <div className="table-scroll">
                  {result.preview.length === 0 ? (
                    <EmptyState
                      icon={Package}
                      title="No valid rows yet"
                      hint="Fix the errors listed below and validate again."
                    />
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ width: 44 }}>Line</th>
                          {previewColumns.map((col) => (
                            <th key={col.key}>{col.header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.preview.map((row, index) => (
                          <tr key={index}>
                            <td className="value-cell">{index + 2}</td>
                            {previewColumns.map((col) => (
                              <td key={col.key}>{row[col.key] === undefined || row[col.key] === '' ? '—' : String(row[col.key])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>

              {result.invalid.length > 0 && (
                <section className="panel" style={{ padding: 18, marginBottom: 16 }}>
                  <b style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 7, color: '#a4404f' }}>
                    <AlertTriangle size={14} /> Invalid rows ({result.invalid.length})
                  </b>
                  <ul style={{ margin: '11px 0 0', paddingLeft: 16, display: 'grid', gap: 8 }}>
                    {result.invalid.map((bad) => (
                      <li key={bad.line} style={{ fontSize: 10.5, lineHeight: 1.6 }}>
                        <b>Line {bad.line}</b> — {bad.errors.join('; ')}
                        <small style={{ display: 'block', color: 'var(--muted)', wordBreak: 'break-word' }}>
                          {Object.entries(bad.row)
                            .filter(([, value]) => value)
                            .map(([key, value]) => `${key}: ${value}`)
                            .join(' · ') || '(empty row)'}
                        </small>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {result.duplicates.length > 0 && (
                <section className="panel" style={{ padding: 18, marginBottom: 16 }}>
                  <b style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 7, color: '#8a6d2f' }}>
                    <Copy size={14} /> Duplicates ({result.duplicates.length})
                  </b>
                  <p style={{ fontSize: 10, color: 'var(--muted)', margin: '7px 0 0' }}>
                    These {target === 'products' ? 'SKUs' : 'codes'} already exist in your workspace and will be skipped.
                  </p>
                  <ul style={{ margin: '11px 0 0', paddingLeft: 16, display: 'grid', gap: 6 }}>
                    {result.duplicates.map((dup) => (
                      <li key={`${dup.line}-${dup.code}`} style={{ fontSize: 10.5 }}>
                        <b>Line {dup.line}</b> — {target === 'products' ? 'SKU' : 'Code'}: {dup.code}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {!result && !error && (
            <EmptyState
              icon={Upload}
              title="Upload or paste a CSV to get started"
              hint="Nothing is written until you review the preview and press Import."
            />
          )}
        </>
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </>
  )
}
export const dynamic = 'force-dynamic'
