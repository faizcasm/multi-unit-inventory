'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Archive,
  ArrowLeftRight,
  ArrowLeftRight as Swap,
  Bell,
  Boxes,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock,
  Download,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
  LucideIcon,
  MapPin,
  MessageSquare,
  Package,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
  UserPlus,
  Users,
  Warehouse,
} from 'lucide-react'

/**
 * Server Components cannot pass component references (functions) into Client
 * Components — RSC serialization rejects them. Server pages therefore pass
 * serializable icon *names*, resolved here against this registry.
 */
const ICONS: Record<string, LucideIcon> = {
  'alert-triangle': AlertTriangle,
  archive: Archive,
  'arrow-left-right': ArrowLeftRight,
  bell: Bell,
  boxes: Boxes,
  building: Building2,
  check: CheckCircle2,
  chevron: ChevronRight,
  'circle-alert': CircleAlert,
  clock: Clock,
  download: Download,
  file: FileText,
  gauge: Gauge,
  history: History,
  dashboard: LayoutDashboard,
  location: MapPin,
  message: MessageSquare,
  package: Package,
  'package-search': PackageSearch,
  plus: Plus,
  refresh: RefreshCw,
  search: Search,
  settings: Settings2,
  shield: ShieldCheck,
  cart: ShoppingCart,
  store: Store,
  swap: Swap,
  truck: Truck,
  'user-plus': UserPlus,
  users: Users,
  warehouse: Warehouse,
}

/** Accepts either a component (client pages) or a registry name (server pages). */
type IconProp = LucideIcon | keyof typeof ICONS

function resolveIcon(icon: IconProp): LucideIcon {
  if (typeof icon === 'string') return ICONS[icon] || Package
  return icon
}

export function PageHeading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string
  title: string
  subtitle: string
  action?: React.ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  )
}

export function Metric({
  label,
  value,
  delta,
  icon,
  tone = 'purple',
  detail,
}: {
  label: string
  value: string | number
  delta?: string
  icon: IconProp
  tone?: 'purple' | 'mint' | 'blue' | 'orange'
  detail?: string
}) {
  const Icon = resolveIcon(icon)
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon ${tone}`}>
          <Icon size={17} />
        </span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-bottom">
        {delta && (
          <span className="metric-delta">
            ↗ {delta}
          </span>
        )}
        <span>{detail || 'vs. previous period'}</span>
      </div>
    </div>
  )
}

/** Maps backend status codes (DRAFT, PENDING_APPROVAL...) and labels to redesign status chips */
const STATUS_CLASS: Record<string, string> = {
  DRAFT: 'status-draft',
  PENDING_APPROVAL: 'status-pending-approval',
  APPROVED: 'status-approved',
  IN_TRANSIT: 'status-in-transit',
  DISPATCHED: 'status-dispatched',
  RECEIVED: 'status-received',
  COMPLETED: 'status-completed',
  REJECTED: 'status-rejected',
  CANCELLED: 'status-cancelled',
  'In transit': 'status-in-transit',
  'Pending approval': 'status-pending-approval',
  'In stock': 'status-in-stock',
  'Low stock': 'status-low-stock',
  'Out of stock': 'status-out-of-stock',
  Healthy: 'status-healthy',
  'Needs attention': 'status-needs-attention',
  Received: 'status-received',
  Dispatched: 'status-dispatched',
  Rejected: 'status-rejected',
}

export function Status({ value }: { value: string }) {
  const cls =
    STATUS_CLASS[value] || `status-${value.toLowerCase().replaceAll(' ', '-')}`
  const label = value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
  return (
    <span className={`status ${cls}`}>
      <i />
      {label}
    </span>
  )
}

export function AppButton({
  children,
  onClick,
  href,
  secondary = false,
  small = false,
  type = 'button',
  disabled = false,
}: {
  children: React.ReactNode
  onClick?: () => void
  href?: string
  secondary?: boolean
  small?: boolean
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  const cls = `button ${secondary ? 'button-secondary' : 'button-primary'} ${small ? 'button-small' : ''}`
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    )
  }
  return (
    <button className={cls} onClick={onClick} type={type} disabled={disabled}>
      {children}
    </button>
  )
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  if (!message) return null
  return (
    <div className="toast" role="status">
      {message}
      <button onClick={onClose} aria-label="Dismiss">
        ✕
      </button>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: IconProp
  title: string
  hint?: string
}) {
  const Icon = resolveIcon(icon)
  return (
    <div className="empty-state">
      <Icon size={24} />
      <b>{title}</b>
      {hint && <p>{hint}</p>}
    </div>
  )
}
