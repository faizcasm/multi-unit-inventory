'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, ChevronDown, Loader2, MessageSquare } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Toast } from '@/components/redesign/ui'

interface Comment {
  _id: string
  body: string
  user: { _id: string; name: string; avatar?: string } | null
  createdAt: string
}

/** Show the latest comments first; reveal the rest with "Load more". */
const VISIBLE_LIMIT = 30

/**
 * `apiFetch` JSON-stringifies plain-object bodies at runtime, but its options
 * are typed as `RequestInit` whose `body` is a `BodyInit` union — cast past it.
 */
const jsonBody = (value: unknown): BodyInit => value as unknown as BodyInit

/** Relative timestamp — mirrors the activity page helper. */
function timeAgo(date: string): string {
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

function initialOf(name?: string): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default function TransferComments({
  transferId,
  canComment = true,
}: {
  transferId: string
  canComment?: boolean
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [toast, setToast] = useState('')

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3500)
  }

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<Comment[]>(`/api/transfers/${transferId}/comments`)
      if (!res.success) throw new Error(res.error || 'Failed to load comments')
      setComments(res.data ?? [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments')
    } finally {
      setLoading(false)
    }
  }, [transferId])

  useEffect(() => {
    load()
  }, [load])

  const post = async () => {
    const body = text.trim()
    if (!body || posting || !canComment) return
    setPosting(true)
    try {
      const res = await apiFetch<{ comment: Comment }>(`/api/transfers/${transferId}/comments`, {
        method: 'POST',
        body: jsonBody({ body }),
      })
      const comment = res.data?.comment
      if (!res.success || !comment) throw new Error(res.error || 'Failed to post comment')
      setComments((prev) => [...prev, comment])
      setText('')
      setShowAll(true)
      notify('Comment posted')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to post comment')
    } finally {
      setPosting(false)
    }
  }

  const visible = !showAll && comments.length > VISIBLE_LIMIT ? comments.slice(-VISIBLE_LIMIT) : comments
  const hiddenCount = comments.length - visible.length
  const trimmed = text.trim()

  return (
    <div style={{ padding: '4px 20px 20px' }}>
      {loading ? (
        <div>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="animate-pulse"
              style={{ display: 'flex', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--line)' }}
            >
              <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--line)', flexShrink: 0 }} />
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', height: 10, width: '35%', background: 'var(--line)', borderRadius: 5, marginBottom: 8 }} />
                <span style={{ display: 'block', height: 8, width: '80%', background: 'var(--line)', borderRadius: 4 }} />
              </span>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="empty-state" style={{ minHeight: 120 }}>
          <AlertCircle size={22} />
          <b>Could not load comments</b>
          <p>{error}</p>
          <button className="button button-secondary button-small" onClick={load}>
            Retry
          </button>
        </div>
      ) : comments.length === 0 ? (
        <div className="empty-state" style={{ minHeight: 120 }}>
          <MessageSquare size={22} />
          <b>No comments yet</b>
          <p>Start the discussion about this transfer.</p>
        </div>
      ) : (
        <>
          {hiddenCount > 0 && (
            <button
              className="button button-secondary button-small"
              style={{ margin: '4px 0 10px' }}
              onClick={() => setShowAll(true)}
            >
              <ChevronDown size={14} /> Load {hiddenCount} earlier comment{hiddenCount === 1 ? '' : 's'}
            </button>
          )}
          <div>
            {visible.map((c) => (
              <div
                key={c._id}
                style={{ display: 'flex', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--line)' }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: 'var(--muted)',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                  aria-hidden
                >
                  {initialOf(c.user?.name)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 13 }}>{c.user?.name || 'Unknown user'}</b>
                    <small style={{ fontSize: 11, color: 'var(--muted)' }} title={new Date(c.createdAt).toLocaleString()}>
                      {timeAgo(c.createdAt)}
                    </small>
                  </div>
                  <p
                    style={{
                      margin: '5px 0 0',
                      fontSize: 13,
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {c.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <textarea
            rows={2}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!canComment || posting}
            placeholder={canComment ? 'Write a comment…' : "You don't have permission to comment"}
            aria-label="Comment"
            style={{
              width: '100%',
              resize: 'vertical',
              border: '1px solid var(--line)',
              borderRadius: 10,
              background: 'var(--surface)',
              color: 'var(--ink)',
              padding: '10px 12px',
              font: 'inherit',
              outline: 'none',
            }}
          />
          {text.length > 1800 && (
            <small style={{ display: 'block', textAlign: 'right', marginTop: 4, fontSize: 11, color: 'var(--muted)' }}>
              {text.length}/2000
            </small>
          )}
        </div>
        <button
          className="button button-primary"
          onClick={post}
          disabled={!canComment || !trimmed || posting}
          title={canComment ? undefined : "You don't have permission to comment"}
        >
          {posting ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Posting…
            </>
          ) : (
            'Post comment'
          )}
        </button>
      </div>

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
