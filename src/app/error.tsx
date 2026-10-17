'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

/**
 * Route-level error boundary. Rendered inside the root layout, so it can rely
 * on redesign.css classes and CSS variables.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="wrap" style={{ paddingTop: 80, paddingBottom: 80 }}>
      <div className="panel" style={{ padding: 40 }}>
        <div className="empty-state" style={{ minHeight: 0 }}>
          <AlertTriangle size={36} aria-hidden="true" />
          <b style={{ fontSize: 18, fontFamily: 'Manrope, sans-serif' }}>
            Something went wrong
          </b>
          <p>
            An unexpected error occurred while loading this page. Your data is
            safe — try again, or head back to the dashboard.
          </p>
          {error.digest ? (
            <p className="muted" style={{ fontSize: 10 }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <div
            style={{
              display: 'flex',
              gap: 10,
              marginTop: 14,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <button type="button" className="button button-primary" onClick={() => reset()}>
              Try again
            </button>
            <Link href="/dashboard" className="button button-secondary">
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
