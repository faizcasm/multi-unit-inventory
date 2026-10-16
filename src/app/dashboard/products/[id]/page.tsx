import { notFound, redirect } from 'next/navigation'
import { Metadata } from 'next'
import Link from 'next/link'
import { connectDB } from '@/lib/db/mongodb'
import { Product } from '@/models/Product'
// Side-effect import: registers the Supplier schema so populate('supplier')
// resolves even when no other Supplier code has loaded in this process.
import '@/models/Supplier'
import { Inventory } from '@/models/Inventory'
import { InventoryMovement } from '@/models/InventoryMovement'
import { StockTransfer } from '@/models/StockTransfer'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { Metric, Status, EmptyState } from '@/components/redesign/ui'
import { EditProductModal } from './EditProductModal'
import {
  ArrowLeftRight,
  Boxes,
  ChevronLeft,
  Package,
  Settings2,
  Truck,
} from 'lucide-react'

interface ProductPageProps {
  params: { id: string }
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { Types } = await import('mongoose')
  if (!Types.ObjectId.isValid(params.id)) return { title: 'Product Not Found' }
  try {
    const session = await auth()
    if (!session?.user) return { title: 'Product Not Found' }
    await connectDB()
    const product = (await Product.findOne({
      _id: params.id,
      organization: session.user.organizationId,
    })
      .select('name sku')
      .lean()) as any
    if (!product) return { title: 'Product Not Found' }
    return { title: `${product.name} · ${product.sku}` }
  } catch {
    return { title: 'Product' }
  }
}

const MOVEMENT_LABELS: Record<string, string> = {
  DISPATCH: 'Dispatched',
  RECEIPT: 'Received',
  ADJUSTMENT: 'Adjustment',
  DISCREPANCY: 'Discrepancy',
  RESERVATION: 'Reserved',
  RELEASE_RESERVATION: 'Reservation released',
  DAMAGED: 'Marked damaged',
  RETURN: 'Returned',
}

