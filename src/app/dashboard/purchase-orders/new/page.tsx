'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useCan } from '@/hooks/useCan'
import { apiFetch } from '@/lib/api'
import { ChevronLeft, Package, Plus, ShieldAlert, Truck, Warehouse, X } from 'lucide-react'
import { PageHeading } from '@/components/redesign/ui'

interface Option {
  _id: string
  name: string
  code?: string
  leadTimeDays?: number
}

interface ProductOption extends Option {
  sku: string
  unitCost?: number
}

interface LineRow {
  productId: string
  name: string
  sku: string
  quantity: number
  unitCost: number
}

export default function NewPurchaseOrderPage() {
  const router = useRouter()
  const { status } = useSession()
  const canCreate = useCan('purchase_orders:create')

  const [suppliers, setSuppliers] = useState<Option[]>([])
  const [locations, setLocations] = useState<Option[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [refLoaded, setRefLoaded] = useState(false)

  const [supplierId, setSupplierId] = useState('')
  const [destinationLocationId, setDestinationLocationId] = useState('')
  const [lines, setLines] = useState<LineRow[]>([])
  const [notes, setNotes] = useState('')
  const [productPicker, setProductPicker] = useState('')
  const [pickerQty, setPickerQty] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  /** Pre-fill from ?productId=A&quantity=5&productId=B&quantity=2 (positionally paired). */
  const prefill = useRef<{ productIds: string[]; quantities: number[] }>({ productIds: [], quantities: [] })

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const productIds = sp.getAll('productId').filter(Boolean)
    const quantities = sp.getAll('quantity').map((value) => {
      const parsed = parseInt(value, 10)
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
    })
    if (productIds.length > 0) {
      prefill.current = { productIds, quantities }
    }
    const presetSupplier = sp.get('supplierId')
    if (presetSupplier) setSupplierId(presetSupplier)
  }, [])

  // Load suppliers, destinations and the product catalogue once.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [supplierRes, locationRes, productRes] = await Promise.all([
          apiFetch<Option[]>('/api/suppliers?limit=100&active=active'),
          apiFetch<Option[]>('/api/locations?limit=100'),
          apiFetch<ProductOption[]>('/api/products?limit=100'),
        ])
        if (cancelled) return
        setSuppliers(supplierRes.data || [])
        setLocations(locationRes.data || [])
        setProducts(productRes.data || [])
        if (!supplierRes.success || !locationRes.success) {
          setError('Could not load suppliers or locations.')
        }
      } catch {
        if (!cancelled) setError('Could not load suppliers, locations and products.')
      } finally {
        if (!cancelled) setRefLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Apply URL prefill once the product catalogue is available.
  useEffect(() => {
    if (!refLoaded || prefill.current.productIds.length === 0) return
    const { productIds, quantities } = prefill.current
    prefill.current = { productIds: [], quantities: [] }

    const rows: LineRow[] = []
    productIds.forEach((pid, index) => {
      if (rows.some((row) => row.productId === pid)) return
      const product = products.find((p) => p._id === pid)
      rows.push({
        productId: pid,
        name: product?.name || pid,
        sku: product?.sku || '',
        quantity: quantities[index] || 1,
        unitCost: product?.unitCost || 0,
      })
    })
    if (rows.length > 0) setLines(rows)
  }, [refLoaded, products])

  const addLine = () => {
    const product = products.find((p) => p._id === productPicker)
    if (!product || pickerQty < 1) return
    if (lines.some((l) => l.productId === product._id)) {
      setError('That product is already on the order.')
      return
    }
    setError('')
    setLines((prev) => [
      ...prev,
      {
        productId: product._id,
        name: product.name,
        sku: product.sku,
        quantity: pickerQty,
        unitCost: product.unitCost || 0,
      },
    ])
    setProductPicker('')
    setPickerQty(1)
  }

  const updateLine = (productId: string, patch: Partial<LineRow>) =>
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)))

  const removeLine = (productId: string) =>
    setLines((prev) => prev.filter((l) => l.productId !== productId))

  const availableProducts = products.filter((p) => !lines.some((l) => l.productId === p._id))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!supplierId) {
      setError('Choose a supplier.')
      return
    }
    if (!destinationLocationId) {
      setError('Choose where the stock will be delivered.')
      return
    }
    if (lines.length === 0) {
      setError('Add at least one product line.')
      return
    }
    if (lines.some((l) => !Number.isInteger(l.quantity) || l.quantity < 1)) {
      setError('Every line needs a whole quantity of at least 1.')
      return
    }
    setSaving(true)
    try {
      const res = await apiFetch<{ _id: string }>('/api/purchase-orders', {
        method: 'POST',
        body: {
          supplierId,
          destinationLocationId,
          notes: notes || undefined,
          lines: lines.map((l) => ({
            productId: l.productId,
            requestedQuantity: l.quantity,
            unitCost: l.unitCost >= 0 ? l.unitCost : undefined,
          })),
        },
      })
      if (!res.success) {
        const details = (res as any).details as Record<string, string[]> | undefined
        const firstDetail = details ? Object.values(details).flat()[0] : null
        setError(firstDetail || res.error || 'Failed to create purchase order')
        return
      }
      const id = (res.data as any)?._id
      router.push(id ? `/dashboard/purchase-orders/${id}` : '/dashboard/purchase-orders')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="empty-state" style={{ minHeight: 260 }}>
        Checking your permissions…
      </div>
    )
  }

  if (!canCreate) {
    return (
      <>
        <PageHeading
          eyebrow="PERMISSION REQUIRED"
          title="New purchase order"
          subtitle="Creating purchase orders is limited to admins and inventory managers."
        />
        <div
          className="panel"
          style={{ padding: 28, display: 'grid', gap: 11, justifyItems: 'center', textAlign: 'center' }}
        >
          <ShieldAlert size={26} style={{ color: '#d5556a' }} />
          <b style={{ fontSize: 13 }}>Your role can&apos;t create purchase orders</b>
          <p style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 400, lineHeight: 1.7, margin: 0 }}>
            Ask a workspace admin for purchasing permissions if you need to order stock.
            You can still review existing orders if your role allows it.
          </p>
          <Link href="/dashboard/purchase-orders" className="button button-secondary">
            Back to purchase orders
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="back-row">
        <Link href="/dashboard/purchase-orders">
          <ChevronLeft size={15} /> Back to purchase orders
        </Link>
        <span> / New purchase order</span>
      </div>

      <PageHeading
        eyebrow="PROCUREMENT"
        title="New purchase order"
        subtitle="Pick a supplier and destination, add products, then send it for delivery."
      />

      <form className="panel" style={{ padding: 24, maxWidth: 820 }} onSubmit={submit}>
        <div className="modal-route-grid" style={{ marginBottom: 20 }}>
          <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
            Supplier
            <div className="field-wrap">
              <Truck size={16} />
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                required
                disabled={!refLoaded}
                style={{ border: 0, outline: 0, width: '100%', background: 'transparent', color: 'var(--ink)' }}
              >
                <option value="">Select supplier…</option>
                {suppliers.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                    {typeof s.leadTimeDays === 'number' ? ` — ${s.leadTimeDays}d lead time` : ''}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <span className="modal-route-icon" aria-hidden>
            →
          </span>
          <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
            Deliver to
            <div className="field-wrap">
              <Warehouse size={16} />
              <select
                value={destinationLocationId}
                onChange={(e) => setDestinationLocationId(e.target.value)}
                required
                disabled={!refLoaded}
                style={{ border: 0, outline: 0, width: '100%', background: 'transparent', color: 'var(--ink)' }}
              >
                <option value="">Select location…</option>
                {locations.map((l) => (
                  <option key={l._id} value={l._id}>
                    {l.name}
                    {l.code ? ` (${l.code})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>

        <div className="settings-field" style={{ maxWidth: 'none' }}>
          <label>Add products</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="field-wrap" style={{ flex: 1 }}>
              <Package size={16} />
              <select
                value={productPicker}
                onChange={(e) => setProductPicker(e.target.value)}
                disabled={!refLoaded}
                style={{ border: 0, outline: 0, width: '100%', background: 'transparent', color: 'var(--ink)' }}
              >
                <option value="">Choose a product…</option>
                {availableProducts.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} — {p.sku}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-wrap" style={{ width: 90 }}>
              <input
                type="number"
                min={1}
                max={1000000}
                value={pickerQty}
                onChange={(e) => setPickerQty(parseInt(e.target.value) || 1)}
                aria-label="Quantity"
              />
            </div>
            <button type="button" className="button button-secondary" onClick={addLine} disabled={!productPicker}>
              <Plus size={15} /> Add
            </button>
          </div>
        </div>

        {lines.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            {lines.map((l) => (
              <div
                key={l.productId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '11px 12px',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <span className="product-thumbnail">
                  <Package size={15} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 12, display: 'block' }}>{l.name}</b>
                  <small style={{ fontSize: 10, color: 'var(--muted)' }}>{l.sku}</small>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--muted)' }}>
                  Qty
                  <input
                    type="number"
                    min={1}
                    max={1000000}
                    value={l.quantity}
                    onChange={(e) => updateLine(l.productId, { quantity: parseInt(e.target.value) || 0 })}
                    aria-label={`Quantity for ${l.name}`}
                    style={{
                      width: 74,
                      height: 32,
                      borderRadius: 8,
                      border: '1px solid var(--line)',
                      background: 'var(--surface)',
                      color: 'var(--ink)',
                      padding: '0 8px',
                    }}
                  />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--muted)' }}>
                  Unit cost
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={l.unitCost}
                    onChange={(e) => updateLine(l.productId, { unitCost: Math.max(0, parseFloat(e.target.value) || 0) })}
                    aria-label={`Unit cost for ${l.name}`}
                    style={{
                      width: 90,
                      height: 32,
                      borderRadius: 8,
                      border: '1px solid var(--line)',
                      background: 'var(--surface)',
                      color: 'var(--ink)',
                      padding: '0 8px',
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => removeLine(l.productId)}
                  aria-label={`Remove ${l.name}`}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', fontSize: 10, color: 'var(--muted)' }}>
              <span>
                {lines.length} line{lines.length === 1 ? '' : 's'}
              </span>
              <span>
                <b style={{ color: 'var(--ink)' }}>
                  {formatValue(lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0))}
                </b>{' '}
                total
              </span>
            </div>
          </div>
        ) : (
          <div className="modal-empty-products" style={{ marginTop: 14 }}>
            <Package size={20} />
            <b style={{ fontSize: 11 }}>No products added yet</b>
            <span style={{ fontSize: 10 }}>Choose a product and quantity above.</span>
          </div>
        )}

        <label className="settings-field" style={{ maxWidth: 'none', marginTop: 20 }}>
          Notes <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span>
          <div className="field-wrap" style={{ height: 'auto', padding: '10px 12px' }}>
            <textarea
              rows={3}
              placeholder="Anything the supplier or receiving team should know"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
              style={{
                border: 0,
                outline: 0,
                width: '100%',
                background: 'transparent',
                resize: 'vertical',
                color: 'var(--ink)',
                font: 'inherit',
              }}
            />
          </div>
        </label>

        {error && (
          <div
            className="auth-message"
            style={{ background: '#fdeef0', borderColor: '#f6d3d9', color: '#a4404f', marginTop: 16 }}
          >
            {error}
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <Link href="/dashboard/purchase-orders" className="button button-secondary">
            Cancel
          </Link>
          <button type="submit" className="button button-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create purchase order'}
          </button>
        </div>
      </form>
    </>
  )
}

function formatValue(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export const dynamic = 'force-dynamic'
