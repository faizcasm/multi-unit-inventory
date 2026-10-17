import Link from 'next/link'
import { MapPin } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="wrap" style={{ paddingTop: 80, paddingBottom: 80 }}>
      <div className="panel" style={{ padding: 40 }}>
        <div className="empty-state" style={{ minHeight: 0 }}>
          <MapPin size={36} aria-hidden="true" />
          <b style={{ fontSize: 18, fontFamily: 'Manrope, sans-serif' }}>
            Page not found
          </b>
          <p>
            The page you&apos;re looking for doesn&apos;t exist or may have been
            moved.
          </p>
          <Link
            href="/dashboard"
            className="button button-primary"
            style={{ marginTop: 14 }}
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
