'use client'

import { useCallback, useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  AlertCircle,
  Building2,
  ChevronLeft,
  Clock,
  Mail,
  Pencil,
  Phone,
  ShieldAlert,
  Truck,
  X,
} from 'lucide-react'
import { PageHeading, Metric, EmptyState, Toast } from '@/components/redesign/ui'
import { apiFetch } from '@/lib/api'
import { useCan } from '@/hooks/useCan'

interface Supplier {
  _id: string
  name: string
  contactName?: string
  contactEmail?: string
  phone?: string
  website?: string
  address?: string
  leadTimeDays: number
  notes?: string
  isActive: boolean
  productCount?: number
  createdAt: string
  updatedAt: string
}

interface LinkedProduct {
  _id: string
  name: string
  sku: string
  unitCost?: number
  unitOfMeasure: string
  isActive: boolean
  totalAvailable?: number
}

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const { status } = useSession()

  const canRead = useCan('suppliers:read')
  const canUpdate = useCan('suppliers:update')
  const canReadProducts = useCan('products:read')

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [products, setProducts] = useState<LinkedProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  // edit modal
  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState({
    name: '',
    contactName: '',
    contactEmail: '',
    phone: '',
    website: '',
    address: '',
    leadTimeDays: 3,
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3500)
  }

  const fetchAll = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await apiFetch<Supplier>(`/api/suppliers/${id}`)
      if (!res.success) throw new Error(res.error || 'Failed to load supplier')
      setSupplier(res.data || null)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load supplier')
    } finally {
      setLoading(false)
    }
  }, [id])

  const fetchProducts = useCallback(async () => {
    if (!id || !canReadProducts) return
    try {
      const res = await apiFetch<LinkedProduct[]>(`/api/products?supplierId=${id}&limit=100`)
      if (res.success) setProducts(res.data || [])
    } catch {
      // linked products are supplementary — ignore failures
    }
  }, [id, canReadProducts])

  useEffect(() => {
    if (status === 'authenticated' && canRead) {
      fetchAll()
      fetchProducts()
    } else if (status !== 'loading') {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, canRead, fetchAll, fetchProducts])

  const openEdit = () => {
    if (!supplier) return
    setForm({
      name: supplier.name,
      contactName: supplier.contactName || '',
      contactEmail: supplier.contactEmail || '',
      phone: supplier.phone || '',
      website: supplier.website || '',
      address: supplier.address || '',
      leadTimeDays: supplier.leadTimeDays ?? 3,
      notes: supplier.notes || '',
    })
    setFormError('')
    setEditOpen(true)
  }

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!supplier) return
    setSaving(true)
    setFormError('')
    try {
      const res = await apiFetch<Supplier>(`/api/suppliers/${supplier._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          contactName: form.contactName,
          contactEmail: form.contactEmail,
          phone: form.phone,
          website: form.website,
          address: form.address,
          leadTimeDays: Number(form.leadTimeDays) || 0,
          notes: form.notes,
        }),
      })
      if (!res.success) {
        const details = res.details as Record<string, string[]> | undefined
        setFormError(details ? Object.values(details).flat()[0] || res.error || 'Failed to save' : res.error || 'Failed to save')
        return
      }
      setEditOpen(false)
      notify('Supplier updated')
      fetchAll()
    } catch {
      setFormError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading') {
    return <div className="empty-state" style={{ minHeight: 260 }}>Checking your permissions…</div>
  }

  if (!canRead) {
    return (
      <>
        <PageHeading
          eyebrow="PERMISSION REQUIRED"
          title="Supplier"
          subtitle="Vendor records are limited to roles with supplier access."
        />
        <div
          className="panel"
          style={{ padding: 28, display: 'grid', gap: 11, justifyItems: 'center', textAlign: 'center' }}
        >
          <ShieldAlert size={26} style={{ color: '#d5556a' }} />
          <b style={{ fontSize: 13 }}>Your role can&apos;t view suppliers</b>
          <Link href="/dashboard/suppliers" className="button button-secondary">
            Back to suppliers
          </Link>
        </div>
      </>
    )
  }

  if (loading) {
    return <div className="empty-state" style={{ minHeight: 260 }}>Loading supplier…</div>
  }

  if (error || !supplier) {
    return (
      <>
        <div className="back-row">
          <Link href="/dashboard/suppliers">
            <ChevronLeft size={15} /> Back to suppliers
          </Link>
        </div>
        <div className="data-disclaimer">
          <AlertCircle size={14} /> {error || 'Supplier not found'}
        </div>
        <div style={{ display: 'grid', placeItems: 'center', marginTop: 14 }}>
          <button className="button button-secondary button-small" onClick={fetchAll}>
            Retry
          </button>
        </div>
      </>
    )
  }

  // Stock value of linked products = Σ (unitCost × available units).
  const stockValue = products.reduce((sum, p) => sum + (p.unitCost || 0) * (p.totalAvailable || 0), 0)

  return (
    <>
      <div className="back-row">
        <Link href="/dashboard/suppliers">
          <ChevronLeft size={15} /> Back to suppliers
        </Link>
        <span> / {supplier.name}</span>
      </div>

      <PageHeading
        eyebrow="VENDOR RECORD"
        title={supplier.name}
        subtitle={
          [supplier.contactName, supplier.contactEmail].filter(Boolean).join(' · ') ||
          'Supplier details and linked catalog items.'
        }
        action={
          canUpdate && (
            <button className="button button-primary" onClick={openEdit}>
              <Pencil size={15} /> Edit supplier
            </button>
          )
        }
      />

      <div className="metric-grid compact-metrics">
        <Metric label="Lead time" value={`${supplier.leadTimeDays}d`} icon={Clock} detail="average ordering time" />
        <Metric
          label="Linked products"
          value={supplier.productCount ?? products.length}
          icon={Truck}
          tone="mint"
          detail="active catalog items"
        />
        <Metric label="Stock value" value={stockValue.toFixed(2)} icon={Building2} tone="blue" detail="unit cost × available" />
        <Metric
          label="Status"
          value={supplier.isActive ? 'Active' : 'Inactive'}
          icon={Building2}
          tone={supplier.isActive ? 'mint' : 'orange'}
          detail={supplier.isActive ? 'accepting orders' : 'deactivated'}
        />
      </div>

      <div className="product-detail-grid">
        <section className="panel product-overview">
          <div className="product-hero-icon">
            <Truck size={38} />
          </div>
          <div className="product-overview-title">
            <h2>{supplier.name}</h2>
            <span className="muted">{supplier.contactName || 'No contact person'}</span>
            {supplier.isActive ? (
              <span className="status status-healthy">
                <i /> Active
              </span>
            ) : (
              <span className="status status-rejected">
                <i /> Inactive
              </span>
            )}
          </div>
          <div className="detail-separator" />
          <div className="detail-kv">
            <span>Contact name</span>
            <b>{supplier.contactName || '—'}</b>
          </div>
          <div className="detail-kv">
            <span>Email</span>
            <b>
              {supplier.contactEmail ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Mail size={12} /> {supplier.contactEmail}
                </span>
              ) : (
                '—'
              )}
            </b>
          </div>
          <div className="detail-kv">
            <span>Phone</span>
            <b>
              {supplier.phone ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Phone size={12} /> {supplier.phone}
                </span>
              ) : (
                '—'
              )}
            </b>
          </div>
          <div className="detail-kv">
            <span>Website</span>
            <b style={{ fontWeight: 500 }}>{supplier.website || '—'}</b>
          </div>
          <div className="detail-kv">
            <span>Address</span>
            <b style={{ fontWeight: 500 }}>{supplier.address || '—'}</b>
          </div>
          <div className="detail-kv">
            <span>Lead time</span>
            <b>{supplier.leadTimeDays} days</b>
          </div>
          <div className="detail-kv">
            <span>Created</span>
            <b style={{ fontWeight: 500 }}>{new Date(supplier.createdAt).toLocaleDateString()}</b>
          </div>
          {supplier.notes && (
            <div className="detail-kv">
              <span>Notes</span>
              <b style={{ fontWeight: 500 }}>{supplier.notes}</b>
            </div>
          )}
        </section>

        <section className="panel product-stock">
          <div className="panel-heading">
            <div>
              <h2>Linked products</h2>
              <p>Catalog items sourced from this supplier</p>
            </div>
            <Link href="/dashboard/products" className="subtle-link">
              All products
            </Link>
          </div>
          {!canReadProducts ? (
            <EmptyState icon="package" title="No access to products" hint="Your role can't view the product catalog." />
          ) : products.length === 0 ? (
            <EmptyState
              icon="package"
              title="No products linked yet"
              hint="Set this supplier on a product's edit form to see it here."
            />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Unit cost</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p._id}>
                      <td>
                        <Link href={`/dashboard/products/${p._id}`} className="transfer-id">
                          {p.name}
                        </Link>
                      </td>
                      <td>{p.sku}</td>
                      <td className="value-cell">{(p.unitCost || 0).toFixed(2)}</td>
                      <td>
                        {p.isActive ? (
                          <span className="status status-healthy">
                            <i /> Active
                          </span>
                        ) : (
                          <span className="status status-rejected">
                            <i /> Inactive
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="table-footer">
            <span>
              Showing <b>{products.length}</b> linked products
            </span>
            <Link href={`/dashboard/products?search=${encodeURIComponent(supplier.name)}`} className="subtle-link">
              Search catalog
            </Link>
          </div>
        </section>
      </div>

      {editOpen && (
        <div className="modal-backdrop" onClick={() => !saving && setEditOpen(false)}>
          <form className="create-modal" onClick={(e) => e.stopPropagation()} onSubmit={saveEdit}>
            <div className="modal-heading">
              <div>
                <div className="modal-kicker">EDIT SUPPLIER</div>
                <h2 style={{ fontFamily: 'Manrope', fontSize: 17, margin: '6px 0 0' }}>Edit {supplier.name}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setEditOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="settings-field" style={{ maxWidth: 'none' }}>
              Supplier name *
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                maxLength={120}
              />
            </div>

            <div className="modal-route-grid" style={{ marginBottom: 4 }}>
              <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
                Contact name <span className="optional">(optional)</span>
                <input
                  value={form.contactName}
                  onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                  maxLength={120}
                />
              </label>
              <span className="modal-route-icon" aria-hidden>
                @
              </span>
              <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
                Email <span className="optional">(optional)</span>
                <input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                  maxLength={255}
                />
              </label>
            </div>

            <div className="modal-route-grid" style={{ marginBottom: 4 }}>
              <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
                Phone <span className="optional">(optional)</span>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  maxLength={30}
                />
              </label>
              <span className="modal-route-icon" aria-hidden>
                ⏱
              </span>
              <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
                Lead time (days)
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={form.leadTimeDays}
                  onChange={(e) => setForm((f) => ({ ...f, leadTimeDays: parseInt(e.target.value) || 0 }))}
                />
              </label>
            </div>

            <div className="settings-field" style={{ maxWidth: 'none' }}>
              Website <span className="optional">(optional)</span>
              <input
                value={form.website}
                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                maxLength={255}
              />
            </div>

            <div className="settings-field" style={{ maxWidth: 'none' }}>
              Address <span className="optional">(optional)</span>
              <input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                maxLength={300}
              />
            </div>

            <div className="settings-field" style={{ maxWidth: 'none' }}>
              Notes <span className="optional">(optional)</span>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
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

            {formError && (
              <div className="auth-message" style={{ background: '#fdeef0', borderColor: '#f6d3d9', color: '#a4404f' }}>
                {formError}
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button type="button" className="button button-secondary" onClick={() => setEditOpen(false)}>
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
export const dynamic = 'force-dynamic'
