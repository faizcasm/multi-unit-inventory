'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Package, Plus, Search, AlertCircle, ArrowRight } from 'lucide-react'
import { PageHeading, Status, EmptyState } from '@/components/redesign/ui'

interface Product {
  _id: string
  name: string
  sku: string
  category?: string
  unitOfMeasure: string
  reorderThreshold: number
  isActive: boolean
  totalAvailable: number
  isLowStock: boolean
  isOutOfStock: boolean
}

const CATEGORIES = ['', 'Electronics', 'Clothing', 'Food', 'Furniture', 'Other']

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (category) params.set('category', category)
      if (statusFilter) params.set('isActive', statusFilter === 'active' ? 'true' : 'false')

      const response = await fetch(`/api/products?${params.toString()}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to fetch products')
      setProducts(data.data || [])
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
  }, [search, category, statusFilter])

  const statusOf = (p: Product) =>
    !p.isActive ? 'Inactive' : p.isOutOfStock ? 'Out of stock' : p.isLowStock ? 'Low stock' : 'In stock'

  return (
    <>
      <PageHeading
        eyebrow="PRODUCT CATALOG"
        title="Products"
        subtitle="Manage the items your teams stock, move, and reorder."
        action={
          <Link href="/dashboard/products/new" className="button button-primary">
            <Plus size={16} /> New product
          </Link>
        }
      />

      <section className="panel table-panel inventory-table-panel">
        <div className="inventory-toolbar">
          <div className="table-tabs">
            <button className={statusFilter === '' ? 'selected' : ''} onClick={() => setStatusFilter('')}>
              All items
              <span className="tab-count">{products.length}</span>
            </button>
            <button className={statusFilter === 'active' ? 'selected' : ''} onClick={() => setStatusFilter('active')}>
              Active
            </button>
            <button className={statusFilter === 'inactive' ? 'selected' : ''} onClick={() => setStatusFilter('inactive')}>
              Inactive
            </button>
          </div>
          <div className="table-tools">
            <label className="table-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products"
                aria-label="Search products"
              />
            </label>
            <select
              className="filter-button"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
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
                      <span className="product-cell">
                        <span className="product-thumbnail">
                          <Package size={17} />
                        </span>
                        <span>
                          <b>{product.name}</b>
                          <small>{product.sku}</small>
                        </span>
                      </span>
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
          <div className="table-footer">
            <span>
              Showing <b>{products.length}</b> products
            </span>
          </div>
        )}
      </section>
    </>
  )
}
export const dynamic = 'force-dynamic'
