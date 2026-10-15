'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  AlertCircle,
  Boxes,
  ClipboardCheck,
  Copy,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  Warehouse,
  X,
} from 'lucide-react'
import { PageHeading, Metric, EmptyState, Toast } from '@/components/redesign/ui'
import { useCan } from '@/hooks/useCan'
import { apiFetch } from '@/lib/api'
import { getPermissionsForRole } from '@/lib/permissions/matrix'
import type { Permission } from '@/lib/permissions/matrix'
import type { UserRole } from '@/models/User'

interface Member {
  _id: string
  name: string
  email: string
  avatar?: string
  role: UserRole
  isActive: boolean
  lastLoginAt?: string | null
  joinedAt?: string
}

interface RoleOption {
  value: UserRole
  label: string
  description: string
}

interface UsersData {
  users: Member[]
  roles: RoleOption[]
  locations: { _id: string; name: string; code: string }[]
}

const ROLE_ICONS: Record<UserRole, typeof ShieldCheck> = {
  admin: ShieldCheck,
  inventory_manager: Boxes,
  approver: ClipboardCheck,
  warehouse_staff: Warehouse,
}

const VERBS: Record<string, string> = {
  read: 'View',
  create: 'Create',
  update: 'Manage',
  delete: 'Remove',
  submit: 'Submit',
  approve: 'Approve',
  reject: 'Reject',
  dispatch: 'Dispatch',
  receive: 'Receive',
  cancel: 'Cancel',
  adjust: 'Adjust',
  export: 'Export',
  deactivate: 'Deactivate',
}

const NOUNS: Record<string, string> = {
  organization: 'workspace settings',
  users: 'members',
  locations: 'locations',
  products: 'products',
  inventory: 'inventory',
  transfers: 'transfers',
  reports: 'reports',
  audit: 'the audit log',
  settings: 'settings',
}

const DOMAIN_ORDER = [
  'organization',
  'users',
  'locations',
  'products',
  'inventory',
  'transfers',
  'reports',
  'audit',
  'settings',
]

/** `transfers:approve` → "Approve transfers", `users:delete` → "Remove members". */
function humanizePermission(permission: string): string {
  const [domain, verb] = permission.split(':')
  return `${VERBS[verb] || verb} ${NOUNS[domain] || domain}`
}

/** Permissions grouped by their domain prefix (stable within a domain). */
function chipsForRole(role: UserRole): Permission[] {
  return [...getPermissionsForRole(role)].sort((a, b) => {
    const da = DOMAIN_ORDER.indexOf(a.split(':')[0])
    const db = DOMAIN_ORDER.indexOf(b.split(':')[0])
    return (da === -1 ? 99 : da) - (db === -1 ? 99 : db)
  })
}

