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
  ClipboardCheck,
  ClipboardList,
  FileUp,
  Handshake,
  LayoutDashboard,
  LifeBuoy,
  LineChart,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Package,
  PackagePlus,
  Plug,
  Plus,
  QrCode,
  ScrollText,
  Search,
  Settings,
  Sparkles,
  Sun,
  Tags,
  Truck,
  Users,
  Warehouse,
  X,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { apiFetch } from '@/lib/api'
import { hasPermission } from '@/lib/permissions/matrix'
import type { Permission } from '@/lib/permissions/matrix'
import type { UserRole } from '@/models/User'
import { ShortcutProvider } from '@/components/shortcuts'

type NavItem = { href: string; label: string; icon: React.ElementType; permission?: Permission }

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
    items: [
      { href: '/dashboard/locations', label: 'Locations', icon: Warehouse },
      { href: '/dashboard/suppliers', label: 'Suppliers', icon: Handshake, permission: 'suppliers:read' },
      { href: '/dashboard/purchase-orders', label: 'Purchase orders', icon: ClipboardList, permission: 'purchase_orders:read' },
      { href: '/dashboard/stocktakes', label: 'Stocktakes', icon: ClipboardCheck, permission: 'stocktakes:read' },
      { href: '/dashboard/replenishment', label: 'Replenishment', icon: PackagePlus },
      { href: '/dashboard/users', label: 'People', icon: Users, permission: 'users:read' },
    ],
  },
  {
    label: 'INSIGHTS & CONTROL',
    items: [
      { href: '/dashboard/reports', label: 'Reports', icon: Activity },
      { href: '/dashboard/analytics', label: 'Analytics', icon: LineChart, permission: 'reports:read' },
      { href: '/dashboard/activity', label: 'Activity', icon: ScrollText, permission: 'audit:read' },
      { href: '/dashboard/integrations', label: 'Integrations', icon: Plug, permission: 'integrations:read' },
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
  '/dashboard/suppliers': 'Suppliers',
  '/dashboard/purchase-orders': 'Purchase orders',
  '/dashboard/stocktakes': 'Stocktakes',
  '/dashboard/replenishment': 'Replenishment',
  '/dashboard/users': 'People',
  '/dashboard/reports': 'Reports',
  '/dashboard/analytics': 'Analytics',
  '/dashboard/activity': 'Activity',
  '/dashboard/integrations': 'Integrations',
  '/dashboard/notifications': 'Notifications',
  '/dashboard/search': 'Search',
  '/dashboard/settings': 'Settings',
}

function getPageTitle(pathname: string): string {
  if (titleMap[pathname]) return titleMap[pathname]
  const base = '/' + pathname.split('/').slice(1, 3).join('/')
  return titleMap[base] || 'Overview'
}

/* ------------------------------------------------------------------ */
/* Notifications (the real per-user notification center)                */
/* ------------------------------------------------------------------ */

type NotificationRow = {
  _id: string
  event: string
  title: string
  body?: string | null
  link?: string | null
  readAt?: string | null
  createdAt: string
  actorUser?: { name?: string } | null
}

function timeAgo(date: string | Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/* ------------------------------------------------------------------ */
/* Command palette (⌘K)                                                */
/* ------------------------------------------------------------------ */

type PResult = { id: string; label: string; sub?: string; icon: React.ElementType; href: string }
type PEntry = PResult & { permission?: Permission; keys?: string }

const STATIC_ENTRIES: PEntry[] = [
  { id: 'overview', label: 'Overview', sub: 'Dashboard home', icon: LayoutDashboard, href: '/dashboard' },
  { id: 'inventory', label: 'Inventory', sub: 'Stock across locations', icon: Package, href: '/dashboard/inventory', keys: 'stock levels availability' },
  { id: 'products', label: 'Products', sub: 'Catalog & SKUs', icon: Boxes, href: '/dashboard/products', keys: 'sku items catalog' },
  { id: 'transfers', label: 'Transfers', sub: 'Movements & requests', icon: Truck, href: '/dashboard/transfers', keys: 'shipments requests orders' },
  { id: 'locations', label: 'Locations', sub: 'Warehouses & stores', icon: Warehouse, href: '/dashboard/locations', keys: 'sites warehouses stores' },
  { id: 'reports', label: 'Reports', sub: 'Insights & CSV exports', icon: BarChart3, href: '/dashboard/reports', keys: 'export analytics download' },
  { id: 'settings', label: 'Settings', sub: 'Workspace preferences', icon: Settings, href: '/dashboard/settings', keys: 'theme security notifications' },
  { id: 'people', label: 'People', sub: 'Members & roles', icon: Users, href: '/dashboard/users', permission: 'users:read', keys: 'team members roles invite' },
  { id: 'activity', label: 'Activity', sub: 'Audit log of every action', icon: ScrollText, href: '/dashboard/activity', permission: 'audit:read', keys: 'audit history events log' },
  { id: 'search', label: 'Search everything', sub: 'Full workspace search', icon: Search, href: '/dashboard/search', keys: 'find lookup global query' },
  { id: 'suppliers', label: 'Suppliers', sub: 'Vendors & lead times', icon: Handshake, href: '/dashboard/suppliers', permission: 'suppliers:read', keys: 'vendor supplier lead time' },
  { id: 'purchase-orders', label: 'Purchase orders', sub: 'Buying & receiving', icon: ClipboardList, href: '/dashboard/purchase-orders', permission: 'purchase_orders:read', keys: 'po receiving order buy' },
  { id: 'stocktakes', label: 'Stocktakes', sub: 'Cycle counts', icon: ClipboardCheck, href: '/dashboard/stocktakes', permission: 'stocktakes:read', keys: 'count audit sheet' },
  { id: 'replenishment', label: 'Replenishment', sub: 'Restock suggestions', icon: PackagePlus, href: '/dashboard/replenishment', keys: 'reorder restock low stock' },
  { id: 'analytics', label: 'Analytics', sub: 'Throughput & cycle time', icon: LineChart, href: '/dashboard/analytics', permission: 'reports:read', keys: 'metrics charts throughput' },
  { id: 'integrations', label: 'Integrations', sub: 'API keys & webhooks', icon: Plug, href: '/dashboard/integrations', permission: 'integrations:read', keys: 'api webhook tokens' },
  { id: 'scan', label: 'Scan barcode', sub: 'Look up a product by code', icon: QrCode, href: '/dashboard/scan', keys: 'barcode scanner camera lookup' },
  { id: 'labels', label: 'Print labels', sub: 'Barcode & QR labels', icon: Tags, href: '/dashboard/labels', permission: 'products:read', keys: 'print label sticker' },
  { id: 'import', label: 'Import CSV', sub: 'Bulk import products & locations', icon: FileUp, href: '/dashboard/products/import', permission: 'products:create', keys: 'csv upload bulk data' },
  { id: 'new-transfer', label: 'New transfer', sub: 'Move stock between locations', icon: Truck, href: '/dashboard/transfers/new', permission: 'transfers:create', keys: 'create ship send move' },
  { id: 'new-product', label: 'New product', sub: 'Add to your catalog', icon: Plus, href: '/dashboard/products/new', permission: 'products:create', keys: 'create add item' },
  { id: 'adjust-stock', label: 'Adjust stock', sub: 'Record an inventory correction', icon: Package, href: '/dashboard/inventory/adjust', permission: 'inventory:adjust', keys: 'count correction write off' },
  { id: 'invite', label: 'Invite teammate', sub: 'Share your registration link', icon: Users, href: '/dashboard/users', permission: 'users:create', keys: 'add member email person' },
  { id: 'new-po', label: 'New purchase order', sub: 'Order stock from a supplier', icon: ClipboardList, href: '/dashboard/purchase-orders/new', permission: 'purchase_orders:create', keys: 'create buy po order' },
  { id: 'new-stocktake', label: 'New count sheet', sub: 'Start a cycle count', icon: ClipboardCheck, href: '/dashboard/stocktakes/new', permission: 'stocktakes:create', keys: 'create count sheet' },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  const { theme, setTheme } = useTheme()
  const [mobileNav, setMobileNav] = React.useState(false)
  const [userMenu, setUserMenu] = React.useState(false)
  const [workspaceMenu, setWorkspaceMenu] = React.useState(false)

  // Command palette
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [paletteQuery, setPaletteQuery] = React.useState('')
  const [remote, setRemote] = React.useState<PResult[]>([])
  const [searching, setSearching] = React.useState(false)
  const [activeIdx, setActiveIdx] = React.useState(0)

  // Help center
  const [helpOpen, setHelpOpen] = React.useState(false)

  // Notifications
  const [notifOpen, setNotifOpen] = React.useState(false)
  const [notifItems, setNotifItems] = React.useState<NotificationRow[]>([])
  const [notifLoading, setNotifLoading] = React.useState(false)
  const [notifError, setNotifError] = React.useState('')
  const [unread, setUnread] = React.useState(0)

  const user = session?.user as any
  const role: UserRole | undefined = user?.role
  const can = (p: Permission) => (role ? hasPermission(role, p) : false)

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
  const orgLabel = user?.organizationSlug ? `${user.organizationSlug} workspace` : 'Ricoz workspace'

  const pageTitle = getPageTitle(pathname)

  /* ---------------- keyboard shortcuts ---------------- */

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        setPaletteQuery('')
      }
      if (e.key === 'Escape') {
        setPaletteOpen(false)
        setHelpOpen(false)
        setNotifOpen(false)
        setUserMenu(false)
        setWorkspaceMenu(false)
      }
    }
    window.addEventListener('keydown', onKey)
    // The ShortcutProvider dispatches this when "/" is pressed.
    const onPaletteEvent = () => {
      setPaletteQuery('')
      setActiveIdx(0)
      setPaletteOpen(true)
      setHelpOpen(false)
    }
    window.addEventListener('ricoz:open-palette', onPaletteEvent)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('ricoz:open-palette', onPaletteEvent)
    }
  }, [])

  // Close overlays whenever the route changes.
  React.useEffect(() => {
    setPaletteOpen(false)
    setPaletteQuery('')
    setRemote([])
    setNotifOpen(false)
    setUserMenu(false)
    setWorkspaceMenu(false)
    setMobileNav(false)
  }, [pathname])

  /* ---------------- notifications ---------------- */

  const loadNotifications = React.useCallback(async (markRead: boolean) => {
    setNotifLoading(true)
    setNotifError('')
    const res = await apiFetch<NotificationRow[]>('/api/notifications?limit=8')
    setNotifLoading(false)
    if (!res.success) {
      setNotifError(res.error || 'Could not load notifications')
      return
    }
    setNotifItems(res.data ?? [])
    if (markRead) {
      // Opening the bell marks everything read (server-side, per user).
      await apiFetch('/api/notifications', { method: 'PATCH', body: { read: true, all: true } })
      setUnread(0)
    } else {
      setUnread(typeof res.unreadCount === 'number' ? res.unreadCount : 0)
    }
  }, [])

  // Seed the unread badge once the session is known.
  React.useEffect(() => {
    if (!session?.user) return
    loadNotifications(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, loadNotifications])

  const toggleNotifications = () => {
    const next = !notifOpen
    setNotifOpen(next)
    if (next) loadNotifications(true)
  }

  /* ---------------- command palette ---------------- */

  const openPalette = () => {
    setPaletteQuery('')
    setActiveIdx(0)
    setPaletteOpen(true)
    setHelpOpen(false)
  }

  const go = (item: PResult) => {
    setPaletteOpen(false)
    setPaletteQuery('')
    setRemote([])
    router.push(item.href)
  }

  // Debounced remote search across products, stock and locations.
  React.useEffect(() => {
    if (!paletteOpen) return
    const q = paletteQuery.trim()
    if (q.length < 2) {
      setRemote([])
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = window.setTimeout(async () => {
      const [prodRes, invRes, locRes] = await Promise.all([
        apiFetch<any[]>(`/api/products?search=${encodeURIComponent(q)}&limit=4`),
        apiFetch<any[]>(`/api/inventory?search=${encodeURIComponent(q)}&limit=4`),
        apiFetch<any[]>(`/api/locations?search=${encodeURIComponent(q)}&limit=4`),
      ])
      const products: PResult[] = (prodRes.success ? prodRes.data ?? [] : []).map((p: any) => ({
        id: `prod-${p._id}`,
        label: p.name || 'Product',
        sub: `Product · ${p.sku || 'no SKU'}`,
        icon: Boxes,
        href: `/dashboard/products/${p._id}`,
      }))
      const seen = new Set(products.map((p) => p.id))
      const stock: PResult[] = (invRes.success ? invRes.data ?? [] : [])
        .filter((row: any) => row.product?._id && !seen.has(`prod-${row.product._id}`))
        .map((row: any) => ({
          id: `prod-${row.product._id}`,
          label: row.product.name || 'Product',
          sub: `${row.availableQuantity ?? 0} available at ${row.location?.name ?? 'a location'}`,
          icon: Package,
          href: `/dashboard/products/${row.product._id}`,
        }))
      const locations: PResult[] = (locRes.success ? locRes.data ?? [] : []).map((l: any) => ({
        id: `loc-${l._id}`,
        label: l.name || 'Location',
        sub: `Location${l.code ? ` · ${l.code}` : ''}`,
        icon: Warehouse,
        href: `/dashboard/locations/${l._id}`,
      }))
      setRemote([...products, ...stock, ...locations].slice(0, 8))
      setSearching(false)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [paletteOpen, paletteQuery])

  React.useEffect(() => {
    setActiveIdx(0)
  }, [paletteQuery, remote])

  const query = paletteQuery.trim().toLowerCase()
  const visibleStatic = STATIC_ENTRIES.filter(
    (entry) =>
      (!entry.permission || can(entry.permission)) &&
      (!query || `${entry.label} ${entry.sub ?? ''} ${entry.keys ?? ''}`.toLowerCase().includes(query))
  )
  const sections: { title: string; items: PResult[] }[] = []
  if (query) {
    sections.push({
      title: 'SEARCH ALL',
      items: [
        {
          id: 'search-all',
          label: `Search all for “${paletteQuery.trim()}”`,
          sub: 'Products, locations, transfers & people',
          icon: Search,
          href: `/dashboard/search?q=${encodeURIComponent(paletteQuery.trim())}`,
        },
      ],
    })
  }
  if (visibleStatic.length) {
    sections.push({ title: query ? 'PAGES & ACTIONS' : 'JUMP TO', items: visibleStatic })
  }
  if (remote.length) sections.push({ title: 'MATCHES', items: remote })
  const flat: PResult[] = sections.flatMap((s) => s.items)

  const onPaletteKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => (flat.length ? (i + 1) % flat.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flat[activeIdx]
      if (item) go(item)
    }
  }

  /* ---------------- render ---------------- */

  let sectionOffset = 0
  const renderedSections = sections.map((section) => {
    const start = sectionOffset
    sectionOffset += section.items.length
    return { ...section, start }
  })

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

        <div style={{ position: 'relative' }}>
          <button className="workspace-switch" onClick={() => setWorkspaceMenu((v) => !v)}>
            <span className="workspace-logo">{initials || 'R'}</span>
            <span className="workspace-text">
              <b>{orgLabel}</b>
              <small>{roleLabel}</small>
            </span>
            <ChevronDown size={15} />
          </button>
          {workspaceMenu && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                onClick={() => setWorkspaceMenu(false)}
              />
              <div
                className="panel"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 'calc(100% + 6px)',
                  zIndex: 50,
                  padding: 6,
                }}
              >
                <div style={{ padding: '9px 10px', borderBottom: '1px solid var(--line)' }}>
                  <b style={{ fontSize: 11.5, display: 'block' }}>{orgLabel}</b>
                  <small style={{ fontSize: 9.5, color: 'var(--muted)' }}>
                    {roleLabel}
                    {user?.email ? ` · ${user.email}` : ''}
                  </small>
                </div>
                <Link
                  href="/dashboard/settings"
                  className="side-link"
                  style={{ width: '100%', marginTop: 4 }}
                  onClick={() => setWorkspaceMenu(false)}
                >
                  <Settings size={15} />
                  <span>Workspace settings</span>
                </Link>
                {can('users:read') && (
                  <Link
                    href="/dashboard/users"
                    className="side-link"
                    style={{ width: '100%' }}
                    onClick={() => setWorkspaceMenu(false)}
                  >
                    <Users size={15} />
                    <span>People &amp; roles</span>
                  </Link>
                )}
                <button
                  className="side-link"
                  style={{ width: '100%', color: '#d5556a' }}
                  onClick={() => signOut({ callbackUrl: '/' })}
                >
                  <LogOut size={15} />
                  <span>Sign out</span>
                </button>
              </div>
            </>
          )}
        </div>

        <nav className="side-nav">
          {navGroups.map((group) => {
            const items = group.items.filter((item) => !item.permission || can(item.permission))
            if (!items.length) return null
            return (
              <div className="nav-group" key={group.label}>
                <div className="nav-group-label">{group.label}</div>
                {items.map((item) => {
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
            )
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-spark">
              <Sparkles size={16} />
            </span>
            <b>Need a hand?</b>
            <p>Shortcuts, workflow tips and quick links.</p>
            <button onClick={() => setHelpOpen(true)}>
              Open help center <ArrowRight size={13} />
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
            <span>{orgLabel}</span>
            <ChevronRight size={14} />
            <b>{pageTitle}</b>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="global-search"
              onClick={openPalette}
              aria-label="Search (Command K)"
              style={{ cursor: 'pointer', font: 'inherit', fontSize: 10 }}
            >
              <Search size={16} />
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 10, color: '#aaa5b5' }}>
                Search products, stock, pages…
              </span>
              <kbd>⌘ K</kbd>
            </button>
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
              onClick={() => setHelpOpen(true)}
            >
              <CircleHelp size={18} />
            </button>
              <div style={{ position: 'relative' }}>
                <button
                  className="icon-button notification-button"
                  aria-label="Notifications"
                  onClick={toggleNotifications}
                >
                  <Bell size={18} />
                  {unread > 0 && <i />}
                </button>
                {notifOpen && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                      onClick={() => setNotifOpen(false)}
                    />
                    <div
                      className="panel"
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 'calc(100% + 8px)',
                        zIndex: 50,
                        width: 320,
                        padding: 0,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '11px 13px',
                          borderBottom: '1px solid var(--line)',
                        }}
                      >
                        <b style={{ fontSize: 12 }}>Notifications</b>
                        <Link
                          href="/dashboard/notifications"
                          onClick={() => setNotifOpen(false)}
                          style={{ fontSize: 10, fontWeight: 700, color: '#7c63e3' }}
                        >
                          View all
                        </Link>
                      </div>
                      <div style={{ maxHeight: 330, overflowY: 'auto' }}>
                        {notifLoading ? (
                          <div style={{ padding: '18px 14px', fontSize: 10.5, color: 'var(--muted)' }}>
                            Loading notifications…
                          </div>
                        ) : notifError ? (
                          <div style={{ padding: '16px 14px', display: 'grid', gap: 9 }}>
                            <span style={{ fontSize: 10.5, color: '#d5556a' }}>{notifError}</span>
                            <button
                              className="button"
                              style={{ justifySelf: 'start' }}
                              onClick={() => loadNotifications(false)}
                            >
                              Retry
                            </button>
                          </div>
                        ) : notifItems.length === 0 ? (
                          <div className="empty-state" style={{ minHeight: 120 }}>
                            <Sparkles size={18} />
                            You&apos;re all caught up.
                          </div>
                        ) : (
                          notifItems.map((n) => (
                            <button
                              key={n._id}
                              onClick={() => {
                                setNotifOpen(false)
                                apiFetch('/api/notifications', {
                                  method: 'PATCH',
                                  body: { read: true, ids: [n._id] },
                                }).catch(() => {})
                                router.push(n.link || '/dashboard/notifications')
                              }}
                              style={{
                                display: 'flex',
                                gap: 10,
                                width: '100%',
                                padding: '10px 13px',
                                textAlign: 'left',
                                alignItems: 'flex-start',
                                borderBottom: '1px solid var(--line)',
                                background: 'transparent',
                                opacity: n.readAt ? 0.62 : 1,
                              }}
                            >
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <b
                                  style={{
                                    fontSize: 11,
                                    display: 'block',
                                    color: 'inherit',
                                    fontWeight: 700,
                                  }}
                                >
                                  {n.title}
                                </b>
                                <small style={{ fontSize: 9.5, opacity: 0.65 }}>
                                  {n.actorUser?.name || 'System'} · {timeAgo(n.createdAt)}
                                </small>
                                {n.body && (
                                  <small style={{ fontSize: 9.5, opacity: 0.6, display: 'block', marginTop: 2 }}>
                                    {n.body}
                                  </small>
                                )}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                      <div
                        style={{
                          borderTop: '1px solid var(--line)',
                          padding: '9px 13px',
                          fontSize: 9.5,
                          opacity: 0.7,
                        }}
                      >
                        Activity is recorded for everyone in your workspace.
                      </div>
                    </div>
                  </>
                )}
              </div>
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
                      style={{ width: '100%' }}
                      onClick={() => {
                        setUserMenu(false)
                        setHelpOpen(true)
                      }}
                    >
                      <LifeBuoy size={16} />
                      <span>Help center</span>
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

      {/* Global keyboard shortcuts (g-chords, / to search, ? for help) */}
      <ShortcutProvider />

      {/* ---------------- Command palette ---------------- */}
      {paletteOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPaletteOpen(false)
          }}
        >
          <div
            className="create-modal"
            style={{ width: 'min(620px,100%)', padding: 0, overflow: 'hidden' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              className="table-search"
              style={{
                width: '100%',
                height: 52,
                border: 0,
                borderBottom: '1px solid var(--line)',
                borderRadius: 0,
                padding: '0 16px',
                gap: 11,
              }}
            >
              <Search size={16} />
              <input
                autoFocus
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                onKeyDown={onPaletteKey}
                placeholder="Search products, stock, locations or jump to a page…"
                aria-label="Global search"
                style={{ fontSize: 13, color: 'inherit' }}
              />
              <kbd
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 4,
                  padding: '2px 6px',
                  fontSize: 9,
                  whiteSpace: 'nowrap',
                }}
              >
                {searching ? '…' : 'Esc'}
              </kbd>
            </div>
            <div style={{ maxHeight: '52vh', overflowY: 'auto', padding: 8 }}>
              {renderedSections.map((section) => (
                <div key={section.title} style={{ marginBottom: 4 }}>
                  <div
                    style={{
                      padding: '7px 10px 5px',
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: 1.1,
                      color: '#aaa5b6',
                    }}
                  >
                    {section.title}
                  </div>
                  {section.items.map((item, i) => {
                    const idx = section.start + i
                    return (
                      <button
                        key={item.id}
                        className={`side-link ${activeIdx === idx ? 'active' : ''}`}
                        style={{ width: '100%' }}
                        onMouseEnter={() => setActiveIdx(idx)}
                        onClick={() => go(item)}
                      >
                        <item.icon size={15} />
                        <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                          <span style={{ display: 'block' }}>{item.label}</span>
                          {item.sub && (
                            <small
                              style={{
                                fontSize: 9,
                                fontWeight: 500,
                                color: activeIdx === idx ? '#8b76e0' : 'var(--muted)',
                              }}
                            >
                              {item.sub}
                            </small>
                          )}
                        </span>
                        <ArrowRight size={12} />
                      </button>
                    )
                  })}
                </div>
              ))}
              {flat.length === 0 && (
                <div className="empty-state" style={{ minHeight: 130 }}>
                  <Search size={18} />
                  {query ? `No matches for “${paletteQuery.trim()}”` : 'Start typing to search'}
                </div>
              )}
            </div>
            <div
              style={{
                borderTop: '1px solid var(--line)',
                padding: '9px 15px',
                display: 'flex',
                gap: 16,
                fontSize: 9.5,
                color: 'var(--muted)',
              }}
            >
              <span>
                <kbd style={{ border: '1px solid var(--line)', borderRadius: 4, padding: '1px 5px', fontSize: 9 }}>↑↓</kbd>{' '}
                navigate
              </span>
              <span>
                <kbd style={{ border: '1px solid var(--line)', borderRadius: 4, padding: '1px 5px', fontSize: 9 }}>↵</kbd>{' '}
                open
              </span>
              <span>
                <kbd style={{ border: '1px solid var(--line)', borderRadius: 4, padding: '1px 5px', fontSize: 9 }}>esc</kbd>{' '}
                close
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Help center ---------------- */}
      {helpOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setHelpOpen(false)
          }}
        >
          <div
            className="create-modal"
            style={{ width: 'min(600px,100%)' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="modal-kicker">HELP CENTER</span>
                <h2>How can we help?</h2>
                <p>Shortcuts, the transfer workflow and quick links for your workspace.</p>
              </div>
              <button
                className="icon-button"
                onClick={() => setHelpOpen(false)}
                aria-label="Close help"
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div className="panel" style={{ padding: 15 }}>
                <b style={{ fontSize: 11.5 }}>Keyboard shortcuts</b>
                <div style={{ display: 'grid', gap: 9, marginTop: 11 }}>
                  {[
                    ['⌘ K / Ctrl K', 'Open global search'],
                    ['↑ ↓', 'Move between results'],
                    ['Enter', 'Open the selected result'],
                    ['Esc', 'Close any open panel'],
                  ].map(([keys, desc]) => (
                    <div
                      key={keys}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                    >
                      <kbd
                        style={{
                          border: '1px solid var(--line)',
                          borderRadius: 5,
                          padding: '3px 7px',
                          fontSize: 9.5,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {keys}
                      </kbd>
                      <span style={{ fontSize: 10.5, color: 'var(--muted)', textAlign: 'right' }}>{desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel" style={{ padding: 15 }}>
                <b style={{ fontSize: 11.5 }}>The transfer workflow</b>
                <ol style={{ margin: '11px 0 0', paddingLeft: 18, display: 'grid', gap: 7, fontSize: 10.5, lineHeight: 1.6, color: 'var(--muted)' }}>
                  <li>Add products and adjust stock into a source location.</li>
                  <li>Create a transfer and submit it for approval.</li>
                  <li>An approver reviews quantities and approves or rejects.</li>
                  <li>Dispatch the shipment, then receive it at the destination.</li>
                  <li>Report any discrepancies during receiving.</li>
                  <li>Track everything in Reports and the Activity log.</li>
                </ol>
              </div>

              <div className="panel" style={{ padding: 15 }}>
                <b style={{ fontSize: 11.5 }}>Quick links</b>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 11 }}>
                  {[
                    { label: 'Reports', href: '/dashboard/reports', show: true },
                    { label: 'Activity log', href: '/dashboard/activity', show: can('audit:read') },
                    { label: 'People & roles', href: '/dashboard/users', show: can('users:read') },
                    { label: 'Public site', href: '/', show: true },
                  ]
                    .filter((l) => l.show)
                    .map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        className="button"
                        onClick={() => setHelpOpen(false)}
                        style={{ fontSize: 10.5 }}
                      >
                        {l.label}
                      </Link>
                    ))}
                </div>
              </div>

              <p className="modal-footnote">
                <LifeBuoy size={13} />
                Still stuck? Your workspace admin manages access, roles and integrations — reach out
                to them for changes beyond your permissions.
              </p>
            </div>

            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="button" onClick={() => setHelpOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
