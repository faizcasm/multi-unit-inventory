'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  Bell,
  Building2,
  ChevronRight,
  LockKeyhole,
  Monitor,
  Moon,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
} from 'lucide-react'
import { PageHeading, Toast } from '@/components/redesign/ui'

interface UserPreferences {
  theme: 'light' | 'dark' | 'system'
  notifications: { email: boolean; inApp: boolean }
  dashboardLayout: 'compact' | 'comfortable'
}

interface OrgSettings {
  timezone: string
  currency: string
  dateFormat: string
  separationOfDuties: boolean
  lowStockThreshold: number
}

type Tab = 'Workspace' | 'Preferences' | 'Notifications' | 'Security'

const TABS: { label: Tab; icon: React.ElementType }[] = [
  { label: 'Workspace', icon: Building2 },
  { label: 'Preferences', icon: SlidersHorizontal },
  { label: 'Notifications', icon: Bell },
  { label: 'Security', icon: LockKeyhole },
]

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="toggle-row">
      <div>
        <b>{label}</b>
        <p>{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        className={`toggle-switch ${value ? 'on' : ''}`}
        onClick={() => onChange(!value)}
      >
        <span />
      </button>
    </div>
  )
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [tab, setTab] = useState<Tab>('Workspace')
  const [prefs, setPrefs] = useState<UserPreferences>({
    theme: 'system',
    notifications: { email: true, inApp: true },
    dashboardLayout: 'comfortable',
  })
  const [orgSettings, setOrgSettings] = useState<OrgSettings>({
    timezone: 'UTC',
    currency: 'USD',
    dateFormat: 'YYYY-MM-DD',
    separationOfDuties: true,
    lowStockThreshold: 10,
  })
  const [orgName, setOrgName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3200)
  }

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/settings')
        const data = await response.json()
        if (response.ok) {
          if (data.data.user?.preferences) setPrefs(data.data.user.preferences)
          if (data.data.organization?.settings) setOrgSettings(data.data.organization.settings)
        }
        const orgResponse = await fetch('/api/organizations')
        const orgData = await orgResponse.json()
        if (orgResponse.ok && orgData.data) {
          setOrgName(orgData.data.name || '')
          setOrgSlug(orgData.data.slug || '')
        }
      } catch (err) {
        console.error('Failed to load settings:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPreferences: prefs,
          organizationSettings: orgSettings,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to save settings')

      if (orgName) {
        await fetch('/api/organizations', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: orgName }),
        })
      }

      notify('Settings saved successfully')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const tabCopy: Record<Tab, string> = {
    Workspace: 'Update the details used to identify your organization.',
    Preferences: 'Set the default display and regional preferences.',
    Notifications: 'Choose which workspace events you want to hear about.',
    Security: 'Review the security controls for your workspace.',
  }

  return (
    <>
      <PageHeading
        eyebrow="WORKSPACE PREFERENCES"
        title="Settings"
        subtitle="Manage workspace details, display preferences, and notification choices."
        action={
          <button className="button button-primary" onClick={handleSave} disabled={saving || loading}>
            <Save size={15} /> {saving ? 'Saving…' : 'Save changes'}
          </button>
        }
      />

      <div className="settings-layout">
        <nav className="panel settings-nav">
          {TABS.map(({ label, icon: Icon }) => (
            <button key={label} className={tab === label ? 'active' : ''} onClick={() => setTab(label)}>
              <Icon size={16} />
              {label}
              {tab === label && <ChevronRight size={15} />}
            </button>
          ))}
        </nav>

        <section className="panel settings-panel">
          <div className="settings-panel-heading">
            <div>
              <h2>{tab}</h2>
              <p>{tabCopy[tab]}</p>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">Loading settings…</div>
          ) : tab === 'Workspace' ? (
            <>
              <label className="settings-field">
                Workspace name
                <input value={orgName} onChange={(e) => setOrgName(e.target.value)} maxLength={100} />
                <small>The name displayed across your workspace.</small>
              </label>
              <label className="settings-field">
                Workspace ID
                <div className="readonly-field">
                  {orgSlug || '—'} <span>Locked</span>
                </div>
                <small>Workspace identifiers are assigned at creation and cannot change.</small>
              </label>
              <label className="settings-field">
                Default timezone
                <select
                  value={orgSettings.timezone}
                  onChange={(e) => setOrgSettings({ ...orgSettings, timezone: e.target.value })}
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York (ET)</option>
                  <option value="America/Chicago">America/Chicago (CT)</option>
                  <option value="America/Denver">America/Denver (MT)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="Europe/Paris">Europe/Paris</option>
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo</option>
                </select>
              </label>
              <label className="settings-field">
                Currency
                <select
                  value={orgSettings.currency}
                  onChange={(e) => setOrgSettings({ ...orgSettings, currency: e.target.value })}
                >
                  <option value="USD">US Dollar (USD)</option>
                  <option value="EUR">Euro (EUR)</option>
                  <option value="GBP">British Pound (GBP)</option>
                  <option value="JPY">Japanese Yen (JPY)</option>
                  <option value="CAD">Canadian Dollar (CAD)</option>
                  <option value="INR">Indian Rupee (INR)</option>
                </select>
              </label>
              <label className="settings-field">
                Low stock threshold
                <input
                  type="number"
                  min={0}
                  value={orgSettings.lowStockThreshold}
                  onChange={(e) =>
                    setOrgSettings({ ...orgSettings, lowStockThreshold: parseInt(e.target.value) || 0 })
                  }
                />
                <small>Default warning level for products without a reorder threshold.</small>
              </label>
              <div className="settings-toggles">
                <Toggle
                  label="Separation of duties"
                  description="Prevent requesters from approving their own transfers."
                  value={orgSettings.separationOfDuties}
                  onChange={(v) => setOrgSettings({ ...orgSettings, separationOfDuties: v })}
                />
              </div>
            </>
          ) : tab === 'Preferences' ? (
            <>
              <div className="settings-field">
                <label>Theme</label>
                <div style={{ display: 'flex', gap: 9, marginTop: 4 }}>
                  {[
                    { value: 'light', label: 'Light', icon: Sun },
                    { value: 'dark', label: 'Dark', icon: Moon },
                    { value: 'system', label: 'System', icon: Monitor },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`button ${prefs.theme === opt.value ? 'button-primary' : 'button-secondary'}`}
                      onClick={() => {
                        setPrefs({ ...prefs, theme: opt.value as any })
                        setTheme(opt.value)
                      }}
                    >
                      <opt.icon size={15} /> {opt.label}
                    </button>
                  ))}
                </div>
                <small>Light is the default. Dark mode restyles the whole workspace.</small>
              </div>
              <div className="settings-field">
                <label>Dashboard layout</label>
                <div style={{ display: 'flex', gap: 9, marginTop: 4 }}>
                  {(['comfortable', 'compact'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`button ${prefs.dashboardLayout === v ? 'button-primary' : 'button-secondary'}`}
                      onClick={() => setPrefs({ ...prefs, dashboardLayout: v })}
                    >
                      {v === 'comfortable' ? 'Comfortable' : 'Compact'}
                    </button>
                  ))}
                </div>
              </div>
              <label className="settings-field">
                Date format
                <select
                  value={orgSettings.dateFormat}
                  onChange={(e) => setOrgSettings({ ...orgSettings, dateFormat: e.target.value })}
                >
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                </select>
              </label>
            </>
          ) : tab === 'Notifications' ? (
            <div className="settings-toggles">
              <Toggle
                label="Email notifications"
                description="Receive important workspace updates by email."
                value={prefs.notifications.email}
                onChange={(v) => setPrefs({ ...prefs, notifications: { ...prefs.notifications, email: v } })}
              />
              <Toggle
                label="In-app notifications"
                description="Show alerts inside the workspace as things happen."
                value={prefs.notifications.inApp}
                onChange={(v) => setPrefs({ ...prefs, notifications: { ...prefs.notifications, inApp: v } })}
              />
            </div>
          ) : (
            <div className="settings-info-block">
              <ShieldCheck size={20} />
              <b>Role-aware access</b>
              <p>
                Your workspace enforces permissions server-side: only authorized roles can create,
                approve, dispatch, or receive stock. Passwords are hashed with bcrypt and password
                reset links expire after one hour.
              </p>
              <div className="detail-kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0' }}>
                <span>Session</span>
                <b>JWT · 30 days</b>
              </div>
              <div className="detail-kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0' }}>
                <span>Password hashing</span>
                <b>bcrypt · 12 rounds</b>
              </div>
              <div className="detail-kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0' }}>
                <span>Audit trail</span>
                <b>Enabled</b>
              </div>
            </div>
          )}

          <div className="settings-save-row">
            <span>Changes apply to this workspace immediately after saving.</span>
            <button className="button button-primary" onClick={handleSave} disabled={saving || loading}>
              <Save size={15} /> {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </section>
      </div>

      <Toast message={toast} onClose={() => setToast('')} />
    </>
  )
}
export const dynamic = 'force-dynamic'
