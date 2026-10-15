'use client'

import { FormEvent, useState } from 'react'
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
          setMessage('Signed in. Taking you to your workspace…')
          router.push('/dashboard')
          router.refresh()
        }
      } else {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            password,
            organizationName: orgName,
            organizationSlug: orgSlug || slugify(orgName),
          }),
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
            setMessage('Workspace created. Taking you to your dashboard…')
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
        </>
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
            <input type="checkbox" /> <span>Remember me</span>
          </label>
          <Link href="/forgot-password">Forgot password?</Link>
        </div>
      )}

      <button className="button button-primary auth-submit" disabled={busy}>
        {busy ? 'Please wait…' : mode === 'login' ? 'Sign in to workspace' : 'Create workspace'}{' '}
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
