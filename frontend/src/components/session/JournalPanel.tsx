import { useEffect, useMemo, useState } from 'react'
import { NoteVisibility } from '@shared'
import type { Role, UUID } from '@shared'
import { useStore } from '../../hooks/useStore'
import type { Note } from '@/types/notes'
import '../../styles/components/session/KnowledgePanels.css'

interface JournalPanelProps {
  apiUrl: string
  token: string
  sessionId: UUID
  role: Role
}

const EMPTY_NOTES: Record<UUID, Note> = {}

const NOTE_VISIBILITY_LABEL: Record<NoteVisibility, string> = {
  [NoteVisibility.DM_ONLY]: 'DM only',
  [NoteVisibility.PLAYERS_VISIBLE]: 'Shared',
  [NoteVisibility.CUSTOM]: 'Custom',
}

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) {
    return 'Not published yet'
  }

  return new Date(timestamp).toLocaleString()
}

export function JournalPanel({ apiUrl, token, sessionId, role }: JournalPanelProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const sessionNotes = useStore((state) => state.notes[sessionId] ?? EMPTY_NOTES)
  const addNote = useStore((state) => state.addNote)

  const entries = useMemo(
    () =>
      Object.values(sessionNotes).sort((left, right) => {
        const leftTimestamp = left.publishedAt ?? left.updatedAt
        const rightTimestamp = right.publishedAt ?? right.updatedAt
        return rightTimestamp - leftTimestamp
      }),
    [sessionNotes]
  )

  useEffect(() => {
    let cancelled = false

    const loadEntries = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`${apiUrl}/api/notes/${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = await response.json()
        const fetchedEntries: Note[] = (data.notes || []).map((note: any) => ({
          id: note.id,
          ownerId: note.authorId,
          ownerUsername: note.authorUsername,
          title: note.title,
          content: note.content,
          visibility: note.visibility,
          tags: note.tags || [],
          allowedUsers: note.allowedUsers || [],
          publishedAt: note.publishedAt,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        }))

        if (!cancelled) {
          for (const entry of fetchedEntries) {
            addNote(sessionId, entry)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load journal entries')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadEntries()

    return () => {
      cancelled = true
    }
  }, [addNote, apiUrl, sessionId, token])

  return (
    <section className="knowledge-panel" data-testid="journal-panel">
      <header className="knowledge-panel-header">
        <div>
          <p className="knowledge-panel-eyebrow">Knowledge</p>
          <h3 className="knowledge-panel-title">Journal</h3>
        </div>
        <span className="knowledge-panel-badge">
          {role === 'DM' ? 'Editable source' : 'Read only'}
        </span>
      </header>

      <p className="knowledge-panel-copy">
        This first journal slice is compiled from visible session notes and published callouts.
      </p>

      {isLoading ? <p className="knowledge-panel-meta">Loading entries…</p> : null}
      {error ? <p className="knowledge-panel-error">{error}</p> : null}

      {!isLoading && entries.length === 0 ? (
        <div className="knowledge-panel-empty">
          <p>No journal entries</p>
        </div>
      ) : (
        <div className="knowledge-panel-results" role="list" aria-label="Journal entries">
          {entries.map((entry) => (
            <article key={entry.id} className="knowledge-panel-card" role="listitem">
              <div className="knowledge-panel-card-header">
                <div>
                  <p className="knowledge-panel-card-title">{entry.title}</p>
                  <p className="knowledge-panel-card-subtitle">
                    {entry.ownerUsername} • {formatTimestamp(entry.publishedAt ?? entry.updatedAt)}
                  </p>
                </div>
                <span className="knowledge-panel-chip">
                  {NOTE_VISIBILITY_LABEL[entry.visibility]}
                </span>
              </div>
              <p className="knowledge-panel-card-body">{entry.content}</p>
              {entry.tags.length ? (
                <div className="knowledge-panel-chip-row" aria-label="Journal tags">
                  {entry.tags.map((tag) => (
                    <span key={`${entry.id}:${tag}`} className="knowledge-panel-chip muted">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
