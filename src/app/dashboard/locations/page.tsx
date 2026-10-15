'use client'

import { useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import {
  Warehouse,
  Plus,
  Search,
  Building2,
  ArrowRight,
  AlertCircle,
  X,
} from 'lucide-react'
import { PageHeading, Metric, Status, EmptyState } from '@/components/redesign/ui'

interface Location {
  _id: string
  name: string
  code: string
  type: string
  address?: { street?: string; city?: string; state?: string; country?: string }
  description?: string
  isActive: boolean
  createdAt: string
  productCount: number
  totalStock: number
  lowStockCount: number
}

const locationTypeLabels: Record<string, string> = {
  warehouse: 'Warehouse',
  store: 'Retail store',
  distribution_center: 'Distribution center',
  other: 'Other',
}

const TYPE_COLORS = ['lavender', 'mint', 'peach', 'blue']

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  // create form
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [type, setType] = useState('warehouse')
  const [city, setCity] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const fetchLocations = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (typeFilter) params.set('type', typeFilter)

      const response = await fetch(`/api/locations?${params.toString()}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to fetch locations')
      setLocations(data.data || [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load locations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLocations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter])

  const createLocation = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      const response = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          code: code.toUpperCase(),
          type,
          address: city ? { city } : undefined,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        const firstDetail = data?.details ? Object.values(data.details).flat()[0] : null
        setFormError(firstDetail || data?.error || 'Failed to create location')
      } else {
        setShowCreate(false)
        setName('')
        setCode('')
        setCity('')
        setType('warehouse')
        fetchLocations()
      }
    } catch {
      setFormError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const totalProducts = locations.reduce((s, l) => s + (l.productCount || 0), 0)
  const totalStock = locations.reduce((s, l) => s + (l.totalStock || 0), 0)
  const lowTotal = locations.reduce((s, l) => s + (l.lowStockCount || 0), 0)

  return (
    <>
      <PageHeading
        eyebrow="OPERATING NETWORK"
        title="Locations"
        subtitle="See where your stock lives and how each location is performing."
        action={
          <button className="button button-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Add location
          </button>
        }
      />

      <div className="metric-grid compact-metrics">
        <Metric label="Active locations" value={locations.filter((l) => l.isActive).length} icon={Warehouse} detail="in your workspace" />
        <Metric label="Products stocked" value={totalProducts} icon={Building2} tone="mint" detail="across all locations" />
        <Metric label="Units on hand" value={totalStock.toLocaleString()} icon={Warehouse} tone="blue" detail="total available stock" />
        <Metric label="Low stock items" value={lowTotal} icon={AlertCircle} tone="orange" detail="need attention" />
      </div>

      <section className="panel table-panel" style={{ marginBottom: 18 }}>
        <div className="inventory-toolbar">
          <div className="table-tabs">
            <button className={typeFilter === '' ? 'selected' : ''} onClick={() => setTypeFilter('')}>
              All types
            </button>
            {['warehouse', 'store', 'distribution_center'].map((t) => (
              <button key={t} className={typeFilter === t ? 'selected' : ''} onClick={() => setTypeFilter(t)}>
                {locationTypeLabels[t]}
              </button>
            ))}
          </div>
          <div className="table-tools">
            <label className="table-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search locations"
                aria-label="Search locations"
              />
            </label>
          </div>
        </div>
      </section>

      {error && (
        <div className="data-disclaimer">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div className="empty-state">Loading locations…</div>
      ) : locations.length === 0 ? (
        <section className="panel" style={{ padding: 24 }}>
          <EmptyState
            icon={Warehouse}
            title="No locations found"
            hint="Get started by creating your first location."
          />
        </section>
      ) : (
        <div className="locations-grid">
          {locations.map((location, i) => (
            <article className="panel location-card" key={location._id}>
              <div className="location-card-top">
                <span className={`location-avatar large ${TYPE_COLORS[i % TYPE_COLORS.length]}`}>
                  <Warehouse size={21} />
                </span>
              </div>
              <span className="location-code">{location.code}</span>
              <h2>
                <Link href={`/dashboard/locations/${location._id}`}>{location.name}</Link>
              </h2>
              <p className="location-city">
                <Building2 size={14} />
                {[location.address?.city, location.address?.state, location.address?.country]
                  .filter(Boolean)
                  .join(', ') || locationTypeLabels[location.type] || location.type}
              </p>
              <span className="location-type">{locationTypeLabels[location.type] || location.type}</span>
              <div className="location-stats">
                <div>
                  <b>{location.productCount}</b>
                  <small>Products</small>
                </div>
                <div>
                  <b>{location.totalStock?.toLocaleString?.() ?? location.totalStock}</b>
                  <small>Units on hand</small>
                </div>
              </div>
              <div className="location-card-footer">
                <Status value={location.isActive ? 'Healthy' : 'Needs attention'} />
                <Link href={`/dashboard/locations/${location._id}`} className="subtle-link">
                  View details <ArrowRight size={13} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <form
            className="create-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={createLocation}
          >
            <div className="modal-heading">
              <div>
                <div className="modal-kicker">NEW LOCATION</div>
                <h2 style={{ fontFamily: 'Manrope', fontSize: 17, margin: '6px 0 0' }}>
                  Add a location
                </h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowCreate(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="auth-form">
              <label>
                Location name
                <div className="field-wrap">
                  <Warehouse size={16} />
                  <input
                    required
                    placeholder="e.g. Central Hub"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                  />
                </div>
              </label>
              <label>
                Code
                <div className="field-wrap">
                  <Building2 size={16} />
                  <input
                    required
                    placeholder="e.g. CENTRAL"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    maxLength={20}
                    pattern="[A-Z0-9-]+"
                    title="Uppercase letters, numbers, and hyphens only"
                  />
                </div>
              </label>
              <label>
                Type
                <div className="field-wrap">
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    style={{ border: 0, outline: 0, width: '100%', background: 'transparent', color: 'var(--ink)' }}
                  >
                    <option value="warehouse">Warehouse</option>
                    <option value="store">Store</option>
                    <option value="distribution_center">Distribution center</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </label>
              <label>
                City <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span>
                <div className="field-wrap">
                  <Building2 size={16} />
                  <input
                    placeholder="e.g. Srinagar"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    maxLength={100}
                  />
                </div>
              </label>

              {formError && (
                <div
                  className="auth-message"
                  style={{ background: '#fdeef0', borderColor: '#f6d3d9', color: '#a4404f' }}
                >
                  {formError}
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="button button-secondary" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={saving}>
                  {saving ? 'Creating…' : 'Create location'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
export const dynamic = 'force-dynamic'
