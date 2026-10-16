'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Toast } from '@/components/redesign/ui'
import { apiFetch } from '@/lib/api'

/**
 * Inline capacity editor for the (server-rendered) location detail page.
 * PATCHes /api/locations/:id { capacity } then refreshes the page so the
 * server-computed utilization figures update.
 */
export function CapacityEditor({ locationId, capacity }: { locationId: string; capacity?: number | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(capacity !== null && capacity !== undefined ? String(capacity) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const parsed = value.trim() === '' ? null : Math.max(0, parseFloat(value) || 0)
      const res = await apiFetch(`/api/locations/${locationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ capacity: parsed }),
      })
      if (!res.success) {
        const details = res.details as Record<string, string[]> | undefined
        setError(details ? Object.values(details).flat()[0] || res.error || 'Failed to save' : res.error || 'Failed to save')
        return
      }
      setOpen(false)
      setToast(parsed === null ? 'Capacity cleared' : 'Capacity updated')
      window.setTimeout(() => setToast(''), 3500)
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button className="button button-secondary" onClick={() => setOpen(true)}>
        {capacity === null || capacity === undefined ? 'Set capacity' : 'Edit capacity'}
      </button>
    )
  }

  return (
    <>
      <form
        className="create-modal"
        style={{ width: 'min(420px, 100%)', marginTop: 14 }}
        onSubmit={submit}
      >
        <div className="settings-field" style={{ maxWidth: 'none', marginBottom: 4 }}>
          Location capacity (units)
          <input
            type="number"
            min={0}
            step={1}
            placeholder="Leave empty for no capacity"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
          <small>Set to an empty value to remove the capacity limit.</small>
        </div>

        {error && (
          <div className="auth-message" style={{ background: '#fdeef0', borderColor: '#f6d3d9', color: '#a4404f' }}>
            {error}
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 4 }}>
          <button type="button" className="button button-secondary" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="submit" className="button button-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save capacity'}
          </button>
        </div>
      </form>
      <Toast message={toast} onClose={() => setToast('')} />
    </>
  )
}
