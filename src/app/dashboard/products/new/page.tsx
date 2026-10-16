'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useCan } from '@/hooks/useCan'
import { Boxes, ChevronLeft, Package, ShieldAlert, Truck } from 'lucide-react'
import { PageHeading } from '@/components/redesign/ui'
import { apiFetch } from '@/lib/api'

const UNIT_OPTIONS = ['pcs', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'box', 'pack', 'roll', 'other']

interface SupplierOption {
  _id: string
  name: string
  leadTimeDays: number
}

export default function NewProductPage() {
  const router = useRouter()
  const { status } = useSession()
  const canCreate = useCan('products:create')
  const [form, setForm] = useState({
    name: '',
    sku: '',
    description: '',
    category: '',
    unitOfMeasure: 'pcs',
    barcode: '',
    reorderThreshold: 0,
    reorderQuantity: 0,
    supplier: '',
    unitCost: '',
  })
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status !== 'authenticated') return
    ;(async () => {
      try {
        const res = await apiFetch<SupplierOption[]>('/api/suppliers?limit=100&active=active')
        if (res.success) setSuppliers(res.data || [])
      } catch {
        // Supplier picker is optional — leave it empty on failure.
      }
    })()
  }, [status])

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({
      ...prev,
      [key]:
        key === 'reorderThreshold' || key === 'reorderQuantity'
          ? Math.max(0, parseInt(e.target.value) || 0)
          : key === 'sku'
            ? e.target.value.toUpperCase()
            : e.target.value,
    }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          description: form.description || undefined,
          category: form.category || undefined,
          barcode: form.barcode || undefined,
          supplier: form.supplier || undefined,
          unitCost: Math.max(0, parseFloat(String(form.unitCost)) || 0),
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        const firstDetail = data?.details ? Object.values(data.details).flat()[0] : null
        setError(firstDetail || data?.error || 'Failed to create product')
      } else {
        router.push('/dashboard/products')
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
          title="New product"
          subtitle="Adding products is limited to admins and inventory managers."
        />
        <div
          className="panel"
          style={{ padding: 28, display: 'grid', gap: 11, justifyItems: 'center', textAlign: 'center' }}
        >
          <ShieldAlert size={26} style={{ color: '#d5556a' }} />
          <b style={{ fontSize: 13 }}>Your role can&apos;t create products</b>
          <p style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 400, lineHeight: 1.7, margin: 0 }}>
            Ask a workspace admin for the Inventory manager role if you need to add catalog items.
            You can still browse existing products.
          </p>
          <Link href="/dashboard/products" className="button button-secondary">
            Back to products
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="back-row">
        <Link href="/dashboard/products">
          <ChevronLeft size={15} /> Back to products
        </Link>
        <span> / New product</span>
      </div>

      <PageHeading
        eyebrow="PRODUCT CATALOG"
        title="New product"
        subtitle="Add an item to your catalog so teams can stock and move it."
      />

      <form className="panel" style={{ padding: 24, maxWidth: 760 }} onSubmit={submit}>
        <div className="modal-route-grid" style={{ marginBottom: 18 }}>
          <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
            Product name
            <div className="field-wrap">
              <Package size={16} />
              <input required placeholder="e.g. Wireless Barcode Scanner" value={form.name} onChange={set('name')} maxLength={200} />
            </div>
          </label>
          <span className="modal-route-icon" aria-hidden>
            #
          </span>
          <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
            SKU
            <div className="field-wrap">
              <Boxes size={16} />
              <input
                required
                placeholder="SKU-1048"
                value={form.sku}
                onChange={set('sku')}
                maxLength={50}
                pattern="[A-Z0-9-_]+"
                title="Uppercase letters, numbers, hyphens, and underscores only"
              />
            </div>
          </label>
        </div>

        <div className="modal-route-grid" style={{ marginBottom: 18 }}>
          <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
            Category <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span>
            <div className="field-wrap">
              <input placeholder="e.g. Electronics" value={form.category} onChange={set('category')} maxLength={100} />
            </div>
          </label>
          <span className="modal-route-icon" aria-hidden>
            /
          </span>
          <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
            Unit of measure
            <div className="field-wrap">
              <select
                value={form.unitOfMeasure}
                onChange={set('unitOfMeasure')}
                style={{ border: 0, outline: 0, width: '100%', background: 'transparent', color: 'var(--ink)' }}
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {u.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>

        <div className="modal-route-grid" style={{ marginBottom: 18 }}>
          <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
            Reorder threshold
            <div className="field-wrap">
              <input type="number" min={0} value={form.reorderThreshold} onChange={set('reorderThreshold')} />
            </div>
          </label>
          <span className="modal-route-icon" aria-hidden>
            +
          </span>
          <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
            Reorder quantity
            <div className="field-wrap">
              <input type="number" min={0} value={form.reorderQuantity} onChange={set('reorderQuantity')} />
            </div>
          </label>
        </div>

        <div className="modal-route-grid" style={{ marginBottom: 18 }}>
          <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
            Supplier <span className="optional">(optional)</span>
            <div className="field-wrap">
              <Truck size={16} />
              <select
                value={form.supplier}
                onChange={set('supplier')}
                style={{ border: 0, outline: 0, width: '100%', background: 'transparent', color: 'var(--ink)' }}
              >
                <option value="">None</option>
                {suppliers.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} — {s.leadTimeDays}d lead time
                  </option>
                ))}
              </select>
            </div>
            <small style={{ fontWeight: 400, color: 'var(--muted)' }}>
              {suppliers.length === 0 && <>No active suppliers yet — </>}
              <Link href="/dashboard/suppliers" className="subtle-link">
                Manage suppliers
              </Link>
            </small>
          </label>
          <span className="modal-route-icon" aria-hidden>
            $
          </span>
          <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
            Unit cost <span className="optional">(optional)</span>
            <div className="field-wrap">
              <input
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                value={form.unitCost}
                onChange={set('unitCost')}
              />
            </div>
          </label>
        </div>

        <label className="settings-field" style={{ maxWidth: 'none' }}>
          Barcode <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span>
          <div className="field-wrap">
            <input placeholder="e.g. 8901234567890" value={form.barcode} onChange={set('barcode')} maxLength={100} />
          </div>
        </label>

        <label className="settings-field" style={{ maxWidth: 'none' }}>
          Description <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span>
          <div className="field-wrap" style={{ height: 'auto', padding: '10px 12px' }}>
            <textarea
              rows={3}
              placeholder="What is this product?"
              value={form.description}
              onChange={set('description')}
              maxLength={1000}
              style={{ border: 0, outline: 0, width: '100%', background: 'transparent', resize: 'vertical', font: 'inherit', color: 'var(--ink)' }}
            />
          </div>
        </label>

        {error && (
          <div className="auth-message" style={{ background: '#fdeef0', borderColor: '#f6d3d9', color: '#a4404f' }}>
            {error}
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 18 }}>
          <Link href="/dashboard/products" className="button button-secondary">
            Cancel
          </Link>
          <button type="submit" className="button button-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create product'}
          </button>
        </div>
      </form>
    </>
  )
}
export const dynamic = 'force-dynamic'
