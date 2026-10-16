import { notFound, redirect } from 'next/navigation'
import { Metadata } from 'next'
import { connectDB } from '@/lib/db/mongodb'
import { Location } from '@/models/Location'
import { Inventory } from '@/models/Inventory'
import { Types } from 'mongoose'
import Link from 'next/link'
import { Building2, ChevronLeft, MapPin, Package, Truck, Warehouse, AlertTriangle, Gauge } from 'lucide-react'
import { Status, Metric } from '@/components/redesign/ui'
import { NewTransferTruckButton } from '@/components/redesign/NewTransferButton'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { CapacityEditor } from './CapacityEditor'

/** Utilization bar color: mint <70%, orange 70–90%, red >90%. */
function utilizationColor(percent: number): string {
  if (percent < 70) return '#23835c'
  if (percent <= 90) return '#b96b16'
  return '#c55c50'
}

interface LocationPageProps {
  params: { id: string }
}

export async function generateMetadata({ params }: LocationPageProps): Promise<Metadata> {
  if (!Types.ObjectId.isValid(params.id)) return { title: 'Location Not Found' }
  try {
    const session = await auth()
    if (!session?.user) return { title: 'Location Not Found' }
    await connectDB()
    const location = (await Location.findOne({
      _id: params.id,
      organization: session.user.organizationId,
    }).select('name').lean()) as any
    if (!location) return { title: 'Location Not Found' }
    return { title: `${location?.name} | Location` }
  } catch {
    return { title: 'Location Not Found' }
  }
}

const TYPE_LABELS: Record<string, string> = {
  warehouse: 'Warehouse',
  store: 'Retail store',
  distribution_center: 'Distribution center',
  other: 'Other',
}

