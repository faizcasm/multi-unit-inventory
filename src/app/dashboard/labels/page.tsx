'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { ChevronLeft, Package, Printer, RefreshCw, Search, Warehouse } from 'lucide-react'
import { PageHeading, EmptyState, Toast } from '@/components/redesign/ui'
import { apiFetch } from '@/lib/api'
import './labels.css'

type Tab = 'products' | 'locations'

interface ProductLabel {
  _id: string
  name: string
  sku: string
  barcode?: string
  unitOfMeasure?: string
}

interface LocationLabel {
  _id: string
  name: string
  code: string
  type?: string
}

/** CODE128 renders printable ASCII (0x20–0x7E); anything else needs a fallback. */
const CODE128_SAFE = /^[\x20-\x7E]+$/

function sanitizeCode128(value?: string): string {
  const trimmed = (value || '').trim()
  return CODE128_SAFE.test(trimmed) ? trimmed : ''
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

function BarcodeLabel({ name, sku, barcode }: { name: string; sku: string; barcode?: string }) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const node = svgRef.current
    if (!node) return
    const candidates = [sanitizeCode128(barcode), sanitizeCode128(sku), 'NOSKU']
    for (const value of candidates) {
      if (!value) continue
      try {
        JsBarcode(node, value, {
          format: 'CODE128',
          width: 1.6,
          height: 40,
          displayValue: true,
          fontSize: 11,
          margin: 2,
          background: 'transparent',
        })
        return
      } catch {
        // Try the next candidate (e.g. barcode had invalid characters).
      }
    }
  }, [barcode, sku])

  return (
    <div className="label-card">
      <b className="label-name" title={name}>
        {name}
      </b>
      <small className="label-sku">{sku}</small>
      <svg ref={svgRef} className="label-barcode" role="img" aria-label={`Barcode for ${name}`} />
    </div>
  )
}

