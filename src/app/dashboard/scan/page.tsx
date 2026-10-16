'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { Boxes, ChevronLeft, MapPin, Package, ScanLine, Search, Truck, Upload } from 'lucide-react'
import { PageHeading, EmptyState, Toast } from '@/components/redesign/ui'
import { apiFetch } from '@/lib/api'

interface ScanMatch {
  type: 'product' | 'location' | 'transfer'
  id: string
  label: string
  sublabel: string
  href: string
}

interface RecentScan {
  type: ScanMatch['type']
  label: string
  href: string
}

const RECENT_KEY = 'ricoz:recent-scans'
const RECENT_MAX = 8

const TYPE_ICONS = { product: Package, location: MapPin, transfer: Truck } as const

function loadRecent(): RecentScan[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

export default function ScanPage() {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<ScanMatch[]>([])
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [recent, setRecent] = useState<RecentScan[]>([])
  const [toast, setToast] = useState('')

  useEffect(() => {
    setRecent(loadRecent())
  }, [])

  const remember = (match: RecentScan) => {
    setRecent((prev) => {
      const next = [match, ...prev.filter((r) => r.href !== match.href)].slice(0, RECENT_MAX)
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      } catch {
        /* storage unavailable — chips just won't persist */
      }
      return next
    })
  }

  const scan = async (raw: string) => {
    const q = raw.trim()
    if (!q || searching) return
    setSearching(true)
    setError('')
    try {
      const res = await apiFetch<{ matches: ScanMatch[] }>(`/api/scan?q=${encodeURIComponent(q)}`)
      if (!res.success) throw new Error(res.error || 'Scan lookup failed')
      const found = res.data?.matches ?? []
      setMatches(found)
      setSearched(true)
      if (found[0]) remember({ type: found[0].type, label: found[0].label, href: found[0].href })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan lookup failed')
      setMatches([])
      setSearched(true)
    } finally {
      setSearching(false)
      setQuery('')
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    scan(query)
  }

  const clearRecent = () => {
    setRecent([])
    try {
      localStorage.removeItem(RECENT_KEY)
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <div className="back-row">
        <Link href="/dashboard">
          <ChevronLeft size={15} /> Back to overview
        </Link>
        <span> / Scan lookup</span>
      </div>

      <PageHeading
        eyebrow="SCAN TO LOOKUP"
        title="Scan lookup"
        subtitle="Scan or type a barcode, SKU, location code, or transfer reference."
      />

      <form className="panel" style={{ padding: 18, marginBottom: 16, maxWidth: 760 }} onSubmit={onSubmit}>
        <label className="table-search" style={{ height: 54 }}>
          <Search size={18} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Scan a barcode or type a SKU, code, or reference…"
            aria-label="Scan or enter a code"
            style={{ fontSize: 14 }}
          />
          <button type="submit" className="button button-primary" disabled={!query.trim() || searching}>
            <ScanLine size={15} /> {searching ? 'Looking…' : 'Look up'}
          </button>
        </label>
        <p className="modal-footnote" style={{ marginTop: 12 }}>
          <ScanLine size={14} />
          Works with USB scanner wedges — the scanner types the code and presses Enter. Lookups match
          product barcodes &amp; SKUs, location codes, and transfer references.
        </p>
      </form>

      {error && (
        <div className="data-disclaimer" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {searched && !error && matches.length === 0 && (
        <div className="panel" style={{ padding: 24, marginBottom: 16 }}>
          <EmptyState
            icon={Search}
            title="No matches found"
            hint="Check the code, or add it to your workspace first."
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/dashboard/products/new" className="button button-secondary">
              <Package size={14} /> Create product
            </Link>
            <Link href="/dashboard/products/import" className="button button-secondary">
              <Upload size={14} /> Import CSV
            </Link>
          </div>
        </div>
      )}

      {matches.length > 0 && (
        <div style={{ display: 'grid', gap: 10, maxWidth: 760, marginBottom: 16 }}>
          {matches.map((match) => {
            const Icon = TYPE_ICONS[match.type] || Boxes
            return (
              <div
                key={`${match.type}-${match.id}`}
                className="panel"
                style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 13 }}
              >
                <span
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: '#f0ecff',
                    color: '#7258db',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={18} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 12.5, display: 'block' }}>{match.label}</b>
                  <small style={{ fontSize: 10, color: 'var(--muted)' }}>{match.sublabel}</small>
                </span>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {match.type === 'product' && (
                    <Link
                      href={`/dashboard/inventory/adjust?productId=${match.id}`}
                      className="button button-secondary button-small"
                    >
                      Adjust stock
                    </Link>
                  )}
                  <Link href={match.href} className="button button-primary button-small">
                    Open {match.type}
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {recent.length > 0 && (
        <section className="panel" style={{ padding: 16, maxWidth: 760 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
            <b style={{ fontSize: 11.5 }}>Recent scans</b>
            <button
              type="button"
              onClick={clearRecent}
              style={{ background: 'transparent', border: 0, color: 'var(--muted)', fontSize: 10, cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
            >
              Clear
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {recent.map((item) => {
              const Icon = TYPE_ICONS[item.type] || Boxes
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="button button-secondary button-small"
                  style={{ gap: 6 }}
                >
                  <Icon size={13} /> {item.label}
                </Link>
              )
            })}
          </div>
        </section>
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </>
  )
}
export const dynamic = 'force-dynamic'