export default async function LocationDetailPage({ params }: LocationPageProps) {
  const session = await auth()
  if (!session?.user) redirect('/signin')

  await connectDB()

  if (!Types.ObjectId.isValid(params.id)) {
    notFound()
  }

  const location = (await Location.findOne({
    _id: params.id,
    organization: session.user.organizationId,
  })
    .populate('organization', 'name')
    .lean()) as any

  if (!location) {
    notFound()
  }

  const address = location.address || {}
  const addressLine = [
    address.street,
    [address.city, address.state].filter(Boolean).join(', '),
    address.postalCode,
    address.country,
  ]
    .filter(Boolean)
    .join(' · ')

  // onHand for utilization = available + reserved + damaged at this location.
  const invRows = (await Inventory.find({
    location: location._id,
    organization: session.user.organizationId,
  })
    .select('availableQuantity reservedQuantity damagedQuantity')
    .lean()) as any[]
  const onHand = invRows.reduce(
    (sum, r) => sum + (r.availableQuantity || 0) + (r.reservedQuantity || 0) + (r.damagedQuantity || 0),
    0
  )
  const capacity: number | null = typeof location.capacity === 'number' ? location.capacity : null
  const percent = capacity && capacity > 0 ? Math.round((onHand / capacity) * 100) : null
  const canUpdate = hasPermission(session.user.role, 'locations:update')

  return (
    <>
      <div className="back-row">
        <Link href="/dashboard/locations">
          <ChevronLeft size={15} /> Back to locations
        </Link>
        <span> / {location.code}</span>
      </div>

      <div className="page-heading">
        <div>
          <div className="page-eyebrow">LOCATION RECORD</div>
          <h1>{location.name}</h1>
          <p>
            {location.code} · {TYPE_LABELS[location.type] || location.type}
          </p>
        </div>
        <div className="heading-action">
          <Link
            href={`/dashboard/inventory?search=${encodeURIComponent(location.name)}`}
            className="button button-secondary"
          >
            <Package size={15} /> View inventory
          </Link>
          <NewTransferTruckButton />
        </div>
      </div>

      <div className="metric-grid compact-metrics">
        <Metric
          label="Utilization"
          value={percent === null ? '—' : `${percent}%`}
          icon="gauge"
          tone={percent === null ? 'purple' : percent < 70 ? 'mint' : percent <= 90 ? 'orange' : 'orange'}
          detail={capacity ? `of ${capacity.toLocaleString()} unit capacity` : 'no capacity set'}
        />
        <Metric label="Units on hand" value={onHand.toLocaleString()} icon="package" tone="blue" detail="available + reserved + damaged" />
        <Metric label="Capacity" value={capacity === null ? '—' : capacity.toLocaleString()} icon="warehouse" detail={capacity ? 'max units at this location' : 'unset'} />
        <Metric label="Products stocked" value={invRows.length} icon="package" detail="tracked here" />
      </div>

      <section className="panel" style={{ padding: 20, marginBottom: 18 }}>
        <div className="panel-heading">
          <div>
            <h2>Capacity &amp; utilization</h2>
            <p>How full this location is against its configured capacity</p>
          </div>
          {percent !== null && percent >= 90 ? (
            <span className="status status-needs-attention">
              <i /> Approaching capacity
            </span>
          ) : percent !== null ? (
            <span className="status status-healthy">
              <i /> Within capacity
            </span>
          ) : null}
        </div>

        {percent === null ? (
          <div className="stock-note" style={{ marginTop: 16 }}>
            <Gauge size={15} />
            No capacity set for this location — set one to track utilization as stock moves in and out.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 16 }}>
              <b
                style={{
                  fontFamily: 'Manrope',
                  fontSize: 34,
                  letterSpacing: '-1.4px',
                  color: utilizationColor(percent),
                }}
              >
                {percent}%
              </b>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {onHand.toLocaleString()} of {capacity!.toLocaleString()} units
              </span>
            </div>
            <div
              style={{ height: 10, borderRadius: 6, background: '#f0edf6', overflow: 'hidden', marginTop: 10 }}
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                style={{
                  width: `${Math.min(percent, 100)}%`,
                  height: '100%',
                  borderRadius: 6,
                  background: utilizationColor(percent),
                  transition: 'width .2s ease',
                }}
              />
            </div>
            {percent >= 90 && (
              <div className="stock-note" style={{ marginTop: 12, color: '#a3561a', background: '#fff7ec' }}>
                <AlertTriangle size={15} />
                <b>Approaching capacity.</b>
                {percent >= 100
                  ? ' This location is at or over its limit — transfer stock out or raise the capacity.'
                  : ' Consider transferring stock out or raising the capacity before it fills up.'}
              </div>
            )}
          </>
        )}

        {canUpdate && (
          <div style={{ marginTop: 14, borderTop: '1px solid #f0edf6', paddingTop: 14 }}>
            <CapacityEditor locationId={String(location._id)} capacity={capacity} />
          </div>
        )}
      </section>

      <div className="product-detail-grid">
        <section className="panel product-overview">
          <div className="product-hero-icon">
            <Warehouse size={38} />
          </div>
          <div className="product-overview-title">
            <h2>{location.name}</h2>
            <span className="muted">{location.code}</span>
            <Status value={location.isActive ? 'Healthy' : 'Needs attention'} />
          </div>
          <div className="detail-separator" />
          <div className="detail-kv">
            <span>Type</span>
            <b>{TYPE_LABELS[location.type] || location.type}</b>
          </div>
          <div className="detail-kv">
            <span>Capacity</span>
            <b>{capacity === null ? '—' : `${capacity.toLocaleString()} units`}</b>
          </div>
          <div className="detail-kv">
            <span>Status</span>
            <b>{location.isActive ? 'Active' : 'Inactive'}</b>
          </div>
          {addressLine && (
            <div className="detail-kv">
              <span>Address</span>
              <b style={{ fontWeight: 500 }}>{addressLine}</b>
            </div>
          )}
          {location.description && (
            <div className="detail-kv">
              <span>Description</span>
              <b style={{ fontWeight: 500 }}>{location.description}</b>
            </div>
          )}
          <div className="detail-kv">
            <span>Workspace</span>
            <b>{location.organization?.name || '—'}</b>
          </div>
        </section>

        <section className="panel product-stock">
          <div className="panel-heading">
            <div>
              <h2>Quick actions</h2>
              <p>Move stock in or out of this location</p>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 10, padding: '0 20px 20px' }}>
            <Link href="/dashboard/inventory/adjust" className="button button-secondary" style={{ width: '100%' }}>
              <Package size={15} /> Adjust stock here
            </Link>
            <Link
              href={`/dashboard/inventory?search=${encodeURIComponent(location.name)}`}
              className="button button-secondary"
              style={{ width: '100%' }}
            >
              <Building2 size={15} /> See stock levels
            </Link>
            <Link href="/dashboard/transfers" className="button button-secondary" style={{ width: '100%' }}>
              <Truck size={15} /> Transfers touching this location
            </Link>
            <div className="stock-note">
              <MapPin size={15} /> Location-level permissions control who can move stock here.
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
export const dynamic = 'force-dynamic'