const TRANSFER_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  IN_TRANSIT: 'In transit',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
}

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const session = await auth()
  if (!session?.user) redirect('/signin')

  const { Types } = await import('mongoose')
  if (!Types.ObjectId.isValid(params.id)) {
    notFound()
  }

  await connectDB()

  const product = (await Product.findOne({
    _id: params.id,
    organization: session.user.organizationId,
  })
    .populate('supplier', 'name leadTimeDays isActive')
    .lean()) as any

  if (!product) {
    notFound()
  }

  const [inventory, movements, transfers] = await Promise.all([
    Inventory.find({ product: product._id, organization: session.user.organizationId })
      .populate('location', 'name code isActive')
      .lean() as any,
    InventoryMovement.find({ product: product._id, organization: session.user.organizationId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('location', 'name code')
      .populate('responsibleUser', 'name')
      .lean() as any,
    StockTransfer.find({
      organization: session.user.organizationId,
      'lineItems.product': product._id,
    })
      .sort({ createdAt: -1 })
      .limit(8)
      .populate('sourceLocation', 'name code')
      .populate('destinationLocation', 'name code')
      .populate('requester', 'name')
      .lean() as any,
  ])

  const totalAvailable = inventory.reduce((sum: number, i: any) => sum + (i?.availableQuantity || 0), 0)
  const totalReserved = inventory.reduce((sum: number, i: any) => sum + (i?.reservedQuantity || 0), 0)
  const totalInTransit = inventory.reduce((sum: number, i: any) => sum + (i?.inTransitQuantity || 0), 0)
  const totalDamaged = inventory.reduce((sum: number, i: any) => sum + (i?.damagedQuantity || 0), 0)

  const isOutOfStock = totalAvailable === 0
  const isLowStock =
    !isOutOfStock &&
    product.reorderThreshold > 0 &&
    totalAvailable <= product.reorderThreshold
  const stockStatus = isOutOfStock ? 'Out of stock' : isLowStock ? 'Low stock' : 'In stock'

  const canAdjust = hasPermission(session.user.role, 'inventory:adjust')
  const canTransfer = hasPermission(session.user.role, 'transfers:create')
  const canUpdateProduct = hasPermission(session.user.role, 'products:update')
  const locationsWithStock = inventory.filter((i: any) => (i?.availableQuantity || 0) > 0).length

  return (
    <>
      <div className="back-row">
        <Link href="/dashboard/products">
          <ChevronLeft size={15} /> Back to products
        </Link>
        <span> / {product.sku}</span>
      </div>

      <div className="page-heading">
        <div>
          <div className="page-eyebrow">PRODUCT RECORD</div>
          <h1>{product.name}</h1>
          <p>
            {product.sku}
            {product.category ? ` · ${product.category}` : ''} · per {product.unitOfMeasure}
          </p>
        </div>
        <div className="heading-action">
          <Link
            href={`/dashboard/inventory?search=${encodeURIComponent(product.sku)}`}
            className="button button-secondary"
          >
            <Package size={15} /> View inventory
          </Link>
          {canAdjust && (
            <Link href="/dashboard/inventory/adjust" className="button button-secondary">
              <Settings2 size={15} /> Adjust stock
            </Link>
          )}
          {canUpdateProduct && (
            <EditProductModal
              product={{
                _id: String(product._id),
                name: product.name,
                sku: product.sku,
                description: product.description,
                category: product.category,
                unitOfMeasure: product.unitOfMeasure,
                barcode: product.barcode,
                reorderThreshold: product.reorderThreshold,
                reorderQuantity: product.reorderQuantity,
                unitCost: product.unitCost ?? 0,
                supplier: product.supplier
                  ? { _id: String(product.supplier._id ?? product.supplier), name: product.supplier.name }
                  : null,
              }}
            />
          )}
          {canTransfer && (
            <Link href="/dashboard/transfers/new" className="button button-primary">
              <Truck size={15} /> New transfer
            </Link>
          )}
        </div>
      </div>

      <div className="metric-grid">
        <Metric
          label="Available"
          value={totalAvailable}
          icon="package"
          tone="mint"
          detail={`across ${locationsWithStock} location${locationsWithStock === 1 ? '' : 's'}`}
        />
        <Metric
          label="Reserved"
          value={totalReserved}
          icon="archive"
          tone="blue"
          detail="held for pending work"
        />
        <Metric
          label="In transit"
          value={totalInTransit}
          icon="truck"
          tone="purple"
          detail="on the way"
        />
        <Metric
          label="Damaged"
          value={totalDamaged}
          icon="alert-triangle"
          tone="orange"
          detail="flagged units"
        />
      </div>

      <div className="product-detail-grid">
        <section className="panel product-overview">
          <div className="product-hero-icon">
            <Boxes size={38} />
          </div>
          <div className="product-overview-title">
            <h2>{product.name}</h2>
            <span className="muted">{product.sku}</span>
            <Status value={stockStatus} />
          </div>
          <div className="detail-separator" />
          <div className="detail-kv">
            <span>Status</span>
            <b>{product.isActive ? 'Active' : 'Inactive'}</b>
          </div>
          <div className="detail-kv">
            <span>Category</span>
            <b>{product.category || '—'}</b>
          </div>
          <div className="detail-kv">
            <span>Unit of measure</span>
            <b>{product.unitOfMeasure}</b>
          </div>
          <div className="detail-kv">
            <span>Supplier</span>
            <b>
              {product.supplier ? (
                <Link href={`/dashboard/suppliers/${product.supplier._id}`} className="subtle-link">
                  {product.supplier.name}
                </Link>
              ) : (
                <Link href="/dashboard/suppliers" className="subtle-link" title="Add or manage suppliers">
                  None — manage suppliers
                </Link>
              )}
            </b>
          </div>
          <div className="detail-kv">
            <span>Unit cost</span>
            <b>{(product.unitCost ?? 0).toFixed(2)}</b>
          </div>
          <div className="detail-kv">
            <span>Barcode</span>
            <b>{product.barcode || '—'}</b>
          </div>
          <div className="detail-kv">
            <span>Reorder threshold</span>
            <b>{product.reorderThreshold || 0}</b>
          </div>
          <div className="detail-kv">
            <span>Reorder quantity</span>
            <b>{product.reorderQuantity || 0}</b>
          </div>
          <div className="detail-kv">
            <span>Created</span>
            <b style={{ fontWeight: 500 }}>{formatDate(product.createdAt)}</b>
          </div>
          <div className="detail-kv">
            <span>Last updated</span>
            <b style={{ fontWeight: 500 }}>{formatDate(product.updatedAt)}</b>
          </div>
          {product.description && (
            <div className="detail-kv">
              <span>Description</span>
              <b style={{ fontWeight: 500 }}>{product.description}</b>
            </div>
          )}
        </section>

        <section className="panel product-stock">
          <div className="panel-heading">
            <div>
              <h2>Stock by location</h2>
              <p>Where this product is held right now</p>
            </div>
            <Status value={stockStatus} />
          </div>
          {inventory.length === 0 ? (
            <EmptyState
              icon="package"
              title="No stock recorded yet"
              hint="Adjust stock to record inventory for this product."
            />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>On hand</th>
                    <th>Reserved</th>
                    <th>In transit</th>
                    <th>Available</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((row: any) => (
                    <tr key={String(row._id)}>
                      <td>
                        <b style={{ color: '#3c3652', fontSize: 10.5 }}>
                          {row.location?.name || 'Unknown'}
                        </b>
                        <div style={{ fontSize: 9, color: '#a39daf', marginTop: 3 }}>
                          {row.location?.code || ''}
                        </div>
                      </td>
                      <td>{row.onHandQuantity ?? 0}</td>
                      <td>{row.reservedQuantity ?? 0}</td>
                      <td>{row.inTransitQuantity ?? 0}</td>
                      <td>
                        <b style={{ color: '#23835c', fontSize: 11 }}>{row.availableQuantity ?? 0}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="table-footer">
            <span>
              Total available: <b>{totalAvailable}</b> {product.unitOfMeasure}
            </span>
            <Link href="/dashboard/inventory" className="subtle-link">
              Open inventory <ArrowLeftRight size={13} />
            </Link>
          </div>
        </section>
      </div>

      <section className="panel table-panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading">
          <div>
            <h2>Recent movements</h2>
            <p>The last adjustments, dispatches and receipts for this product</p>
          </div>
          <Link href="/dashboard/activity" className="subtle-link">
            Full activity log
          </Link>
        </div>
        {movements.length === 0 ? (
          <EmptyState
            icon="swap"
            title="No movements yet"
            hint="Stock movements appear here as soon as inventory changes."
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Movement</th>
                  <th>Location</th>
                  <th>Quantity</th>
                  <th>By</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m: any) => (
                  <tr key={String(m._id)}>
                    <td title={new Date(m.createdAt).toLocaleString()}>
                      {formatDateTime(m.createdAt)}
                    </td>
                    <td>
                      <b style={{ color: '#3c3652', fontSize: 10.5 }}>
                        {MOVEMENT_LABELS[m.movementType] || m.movementType}
                      </b>
                    </td>
                    <td>{m.location?.name || '—'}</td>
                    <td>
                      <b style={{ color: '#5a546d' }}>
                        {m.quantity} {product.unitOfMeasure}
                      </b>
                    </td>
                    <td>{m.responsibleUser?.name || '—'}</td>
                    <td style={{ maxWidth: 220 }}>{m.reason || m.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h2>Transfers containing this product</h2>
            <p>Where this product has been requested to move</p>
          </div>
          <Link href="/dashboard/transfers" className="subtle-link">
            All transfers <ArrowLeftRight size={13} />
          </Link>
        </div>
        {transfers.length === 0 ? (
          <EmptyState
            icon="truck"
            title="No transfers yet"
            hint="Create a transfer to move this product between locations."
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Transfer</th>
                  <th>Route</th>
                  <th>Status</th>
                  <th>Requested by</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t: any) => {
                  const qty =
                    t.lineItems?.find(
                      (li: any) => String(li.product ?? li.product?._id) === String(product._id)
                    )?.requestedQuantity ?? '—'
                  return (
                    <tr key={String(t._id)}>
                      <td>
                        <Link href={`/dashboard/transfers/${t._id}`} className="transfer-id">
                          {t.reference}
                        </Link>
                      </td>
                      <td>
                        <span className="route-cell">
                          {t.sourceLocation?.name || '—'} → {t.destinationLocation?.name || '—'}
                        </span>
                      </td>
                      <td>
                        <Status value={TRANSFER_STATUS_LABEL[t.status] || t.status} />
                      </td>
                      <td>{t.requester?.name || '—'}</td>
                      <td title={new Date(t.createdAt).toLocaleString()}>
                        {formatDate(t.createdAt)}
                      </td>
                      <td>
                        <b style={{ color: '#5a546d' }}>
                          {qty} {qty === '—' ? '' : product.unitOfMeasure}
                        </b>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
export const dynamic = 'force-dynamic'
