'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useCan } from '@/hooks/useCan'
import { ChevronLeft, Package, Plus, X, ShieldAlert } from 'lucide-react'
import { PageHeading } from '@/components/redesign/ui'

const UNIT_OPTIONS = ['pcs', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'box', 'pack', 'roll', 'other']

interface LineItem {
  productId: string
  name: string
  sku: string
  requestedQuantity: number
}

export default function NewTransferPage() {
  const router = useRouter()
  const { status } = useSession()
  const canCreate = useCan('transfers:create')
  const [locations, setLocations] = useState<{ _id: string; name: string; code: string }[]>([])
  const [products, setProducts] = useState<{ _id: string; name: string; sku: string }[]>([])
  const [loaded, setLoaded] = useState(false)

  const [sourceLocationId, setSourceLocationId] = useState('')
  const [destinationLocationId, setDestinationLocationId] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [productPicker, setProductPicker] = useState('')
  const [qty, setQty] = useState(1)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // load reference data once
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [locRes, prodRes] = await Promise.all([fetch('/api/locations'), fetch('/api/products')])
        const locData = await locRes.json()
        const prodData = await prodRes.json()
        if (cancelled) return
        if (locRes.ok) setLocations(locData.data || [])
        if (prodRes.ok) setProducts(prodData.data || [])
        setLoaded(true)
      } catch {
        if (!cancelled) setError('Could not load locations and products.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const addLine = () => {
    const product = products.find((p) => p._id === productPicker)
    if (!product || qty < 1) return
    setLineItems((prev) => {
      const existing = prev.findIndex((l) => l.productId === product._id)
      if (existing >= 0) {
        const next = [...prev]
        next[existing].requestedQuantity += qty
        return next
      }
      return [...prev, { productId: product._id, name: product.name, sku: product.sku, requestedQuantity: qty }]
    })
    setProductPicker('')
    setQty(1)
  }

  const removeLine = (productId: string) =>
    setLineItems((prev) => prev.filter((l) => l.productId !== productId))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!sourceLocationId || !destinationLocationId) {
      setError('Choose both a source and a destination location.')
      return
    }
    if (sourceLocationId === destinationLocationId) {
      setError('Source and destination must be different locations.')
      return
    }
    if (lineItems.length === 0) {
      setError('Add at least one product line.')
      return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceLocationId,
          destinationLocationId,
          lineItems: lineItems.map((l) => ({
            productId: l.productId,
            requestedQuantity: l.requestedQuantity,
          })),
          notes: notes || undefined,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        const firstDetail = data?.details ? Object.values(data.details).flat()[0] : null
        setError(firstDetail || data?.error || 'Failed to create transfer')
      } else {
        const id = data?.data?._id
        router.push(id ? `/dashboard/transfers/${id}` : '/dashboard/transfers')
      }
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
          title="New transfer"
          subtitle="Creating transfers is limited to admins and inventory managers."
        />
        <div
          className="panel"
          style={{ padding: 28, display: 'grid', gap: 11, justifyItems: 'center', textAlign: 'center' }}
        >
          <ShieldAlert size={26} style={{ color: '#d5556a' }} />
          <b style={{ fontSize: 13 }}>Your role can&apos;t create transfers</b>
          <p style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 400, lineHeight: 1.7, margin: 0 }}>
            Ask a workspace admin for the Inventory manager role if you need to move stock. Approvers
            and warehouse staff can still work on existing transfers.
          </p>
          <Link href="/dashboard/transfers" className="button button-secondary">
            Back to transfers
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="back-row">
        <Link href="/dashboard/transfers">
          <ChevronLeft size={15} /> Back to transfers
        </Link>
        <span> / New transfer</span>
      </div>

      <PageHeading
        eyebrow="STOCK MOVEMENT"
        title="New transfer"
        subtitle="Pick source and destination, add products, and send it for approval."
      />

      <form className="panel" style={{ padding: 24, maxWidth: 760 }} onSubmit={submit}>
        <div className="modal-route-grid" style={{ marginBottom: 20 }}>
          <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
            Source location
            <div className="field-wrap">
              <select
                value={sourceLocationId}
                onChange={(e) => setSourceLocationId(e.target.value)}
                required
                style={{ border: 0, outline: 0, width: '100%', background: 'transparent', color: 'var(--ink)' }}
              >
                <option value="">Select source…</option>
                {locations.map((l) => (
                  <option key={l._id} value={l._id}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>
          </label>
          <span className="modal-route-icon" aria-hidden>
            →
          </span>
          <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
            Destination location
            <div className="field-wrap">
              <select
                value={destinationLocationId}
                onChange={(e) => setDestinationLocationId(e.target.value)}
                required
                style={{ border: 0, outline: 0, width: '100%', background: 'transparent', color: 'var(--ink)' }}
              >
                <option value="">Select destination…</option>
                {locations.map((l) => (
                  <option key={l._id} value={l._id}>
                    {l.name} ({l.code})
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
                style={{ border: 0, outline: 0, width: '100%', background: 'transparent', color: 'var(--ink)' }}
              >
                <option value="">Choose a product…</option>
                {products.map((p) => (
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
                value={qty}
                onChange={(e) => setQty(parseInt(e.target.value) || 1)}
                aria-label="Quantity"
              />
            </div>
            <button
              type="button"
              className="button button-secondary"
              onClick={addLine}
              disabled={!productPicker}
            >
              <Plus size={15} /> Add
            </button>
          </div>
        </div>

        {lineItems.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            {lineItems.map((l) => (
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
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: 12, display: 'block' }}>{l.name}</b>
                  <small style={{ fontSize: 10, color: 'var(--muted)' }}>{l.sku}</small>
                </div>
                <b style={{ fontSize: 12 }}>{l.requestedQuantity} units</b>
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
              placeholder="Anything the receiving team should know"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
              style={{ border: 0, outline: 0, width: '100%', background: 'transparent', resize: 'vertical', color: 'var(--ink)', font: 'inherit' }}
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
          <Link href="/dashboard/transfers" className="button button-secondary">
            Cancel
          </Link>
          <button type="submit" className="button button-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create transfer'}
          </button>
        </div>
      </form>
    </>
  )
}
export const dynamic = 'force-dynamic'
