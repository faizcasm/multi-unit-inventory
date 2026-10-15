import Link from 'next/link'
import { ArrowLeft, ArrowRight, Boxes, LockKeyhole, ShieldCheck } from 'lucide-react'
import AuthForm from '@/components/auth/AuthForm'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Sign in',
}

export default function LoginPage() {
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
          <div className="eyebrow">A CLEARER VIEW OF STOCK</div>
          <h1>
            Bring every
            <br />
            location <span>together.</span>
          </h1>
          <p>
            One workspace for inventory visibility, accountable transfers, and calmer day-to-day
            operations.
          </p>
          <div className="auth-side-points">
            <span>
              <ShieldCheck size={17} /> Role-aware workflows
            </span>
            <span>
              <LockKeyhole size={17} /> Secure access
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
            <span className="auth-kicker">WELCOME BACK</span>
            <h2>Sign in to your workspace</h2>
            <p>Pick up where your team left off.</p>
          </div>
          <AuthForm mode="login" />
          <div className="auth-switch">
            New to Ricoz?{' '}
            <Link href="/register">
              Create an account <ArrowRight size={14} />
            </Link>
          </div>
          <div className="auth-legal">
            By continuing, you agree to the terms and privacy policy for your workspace.
          </div>
        </div>
      </section>
    </main>
  )
}
