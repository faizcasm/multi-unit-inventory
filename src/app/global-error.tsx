'use client'

/**
 * Root-level error boundary — replaces the root layout on a crash, so it must
 * render its own <html>/<body> and be fully self-contained (no imports of app
 * CSS, fonts, or providers). Inline styles only, with a neutral light/dark
 * palette that doesn't depend on any stylesheet loading successfully.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#f8f7fb',
          color: '#201c33',
          fontFamily:
            "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <style>{`
          @media (prefers-color-scheme: dark) {
            body { background: #141126 !important; color: #eceaf6 !important; }
            .ge-card { background: #1d1936 !important; border-color: #302a52 !important; }
            .ge-muted { color: #9d99b5 !important; }
          }
        `}</style>
        <div
          className="ge-card"
          style={{
            maxWidth: 440,
            width: '100%',
            background: '#ffffff',
            border: '1px solid #eeebf5',
            borderRadius: 16,
            padding: '40px 32px',
            textAlign: 'center',
            boxShadow: '0 10px 35px rgba(42, 31, 82, 0.08)',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 48,
              height: 48,
              margin: '0 auto 16px',
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: 24,
              background: 'linear-gradient(145deg, #7c63e3, #5a44c9)',
            }}
          >
            R
          </div>
          <div
            style={{
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: '-0.3px',
              marginBottom: 20,
            }}
          >
            ricoz inventory
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 22, letterSpacing: '-0.5px' }}>
            Something went wrong
          </h1>
          <p className="ge-muted" style={{ margin: '0 0 24px', fontSize: 14, color: '#77758a', lineHeight: 1.6 }}>
            The app hit an unexpected error and couldn&apos;t recover. Reloading
            usually fixes it. If it keeps happening, check your connection or
            try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              border: 'none',
              borderRadius: 10,
              minHeight: 43,
              padding: '0 22px',
              fontSize: 14,
              fontWeight: 700,
              color: '#ffffff',
              cursor: 'pointer',
              background: 'linear-gradient(135deg, #8066ed, #6b50df)',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
