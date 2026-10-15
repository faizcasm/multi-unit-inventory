import Link from 'next/link'
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Command,
  Layers3,
  MapPin,
  Package,
  ShieldCheck,
  Sparkles,
  Truck,
  Warehouse,
} from 'lucide-react'

const featureList = [
  {
    icon: Package,
    title: 'One inventory view',
    text: 'See product availability by location, with the context your team needs to make the next move.',
  },
  {
    icon: Truck,
    title: 'Transfers that stay traceable',
    text: 'Follow a stock movement from draft and approval through dispatch and receiving.',
  },
  {
    icon: ShieldCheck,
    title: 'Accountability built in',
    text: 'Role-aware actions and a movement history help keep inventory changes explainable.',
  },
]

export default function HomePage() {
  return (
    <main className="marketing-page">
      <header className="marketing-nav wrap">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Boxes size={20} />
          </span>
          <span>
            ricoz<span className="brand-light"> inventory</span>
          </span>
        </Link>
        <nav className="marketing-links">
          <a href="#platform">Platform</a>
          <a href="#workflow">How it works</a>
          <a href="#controls">Controls</a>
        </nav>
        <div className="nav-actions">
          <Link className="nav-login" href="/signin">
            Log in
          </Link>
          <Link className="button button-primary button-small" href="/register">
            Get started <ArrowRight size={15} />
          </Link>
        </div>
      </header>

      <section className="hero wrap">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-dot" /> INVENTORY, IN SYNC
          </div>
          <h1>
            Every location.
            <br />
            <span>One clear picture.</span>
          </h1>
          <p className="hero-sub">
            Move stock with clarity and control. Ricoz brings your products, locations, and transfer
            workflows into one calmer, more accountable workspace.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/register">
              Explore the workspace <ArrowRight size={16} />
            </Link>
            <a className="button button-secondary" href="#workflow">
              See how it works <ChevronRight size={16} />
            </a>
          </div>
          <div className="hero-proof">
            <div className="proof-avatars">
              <span>O</span>
              <span>M</span>
              <span>A</span>
            </div>
            <span>
              Built for teams moving inventory
              <br />
              <b>across multiple locations</b>
            </span>
          </div>
        </div>

        <div className="hero-visual">
          <div className="visual-glow" />
          <div className="dashboard-window">
            <div className="window-top">
              <div className="window-dots">
                <i />
                <i />
                <i />
              </div>
              <span>Workspace overview</span>
              <span className="window-status">
                <i /> All systems organized
              </span>
            </div>
            <div className="mock-layout">
              <aside className="mock-sidebar">
                <div className="mock-brand">
                  <span className="brand-mark tiny">
                    <Boxes size={13} />
                  </span>{' '}
                  ricoz
                </div>
                <div className="mock-nav active">
                  <Command size={13} /> Overview
                </div>
                <div className="mock-nav">
                  <Package size={13} /> Inventory
                </div>
                <div className="mock-nav">
                  <Truck size={13} /> Transfers
                </div>
                <div className="mock-nav">
                  <Warehouse size={13} /> Locations
                </div>
                <div className="mock-nav">
                  <ClipboardCheck size={13} /> Approvals
                </div>
                <div className="mock-sidebar-bottom">
                  <div className="mock-avatar">FH</div>
                  <span>
                    Faizan H.
                    <small>Workspace admin</small>
                  </span>
                </div>
              </aside>
              <div className="mock-main">
                <div className="mock-heading">
                  <div>
                    <small>THURSDAY, OCTOBER 15</small>
                    <h3>Good morning, Faizan</h3>
                    <p>Here&apos;s what&apos;s happening across your locations.</p>
                  </div>
                  <span className="mock-date">Last 30 days⌄</span>
                </div>
                <div className="mock-kpis">
                  <div className="mock-kpi">
                    <span>Total products</span>
                    <b>1,248</b>
                    <small className="green">↗ 8.2% <em>vs last month</em></small>
                  </div>
                  <div className="mock-kpi">
                    <span>In transit</span>
                    <b>23</b>
                    <small>Across 6 locations</small>
                  </div>
                  <div className="mock-kpi">
                    <span>Needs attention</span>
                    <b>07</b>
                    <small className="amber">Low stock items</small>
                  </div>
                </div>
                <div className="mock-panels">
                  <div className="mock-panel chart-panel">
                    <div className="mock-panel-head">
                      <b>Stock movement</b>
                      <span>View report ↗</span>
                    </div>
                    <div className="chart-labels">
                      <span>120</span>
                      <span>80</span>
                      <span>40</span>
                      <span>0</span>
                    </div>
                    <div className="mock-chart">
                      <div className="chart-grid" />
                      <svg
                        viewBox="0 0 320 105"
                        preserveAspectRatio="none"
                        aria-label="Illustrative stock movement chart"
                      >
                        <defs>
                          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#8b75ed" stopOpacity=".28" />
                            <stop offset="100%" stopColor="#8b75ed" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path
                          d="M0 78 C22 70 24 45 48 54 S75 70 96 44 S128 60 150 39 S180 50 200 26 S226 53 246 31 S276 48 300 15 L320 25 L320 105 L0 105Z"
                          fill="url(#area)"
                        />
                        <path
                          d="M0 78 C22 70 24 45 48 54 S75 70 96 44 S128 60 150 39 S180 50 200 26 S226 53 246 31 S276 48 300 15 L320 25"
                          fill="none"
                          stroke="#8067e9"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                    <div className="chart-days">
                      <span>Sep 16</span>
                      <span>Sep 22</span>
                      <span>Sep 28</span>
                      <span>Oct 04</span>
                      <span>Oct 10</span>
                      <span>Oct 15</span>
                    </div>
                  </div>
                  <div className="mock-panel transfer-panel">
                    <div className="mock-panel-head">
                      <b>Recent transfers</b>
                      <span>See all ↗</span>
                    </div>
                    <div className="mini-transfer">
                      <span className="mini-icon purple">
                        <Truck size={14} />
                      </span>
                      <span>
                        <b>TR-0024</b>
                        <small>Central Hub → North Store</small>
                      </span>
                      <em className="pill transit">In transit</em>
                    </div>
                    <div className="mini-transfer">
                      <span className="mini-icon green-bg">
                        <CircleCheck size={14} />
                      </span>
                      <span>
                        <b>TR-0023</b>
                        <small>East Store → Central Hub</small>
                      </span>
                      <em className="pill received">Received</em>
                    </div>
                    <div className="mini-transfer">
                      <span className="mini-icon orange-bg">
                        <ClipboardCheck size={14} />
                      </span>
                      <span>
                        <b>TR-0022</b>
                        <small>Central Hub → West Store</small>
                      </span>
                      <em className="pill review">Review</em>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="floating-note note-top">
              <span className="float-icon">
                <Check size={15} />
              </span>
              <span>
                <b>Transfer received</b>
                <small>TR-0023 · Just now</small>
              </span>
            </div>
            <div className="floating-note note-bottom">
              <span className="float-icon purple-icon">
                <Layers3 size={15} />
              </span>
              <span>
                <b>Inventory in sync</b>
                <small>Across all locations</small>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="trust-strip">
        <div className="wrap trust-inner">
          <span>MADE FOR MULTI-LOCATION OPERATIONS</span>
          <div>
            <Warehouse size={17} /> Warehouses
          </div>
          <div>
            <MapPin size={17} /> Retail locations
          </div>
          <div>
            <Layers3 size={17} /> Distribution teams
          </div>
        </div>
      </section>

      <section className="section wrap" id="platform">
        <div className="section-intro">
          <div className="eyebrow">A BETTER WAY TO MOVE</div>
          <h2>
            Inventory operations,
            <br />
            <span>without the guesswork.</span>
          </h2>
          <p>
            Keep the everyday work connected: the product, the stock, the location, and the people
            responsible for moving it.
          </p>
        </div>
        <div className="feature-grid">
          {featureList.map(({ icon: Icon, title, text }, i) => (
            <article className="feature-card" key={title}>
              <span className="feature-icon">
                <Icon size={21} />
              </span>
              <span className="feature-number">0{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
              <a href="#workflow">
                Explore capability <ArrowUpRight size={14} />
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="workflow-section" id="workflow">
        <div className="wrap workflow-grid">
          <div>
            <div className="eyebrow">A CONNECTED WORKFLOW</div>
            <h2>
              From request
              <br />
              to <span>reconciled stock.</span>
            </h2>
            <p className="section-copy">
              Every transfer has a clear next step, so teams can spend less time chasing updates and
              more time keeping stock where it belongs.
            </p>
            <Link href="/register" className="text-link">
              See the workspace <ArrowRight size={15} />
            </Link>
          </div>
          <div className="steps-list">
            <div className="step">
              <span className="step-num">01</span>
              <span className="step-icon">
                <Package size={19} />
              </span>
              <div>
                <h3>Create a transfer</h3>
                <p>Choose source and destination locations, add products, and set quantities.</p>
              </div>
              <span className="step-check">
                <Check size={14} />
              </span>
            </div>
            <div className="step">
              <span className="step-num">02</span>
              <span className="step-icon">
                <ClipboardCheck size={19} />
              </span>
              <div>
                <h3>Review and approve</h3>
                <p>Route requests through the right approval before stock leaves.</p>
              </div>
              <span className="step-check">
                <Check size={14} />
              </span>
            </div>
            <div className="step">
              <span className="step-num">03</span>
              <span className="step-icon">
                <Truck size={19} />
              </span>
              <div>
                <h3>Dispatch the stock</h3>
                <p>Record dispatch and keep the transfer status visible.</p>
              </div>
              <span className="step-check">
                <Check size={14} />
              </span>
            </div>
            <div className="step">
              <span className="step-num">04</span>
              <span className="step-icon">
                <CircleCheck size={19} />
              </span>
              <div>
                <h3>Receive and reconcile</h3>
                <p>Confirm received quantities and document missing or damaged items.</p>
              </div>
              <span className="step-check">
                <Check size={14} />
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="controls-section wrap" id="controls">
        <div className="controls-card">
          <div className="controls-copy">
            <div className="eyebrow">CONTROL WITHOUT COMPLEXITY</div>
            <h2>
              Clear ownership.
              <br />
              <span>Traceable movement.</span>
            </h2>
            <p>
              Give teams the access they need, keep sensitive actions accountable, and preserve the
              history behind stock changes.
            </p>
            <ul>
              <li>
                <Check size={16} /> Role-aware workflows
              </li>
              <li>
                <Check size={16} /> Movement ledger and audit history
              </li>
              <li>
                <Check size={16} /> Organization-scoped inventory
              </li>
            </ul>
            <Link className="button button-primary" href="/register">
              Get started <ArrowRight size={15} />
            </Link>
          </div>
          <div className="control-visual">
            <div className="audit-card">
              <div className="audit-head">
                <span className="feature-icon">
                  <ShieldCheck size={19} />
                </span>
                <span>
                  <b>Activity history</b>
                  <small>Inventory movement log</small>
                </span>
                <span className="audit-dots">•••</span>
              </div>
              <div className="audit-row">
                <span className="audit-line purple-line" />
                <div>
                  <b>Transfer approved</b>
                  <small>TR-0024 · Central Hub</small>
                </div>
                <time>10:42 AM</time>
              </div>
              <div className="audit-row">
                <span className="audit-line green-line" />
                <div>
                  <b>Stock dispatched</b>
                  <small>TR-0023 · East Store</small>
                </div>
                <time>09:18 AM</time>
              </div>
              <div className="audit-row">
                <span className="audit-line orange-line" />
                <div>
                  <b>Quantity adjusted</b>
                  <small>SKU-1048 · North Store</small>
                </div>
                <time>Yesterday</time>
              </div>
              <div className="audit-foot">
                <ShieldCheck size={15} /> Every change has a trail
              </div>
            </div>
            <div className="control-orb">
              <ShieldCheck size={24} />
            </div>
          </div>
        </div>
      </section>

      <section className="final-cta wrap">
        <div className="cta-orb">
          <Sparkles size={22} />
        </div>
        <div>
          <h2>Make every stock movement count.</h2>
          <p>Bring your locations and transfer workflows into one place.</p>
        </div>
        <Link className="button button-white" href="/register">
          Open Ricoz Inventory <ArrowRight size={16} />
        </Link>
      </section>

      <footer className="marketing-footer wrap">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Boxes size={18} />
          </span>
          <span>
            ricoz<span className="brand-light"> inventory</span>
          </span>
        </Link>
        <span>Inventory operations, made clearer.</span>
        <div>
          <Link href="/signin">Log in</Link>
          <Link href="/register">Get started</Link>
        </div>
        <small>© 2026 Ricoz Inventory</small>
      </footer>
    </main>
  )
}
