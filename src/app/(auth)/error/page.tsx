'use client'

import Link from 'next/link'
import { ArrowLeft, Boxes, ShieldAlert } from 'lucide-react'

export default function AuthErrorPage() {
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
          <div className="eyebrow">AUTHENTICATION</div>
          <h1>
            Something
            <br />
            <span>went sideways.</span>
          </h1>
          <p>
            Sign-in didn&apos;t complete. Your workspace is safe — just try again in a moment.
          </p>
        </div>
        <div className="auth-side-bottom">
          <span>Designed for teams on the move.</span>
          <span>© 2026 Ricoz Inventory</span>
        </div>
        <div className="auth-deco deco-one" />
        <div className="auth-deco deco-two" />
      </section>
      <section className="auth-main">
        <Link href="/" className="auth-back">
          <ArrowLeft size={15} /> Back to home
        </Link>
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <span className="brand-mark">
              <Boxes size={20} />
            </span>
            <b>ricoz inventory</b>
          </div>
          <div className="auth-heading">
            <span className="auth-kicker">AUTHENTICATION ERROR</span>
            <h2>We couldn&apos;t sign you in</h2>
            <p>
              Something went wrong during authentication. Try again, or contact your workspace admin
              if it keeps happening.
            </p>
          </div>
          <div className="auth-form">
            <Link href="/signin" className="button button-primary auth-submit">
              <ShieldAlert size={16} /> Try signing in again
            </Link>
            <Link href="/" className="button button-secondary auth-submit">
              Go back home
            </Link>
          </div>
          <div className="auth-legal">
            If you were trying to reset your password, use the forgot password link on the sign-in
            page.
          </div>
        </div>
      </section>
    </main>
  )
}
