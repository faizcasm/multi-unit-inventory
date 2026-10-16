'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Package, Plus, Printer, Search, AlertCircle, ArrowRight, Upload } from 'lucide-react'
import { PageHeading, Status, EmptyState, Toast } from '@/components/redesign/ui'
import { Pagination, CsvExportButton, toCsv } from '@/components/redesign/TableBits'
import { apiFetch, ApiPagination } from '@/lib/api'
import { useCan } from '@/hooks/useCan'

interface Product {
  _id: string
  name: string
  sku: string
  barcode?: string
  category?: string
  unitOfMeasure: string
  reorderThreshold: number
  isActive: boolean
  totalAvailable: number
  isLowStock: boolean
  isOutOfStock: boolean
}

const CATEGORIES = ['', 'Electronics', 'Clothing', 'Food', 'Furniture', 'Other']

const PAGE_SIZE = 20

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<ApiPagination>({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const canCreate = useCan('products:create')
  const canRead = useCan('products:read')
  const canDeactivate = useCan('products:deactivate')

  // Bulk selection (id → product, so cross-page exports keep their rows).
  const [selected, setSelected] = useState<Record<string, Product>>({})
  const [bulkBusy, setBulkBusy] = useState(false)
  const [toast, setToast] = useState('')

  const selectedIds = Object.keys(selected)
  const selectedCount = selectedIds.length
  const allOnPageSelected = products.length > 0 && products.every((p) => selected[p._id])

  const toggleRow = (product: Product) =>
    setSelected((prev) => {
      const next = { ...prev }
      if (next[product._id]) delete next[product._id]
      else next[product._id] = product
      return next
    })

  const toggleAllOnPage = () =>
    setSelected((prev) => {
      const next = { ...prev }
      if (allOnPageSelected) {
        products.forEach((p) => delete next[p._id])
      } else {
        products.forEach((p) => {
          next[p._id] = p
        })
      }
      return next
    })

  const exportSelectedCsv = () => {
    const rows = Object.values(selected)
    if (!rows.length) return
    const columns = [
      { key: 'product', header: 'Product' },
      { key: 'sku', header: 'SKU' },
      { key: 'category', header: 'Category' },
      { key: 'barcode', header: 'Barcode' },
      { key: 'unit', header: 'Unit' },
      { key: 'active', header: 'Active' },
    ]
    const csv = String.fromCharCode(0xfeff) + toCsv(
      columns,
      rows.map((row) => ({
        product: row.name,
        sku: row.sku,
        category: row.category || '',
        barcode: row.barcode || '',
        unit: row.unitOfMeasure || '',
        active: row.isActive ? 'Yes' : 'No',
      }))
    )
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const downloadUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = downloadUrl
    anchor.download = `products-selected-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(downloadUrl)
    setToast(`Exported ${rows.length} product${rows.length === 1 ? '' : 's'}`)
  }

  const runBulk = async (action: 'activate' | 'deactivate') => {
    const ids = selectedIds.slice(0, 100)
    if (!ids.length || bulkBusy) return
    const verb = action === 'activate' ? 'Activate' : 'Deactivate'
    if (!window.confirm(`${verb} ${ids.length} selected product${ids.length === 1 ? '' : 's'}?`)) return
    setBulkBusy(true)
    try {
      const res = await fetch('/api/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Bulk update failed')
      const updated = Number(json.data?.updated ?? 0)
      setToast(`${updated} product${updated === 1 ? '' : 's'} ${action === 'activate' ? 'activated' : 'deactivated'}`)
      setSelected({})
      fetchProducts()
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Bulk update failed')
    } finally {
      setBulkBusy(false)
    }
  }

  /** Query string for the current filters. */
  const buildQuery = () => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(PAGE_SIZE))
    if (search) params.set('search', search)
    if (category) params.set('category', category)
    if (statusFilter) params.set('isActive', statusFilter === 'active' ? 'true' : 'false')
    return params.toString()
  }

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const res = await apiFetch<Product[]>(`/api/products?${buildQuery()}`)
      if (!res.success) throw new Error(res.error || 'Failed to fetch products')
      const rows = res.data || []
      setProducts(rows)
      const pg = res.pagination
      setPagination(pg || { page, limit: PAGE_SIZE, total: rows.length, totalPages: 1 })
      // If the data shrank and we're past the end, jump to the last page.
      if (pg && pg.totalPages > 0 && pg.page > pg.totalPages) {
        setPage(pg.totalPages)
      }
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, statusFilter, page])

  const statusOf = (p: Product) =>
    !p.isActive ? 'Inactive' : p.isOutOfStock ? 'Out of stock' : p.isLowStock ? 'Low stock' : 'In stock'

  return (
    <>
      <PageHeading
        eyebrow="PRODUCT CATALOG"
        title="Products"
        subtitle="Manage the items your teams stock, move, and reorder."
        action={
          <>
            <CsvExportButton
              path={`/api/products?${buildQuery()}`}
              filename="products"
              noun="products"
              columns={[
                { key: 'product', header: 'Product' },
                { key: 'sku', header: 'SKU' },
                { key: 'category', header: 'Category' },
                { key: 'barcode', header: 'Barcode' },
                { key: 'unit', header: 'Unit' },
                { key: 'active', header: 'Active' },
              ]}
              mapRow={(row) => ({
                product: row.name,
                sku: row.sku,
                category: row.category || '',
                barcode: row.barcode || '',
                unit: row.unitOfMeasure || '',
                active: row.isActive ? 'Yes' : 'No',
              })}
            />
            {canRead && (
              <Link href="/dashboard/labels" className="button button-secondary">
                <Printer size={15} /> Print labels
              </Link>
            )}
            {canCreate && (
              <Link href="/dashboard/products/import" className="button button-secondary">
                <Upload size={15} /> Import CSV
              </Link>
            )}
            {canCreate && (
              <Link href="/dashboard/products/new" className="button button-primary">
                <Plus size={16} /> New product
              </Link>
            )}
          </>
        }
      />

      <section className="panel table-panel inventory-table-panel">
        <div className="inventory-toolbar">
          <div className="table-tabs">
            <button
              className={statusFilter === '' ? 'selected' : ''}
              onClick={() => {
                setStatusFilter('')
                setPage(1)
              }}
            >
              All items
              {statusFilter === '' && <span className="tab-count">{pagination.total}</span>}
            </button>
            <button
              className={statusFilter === 'active' ? 'selected' : ''}
              onClick={() => {
                setStatusFilter('active')
                setPage(1)
              }}
            >
              Active
            </button>
            <button
              className={statusFilter === 'inactive' ? 'selected' : ''}
              onClick={() => {
                setStatusFilter('inactive')
                setPage(1)
              }}
            >
              Inactive
            </button>
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
                placeholder="Search products"
                aria-label="Search products"
              />
            </label>
            <select
              className="filter-button"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value)
                setPage(1)
              }}
              aria-label="Filter by category"
              style={{ height: 34 }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c === '' ? 'All categories' : c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="data-disclaimer" style={{ padding: '0 20px' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <div className="table-scroll">
          {loading ? (
            <div className="empty-state">Loading products…</div>
          ) : products.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No products match this view"
              hint="Try a different search or create your first product."
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 38 }}>
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleAllOnPage}
                      aria-label="Select all products on this page"
                    />
                  </th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Available</th>
                  <th>Reorder at</th>
                  <th>Stock status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product._id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!selected[product._id]}
                        onChange={() => toggleRow(product)}
                        aria-label={`Select ${product.name}`}
                      />
                    </td>
                    <td>
                      <Link
                        href={`/dashboard/products/${product._id}`}
                        className="product-cell"
                        style={{ color: 'inherit', textDecoration: 'none' }}
                        title={`Open ${product.name}`}
                      >
                        <span className="product-thumbnail">
                          <Package size={17} />
                        </span>
                        <span>
                          <b>{product.name}</b>
                          <small>{product.sku}</small>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <span className="category-text">{product.category || 'Uncategorized'}</span>
                    </td>
                    <td>
                      <b className="stock-number">{product.totalAvailable}</b>
                      <small className="stock-reorder"> {product.unitOfMeasure}</small>
                    </td>
                    <td className="value-cell">{product.reorderThreshold}</td>
                    <td>
                      <Status value={statusOf(product)} />
                    </td>
                    <td>
                      <Link
                        href={`/dashboard/inventory?search=${encodeURIComponent(product.sku)}`}
                        className="subtle-link"
                      >
                        View stock <ArrowRight size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selectedCount > 0 && (
          <div
            style={{
              position: 'sticky',
              bottom: 14,
              margin: '0 20px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              background: '#241c3f',
              color: '#fff',
              borderRadius: 11,
              padding: '10px 14px',
              zIndex: 5,
              boxShadow: '0 14px 34px rgba(28,20,54,.3)',
            }}
          >
            <b style={{ fontSize: 11.5 }}>
              {selectedCount} selected
            </b>
            <span style={{ flex: 1 }} />
            <button className="button button-small button-secondary" type="button" onClick={exportSelectedCsv}>
              Export selected CSV
            </button>
            {canDeactivate && (
              <>
                <button
                  className="button button-small button-secondary"
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => runBulk('deactivate')}
                >
                  Deactivate
                </button>
                <button
                  className="button button-small button-secondary"
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => runBulk('activate')}
                >
                  Activate
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setSelected({})}
              aria-label="Clear selection"
              style={{ background: 'transparent', border: 0, color: '#cfc8e8', fontSize: 13, cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        {!loading && products.length > 0 && (
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPage={setPage}
            noun="products"
          />
        )}
      </section>

      <Toast message={toast} onClose={() => setToast('')} />
    </>
  )
}
export const dynamic = 'force-dynamic'
