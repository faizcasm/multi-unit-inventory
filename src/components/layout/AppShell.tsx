'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Package,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Truck,
  Warehouse,
  X,
} from 'lucide-react'
import { useTheme } from 'next-themes'

type NavItem = { href: string; label: string; icon: React.ElementType; count?: number }

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'WORKSPACE',
    items: [
      { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
      { href: '/dashboard/inventory', label: 'Inventory', icon: Package },
      { href: '/dashboard/products', label: 'Products', icon: Boxes },
      { href: '/dashboard/transfers', label: 'Transfers', icon: Truck },
    ],
  },
  {
    label: 'OPERATIONS',
    items: [{ href: '/dashboard/locations', label: 'Locations', icon: Warehouse }],
  },
  {
    label: 'INSIGHTS & CONTROL',
    items: [
      { href: '/dashboard/reports', label: 'Reports', icon: Activity },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    ],
  },
]

const titleMap: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/inventory': 'Inventory',
  '/dashboard/products': 'Products',
  '/dashboard/transfers': 'Transfers',
  '/dashboard/locations': 'Locations',
  '/dashboard/reports': 'Reports',
  '/dashboard/settings': 'Settings',
}

function getPageTitle(pathname: string): string {
  if (titleMap[pathname]) return titleMap[pathname]
  const base = '/' + pathname.split('/').slice(1, 3).join('/')
  return titleMap[base] || 'Overview'
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  const { theme, setTheme } = useTheme()
  const [mobileNav, setMobileNav] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [toast, setToast] = React.useState('')
  const [userMenu, setUserMenu] = React.useState(false)

  const user = session?.user as any
  const name: string = user?.name || 'Team member'
  const initials = name
    .split(' ')
    .map((s: string) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const roleLabel =
    user?.role === 'admin'
      ? 'Workspace admin'
      : user?.role === 'inventory_manager'
        ? 'Inventory manager'
        : user?.role === 'approver'
          ? 'Approver'
          : user?.role === 'warehouse_staff'
            ? 'Warehouse staff'
            : 'Member'

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }

  const pageTitle = getPageTitle(pathname)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!search.trim()) return
    router.push(`/dashboard/inventory?search=${encodeURIComponent(search.trim())}`)
    setMobileNav(false)
  }

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  return (
    <div className="app-frame">
      <aside className={`app-sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <Link href="/" className="app-brand">
          <span className="brand-mark">
            <Boxes size={19} />
          </span>
          <span>
            ricoz<span className="brand-light"> inventory</span>
          </span>
          <button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu">
            <X size={17} />
          </button>
        </Link>

        <button
          className="workspace-switch"
          onClick={() => notify('You belong to one workspace for now.')}
        >
          <span className="workspace-logo">{initials || 'R'}</span>
          <span className="workspace-text">
            <b>{user?.organizationSlug ? user.organizationSlug : 'Ricoz'} workspace</b>
            <small>Organization</small>
          </span>
          <ChevronDown size={15} />
        </button>

        <nav className="side-nav">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map((item) => {
                const active =
                  item.href === '/dashboard'
                    ? pathname === '/dashboard'
                    : pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link
                    href={item.href}
                    key={item.href}
                    className={`side-link ${active ? 'active' : ''}`}
                    onClick={() => setMobileNav(false)}
                  >
                    <item.icon size={17} />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-spark">
              <Sparkles size={16} />
            </span>
            <b>Need a hand?</b>
            <p>Get help setting up your inventory workflow.</p>
            <button onClick={() => notify('Help center: reach out to your workspace admin.')}>
              Visit help center <ArrowRight size={13} />
            </button>
          </div>
          <button className="profile-row" onClick={() => router.push('/dashboard/settings')}>
            <span className="profile-avatar">{initials || 'U'}</span>
            <span className="profile-meta">
              <b>{name}</b>
              <small>{roleLabel}</small>
            </span>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <button
            className="mobile-menu"
            onClick={() => setMobileNav(!mobileNav)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <span>{user?.organizationSlug ? user.organizationSlug : 'Ricoz'} workspace</span>
            <ChevronRight size={14} />
            <b>{pageTitle}</b>
          </div>
          <div className="topbar-actions">
            <form className="global-search" onSubmit={handleSearch}>
              <Search size={16} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search inventory..."
                aria-label="Search inventory"
              />
              <kbd>⌘ K</kbd>
            </form>
            <button
              className="icon-button"
              aria-label="Toggle theme"
              onClick={toggleTheme}
            >
              <Sun size={18} className="dark:hidden" />
              <Moon size={18} className="hidden dark:block" />
            </button>
            <button
              className="icon-button"
              aria-label="Help"
              onClick={() => notify('Help center: reach out to your workspace admin.')}
            >
              <CircleHelp size={18} />
            </button>
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
              onClick={() => notify('You are all caught up.')}
            >
              <Bell size={18} />
              <i />
            </button>
            <span className="topbar-divider" />
            <div className="topbar-user-wrap" style={{ position: 'relative' }}>
              <button className="topbar-user" onClick={() => setUserMenu((v) => !v)}>
                <span className="profile-avatar small-avatar">{initials || 'U'}</span>
                <ChevronDown size={14} />
              </button>
              {userMenu && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                    onClick={() => setUserMenu(false)}
                  />
                  <div
                    className="panel"
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 'calc(100% + 8px)',
                      zIndex: 50,
                      width: 210,
                      padding: 6,
                    }}
                  >
                    <div style={{ padding: '9px 10px', borderBottom: '1px solid var(--line)' }}>
                      <b style={{ fontSize: 12, display: 'block' }}>{name}</b>
                      <small style={{ fontSize: 10, color: 'var(--muted)' }}>{user?.email}</small>
                    </div>
                    <button
                      className="side-link"
                      style={{ width: '100%', marginTop: 4 }}
                      onClick={() => {
                        setUserMenu(false)
                        router.push('/dashboard/settings')
                      }}
                    >
                      <Settings size={16} />
                      <span>Settings</span>
                    </button>
                    <button
                      className="side-link"
                      style={{ width: '100%', color: '#d5556a' }}
                      onClick={() => signOut({ callbackUrl: '/' })}
                    >
                      <LogOut size={16} />
                      <span>Sign out</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="app-content">{children}</main>

        <footer className="app-footer">
          <span>© 2026 Ricoz Inventory</span>
          <span>
            <i /> All changes are saved to your workspace
          </span>
          <Link href="/">
            Public site <ArrowRight size={12} />
          </Link>
        </footer>
      </div>

      {mobileNav && (
        <button
          className="mobile-scrim"
          onClick={() => setMobileNav(false)}
          aria-label="Close navigation"
        />
      )}
      {toast && (
        <div className="toast">
          <ShieldCheck size={17} />
          {toast}
          <button onClick={() => setToast('')} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
