'use client'

import { useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Clock,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldAlert,
  Truck,
  Users,
  X,
} from 'lucide-react'
import { PageHeading, Metric, EmptyState, Toast } from '@/components/redesign/ui'
import { Pagination, CsvExportButton } from '@/components/redesign/TableBits'
import { apiFetch, ApiPagination } from '@/lib/api'
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
}

const PAGE_SIZE = 20

const EMPTY_FORM = {
  name: '',
  contactName: '',
  contactEmail: '',
  phone: '',
  website: '',
  address: '',
  leadTimeDays: 3,
  notes: '',
}

export default function SuppliersPage() {
  const { status } = useSession()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<ApiPagination>({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const canRead = useCan('suppliers:read')
  const canCreate = useCan('suppliers:create')
  const canUpdate = useCan('suppliers:update')
  const canDeactivate = useCan('suppliers:deactivate')

  // modal state — `editing` is null for create mode
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3500)
  }

  const buildQuery = () => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(PAGE_SIZE))
    params.set('active', statusFilter)
    if (search) params.set('search', search)
    return params.toString()
  }

  const fetchSuppliers = async () => {
    setLoading(true)
    try {
      const res = await apiFetch<Supplier[]>(`/api/suppliers?${buildQuery()}`)
      if (!res.success) throw new Error(res.error || 'Failed to fetch suppliers')
      const rows = res.data || []
      setSuppliers(rows)
      const pg = res.pagination
      setPagination(pg || { page, limit: PAGE_SIZE, total: rows.length, totalPages: 1 })
      if (pg && pg.totalPages > 0 && pg.page > pg.totalPages) {
        setPage(pg.totalPages)
      }
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load suppliers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === 'authenticated' && canRead) fetchSuppliers()
    else if (status !== 'loading') setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, canRead, search, statusFilter, page])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (supplier: Supplier) => {
    setEditing(supplier)
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
    setModalOpen(true)
  }

  const saveSupplier = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      const payload = {
        name: form.name,
        contactName: form.contactName,
        contactEmail: form.contactEmail,
        phone: form.phone,
        website: form.website,
        address: form.address,
        leadTimeDays: Number(form.leadTimeDays) || 0,
        notes: form.notes,
      }
      const res = editing
        ? await apiFetch<Supplier>(`/api/suppliers/${editing._id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await apiFetch<Supplier>('/api/suppliers', { method: 'POST', body: JSON.stringify(payload) })
      if (!res.success) {
        const details = res.details as Record<string, string[]> | undefined
        setFormError(details ? Object.values(details).flat()[0] || res.error || 'Failed to save supplier' : res.error || 'Failed to save supplier')
        return
      }
      setModalOpen(false)
      notify(editing ? 'Supplier updated' : 'Supplier created')
      fetchSuppliers()
    } catch {
      setFormError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async (supplier: Supplier) => {
    const ok = window.confirm(`Deactivate "${supplier.name}"? Products keep their link but the supplier is marked inactive.`)
    if (!ok) return
    const res = await apiFetch<Supplier>(`/api/suppliers/${supplier._id}`, { method: 'DELETE' })
    if (!res.success) {
      notify(res.error || 'Could not deactivate supplier')
      return
    }
    notify('Supplier deactivated')
    fetchSuppliers()
  }

  const reactivate = async (supplier: Supplier) => {
    const res = await apiFetch<Supplier>(`/api/suppliers/${supplier._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: true }),
    })
    if (!res.success) {
      notify(res.error || 'Could not reactivate supplier')
      return
    }
    notify('Supplier reactivated')
    fetchSuppliers()
  }

  if (status === 'loading') {
    return <div className="empty-state" style={{ minHeight: 260 }}>Checking your permissions…</div>
  }

  if (!canRead && !loading) {
    return (
      <>
        <PageHeading
          eyebrow="PERMISSION REQUIRED"
          title="Suppliers"
          subtitle="Vendor records are limited to roles with supplier access."
        />
        <div
          className="panel"
          style={{ padding: 28, display: 'grid', gap: 11, justifyItems: 'center', textAlign: 'center' }}
        >
          <ShieldAlert size={26} style={{ color: '#d5556a' }} />
          <b style={{ fontSize: 13 }}>Your role can&apos;t view suppliers</b>
          <p style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 400, lineHeight: 1.7, margin: 0 }}>
            Ask a workspace admin for the Inventory manager role if you need to manage vendors. You can still
            browse products and inventory.
          </p>
          <Link href="/dashboard/products" className="button button-secondary">
            Back to products
          </Link>
        </div>
      </>
    )
  }

  const totalActive = suppliers.filter((s) => s.isActive).length
  const avgLead =
    suppliers.length > 0
      ? Math.round(suppliers.reduce((sum, s) => sum + (s.leadTimeDays || 0), 0) / suppliers.length)
      : 0

  return (
    <>
      <PageHeading
        eyebrow="VENDOR NETWORK"
        title="Suppliers"
        subtitle="Track who provides your stock, lead times, and contact details."
        action={
          <>
            <CsvExportButton
              path={`/api/suppliers?${buildQuery()}`}
              filename="suppliers"
              noun="suppliers"
              columns={[
                { key: 'supplier', header: 'Supplier' },
                { key: 'contact', header: 'Contact' },
                { key: 'email', header: 'Email' },
                { key: 'phone', header: 'Phone' },
                { key: 'leadTime', header: 'Lead time (days)' },
                { key: 'products', header: 'Products' },
                { key: 'active', header: 'Active' },
              ]}
              mapRow={(row) => ({
                supplier: row.name,
                contact: row.contactName || '',
                email: row.contactEmail || '',
                phone: row.phone || '',
                leadTime: row.leadTimeDays,
                products: row.productCount ?? '',
                active: row.isActive ? 'Yes' : 'No',
              })}
            />
            {canCreate && (
              <button className="button button-primary" onClick={openCreate}>
                <Plus size={16} /> New supplier
              </button>
            )}
          </>
        }
      />

      <div className="metric-grid compact-metrics">
        <Metric label="Total" value={pagination.total} icon={Truck} detail="suppliers in this view" />
        <Metric label="Active" value={totalActive} icon={Building2} tone="mint" detail="on this page" />
        <Metric label="Avg lead time" value={`${avgLead}d`} icon={Clock} tone="blue" detail="across shown vendors" />
        <Metric label="Products linked" value={suppliers.reduce((s, x) => s + (x.productCount || 0), 0)} icon={Users} tone="orange" detail="active items" />
      </div>

      <section className="panel table-panel inventory-table-panel" style={{ marginBottom: 18 }}>
        <div className="inventory-toolbar">
          <div className="table-tabs">
            {(['active', 'inactive', 'all'] as const).map((f) => (
              <button
                key={f}
                className={statusFilter === f ? 'selected' : ''}
                onClick={() => {
                  setStatusFilter(f)
                  setPage(1)
                }}
              >
                {f === 'active' ? 'Active' : f === 'inactive' ? 'Inactive' : 'All suppliers'}
              </button>
            ))}
          </div>
          <div className="table-tools">
            <label className="table-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Search suppliers"
                aria-label="Search suppliers"
              />
            </label>
          </div>
        </div>

        {error && (
          <div className="data-disclaimer" style={{ padding: '0 20px' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <div className="table-scroll">
          {loading ? (
            <div className="empty-state">Loading suppliers…</div>
          ) : suppliers.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No suppliers found"
              hint={canCreate ? 'Create your first vendor to link products to it.' : 'No vendors match this view.'}
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th>Lead time</th>
                  <th>Products</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier._id}>
                    <td>
                      <Link
                        href={`/dashboard/suppliers/${supplier._id}`}
                        className="product-cell"
                        style={{ color: 'inherit', textDecoration: 'none' }}
                        title={`Open ${supplier.name}`}
                      >
                        <span className="product-thumbnail">
                          <Truck size={17} />
                        </span>
                        <span>
                          <b>{supplier.name}</b>
                          <small>{supplier.contactName || supplier.contactEmail || 'No contact'}</small>
                        </span>
                      </Link>
                    </td>
                    <td>
                      {supplier.contactName || '—'}
                      {supplier.contactEmail && (
                        <small style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          <Mail size={11} /> {supplier.contactEmail}
                        </small>
                      )}
                    </td>
                    <td>
                      {supplier.phone ? (
                        <span className="table-location">
                          <Phone size={12} /> {supplier.phone}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="value-cell">{supplier.leadTimeDays}d</td>
                    <td>{supplier.productCount ?? 0}</td>
                    <td>
                      {supplier.isActive ? (
                        <span className="status status-healthy">
                          <i /> Active
                        </span>
                      ) : (
                        <span className="status status-rejected">
                          <i /> Inactive
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                        {canUpdate && (
                          <button className="subtle-link" onClick={() => openEdit(supplier)}>
                            <Pencil size={12} /> Edit
                          </button>
                        )}
                        {supplier.isActive && canDeactivate && (
                          <button className="reject-button" onClick={() => deactivate(supplier)}>
                            Deactivate
                          </button>
                        )}
                        {!supplier.isActive && canUpdate && (
                          <button className="subtle-link" onClick={() => reactivate(supplier)}>
                            Reactivate
                          </button>
                        )}
                        <Link href={`/dashboard/suppliers/${supplier._id}`} className="subtle-link" aria-label={`Open ${supplier.name}`}>
                          <ArrowRight size={13} />
                        </Link>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!loading && suppliers.length > 0 && (
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPage={setPage}
            noun="suppliers"
            hint={statusFilter === 'all' ? undefined : `${statusFilter} only`}
          />
        )}
      </section>

      {modalOpen && (
        <div className="modal-backdrop" onClick={() => !saving && setModalOpen(false)}>
          <form className="create-modal" onClick={(e) => e.stopPropagation()} onSubmit={saveSupplier}>
            <div className="modal-heading">
              <div>
                <div className="modal-kicker">{editing ? 'EDIT SUPPLIER' : 'NEW SUPPLIER'}</div>
                <h2 style={{ fontFamily: 'Manrope', fontSize: 17, margin: '6px 0 0' }}>
                  {editing ? 'Edit supplier' : 'Add a supplier'}
                </h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setModalOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="settings-field" style={{ maxWidth: 'none' }}>
              Supplier name *
              <input
                required
                placeholder="e.g. Acme Packaging Co."
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                maxLength={120}
              />
            </div>

            <div className="modal-route-grid" style={{ marginBottom: 4 }}>
              <label className="settings-field" style={{ maxWidth: 'none', marginBottom: 0 }}>
                Contact name <span className="optional">(optional)</span>
                <input
                  placeholder="e.g. Jane Doe"
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
                  placeholder="jane@acme.com"
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
                  placeholder="e.g. +1 555 0100"
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
                placeholder="https://acme.com"
                value={form.website}
                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                maxLength={255}
              />
            </div>

            <div className="settings-field" style={{ maxWidth: 'none' }}>
              Address <span className="optional">(optional)</span>
              <input
                placeholder="Street, city, country"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                maxLength={300}
              />
            </div>

            <div className="settings-field" style={{ maxWidth: 'none' }}>
              Notes <span className="optional">(optional)</span>
              <textarea
                rows={3}
                placeholder="Payment terms, minimum order…"
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
              <button type="button" className="button button-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="button button-primary" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create supplier'}
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
