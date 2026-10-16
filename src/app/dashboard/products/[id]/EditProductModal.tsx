'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Pencil, X } from 'lucide-react'
import { Toast } from '@/components/redesign/ui'
import { apiFetch } from '@/lib/api'

const UNIT_OPTIONS = ['pcs', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'box', 'pack', 'roll', 'other']

interface SupplierOption {
  _id: string
  name: string
  leadTimeDays: number
  isActive?: boolean
}

/** Serializable subset of the product the server page passes down. */
export interface EditableProduct {
  _id: string
  name: string
  sku: string
  description?: string
  category?: string
  unitOfMeasure: string
  barcode?: string
  reorderThreshold: number
  reorderQuantity: number
  unitCost?: number
  supplier?: { _id: string; name: string } | null
}

/**
 * Inline "Edit product" modal for the (server-rendered) product detail page.
 * PATCHes /api/products/:id with name/sku/description/category/uom/barcode/
 * thresholds/supplier/unitCost, then refreshes the server-rendered page.
 */
export function EditProductModal({ product }: { product: EditableProduct }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])

  const [form, setForm] = useState({
    name: product.name,
    sku: product.sku,
    description: product.description || '',
    category: product.category || '',
    unitOfMeasure: product.unitOfMeasure,
    barcode: product.barcode || '',
    reorderThreshold: product.reorderThreshold || 0,
    reorderQuantity: product.reorderQuantity || 0,
    supplier: product.supplier?._id || '',
    unitCost: String(product.unitCost ?? 0),
  })

  useEffect(() => {
    if (!open) return
    ;(async () => {
      try {
        const res = await apiFetch<SupplierOption[]>('/api/suppliers?limit=100&active=all')
        if (res.success) setSuppliers(res.data || [])
      } catch {
        // Supplier picker is optional — leave it empty on failure.
      }
    })()
  }, [open])

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
      const res = await apiFetch(`/api/products/${product._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          sku: form.sku.toUpperCase(),
          description: form.description,
          category: form.category,
          unitOfMeasure: form.unitOfMeasure,
          barcode: form.barcode,
          reorderThreshold: form.reorderThreshold,
          reorderQuantity: form.reorderQuantity,
          supplier: form.supplier || null,
          unitCost: Math.max(0, parseFloat(form.unitCost) || 0),
        }),
      })
      if (!res.success) {
        const details = res.details as Record<string, string[]> | undefined
        setError(details ? Object.values(details).flat()[0] || res.error || 'Failed to save' : res.error || 'Failed to save')
        return
      }
      setOpen(false)
      setToast('Product updated')
      window.setTimeout(() => setToast(''), 3500)
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button className="button button-primary" onClick={() => setOpen(true)}>
        <Pencil size={15} /> Edit product
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => !saving && setOpen(false)}>
          <form className="create-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div className="modal-heading">
              <div>
                <div className="modal-kicker">EDIT PRODUCT</div>
                <h2 style={{ fontFamily: 'Manrope', fontSize: 17, margin: '6px 0 0' }}>{product.name}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="modal-route-grid" style={{ marginBottom: 4 }}>
              <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
                Product name *
                <input required value={form.name} onChange={set('name')} maxLength={200} />
              </label>
              <span className="modal-route-icon" aria-hidden>
                #
              </span>
              <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
                SKU *
                <input
                  required
                  value={form.sku}
                  onChange={set('sku')}
                  maxLength={50}
                  pattern="[A-Z0-9-_]+"
                  title="Uppercase letters, numbers, hyphens, and underscores only"
                />
              </label>
            </div>

            <div className="modal-route-grid" style={{ marginBottom: 4 }}>
              <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
                Category <span className="optional">(optional)</span>
                <input value={form.category} onChange={set('category')} maxLength={100} />
              </label>
              <span className="modal-route-icon" aria-hidden>
                /
              </span>
              <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
                Unit of measure
                <select value={form.unitOfMeasure} onChange={set('unitOfMeasure')}>
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u}>
                      {u.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="modal-route-grid" style={{ marginBottom: 4 }}>
              <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
                Barcode <span className="optional">(optional)</span>
                <input value={form.barcode} onChange={set('barcode')} maxLength={100} />
              </label>
              <span className="modal-route-icon" aria-hidden>
                |
              </span>
              <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
                Unit cost <span className="optional">(optional)</span>
                <input type="number" min={0} step={0.01} value={form.unitCost} onChange={set('unitCost')} />
              </label>
            </div>

            <div className="modal-route-grid" style={{ marginBottom: 4 }}>
              <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
                Reorder threshold
                <input
                  type="number"
                  min={0}
                  value={form.reorderThreshold}
                  onChange={set('reorderThreshold')}
                />
              </label>
              <span className="modal-route-icon" aria-hidden>
                +
              </span>
              <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
                Reorder quantity
                <input
                  type="number"
                  min={0}
                  value={form.reorderQuantity}
                  onChange={set('reorderQuantity')}
                />
              </label>
            </div>

            <div className="settings-field" style={{ maxWidth: 'none' }}>
              Supplier <span className="optional">(optional)</span>
              <select value={form.supplier} onChange={set('supplier')}>
                <option value="">None</option>
                {suppliers.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                    {s.isActive === false ? ' (inactive)' : ''} — {s.leadTimeDays}d lead time
                  </option>
                ))}
              </select>
              <small style={{ fontWeight: 400, color: 'var(--muted)' }}>
                <Link href="/dashboard/suppliers" className="subtle-link">
                  Manage suppliers
                </Link>
              </small>
            </div>

            <div className="settings-field" style={{ maxWidth: 'none', marginBottom: 4 }}>
              Description <span className="optional">(optional)</span>
              <textarea
                rows={3}
                value={form.description}
                onChange={set('description')}
                maxLength={1000}
                style={{
                  width: '100%',
                  border: '1px solid #eae7f1',
                  background: '#fff',
                  borderRadius: 8,
                  padding: '10px 11px',
                  outline: 0,
                  color: '#57516a',
                  fontSize: 11,
                  resize: 'vertical',
                  font: 'inherit',
                }}
              />
            </div>

            {error && (
              <div className="auth-message" style={{ background: '#fdeef0', borderColor: '#f6d3d9', color: '#a4404f' }}>
                {error}
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button type="button" className="button button-secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="button button-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </>
  )
}
