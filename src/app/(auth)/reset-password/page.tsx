'use client'

import { FormEvent, Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
} from 'lucide-react'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const email = searchParams.get('email') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [done, setDone] = useState(false)

  const validLink = Boolean(token && email)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMessage('')
    setIsError(false)

    if (password !== confirm) {
      setIsError(true)
      setMessage('Passwords do not match.')
      return
    }

    setBusy(true)
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, password }),
      })
      const data = await response.json()
      if (!response.ok) {
        setIsError(true)
        setMessage(data?.error || 'Unable to reset password. Please request a new link.')
      } else {
        setDone(true)
        setMessage(data?.message || 'Password updated.')
      }
    } catch {
      setIsError(true)
      setMessage('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-mobile-brand">
        <span className="brand-mark">
          <Boxes size={20} />
        </span>
        <b>ricoz inventory</b>
      </div>
      <div className="auth-heading">
        <span className="auth-kicker">SET NEW PASSWORD</span>
        <h2>Choose a new password</h2>
        <p>Your new password replaces the old one immediately.</p>
      </div>

      {!validLink ? (
        <div className="auth-message" role="alert" style={{ background: '#fdeef0', borderColor: '#f6d3d9', color: '#a4404f' }}>
          This reset link is missing its token or email. Please open the link from your inbox, or
          request a new one from the{' '}
          <Link href="/forgot-password" style={{ fontWeight: 700 }}>
            forgot password page
          </Link>
          .
        </div>
      ) : done ? (
        <div className="auth-message" role="status" style={{ display: 'flex', gap: 10 }}>
          <LockKeyhole size={17} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            {message}
            <br />
            <Link href="/signin" style={{ fontWeight: 700 }}>
              Sign in now →
            </Link>
          </span>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <label>
            <div className="field-wrap" style={{ marginTop: 6 }}>
              <Mail size={17} />
              <input value={email} readOnly disabled />
            </div>
          </label>

          <label>
            New password
            <div className="field-wrap">
              <LockKeyhole size={17} />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                className="password-toggle"
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{ border: 0, background: 'transparent', display: 'grid', placeItems: 'center' }}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          <label>
            Confirm password
            <div className="field-wrap">
              <LockKeyhole size={17} />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                placeholder="Repeat the new password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          </label>

          <button className="button button-primary auth-submit" disabled={busy}>
            {busy ? 'Updating…' : 'Update password'} {!busy && <ArrowRight size={16} />}
          </button>

          {message && (
            <div
              className="auth-message"
              role="status"
              style={
                isError ? { background: '#fdeef0', borderColor: '#f6d3d9', color: '#a4404f' } : undefined
              }
            >
              {message}
            </div>
          )}

          <div className="auth-secure">
            <LockKeyhole size={13} /> Choose something only your team can&apos;t guess.
          </div>
        </form>
      )}

      <div className="auth-switch">
        <Link href="/signin">Back to sign in</Link>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
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
          <div className="eyebrow">SECURE YOUR WORKSPACE</div>
          <h1>
            A fresh
            <br />
            <span>start.</span>
          </h1>
          <p>Set a new password and keep your inventory workspace protected.</p>
          <div className="auth-side-points">
            <span>
              <LockKeyhole size={17} /> Hashed with bcrypt
            </span>
            <span>
              <Mail size={17} /> Single-use reset links
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
        <Suspense fallback={<div className="auth-card">Loading…</div>}>
          <ResetPasswordForm />
        </Suspense>
      </section>
    </main>
  )
}