function QrLabel({ name, code, id }: { name: string; code: string; id: string }) {
  const [dataUrl, setDataUrl] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const url = `${window.location.origin}/dashboard/locations/${id}`
    QRCode.toDataURL(url, { width: 200, margin: 1, errorCorrectionLevel: 'M' })
      .then((data) => {
        if (!cancelled) setDataUrl(data)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <div className="label-card">
      <b className="label-name" title={name}>
        {name}
      </b>
      <small className="label-sku">{code}</small>
      {failed ? (
        <span className="label-fallback">QR unavailable</span>
      ) : dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUrl} className="label-qr" alt={`QR code for ${name}`} />
      ) : (
        <span className="label-qr" aria-hidden />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function LabelsPage() {
  const [tab, setTab] = useState<Tab>('products')
  const [products, setProducts] = useState<ProductLabel[]>([])
  const [locations, setLocations] = useState<LocationLabel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [productSel, setProductSel] = useState<Record<string, number>>({})
  const [locationSel, setLocationSel] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const [prodRes, locRes] = await Promise.all([
          apiFetch<ProductLabel[]>('/api/products?limit=1000'),
          apiFetch<LocationLabel[]>('/api/locations?limit=1000'),
        ])
        if (!prodRes.success) throw new Error(prodRes.error || 'Failed to load products')
        if (!locRes.success) throw new Error(locRes.error || 'Failed to load locations')
        setProducts(prodRes.data || [])
        setLocations(locRes.data || [])
        setError('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load labels data')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const query = search.trim().toLowerCase()
  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) => !query || `${p.name} ${p.sku} ${p.barcode || ''}`.toLowerCase().includes(query)
      ),
    [products, query]
  )
  const filteredLocations = useMemo(
    () => locations.filter((l) => !query || `${l.name} ${l.code}`.toLowerCase().includes(query)),
    [locations, query]
  )

  const selectedProductCount = Object.keys(productSel).length
  const selectedLocationCount = Object.keys(locationSel).length
  const selectedProducts = products.filter((p) => productSel[p._id])
  const selectedLocations = locations.filter((l) => locationSel[l._id])

  const toggleProduct = (id: string) =>
    setProductSel((prev) => {
      const next = { ...prev }
      if (next[id]) delete next[id]
      else next[id] = 1
      return next
    })

  const setProductQty = (id: string, qty: number) =>
    setProductSel((prev) => {
      const parsed = Number.isFinite(qty) ? Math.min(99, Math.max(1, Math.trunc(qty))) : 1
      return { ...prev, [id]: parsed }
    })

  const toggleLocation = (id: string) =>
    setLocationSel((prev) => {
      const next = { ...prev }
      if (next[id]) delete next[id]
      else next[id] = true
      return next
    })

  const selectAllVisible = () => {
    if (tab === 'products') {
      setProductSel((prev) => {
        const next = { ...prev }
        const allSelected = filteredProducts.every((p) => next[p._id])
        filteredProducts.forEach((p) => {
          if (allSelected) delete next[p._id]
          else next[p._id] = 1
        })
        return next
      })
    } else {
      setLocationSel((prev) => {
        const next = { ...prev }
        const allSelected = filteredLocations.every((l) => next[l._id])
        filteredLocations.forEach((l) => {
          if (allSelected) delete next[l._id]
          else next[l._id] = true
        })
        return next
      })
    }
  }

  const printableCount =
    tab === 'products'
      ? selectedProducts.reduce((sum, p) => sum + (productSel[p._id] || 1), 0)
      : selectedLocations.length

  return (
    <>
      <div className="back-row no-print">
        <Link href="/dashboard/products">
          <ChevronLeft size={15} /> Back to products
        </Link>
        <span> / Print labels</span>
      </div>

      <PageHeading
        eyebrow="LABEL STUDIO"
        title="Print labels"
        subtitle="Generate barcode and QR labels for your catalog and locations."
        action={
          <button
            className="button button-primary"
            type="button"
            onClick={() => window.print()}
            disabled={printableCount === 0}
          >
            <Printer size={15} /> Print labels ({printableCount})
          </button>
        }
      />

      {/* Toolbar (screen only) */}
      <div className="panel no-print" style={{ padding: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className="table-tabs">
            <button className={tab === 'products' ? 'selected' : ''} onClick={() => { setTab('products'); setSearch('') }}>
              <Package size={14} /> Products (barcodes)
            </button>
            <button className={tab === 'locations' ? 'selected' : ''} onClick={() => { setTab('locations'); setSearch('') }}>
              <Warehouse size={14} /> Locations (QR)
            </button>
          </div>
          <span style={{ flex: 1 }} />
          <label className="table-search">
            <Search size={15} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === 'products' ? 'Search products' : 'Search locations'}
              aria-label={tab === 'products' ? 'Search products' : 'Search locations'}
            />
          </label>
          <button className="button button-secondary" type="button" onClick={selectAllVisible}>
            Select all visible
          </button>
        </div>
      </div>

      {error && (
        <div className="data-disclaimer no-print" style={{ marginBottom: 16 }}>
          {error}{' '}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ background: 'transparent', border: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
          >
            <RefreshCw size={12} style={{ verticalAlign: -2 }} /> Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="empty-state">Loading products and locations…</div>
      ) : (
        <div className="label-layout">
          {/* Picker (screen only) */}
          <section className="panel label-picker no-print">
            {tab === 'products' ? (
              filteredProducts.length === 0 ? (
                <EmptyState icon={Package} title="No products" hint="Try a different search." />
              ) : (
                filteredProducts.map((product) => (
                  <div className="label-item" key={product._id}>
                    <input
                      type="checkbox"
                      checked={!!productSel[product._id]}
                      onChange={() => toggleProduct(product._id)}
                      aria-label={`Select ${product.name}`}
                    />
                    <span className="label-item-meta">
                      <b>{product.name}</b>
                      <small>
                        {product.sku}
                        {product.barcode ? ` · ${product.barcode}` : ''}
                      </small>
                    </span>
                    <input
                      className="label-qty"
                      type="number"
                      min={1}
                      max={99}
                      value={productSel[product._id] || 1}
                      onChange={(e) => setProductQty(product._id, parseInt(e.target.value, 10))}
                      disabled={!productSel[product._id]}
                      aria-label={`Quantity for ${product.name}`}
                    />
                  </div>
                ))
              )
            ) : filteredLocations.length === 0 ? (
              <EmptyState icon={Warehouse} title="No locations" hint="Try a different search." />
            ) : (
              filteredLocations.map((location) => (
                <div className="label-item" key={location._id}>
                  <input
                    type="checkbox"
                    checked={!!locationSel[location._id]}
                    onChange={() => toggleLocation(location._id)}
                    aria-label={`Select ${location.name}`}
                  />
                  <span className="label-item-meta">
                    <b>{location.name}</b>
                    <small>
                      {location.code}
                      {location.type ? ` · ${location.type.replace(/_/g, ' ')}` : ''}
                    </small>
                  </span>
                </div>
              ))
            )}
          </section>

          {/* Printable labels */}
          <section className="panel" style={{ padding: 16 }}>
            {tab === 'products' ? (
              printableCount === 0 ? (
                <EmptyState
                  icon={Package}
                  title="No product labels selected"
                  hint="Tick products on the left and set how many labels each needs."
                />
              ) : (
                <div className="label-grid">
                  {selectedProducts.map((product) =>
                    Array.from({ length: productSel[product._id] || 1 }, (_, index) => (
                      <BarcodeLabel
                        key={`${product._id}-${index}`}
                        name={product.name}
                        sku={product.sku}
                        barcode={product.barcode}
                      />
                    ))
                  )}
                </div>
              )
            ) : printableCount === 0 ? (
              <EmptyState
                icon={Warehouse}
                title="No location labels selected"
                hint="Tick locations on the left — each prints a QR code linking to its page."
              />
            ) : (
              <div className="label-grid">
                {selectedLocations.map((location) => (
                  <QrLabel key={location._id} id={location._id} name={location.name} code={location.code} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </>
  )
}
export const dynamic = 'force-dynamic'
