/**
 * PopoutRouteView
 *
 * Minimal layout rendered in a pop-out window for notes and journals.
 * Auth token and API URL are read from sessionStorage (set by the opener before window.open).
 *
 * Supported routes:
 *   /popout/note/:noteId     — read-only note view
 *   /popout/journal/:sessionId — full-featured journal editor (DM) or read-only (player)
 */

import { useEffect, useState, useMemo } from 'react'
import { Role } from '@shared'
import type { UUID } from '@shared'
import { JournalPanel } from '@/components/workspaces/shared/panels/JournalPanel'
import { MarkdownEditor } from '@/components/workspaces/shared/panels/MarkdownEditor'
import { POPOUT_STORAGE_API_URL_KEY, POPOUT_STORAGE_TOKEN_KEY } from '@/utils/route-view'
import '@/styles/components/workspaces/shared/panels/KnowledgePanels.css'

interface PopoutNoteViewProps {
  noteId: string
  token: string
  apiUrl: string
}

interface NoteData {
  id: string
  title: string
  content: string
  tags: string[]
  ownerUsername?: string
}

function PopoutNoteView({ noteId, token, apiUrl }: PopoutNoteViewProps) {
  const [note, setNote] = useState<NoteData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        // Fetch via campaign notes search — note noteId only, no session context needed
        const res = await fetch(`${apiUrl}/api/notes/by-id/${noteId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!res.ok) {
          setError('Note not found or access denied.')
          return
        }

        const data = (await res.json()) as { note?: NoteData }
        setNote(data.note ?? null)
      } catch {
        setError('Failed to load note.')
      }
    }

    void load()
  }, [apiUrl, noteId, token])

  if (error) {
    return <p className="knowledge-panel-copy knowledge-panel-copy--error">{error}</p>
  }

  if (!note) {
    return <p className="knowledge-panel-copy">Loading…</p>
  }

  return (
    <section className="knowledge-panel" style={{ padding: '1rem' }}>
      <header className="knowledge-panel-header" style={{ marginBottom: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{note.title}</h2>
          {note.ownerUsername ? (
            <p className="knowledge-panel-copy" style={{ marginTop: '0.25rem' }}>
              by {note.ownerUsername}
            </p>
          ) : null}
        </div>
      </header>

      <MarkdownEditor value={note.content} readOnly variant="full" />

      {note.tags.length > 0 ? (
        <div className="knowledge-panel-chip-row" style={{ marginTop: '0.75rem' }}>
          {note.tags.map((tag) => (
            <span key={tag} className="knowledge-panel-chip muted">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  )
}

interface PopoutJournalViewProps {
  sessionId: string
  token: string
  apiUrl: string
  role: Role
}

function PopoutJournalView({ sessionId, token, apiUrl, role }: PopoutJournalViewProps) {
  return (
    <div style={{ padding: '1rem', height: '100%', boxSizing: 'border-box', overflow: 'auto' }}>
      <JournalPanel
        apiUrl={apiUrl}
        token={token}
        role={role}
        sessionId={sessionId as UUID}
        autoEdit={role === 'DM'}
        autoSave={role === 'DM'}
      />
    </div>
  )
}

interface PopoutRouteViewProps {
  kind: 'popout-note' | 'popout-journal'
  noteId?: string
  sessionId?: string
}

/**
 * Reads auth from sessionStorage (set by opener) and renders the appropriate pop-out view.
 */
export function PopoutRouteView({ kind, noteId, sessionId }: PopoutRouteViewProps) {
  // Read popout auth from sessionStorage via lazy state initializers
  // (avoids calling sessionStorage directly during render)
  const [token] = useState<string>(() => sessionStorage.getItem(POPOUT_STORAGE_TOKEN_KEY) ?? '')
  const [apiUrl] = useState<string>(() => sessionStorage.getItem(POPOUT_STORAGE_API_URL_KEY) ?? '')

  // Derive role from JWT (best-effort; token is not verified here — that's the server's job).
  const role: Role = useMemo(() => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1] ?? '')) as { role?: string }
      const r = payload.role
      if (r === 'DM' || r === 'PLAYER' || r === 'SPECTATOR' || r === 'SYSTEM') return r as Role
    } catch {
      // fall through
    }
    return Role.PLAYER
  }, [token])

  if (!token || !apiUrl) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'sans-serif',
          color: '#888',
        }}
      >
        <p>This window must be opened from within VTT-Chat.</p>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface, #1a1a2e)',
        color: 'var(--color-text-primary, #e2e8f0)',
        fontFamily: 'var(--font-sans, sans-serif)',
      }}
    >
      {kind === 'popout-note' && noteId ? (
        <PopoutNoteView noteId={noteId} token={token} apiUrl={apiUrl} />
      ) : kind === 'popout-journal' && sessionId ? (
        <PopoutJournalView sessionId={sessionId} token={token} apiUrl={apiUrl} role={role} />
      ) : (
        <p style={{ padding: '2rem' }}>Invalid pop-out target.</p>
      )}
    </div>
  )
}
