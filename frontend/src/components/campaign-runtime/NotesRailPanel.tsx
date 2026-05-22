import { useEffect, useMemo, useState } from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { NoteVisibility } from '@shared'
import type { Role, UUID } from '@shared'
import { useStore } from '../../hooks/useStore'
import type { Note } from '@/types/notes'
import { fetchSessionNotesOnce } from '@/utils/notesFetch'
import '../../styles/components/session/KnowledgePanels.css'

interface NotesRailPanelProps {
  apiUrl: string
  token: string
  sessionId: UUID
  role: Role
  onOpenNotesWorkspace?: () => void
}

const EMPTY_NOTES: Record<UUID, Note> = {}

const NOTE_VISIBILITY_LABEL: Record<NoteVisibility, string> = {
  [NoteVisibility.DM_ONLY]: 'DM only',
  [NoteVisibility.PLAYERS_VISIBLE]: 'Shared',
  [NoteVisibility.CUSTOM]: 'Custom',
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function truncateCopy(content: string, maxLength = 180): string {
  if (content.length <= maxLength) {
    return content
  }

  return `${content.slice(0, maxLength - 1).trimEnd()}…`
}

export function NotesRailPanel({
  apiUrl,
  token,
  sessionId,
  role,
  onOpenNotesWorkspace,
}: NotesRailPanelProps) {
  const [query, setQuery] = useState('')
  const [visibilityFilter, setVisibilityFilter] = useState<'ALL' | 'SHARED' | 'PRIVATE'>('ALL')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const sessionNotes = useStore((state) => state.notes[sessionId] ?? EMPTY_NOTES)
  const addNote = useStore((state) => state.addNote)

  useEffect(() => {
    let cancelled = false

    const loadNotes = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const fetchedNotes: Note[] = await fetchSessionNotesOnce(apiUrl, sessionId, token)

        if (!cancelled) {
          for (const note of fetchedNotes) {
            addNote(sessionId, note)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load notes')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadNotes()

    return () => {
      cancelled = true
    }
  }, [addNote, apiUrl, sessionId, token])

  const notes = useMemo(
    () =>
      Object.values(sessionNotes).sort((left, right) => {
        const leftTimestamp = left.publishedAt ?? left.updatedAt
        const rightTimestamp = right.publishedAt ?? right.updatedAt
        return rightTimestamp - leftTimestamp
      }),
    [sessionNotes]
  )

  const normalizedQuery = query.trim().toLowerCase()

  const filteredNotes = useMemo(() => {
    const visibilityScopedNotes =
      visibilityFilter === 'ALL'
        ? notes
        : visibilityFilter === 'SHARED'
          ? notes.filter((note) => note.visibility === NoteVisibility.PLAYERS_VISIBLE)
          : notes.filter((note) => note.visibility !== NoteVisibility.PLAYERS_VISIBLE)

    if (!normalizedQuery) {
      return visibilityScopedNotes
    }

    return visibilityScopedNotes.filter((note) => {
      const searchText = `${note.title} ${note.content} ${note.ownerUsername} ${note.tags.join(' ')}`
      return searchText.toLowerCase().includes(normalizedQuery)
    })
  }, [normalizedQuery, notes, visibilityFilter])

  const statSummary = useMemo(() => {
    const total = notes.length
    const shared = notes.filter((note) => note.visibility === NoteVisibility.PLAYERS_VISIBLE).length
    const privateCount = notes.filter(
      (note) => note.visibility !== NoteVisibility.PLAYERS_VISIBLE
    ).length
    return { total, shared, privateCount }
  }, [notes])

  return (
    <section className="knowledge-panel" data-testid="notes-rail-panel">
      <header className="knowledge-panel-header">
        <div>
          <p className="knowledge-panel-eyebrow">Knowledge</p>
          <h3 className="knowledge-panel-title">Notes</h3>
        </div>
        <span className="knowledge-panel-badge">{role === 'DM' ? 'Editable' : 'Read only'}</span>
      </header>

      <p className="knowledge-panel-copy">
        Browse your latest notes, search quickly, then jump to the full notes workspace for edits.
      </p>

      <div className="knowledge-panel-stat-grid" aria-label="Notes summary">
        <p>
          Total <strong>{statSummary.total}</strong>
        </p>
        <p>
          Shared <strong>{statSummary.shared}</strong>
        </p>
        <p>
          Private <strong>{statSummary.privateCount}</strong>
        </p>
      </div>

      <TabsPrimitive.Root
        value={visibilityFilter}
        onValueChange={(value) => setVisibilityFilter(value as 'ALL' | 'SHARED' | 'PRIVATE')}
        className="knowledge-panel-tabs"
      >
        <TabsPrimitive.List
          className="knowledge-panel-tabs__list"
          aria-label="Notes visibility filter"
        >
          <TabsPrimitive.Trigger value="ALL" className="knowledge-panel-tabs__trigger">
            All
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="SHARED" className="knowledge-panel-tabs__trigger">
            Shared
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="PRIVATE" className="knowledge-panel-tabs__trigger">
            Private
          </TabsPrimitive.Trigger>
        </TabsPrimitive.List>
      </TabsPrimitive.Root>

      <label className="knowledge-panel-search">
        <span className="knowledge-panel-search-label">Filter notes</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search titles, content, authors, or tags"
          disabled={isLoading}
        />
      </label>

      {onOpenNotesWorkspace ? (
        <button type="button" className="knowledge-panel-action" onClick={onOpenNotesWorkspace}>
          Open full notes workspace
        </button>
      ) : null}

      {isLoading ? <p className="knowledge-panel-meta">Loading notes…</p> : null}
      {error ? <p className="knowledge-panel-error">{error}</p> : null}

      {!isLoading && filteredNotes.length === 0 ? (
        <div className="knowledge-panel-empty">
          <p>{normalizedQuery ? 'No notes match that filter.' : 'No notes yet.'}</p>
        </div>
      ) : (
        <div className="knowledge-panel-results" role="list" aria-label="Recent notes">
          {filteredNotes.slice(0, 12).map((note) => {
            const timestamp = note.publishedAt ?? note.updatedAt

            return (
              <article key={note.id} className="knowledge-panel-card" role="listitem">
                <div className="knowledge-panel-card-header">
                  <div>
                    <p className="knowledge-panel-card-title">{note.title}</p>
                    <p className="knowledge-panel-card-subtitle">
                      {note.ownerUsername} • {formatTimestamp(timestamp)}
                    </p>
                  </div>
                  <span className="knowledge-panel-chip">
                    {NOTE_VISIBILITY_LABEL[note.visibility]}
                  </span>
                </div>

                <p className="knowledge-panel-card-body">{truncateCopy(note.content)}</p>

                {note.tags.length ? (
                  <div className="knowledge-panel-chip-row" aria-label="Note tags">
                    {note.tags.map((tag) => (
                      <span key={`${note.id}:${tag}`} className="knowledge-panel-chip muted">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
