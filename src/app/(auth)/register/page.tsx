import Link from 'next/link'
import { ArrowLeft, Boxes, Check, ShieldCheck } from 'lucide-react'
import AuthForm from '@/components/auth/AuthForm'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Create account',
}

export default function RegisterPage() {
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
          <div className="eyebrow">START WITH A CLEAR PICTURE</div>
          <h1>
            Make room
            <br />
            for <span>better flow.</span>
          </h1>
          <p>
            Bring your stock, locations, and transfer process into one connected workspace built
            around real operations.
          </p>
          <div className="auth-side-points">
            <span>
              <Check size={17} /> Product and location visibility
            </span>
            <span>
              <Check size={17} /> Trackable transfer workflow
            </span>
            <span>
              <ShieldCheck size={17} /> Clear roles and accountability
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
            <span className="auth-kicker">GET STARTED</span>
            <h2>Create your workspace</h2>
            <p>Set up your account to organize your inventory.</p>
          </div>
          <AuthForm mode="register" />
          <div className="auth-switch">
            Already have an account? <Link href="/signin">Sign in</Link>
          </div>
          <div className="auth-legal">
            Your workspace gets a main warehouse by default — you can add more locations from the
            dashboard.
          </div>
        </div>
      </section>
    </main>
  )
}
