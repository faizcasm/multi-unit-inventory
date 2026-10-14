'use client'

import { useEffect, useState } from 'react'
import { Save, Bell, Moon, Sun, Monitor, Building, Settings as SettingsIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Label } from '@/components/ui/Label'
import { useTheme } from 'next-themes'
// import { toast } from 'react-hot-toast'

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

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
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

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/settings')
        const data = await response.json()
        if (response.ok) {
          if (data.data.user?.preferences) {
            setPrefs(data.data.user.preferences)
          }
          if (data.data.organization?.settings) {
            setOrgSettings(data.data.organization.settings)
          }
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

      // Update organization name/slug
      if (orgName) {
        await fetch('/api/organizations', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: orgName }),
        })
      }

      alert('Settings saved successfully')
    } catch (err) {
      console.error('Failed to save settings:', err)
      alert('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your preferences and organization settings</p>
        </div>
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-muted/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your preferences and organization settings</p>
        </div>
        <Button onClick={handleSave} loading={saving} className="gap-2">
          <Save className="h-4 w-4" />
          Save Changes
        </Button>
      </div>

      {/* Theme Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sun className="h-5 w-5" />
            Theme
          </CardTitle>
          <CardDescription>Choose how the app looks to you</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {[
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark', label: 'Dark', icon: Moon },
              { value: 'system', label: 'System', icon: Monitor },
            ].map((themeOption) => (
              <button
                key={themeOption.value}
                onClick={() => { setPrefs({ ...prefs, theme: themeOption.value as any }); setTheme(themeOption.value) }}
                className={`p-4 rounded-lg border-2 text-center transition-all ${
                  prefs.theme === themeOption.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground'
                }`}
              >
                <themeOption.icon className="h-6 w-6 mx-auto mb-2" />
                <div className="font-medium">{themeOption.label}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>Choose what notifications you receive</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <div className="font-medium">Email Notifications</div>
              <div className="text-sm text-muted-foreground">Receive updates via email</div>
            </div>
            <input
              type="checkbox"
              checked={prefs.notifications.email}
              onChange={(e) => setPrefs({ ...prefs, notifications: { ...prefs.notifications, email: e.target.checked } })}
              className="h-4 w-4 rounded"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <div className="font-medium">In-App Notifications</div>
              <div className="text-sm text-muted-foreground">Receive updates in the app</div>
            </div>
            <input
              type="checkbox"
              checked={prefs.notifications.inApp}
              onChange={(e) => setPrefs({ ...prefs, notifications: { ...prefs.notifications, inApp: e.target.checked } })}
              className="h-4 w-4 rounded"
            />
          </label>
        </CardContent>
      </Card>

      {/* Organization Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            Organization Settings
          </CardTitle>
          <CardDescription>Configure your organization details and policies</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Organization Name</Label>
              <Input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Organization Slug</Label>
              <Input
                value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value)}
                disabled
                className="mt-1"
              />
            </div>
            <div>
              <Label>Timezone</Label>
              <Select
                value={orgSettings.timezone}
                onChange={(e) => setOrgSettings({ ...orgSettings, timezone: e.target.value })}
                options={[
                  { value: 'UTC', label: 'UTC' },
                  { value: 'America/New_York', label: 'Eastern Time' },
                  { value: 'America/Chicago', label: 'Central Time' },
                  { value: 'America/Denver', label: 'Mountain Time' },
                  { value: 'America/Los_Angeles', label: 'Pacific Time' },
                  { value: 'Europe/London', label: 'London' },
                  { value: 'Europe/Paris', label: 'Paris' },
                  { value: 'Asia/Tokyo', label: 'Tokyo' },
                ]}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Currency</Label>
              <Select
                value={orgSettings.currency}
                onChange={(e) => setOrgSettings({ ...orgSettings, currency: e.target.value })}
                options={[
                  { value: 'USD', label: 'US Dollar (USD)' },
                  { value: 'EUR', label: 'Euro (EUR)' },
                  { value: 'GBP', label: 'British Pound (GBP)' },
                  { value: 'JPY', label: 'Japanese Yen (JPY)' },
                  { value: 'CAD', label: 'Canadian Dollar (CAD)' },
                ]}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Low Stock Threshold</Label>
              <Input
                type="number"
                value={orgSettings.lowStockThreshold}
                onChange={(e) => setOrgSettings({ ...orgSettings, lowStockThreshold: parseInt(e.target.value) || 0 })}
                className="mt-1"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="flex items-center justify-between cursor-pointer p-4 rounded-lg border">
              <div>
                <div className="font-medium">Separation of Duties</div>
                <div className="text-sm text-muted-foreground">
                  Prevent requesters from approving their own transfers
                </div>
              </div>
              <input
                type="checkbox"
                checked={orgSettings.separationOfDuties}
                onChange={(e) => setOrgSettings({ ...orgSettings, separationOfDuties: e.target.checked })}
                className="h-4 w-4 rounded"
              />
            </label>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}