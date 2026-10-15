'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useCan } from '@/hooks/useCan'
import { ChevronLeft, Package, SlidersHorizontal, Warehouse, ArrowDownRight, ArrowUpRight, ShieldAlert } from 'lucide-react'
import { PageHeading } from '@/components/redesign/ui'

export default function AdjustInventoryPage() {
  const router = useRouter()
  const { status } = useSession()
  const canAdjust = useCan('inventory:adjust')
  const [products, setProducts] = useState<{ _id: string; name: string; sku: string }[]>([])
  const [locations, setLocations] = useState<{ _id: string; name: string; code: string }[]>([])

  const [productId, setProductId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [adjustmentQuantity, setAdjustmentQuantity] = useState(0)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const [prodRes, locRes] = await Promise.all([fetch('/api/products'), fetch('/api/locations')])
        const prodData = await prodRes.json()
        const locData = await locRes.json()
        if (prodRes.ok) setProducts(prodData.data || [])
        if (locRes.ok) setLocations(locData.data || [])
      } catch {
        setError('Could not load products and locations.')
      }
    })()
  }, [])

  const isAdd = adjustmentQuantity > 0

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (adjustmentQuantity === 0) {
      setError('Enter a non-zero quantity to adjust.')
      return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/inventory/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          locationId,
          adjustmentQuantity,
          reason,
          notes: notes || undefined,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        const firstDetail = data?.details ? Object.values(data.details).flat()[0] : null
        setError(firstDetail || data?.error || 'Failed to adjust inventory')
      } else {
        router.push('/dashboard/inventory')
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

  if (!canAdjust) {
    return (
      <>
        <PageHeading
          eyebrow="PERMISSION REQUIRED"
          title="Adjust stock"
          subtitle="Stock corrections are limited to inventory managers and admins."
        />
        <div
          className="panel"
          style={{ padding: 28, display: 'grid', gap: 11, justifyItems: 'center', textAlign: 'center' }}
        >
          <ShieldAlert size={26} style={{ color: '#d5556a' }} />
          <b style={{ fontSize: 13 }}>Your role can&apos;t adjust stock</b>
          <p style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 400, lineHeight: 1.7, margin: 0 }}>
            Ask a workspace admin for the Inventory manager role if you need to record corrections.
            You can still browse stock in the meantime.
          </p>
          <Link href="/dashboard/inventory" className="button button-secondary">
            Back to inventory
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="back-row">
        <Link href="/dashboard/inventory">
          <ChevronLeft size={15} /> Back to inventory
        </Link>
        <span> / Adjust stock</span>
      </div>

      <PageHeading
        eyebrow="STOCK ADJUSTMENT"
        title="Adjust stock"
        subtitle="Record a correction for damaged, counted, or received stock."
      />

      <form className="panel" style={{ padding: 24, maxWidth: 760 }} onSubmit={submit}>
        <div className="modal-route-grid" style={{ marginBottom: 18 }}>
          <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
            Product
            <div className="field-wrap">
              <Package size={16} />
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                required
                style={{ border: 0, outline: 0, width: '100%', background: 'transparent', color: 'var(--ink)' }}
              >
                <option value="">Select product…</option>
                {products.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} — {p.sku}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <span className="modal-route-icon" aria-hidden>
            →
          </span>
          <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
            Location
            <div className="field-wrap">
              <Warehouse size={16} />
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                required
                style={{ border: 0, outline: 0, width: '100%', background: 'transparent', color: 'var(--ink)' }}
              >
                <option value="">Select location…</option>
                {locations.map((l) => (
                  <option key={l._id} value={l._id}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>

        <label className="settings-field" style={{ maxWidth: 'none' }}>
          Adjustment quantity {isAdd ? '(stock in)' : '(stock out)'}
          <div className="field-wrap">
            {isAdd ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
            <input
              type="number"
              required
              placeholder="e.g. 10 or -5"
              value={adjustmentQuantity || ''}
              onChange={(e) => setAdjustmentQuantity(parseInt(e.target.value) || 0)}
            />
          </div>
          <small style={{ fontWeight: 400, color: 'var(--muted)' }}>
            Use a positive number to add stock, negative to remove it.
          </small>
        </label>

        <label className="settings-field" style={{ maxWidth: 'none' }}>
          Reason
          <div className="field-wrap">
            <SlidersHorizontal size={16} />
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              style={{ border: 0, outline: 0, width: '100%', background: 'transparent', color: 'var(--ink)' }}
            >
              <option value="">Select a reason…</option>
              <option value="Cycle count">Cycle count</option>
              <option value="Damaged stock">Damaged stock</option>
              <option value="Manual correction">Manual correction</option>
              <option value="Received without transfer">Received without transfer</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </label>

        <label className="settings-field" style={{ maxWidth: 'none' }}>
          Notes <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span>
          <div className="field-wrap" style={{ height: 'auto', padding: '10px 12px' }}>
            <textarea
              rows={3}
              placeholder="Add context for the audit trail"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              style={{ border: 0, outline: 0, width: '100%', background: 'transparent', resize: 'vertical', font: 'inherit', color: 'var(--ink)' }}
            />
          </div>
        </label>

        {error && (
          <div className="auth-message" style={{ background: '#fdeef0', borderColor: '#f6d3d9', color: '#a4404f' }}>
            {error}
          </div>
        )}

        <div className="modal-footnote" style={{ marginTop: 16 }}>
          <SlidersHorizontal size={14} />
          Adjustments update available stock and create an inventory movement plus an audit event.
        </div>

        <div className="modal-actions" style={{ marginTop: 18 }}>
          <Link href="/dashboard/inventory" className="button button-secondary">
            Cancel
          </Link>
          <button type="submit" className="button button-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save adjustment'}
          </button>
        </div>
      </form>
    </>
  )
}
export const dynamic = 'force-dynamic'