function timeAgo(iso?: string | null): string {
  if (!iso) return 'Never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'Never'
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (secs < 60) return 'Just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

const initialsOf = (name?: string, email?: string) =>
  (name || email || '?')
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?'

const MAX_CHIPS = 6

export default function PeoplePage() {
  const { data: session, status } = useSession()
  const sessionUser = (session?.user as any) as
    | { id?: string; email?: string; role?: UserRole }
    | undefined

  const canRead = useCan('users:read')
  const canCreate = useCan('users:create')
  const canUpdate = useCan('users:update')
  const canDelete = useCan('users:delete')

  const [members, setMembers] = useState<Member[]>([])
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)

  // invite panel
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [inviteRole, setInviteRole] = useState<UserRole>('inventory_manager')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteCreating, setInviteCreating] = useState(false)

  // role change panel
  const [roleTarget, setRoleTarget] = useState<Member | null>(null)
  const [pendingRole, setPendingRole] = useState<UserRole>('warehouse_staff')

  // remove panel
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null)

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3500)
  }

  const fetchPeople = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<UsersData>('/api/users')
      if (!res.success) {
        setError(res.error || 'Failed to load people')
      } else {
        setMembers(res.data?.users || [])
        setRoles(res.data?.roles || [])
        setError('')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'authenticated' && canRead) fetchPeople()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, canRead])

  // Invite links are one-time, expiring tokens created on demand (POST /api/invites).
  const createInvite = async () => {
    setInviteCreating(true)
    try {
      const res = await apiFetch<{ url: string; expiresAt: string }>('/api/invites', {
        method: 'POST',
        body: JSON.stringify({
          role: inviteRole,
          ...(inviteEmail.trim() ? { email: inviteEmail.trim() } : {}),
        }),
      })
      if (!res.success || !res.data?.url) {
        notify(res.error || 'Could not create invite link')
        return
      }
      setInviteLink(res.data.url)
      notify('Invite created — copy it before closing this panel')
    } finally {
      setInviteCreating(false)
    }
  }

  const isSelf = (member: Member) =>
    (!!sessionUser?.id && member._id === sessionUser.id) ||
    (!!sessionUser?.email && member.email?.toLowerCase() === sessionUser.email.toLowerCase())

  const roleLabel = (value: UserRole) =>
    roles.find((r) => r.value === value)?.label || value.replaceAll('_', ' ')

  const openRoleChange = (member: Member) => {
    setPendingRole(member.role)
    setRoleTarget(member)
  }

  const copyInvite = async () => {
    if (!inviteLink) {
      notify('Generate an invite link first')
      return
    }
    try {
      await navigator.clipboard.writeText(inviteLink)
      notify('Invite link copied')
    } catch {
      notify('Could not copy automatically — select the link and copy it manually')
    }
  }

  const confirmRole = async () => {
    if (!roleTarget) return
    setBusy(true)
    try {
      const res = await apiFetch('/api/users', {
        method: 'PATCH',
        body: JSON.stringify({ userId: roleTarget._id, role: pendingRole }),
      })
      if (!res.success) {
        // Nothing was changed server-side — keep the old role shown.
        notify(res.error || 'Could not update role')
      } else {
        const name = roleTarget.name
        setMembers((prev) =>
          prev.map((m) => (m._id === roleTarget._id ? { ...m, role: pendingRole } : m))
        )
        setRoleTarget(null)
        notify(`${name} is now ${roleLabel(pendingRole)}`)
      }
    } catch {
      notify('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const confirmRemove = async () => {
    if (!removeTarget) return
    setBusy(true)
    try {
      const res = await apiFetch(`/api/users?userId=${removeTarget._id}`, { method: 'DELETE' })
      if (!res.success) {
        notify(res.error || 'Could not remove member')
      } else {
        const name = removeTarget.name
        setMembers((prev) => prev.filter((m) => m._id !== removeTarget._id))
        setRemoveTarget(null)
        notify(`${name} was removed from the workspace`)
      }
    } catch {
      notify('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') {
    return <div className="empty-state">Loading people…</div>
  }

  if (!canRead) {
    return (
      <section className="panel" style={{ padding: 24 }}>
        <div className="empty-state">
          <ShieldAlert size={24} />
          <b>You don&apos;t have permission to view people</b>
          <p>Ask an organization administrator to grant you users:read access.</p>
        </div>
      </section>
    )
  }

  const activeCount = members.filter((m) => m.isActive && m.lastLoginAt).length
  const invitedCount = members.filter((m) => !m.lastLoginAt).length

  return (
    <>
      <PageHeading
        eyebrow="WORKSPACE ACCESS"
        title="People"
        subtitle="Who can access your workspace, and what they can do."
        action={
          canCreate ? (
            <button className="button button-primary" onClick={() => setInviteOpen(true)}>
              <UserPlus size={16} /> Invite teammate
            </button>
          ) : undefined
        }
      />

      <div className="metric-grid compact-metrics">
        <Metric label="Team members" value={members.length} icon={Users} detail="in your workspace" />
        <Metric label="Active" value={activeCount} icon={UserCheck} tone="mint" detail="have signed in" />
        <Metric label="Invited" value={invitedCount} icon={UserPlus} tone="blue" detail="haven't signed in yet" />
        <Metric label="Roles" value={roles.length} icon={ShieldCheck} tone="orange" detail="access levels defined" />
      </div>

      {roles.length > 0 && (
      <section className="panel table-panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading" style={{ padding: '19px 20px 15px' }}>
          <div>
            <h2>Roles &amp; access</h2>
            <p>What each role can do in this workspace</p>
          </div>
        </div>
        <div className="approval-grid" style={{ padding: '0 20px 20px' }}>
          {roles.map((role) => {
            const Icon = ROLE_ICONS[role.value] || ShieldCheck
            const chips = chipsForRole(role.value)
            const visible = chips.slice(0, MAX_CHIPS)
            const hidden = chips.slice(MAX_CHIPS)
            const holders = members.filter((m) => m.role === role.value).length
            return (
              <article className="panel approval-card" key={role.value}>
                <div className="approval-card-top">
                  <span className="approval-card-icon">
                    <Icon size={16} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <b style={{ display: 'block' }}>{role.label}</b>
                    <span className="status" style={{ marginTop: 6 }}>
                      {holders} {holders === 1 ? 'member' : 'members'}
                    </span>
                  </div>
                </div>
                <p style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.6, margin: '12px 0 0' }}>
                  {role.description}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 13 }}>
                  {visible.map((p) => (
                    <span className="status" key={p}>
                      {humanizePermission(p)}
                    </span>
                  ))}
                  {hidden.length > 0 && (
                    <span className="status" title={hidden.map(humanizePermission).join(', ')}>
                      +{hidden.length} more
                    </span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>
      )}

      <section className="panel table-panel">
        <div className="panel-heading" style={{ padding: '19px 20px 15px' }}>
          <div>
            <h2>Members</h2>
            <p>Everyone with access to this workspace</p>
          </div>
          {sessionUser?.role && <span className="status">Your role: {roleLabel(sessionUser.role)}</span>}
        </div>

        {error && (
          <div className="data-disclaimer" style={{ padding: '0 20px' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <div className="table-scroll">
          {loading ? (
            <div className="empty-state">Loading people…</div>
          ) : members.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No members found"
              hint={canCreate ? 'Use “Invite teammate” to get your team on board.' : 'Ask an admin to invite your team.'}
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last active</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const self = isSelf(member)
                  return (
                    <tr key={member._id}>
                      <td>
                        <span className="person-cell">
                          <span className="person-dot">{initialsOf(member.name, member.email)}</span>
                          <span>
                            <b style={{ display: 'block', fontSize: 11 }}>
                              {member.name}
                              {self && <small style={{ fontWeight: 600 }}> (you)</small>}
                            </b>
                            <small style={{ fontSize: 10, color: 'var(--muted)' }}>{member.email}</small>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span className="status">{roleLabel(member.role)}</span>
                          {canUpdate && !self && (
                            <button className="subtle-link" onClick={() => openRoleChange(member)}>
                              Change
                            </button>
                          )}
                        </span>
                      </td>
                      <td>
                        {!member.isActive ? (
                          <span className="status status-rejected">
                            <i /> Disabled
                          </span>
                        ) : member.lastLoginAt ? (
                          <span className="status status-healthy">
                            <i /> Active
                          </span>
                        ) : (
                          <span className="status status-pending-approval">
                            <i /> Invited
                          </span>
                        )}
                      </td>
                      <td>{timeAgo(member.lastLoginAt)}</td>
                      <td>{member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : '—'}</td>
                      <td>
                        {canDelete && !self ? (
                          <button className="reject-button" onClick={() => setRemoveTarget(member)}>
                            Remove
                          </button>
                        ) : self ? (
                          <small style={{ fontSize: 9, color: 'var(--muted)' }}>You</small>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {!loading && !error && members.length > 0 && (
          <div className="table-footer">
            <span>
              Showing <b>{members.length}</b> {members.length === 1 ? 'member' : 'members'}
            </span>
            <span>Roles apply immediately</span>
          </div>
        )}
      </section>

      {error && !loading && members.length === 0 && (
        <div style={{ display: 'grid', placeItems: 'center', marginTop: 14 }}>
          <button className="button button-secondary button-small" onClick={fetchPeople}>
            Retry
          </button>
        </div>
      )}

      {inviteOpen && (
        <div className="modal-backdrop" onClick={() => setInviteOpen(false)}>
          <div className="create-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(480px, 100%)' }}>
            <div className="modal-heading">
              <div>
                <div className="modal-kicker">INVITE TEAMMATE</div>
                <h2 style={{ fontFamily: 'Manrope', fontSize: 17, margin: '6px 0 0' }}>
                  Share your invite link
                </h2>
              </div>
              <button className="icon-button" onClick={() => setInviteOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            {!inviteLink ? (
              <>
                <label className="settings-field" style={{ maxWidth: 'none' }}>
                  Role for the new member
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as UserRole)}
                  >
                    {roles.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <small>You can change their role any time from the members table.</small>
                </label>

                <label className="settings-field" style={{ maxWidth: 'none' }}>
                  Email <span className="optional">(optional)</span>
                  <input
                    type="email"
                    placeholder="Lock this invite to one email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    maxLength={255}
                  />
                  <small>Set an email to make sure only that person can use the link.</small>
                </label>

                <div className="data-disclaimer" style={{ margin: 0 }}>
                  <UserPlus size={14} /> The link is single-use, expires in 7 days, and lets the invitee join this
                  workspace directly — no new workspace is created.
                </div>

                <div className="modal-actions" style={{ marginTop: 18 }}>
                  <button className="button button-secondary" onClick={() => setInviteOpen(false)}>
                    Cancel
                  </button>
                  <button
                    className="button button-primary"
                    onClick={createInvite}
                    disabled={inviteCreating}
                  >
                    {inviteCreating ? 'Generating…' : 'Generate invite link'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="settings-field" style={{ maxWidth: 'none' }}>
                  Invite link
                  <div className="readonly-field">
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 10,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {inviteLink}
                    </span>
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={copyInvite}
                      style={{ minHeight: 30, fontSize: 10 }}
                    >
                      <Copy size={13} /> Copy
                    </button>
                  </div>
                  <small>Single-use · expires in 7 days · shown only once.</small>
                </label>

                <div className="data-disclaimer" style={{ margin: 0 }}>
                  <UserPlus size={14} /> The invitee signs up with this link (use an email that isn&apos;t registered
                  yet) and lands in this workspace with the chosen role.
                </div>

                <div className="modal-actions" style={{ marginTop: 18 }}>
                  <button
                    className="button button-secondary"
                    onClick={() => {
                      setInviteLink('')
                      setInviteEmail('')
                    }}
                  >
                    Create another
                  </button>
                  <button className="button button-primary" onClick={copyInvite}>
                    <Copy size={14} /> Copy invite link
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {roleTarget && (
        <div className="modal-backdrop" onClick={() => !busy && setRoleTarget(null)}>
          <div className="create-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(480px, 100%)' }}>
            <div className="modal-heading">
              <div>
                <div className="modal-kicker">CHANGE ROLE</div>
                <h2 style={{ fontFamily: 'Manrope', fontSize: 17, margin: '6px 0 0' }}>
                  Update access for {roleTarget.name}?
                </h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setRoleTarget(null)}
                aria-label="Close"
                disabled={busy}
              >
                <X size={16} />
              </button>
            </div>

            <label className="settings-field" style={{ maxWidth: 'none' }}>
              Role
              <div className="field-wrap" style={{ height: 'auto', padding: '10px 12px' }}>
                <select
                  value={pendingRole}
                  onChange={(e) => setPendingRole(e.target.value as UserRole)}
                  style={{
                    border: 0,
                    outline: 0,
                    width: '100%',
                    background: 'transparent',
                    color: 'var(--ink)',
                  }}
                >
                  {roles.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <small>{roles.find((r) => r.value === pendingRole)?.description}</small>
            </label>

            <div className="data-disclaimer" style={{ margin: 0 }}>
              <ShieldCheck size={14} /> Their permissions change right away. Role changes are recorded in your audit
              history.
            </div>

            <div className="modal-actions" style={{ marginTop: 18 }}>
              <button className="button button-secondary" onClick={() => setRoleTarget(null)} disabled={busy}>
                Cancel
              </button>
              <button
                className="button button-primary"
                onClick={confirmRole}
                disabled={busy || pendingRole === roleTarget.role}
              >
                {busy ? 'Saving…' : 'Save role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {removeTarget && (
        <div className="modal-backdrop" onClick={() => !busy && setRemoveTarget(null)}>
          <div className="create-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(480px, 100%)' }}>
            <div className="modal-heading">
              <div>
                <div className="modal-kicker">REMOVE MEMBER</div>
                <h2 style={{ fontFamily: 'Manrope', fontSize: 17, margin: '6px 0 0' }}>
                  Remove {removeTarget.name} from this workspace?
                </h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setRemoveTarget(null)}
                aria-label="Close"
                disabled={busy}
              >
                <X size={16} />
              </button>
            </div>

            <div className="data-disclaimer" style={{ margin: 0 }}>
              <AlertCircle size={14} /> They lose access immediately. Their history stays in your audit trail, and you
              can invite them back later.
            </div>

            <div className="modal-actions" style={{ marginTop: 18 }}>
              <button className="button button-secondary" onClick={() => setRemoveTarget(null)} disabled={busy}>
                Back
              </button>
              <button className="button button-primary" onClick={confirmRemove} disabled={busy}>
                {busy ? 'Removing…' : 'Remove member'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </>
  )
}
export const dynamic = 'force-dynamic'
