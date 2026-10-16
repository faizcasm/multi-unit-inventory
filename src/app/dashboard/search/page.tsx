'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  LucideIcon,
  MapPin,
  Package,
  Plus,
  Search,
  Truck,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useCan } from '@/hooks/useCan'
import { PageHeading } from '@/components/redesign/ui'

interface SearchItem {
  id: string
  label: string
  sublabel?: string
  href: string
  meta?: string
}

interface SearchGroup {
  type: string
  label: string
  total: number
  items: SearchItem[]
}

interface SearchData {
  groups: SearchGroup[]
  total: number
}

const GROUP_ICONS: Record<string, LucideIcon> = {
  products: Package,
  locations: MapPin,
  transfers: Truck,
  members: Users,
}

const RECENTS_KEY = 'ricoz:searches'
const MAX_RECENTS = 6

/** Last searches, newest first, deduped, capped. */
function readRecents(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((s) => typeof s === 'string').slice(0, MAX_RECENTS) : []
  } catch {
    return []
  }
}

function pushRecent(term: string) {
  try {
    const next = [term, ...readRecents().filter((s) => s.toLowerCase() !== term.toLowerCase())]
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next.slice(0, MAX_RECENTS)))
  } catch {}
}

function SearchView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const q = (searchParams.get('q') || '').trim()

  const [term, setTerm] = useState(q)
  const [data, setData] = useState<SearchData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [recents, setRecents] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const canCreateProduct = useCan('products:create')

  // Guard against out-of-order responses when the query changes quickly.
  const requestIdRef = useRef(0)

  useEffect(() => {
    setRecents(readRecents())
  }, [])

  // Keep the input in sync when the URL query changes (back/forward, recent chip).
  useEffect(() => {
    setTerm(q)
  }, [q])

  const run = useCallback(
    async (query: string) => {
      const requestId = ++requestIdRef.current
      setLoading(true)
      setError('')
      try {
        const res = await apiFetch<SearchData>(`/api/search?q=${encodeURIComponent(query)}`)
        if (requestId !== requestIdRef.current) return
        if (!res.success) {
          setError(res.error || 'Search failed')
          setData(null)
          return
        }
        setData(res.data ?? { groups: [], total: 0 })
        pushRecent(query)
        setRecents(readRecents())
      } catch {
        if (requestId !== requestIdRef.current) return
        setError('Search failed')
        setData(null)
      } finally {
        if (requestId === requestIdRef.current) setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (!q) {
      requestIdRef.current++
      setData(null)
      setError('')
      setLoading(false)
      return
    }
    run(q)
  }, [q, run])

  const submit = () => {
    const next = term.trim()
    if (!next) return
    router.replace(`/dashboard/search?q=${encodeURIComponent(next)}`)
  }

  const noResults = q && !loading && !error && data && data.total === 0

  return (
    <>
      <style>{`
        @keyframes ricoz-search-pulse{0%,100%{opacity:.5}50%{opacity:1}}
        .ricoz-search-pulse{animation:ricoz-search-pulse 1.4s ease-in-out infinite}
        .ricoz-search-row{display:flex;align-items:center;gap:11px;padding:12px 20px;border-top:1px solid var(--line);color:inherit}
        .ricoz-search-row:hover{background:var(--canvas)}
        .ricoz-search-row b{font-size:12.5px}
        .ricoz-search-row small{display:block;font-size:10px;color:var(--muted);margin-top:3px}
        .ricoz-search-meta{margin-left:auto;font-size:10px;color:var(--muted);text-transform:capitalize;white-space:nowrap}
        .ricoz-recent-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:6px 12px;font-size:11px;font-weight:600}
        .ricoz-recent-chip:hover{border-color:var(--violet);color:var(--violet)}
      `}</style>

      <PageHeading
        eyebrow="FIND ANYTHING"
        title="Search"
        subtitle="Products, locations, transfers and members across your workspace."
      />

      <section className="panel" style={{ padding: 20, marginBottom: 16 }}>
        <label className="table-search" style={{ width: '100%', height: 46, borderRadius: 11, gap: 10, padding: '0 14px' }}>
          <Search size={17} />
          <input
            ref={inputRef}
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Search by name, SKU, code, reference or email…"
            maxLength={100}
            style={{ fontSize: 13.5, height: '100%' }}
          />
          {term && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setTerm('')
                inputRef.current?.focus()
              }}
              style={{ border: 0, background: 'transparent', color: 'var(--muted)', display: 'grid', placeItems: 'center', padding: 2 }}
            >
              <X size={14} />
            </button>
          )}
        </label>

        {!q && recents.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, color: 'var(--muted)' }}>RECENT</span>
            {recents.map((r) => (
              <button
                key={r}
                className="ricoz-recent-chip"
                onClick={() => {
                  setTerm(r)
                  router.replace(`/dashboard/search?q=${encodeURIComponent(r)}`)
                }}
              >
                <Search size={11} /> {r}
              </button>
            ))}
          </div>
        )}
      </section>

      {!q ? (
        <section className="panel" style={{ padding: 24 }}>
          <div className="empty-state" style={{ minHeight: 220 }}>
            <Search size={24} />
            <b>Start typing to search</b>
            <p>Find products by name or SKU, locations by code, transfers by reference, or members by email.</p>
          </div>
        </section>
      ) : loading ? (
        <section className="panel" style={{ padding: '10px 0' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="ricoz-search-row ricoz-search-pulse" style={{ animationDelay: `${i * 120}ms` }}>
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: 'var(--line)',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ width: '38%', height: 10, borderRadius: 5, background: 'var(--line)' }} />
                <div style={{ width: '22%', height: 8, borderRadius: 4, background: 'var(--line)', marginTop: 7 }} />
              </div>
            </div>
          ))}
        </section>
      ) : error ? (
        <section className="panel" style={{ padding: 24 }}>
          <div className="empty-state" style={{ minHeight: 220 }}>
            <AlertCircle size={24} />
            <b>Could not run the search</b>
            <p>{error}</p>
            <button className="button button-secondary button-small" onClick={() => run(q)}>
              Retry
            </button>
          </div>
        </section>
      ) : noResults ? (
        <section className="panel" style={{ padding: 24 }}>
          <div className="empty-state" style={{ minHeight: 220 }}>
            <Search size={24} />
            <b>No results for &ldquo;{q}&rdquo;</b>
            <p>Try a different name, SKU, code or reference — or add it to your workspace.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {canCreateProduct && (
                <Link href="/dashboard/products/new" className="button button-primary button-small">
                  <Plus size={14} /> New product
                </Link>
              )}
              <Link href="/dashboard/products/import" className="button button-secondary button-small">
                <Upload size={14} /> Import CSV
              </Link>
            </div>
          </div>
        </section>
      ) : (
        data?.groups
          .filter((g) => g.items.length > 0)
          .map((group) => {
            const Icon = GROUP_ICONS[group.type] || Package
            return (
              <section key={group.type} className="panel table-panel" style={{ marginBottom: 14 }}>
                <div className="panel-heading">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Icon size={16} color="var(--violet)" />
                    <h2>{group.label}</h2>
                    <span className="count-badge">{group.total}</span>
                  </div>
                  {group.total > group.items.length && (
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                      Top {group.items.length} of {group.total}
                    </span>
                  )}
                </div>
                <div>
                  {group.items.map((item) => (
                    <Link key={`${group.type}-${item.id}`} href={item.href} className="ricoz-search-row">
                      <div style={{ minWidth: 0 }}>
                        <b>{item.label}</b>
                        {item.sublabel && <small>{item.sublabel}</small>}
                      </div>
                      {item.meta && <span className="ricoz-search-meta">{item.meta}</span>}
                      <ArrowRight size={14} color="var(--muted)" style={{ flexShrink: 0 }} />
                    </Link>
                  ))}
                </div>
              </section>
            )
          })
      )}
    </>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchView />
    </Suspense>
  )
}

export const dynamic = 'force-dynamic'
