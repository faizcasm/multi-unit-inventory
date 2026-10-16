'use client'

import { CSSProperties, ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

/**
 * Self-mounting guard: if `<ShortcutProvider />` is ever mounted twice
 * (e.g. nested layouts), only the first instance attaches its listeners and
 * renders the help modal. The flag resets on unmount so hot-reloads and
 * legitimate remounts still work.
 */
let claimed = false

/** Chord targets: press `g`, then a letter, to jump around the app. */
const GOTO_TARGETS: { key: string; label: string; href: string }[] = [
  { key: 'd', label: 'Dashboard', href: '/dashboard' },
  { key: 'i', label: 'Inventory', href: '/dashboard/inventory' },
  { key: 'p', label: 'Products', href: '/dashboard/products' },
  { key: 't', label: 'Transfers', href: '/dashboard/transfers' },
  { key: 'l', label: 'Locations', href: '/dashboard/locations' },
  { key: 'r', label: 'Reports', href: '/dashboard/reports' },
  { key: 'a', label: 'Activity', href: '/dashboard/activity' },
  { key: 's', label: 'Suppliers', href: '/dashboard/suppliers' },
]

const GOTO_MAP: Record<string, string> = Object.fromEntries(
  GOTO_TARGETS.map((t) => [t.key, t.href])
)

/** Milliseconds the `g` chord stays armed before it auto-disarms. */
const CHORD_TIMEOUT = 1400

const KBD_STYLE: CSSProperties = {
  border: '1px solid var(--line)',
  borderRadius: 4,
  padding: '1px 6px',
  fontSize: 12,
  lineHeight: '18px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  background: 'var(--canvas)',
  color: 'var(--ink)',
  display: 'inline-block',
}

const ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 14,
  padding: '9px 0',
  borderBottom: '1px solid var(--line)',
  fontSize: 12,
  color: 'var(--ink)',
}

const GROUP_TITLE_STYLE: CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: '1.1px',
  color: 'var(--muted)',
  margin: '16px 0 4px',
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd style={KBD_STYLE}>{children}</kbd>
}

export function ShortcutProvider() {
  const router = useRouter()
  const [active, setActive] = useState(false)
  const [armed, setArmed] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  // First instance wins; everyone else renders nothing.
  useEffect(() => {
    if (claimed) return
    claimed = true
    setActive(true)
    return () => {
      claimed = false
      setActive(false)
    }
  }, [])

  // Chord auto-disarm timer.
  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(false), CHORD_TIMEOUT)
    return () => window.clearTimeout(timer)
  }, [armed])

  // Global keydown listener.
  useEffect(() => {
    if (!active) return

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const inEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)

      // Escape is always handled: close the help modal / clear the chord.
      if (e.key === 'Escape') {
        setArmed(false)
        setHelpOpen(false)
        return
      }

      // Never hijack browser/OS combos or keystrokes inside editable fields.
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (inEditable) return

      if (armed) {
        e.preventDefault()
        setArmed(false)
        const href = GOTO_MAP[e.key.toLowerCase()]
        if (href) router.push(href)
        return
      }

      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault()
        setArmed(true)
        return
      }

      if (e.key === '/') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('ricoz:open-palette'))
        return
      }

      if (e.key === '?') {
        e.preventDefault()
        setHelpOpen(true)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [active, armed, router])

  if (!active) return null

  return (
    <>
      {armed && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            left: 18,
            bottom: 18,
            zIndex: 70,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 12px',
            borderRadius: 999,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            boxShadow: 'var(--shadow)',
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--muted)',
          }}
        >
          <Kbd>g</Kbd>
          <span>…then press a key</span>
        </div>
      )}

      {helpOpen && (
        <div className="modal-backdrop" onClick={() => setHelpOpen(false)}>
          <div
            className="create-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(460px, 100%)' }}
          >
            <div className="modal-heading">
              <div>
                <div className="modal-kicker">SHORTCUTS</div>
                <h2 style={{ fontFamily: 'Manrope', fontSize: 17, margin: '6px 0 0' }}>
                  Keyboard shortcuts
                </h2>
              </div>
              <button className="icon-button" onClick={() => setHelpOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div style={{ marginTop: -6 }}>
              <div style={GROUP_TITLE_STYLE}>NAVIGATION</div>
              {GOTO_TARGETS.map((t) => (
                <div key={t.key} style={ROW_STYLE}>
                  <span>{t.label}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Kbd>g</Kbd>
                    <span style={{ color: 'var(--muted)', fontSize: 11 }}>then</span>
                    <Kbd>{t.key}</Kbd>
                  </span>
                </div>
              ))}

              <div style={GROUP_TITLE_STYLE}>ACTIONS</div>
              <div style={ROW_STYLE}>
                <span>Open search</span>
                <Kbd>/</Kbd>
              </div>
              <div style={ROW_STYLE}>
                <span>Show this help</span>
                <Kbd>?</Kbd>
              </div>
              <div
                style={{
                  ...ROW_STYLE,
                  borderBottom: 0,
                }}
              >
                <span>Close dialogs / clear chord</span>
                <Kbd>Esc</Kbd>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 14 }}>
              <button className="button button-secondary" onClick={() => setHelpOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default ShortcutProvider
