'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Package, Plus, Search, AlertCircle, ArrowRight } from 'lucide-react'
import { PageHeading, Status, EmptyState } from '@/components/redesign/ui'
import { Pagination, CsvExportButton } from '@/components/redesign/TableBits'
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
    </>
  )
}
export const dynamic = 'force-dynamic'
