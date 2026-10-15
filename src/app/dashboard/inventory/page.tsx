'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Package, Search, SlidersHorizontal, AlertCircle, Plus } from 'lucide-react'
import { PageHeading, Status, EmptyState } from '@/components/redesign/ui'
import { Pagination, CsvExportButton } from '@/components/redesign/TableBits'
import { apiFetch, ApiPagination } from '@/lib/api'
import { useCan } from '@/hooks/useCan'

interface InventoryItem {
  _id: string
  product: { _id?: string; name: string; sku: string; unitOfMeasure: string; reorderThreshold: number; isActive: boolean } | null
  location: { name: string; code: string } | null
  availableQuantity: number
  reservedQuantity: number
  inTransitQuantity: number
  damagedQuantity: number
}

type Tab = 'All items' | 'Low stock' | 'Out of stock'

const PAGE_SIZE = 50

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [search, setSearch] = useState('')
  const [locationId, setLocationId] = useState('')
  const [locations, setLocations] = useState<{ _id: string; name: string; code: string }[]>([])
  const [tab, setTab] = useState<Tab>('All items')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<ApiPagination>({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const canAdjust = useCan('inventory:adjust')

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const response = await fetch('/api/locations')
        const data = await response.json()
        if (response.ok) setLocations(data.data || [])
      } catch {}
    }
    fetchLocations()
  }, [])

  /** Query string for the current filters (optionally pinned to a page). */
  const buildQuery = () => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(PAGE_SIZE))
    if (search) params.set('search', search)
    if (locationId) params.set('locationId', locationId)
    if (tab === 'Low stock') params.set('lowStock', 'true')
    if (tab === 'Out of stock') params.set('outOfStock', 'true')
    return params.toString()
  }

  const fetchInventory = async () => {
    setLoading(true)
    try {
      const res = await apiFetch<InventoryItem[]>(`/api/inventory?${buildQuery()}`)
      if (!res.success) throw new Error(res.error || 'Failed to fetch inventory')
      const rows = res.data || []
      setInventory(rows)
      const pg = res.pagination
      setPagination(pg || { page, limit: PAGE_SIZE, total: rows.length, totalPages: 1 })
      // If the data shrank and we're past the end, jump to the last page.
      if (pg && pg.totalPages > 0 && pg.page > pg.totalPages) {
        setPage(pg.totalPages)
      }
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInventory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, locationId, tab, page])

  const statusOf = (item: InventoryItem): string => {
    if (item.availableQuantity === 0) return 'Out of stock'
    if (
      item.product &&
      item.product.reorderThreshold > 0 &&
      item.availableQuantity <= item.product.reorderThreshold
    )
      return 'Low stock'
    return 'In stock'
  }

  return (
    <>
      <PageHeading
        eyebrow="STOCK CONTROL"
        title="Inventory"
        subtitle="Keep product availability and stock levels clear across every location."
        action={
          <>
            {canAdjust && (
              <Link href="/dashboard/inventory/adjust" className="button button-secondary">
                <SlidersHorizontal size={15} /> Adjust stock
              </Link>
            )}
            <CsvExportButton
              path={`/api/inventory?${buildQuery()}`}
              filename="inventory"
              noun="stock records"
              columns={[
                { key: 'product', header: 'Product' },
                { key: 'sku', header: 'SKU' },
                { key: 'location', header: 'Location' },
                { key: 'available', header: 'Available' },
                { key: 'reserved', header: 'Reserved' },
                { key: 'inTransit', header: 'In transit' },
                { key: 'damaged', header: 'Damaged' },
                { key: 'status', header: 'Status' },
              ]}
              mapRow={(row) => ({
                product: row.product?.name || 'Unnamed product',
                sku: row.product?.sku || '',
                location: row.location?.name || '',
                available: row.availableQuantity,
                reserved: row.reservedQuantity,
                inTransit: row.inTransitQuantity,
                damaged: row.damagedQuantity,
                status: statusOf(row),
              })}
            />
            <Link href="/dashboard/products/new" className="button button-primary">
              <Plus size={16} /> New product
            </Link>
          </>
        }
      />

      <section className="panel table-panel inventory-table-panel">
        <div className="inventory-toolbar">
          <div className="table-tabs">
            {(['All items', 'Low stock', 'Out of stock'] as Tab[]).map((t) => (
              <button
                key={t}
                className={tab === t ? 'selected' : ''}
                onClick={() => {
                  setTab(t)
                  setPage(1)
                }}
              >
                {t}
                {tab === t && <span className="tab-count">{pagination.total}</span>}
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
                placeholder="Search products"
                aria-label="Search products"
              />
            </label>
            <select
              className="filter-button"
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value)
                setPage(1)
              }}
              aria-label="Filter by location"
              style={{ height: 34 }}
            >
              <option value="">All locations</option>
              {locations.map((l) => (
                <option key={l._id} value={l._id}>
                  {l.name} ({l.code})
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
            <div className="empty-state">Loading inventory…</div>
          ) : inventory.length === 0 ? (
            <EmptyState icon={Package} title="No inventory matches this view" hint="Try a different search or stock filter." />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Location</th>
                  <th>Available</th>
                  <th>Reserved</th>
                  <th>In transit</th>
                  <th>Damaged</th>
                  <th>Stock status</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((item) => (
                  <tr key={item._id}>
                    <td>
                      {item.product?._id ? (
                        <Link
                          href={`/dashboard/products/${item.product._id}`}
                          className="product-cell"
                          style={{ color: 'inherit', textDecoration: 'none' }}
                          title={`Open ${item.product?.name || 'product'}`}
                        >
                          <span className="product-thumbnail">
                            <Package size={17} />
                          </span>
                          <span>
                            <b>{item.product?.name || 'Unnamed product'}</b>
                            <small>{item.product?.sku}</small>
                          </span>
                        </Link>
                      ) : (
                        <span className="product-cell">
                          <span className="product-thumbnail">
                            <Package size={17} />
                          </span>
                          <span>
                            <b>{item.product?.name || 'Unnamed product'}</b>
                            <small>{item.product?.sku}</small>
                          </span>
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="table-location">{item.location?.name}</span>
                    </td>
                    <td>
                      <b className="stock-number">{item.availableQuantity}</b>
                      <small className="stock-reorder">
                        {' '}
                        Reorder at {item.product?.reorderThreshold ?? 0}
                      </small>
                    </td>
                    <td className="value-cell">{item.reservedQuantity}</td>
                    <td className="value-cell">{item.inTransitQuantity}</td>
                    <td className="value-cell">{item.damagedQuantity}</td>
                    <td>
                      <Status value={statusOf(item)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {!loading && inventory.length > 0 && (
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPage={setPage}
            noun="stock records"
          />
        )}
      </section>
    </>
  )
}
export const dynamic = 'force-dynamic'
