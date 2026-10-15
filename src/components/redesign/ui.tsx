'use client'

import * as React from 'react'
import Link from 'next/link'
import { LucideIcon } from 'lucide-react'

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
  icon: Icon,
  tone = 'purple',
  detail,
}: {
  label: string
  value: string | number
  delta?: string
  icon: LucideIcon
  tone?: 'purple' | 'mint' | 'blue' | 'orange'
  detail?: string
}) {
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
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon
  title: string
  hint?: string
}) {
  return (
    <div className="empty-state">
      <Icon size={24} />
      <b>{title}</b>
      {hint && <p>{hint}</p>}
    </div>
  )
}
