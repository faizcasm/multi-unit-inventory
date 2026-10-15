'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  UserRound,
} from 'lucide-react'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50)
}

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  // register fields
  const [name, setName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)

  // Pre-fill the email field with the address used last time (login only).
  useEffect(() => {
    if (mode !== 'login') return
    try {
      const saved = localStorage.getItem('ricoz:remembered-email')
      if (saved) setEmail(saved)
    } catch {
      /* storage unavailable — nothing to restore */
    }
  }, [mode])

  // Invite flow: /register?invite=… describes the workspace being joined.
  const [inviteToken, setInviteToken] = useState('')
  const [inviteInfo, setInviteInfo] = useState<{
    organizationName: string
    roleLabel: string
    emailRequired?: string | null
  } | null>(null)
  const [inviteError, setInviteError] = useState('')

  useEffect(() => {
    if (mode !== 'register') return
    const params = new URLSearchParams(window.location.search)
    const token = params.get('invite')?.trim()
    if (!token) return
    setInviteToken(token)
    ;(async () => {
      try {
        const res = await fetch(`/api/invites/${encodeURIComponent(token)}`)
        const data = await res.json()
        if (res.ok && data.data) {
          setInviteInfo(data.data)
        } else {
          setInviteError(data.error || 'This invite link is invalid, expired, or already used.')
        }
      } catch {
        setInviteError('Could not validate the invite link. Try opening it again.')
      }
    })()
  }, [mode])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    setIsError(false)

    try {
      if (mode === 'login') {
        const result = await signIn('credentials', { email, password, redirect: false })
        if (result?.error) {
          setIsError(true)
          setMessage('Invalid email or password. Please try again.')
        } else {
          try {
            if (remember) localStorage.setItem('ricoz:remembered-email', email.trim())
            else localStorage.removeItem('ricoz:remembered-email')
          } catch {
            /* storage unavailable — sign-in still succeeds */
          }
          setMessage('Signed in. Taking you to your workspace…')
          router.push('/dashboard')
          router.refresh()
        }
      } else {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            inviteInfo
              ? { name, email, password, invite: inviteToken }
              : {
                  name,
                  email,
                  password,
                  organizationName: orgName,
                  organizationSlug: orgSlug || slugify(orgName),
                }
          ),
        })
        const data = await response.json()
        if (!response.ok) {
          setIsError(true)
          const firstDetail = data?.details ? Object.values(data.details).flat()[0] : null
          setMessage(firstDetail || data?.error || 'Registration failed. Please try again.')
        } else {
          // sign in right after successful registration
          const result = await signIn('credentials', { email, password, redirect: false })
          if (result?.error) {
            setMessage('Account created. Please sign in to continue.')
            router.push('/signin')
          } else {
            setMessage(inviteInfo ? 'Joined! Taking you to your dashboard…' : 'Workspace created. Taking you to your dashboard…')
            router.push('/dashboard')
            router.refresh()
          }
        }
      }
    } catch {
      setIsError(true)
      setMessage('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {mode === 'register' && (
        <>
          <label>
            Full name
            <div className="field-wrap">
              <UserRound size={17} />
              <input
                required
                placeholder="Your name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
            </div>
          </label>
          {!inviteInfo && (
            <label>
              Workspace name
              <div className="field-wrap">
                <Building2 size={17} />
                <input
                  required
                  placeholder="e.g. Northstar Retail"
                  autoComplete="organization"
                  value={orgName}
                  onChange={(e) => {
                    setOrgName(e.target.value)
                    if (!slugTouched) setOrgSlug(slugify(e.target.value))
                  }}
                  maxLength={100}
                />
              </div>
            </label>
          )}
        </>
      )}

      {mode === 'register' && inviteError && (
        <div
          className="auth-message"
          role="status"
          style={{ background: '#fdeef0', borderColor: '#f6d3d9', color: '#a4404f' }}
        >
          {inviteError} You can still create a new workspace below.
        </div>
      )}

      {mode === 'register' && inviteInfo && (
        <div
          style={{
            border: '1px solid #e6ddff',
            background: '#f6f2ff',
            borderRadius: 10,
            padding: '13px 15px',
            display: 'grid',
            gap: 6,
          }}
        >
          <b style={{ fontSize: 12, color: '#4b3f77' }}>
            Joining {inviteInfo.organizationName}
          </b>
          <span style={{ fontSize: 10.5, color: '#7d76a0', lineHeight: 1.65 }}>
            You&apos;ll join as <b>{inviteInfo.roleLabel}</b> — an admin can change your role later
            from People.
            {inviteInfo.emailRequired
              ? ` Sign up with ${inviteInfo.emailRequired} to use this invite.`
              : ''}
          </span>
        </div>
      )}

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

      <label>
        Password
        <div className="field-wrap">
          <LockKeyhole size={17} />
          <input
            type={showPassword ? 'text' : 'password'}
            required
            minLength={8}
            placeholder="At least 8 characters"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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

      {mode === 'login' && (
        <div className="auth-form-meta">
          <label className="remember" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />{' '}
            <span>Remember my email</span>
          </label>
          <Link href="/forgot-password">Forgot password?</Link>
        </div>
      )}

      <button className="button button-primary auth-submit" disabled={busy}>
        {busy
          ? 'Please wait…'
          : mode === 'login'
            ? 'Sign in to workspace'
            : inviteInfo
              ? 'Join workspace'
              : 'Create workspace'}{' '}
        {!busy && <ArrowRight size={16} />}
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
        <LockKeyhole size={13} /> Your workspace access stays protected.
      </div>
    </form>
  )
}
