import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { connectDB } from '@/lib/db/mongodb'
import { Location } from '@/models/Location'
import { Types } from 'mongoose'
import Link from 'next/link'
import { Building2, ChevronLeft, MapPin, Package, Truck, Warehouse } from 'lucide-react'
import { Status } from '@/components/redesign/ui'

interface LocationPageProps {
  params: { id: string }
}

export async function generateMetadata({ params }: LocationPageProps): Promise<Metadata> {
  if (!Types.ObjectId.isValid(params.id)) return { title: 'Location Not Found' }
  try {
    await connectDB()
    const location = (await Location.findById(params.id).lean()) as any
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
  await connectDB()

  if (!Types.ObjectId.isValid(params.id)) {
    notFound()
  }

  const location = (await Location.findById(params.id)
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
          <Link href="/dashboard/transfers/new" className="button button-primary">
            <Truck size={15} /> New transfer
          </Link>
        </div>
      </div>

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
