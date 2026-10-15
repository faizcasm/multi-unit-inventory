'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Boxes, CheckCircle2, LockKeyhole, Mail } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    setIsError(false)
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await response.json()
      if (!response.ok) {
        setIsError(true)
        setMessage(data?.error || 'Unable to send the reset email. Please try again.')
      } else {
        setSent(true)
        setMessage(data?.message || 'Check your inbox for a reset link.')
      }
    } catch {
      setIsError(true)
      setMessage('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-side">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Boxes size={20} />
          </span>
          <span>
            ricoz<span className="brand-light"> inventory</span>
          </span>
        </Link>
        <div className="auth-side-content">
          <div className="eyebrow">ACCOUNT RECOVERY</div>
          <h1>
            Get back
            <br />
            <span>in control.</span>
          </h1>
          <p>
            Reset your password and pick up your inventory workflow right where you left off.
          </p>
          <div className="auth-side-points">
            <span>
              <LockKeyhole size={17} /> Links expire in one hour
            </span>
            <span>
              <Mail size={17} /> Sent straight to your inbox
            </span>
          </div>
        </div>
        <div className="auth-side-bottom">
          <span>Designed for teams on the move.</span>
          <span>© 2026 Ricoz Inventory</span>
        </div>
        <div className="auth-deco deco-one" />
        <div className="auth-deco deco-two" />
      </section>
      <section className="auth-main">
        <Link href="/signin" className="auth-back">
          <ArrowLeft size={15} /> Back to sign in
        </Link>
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <span className="brand-mark">
              <Boxes size={20} />
            </span>
            <b>ricoz inventory</b>
          </div>
          <div className="auth-heading">
            <span className="auth-kicker">FORGOT PASSWORD</span>
            <h2>Reset your password</h2>
            <p>Enter your email and we&apos;ll send you a secure reset link.</p>
          </div>

          {sent ? (
            <div className="auth-message" role="status" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <CheckCircle2 size={17} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                {message}
                <br />
                <Link href="/signin" style={{ fontWeight: 700 }}>
                  Back to sign in →
                </Link>
              </span>
            </div>
          ) : (
            <form className="auth-form" onSubmit={submit}>
              <label>
                Work email
                <div className="field-wrap">
                  <Mail size={17} />
                  <input
                    type="email"
                    required
                    placeholder="you@company.com"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </label>

              <button className="button button-primary auth-submit" disabled={busy}>
                {busy ? 'Sending…' : 'Send reset link'} {!busy && <ArrowRight size={16} />}
              </button>

              {message && (
                <div
                  className="auth-message"
                  role="status"
                  style={
                    isError
                      ? { background: '#fdeef0', borderColor: '#f6d3d9', color: '#a4404f' }
                      : undefined
                  }
                >
                  {message}
                </div>
              )}

              <div className="auth-secure">
                <LockKeyhole size={13} /> Reset links expire after 60 minutes.
              </div>
            </form>
          )}

          <div className="auth-switch">
            Remembered it? <Link href="/signin">Sign in</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
