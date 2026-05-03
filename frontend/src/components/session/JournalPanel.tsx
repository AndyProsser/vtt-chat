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

type JournalViewMode = 'all' | 'favorites' | 'pinned'

const EMPTY_NOTES: Record<UUID, Note> = {}
const JOURNAL_PINNED_STORAGE_KEY = 'vtt-chat:journal:pinned'
const JOURNAL_FAVORITE_STORAGE_KEY = 'vtt-chat:journal:favorites'

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

function readStoredIds(storageKey: string): Set<string> {
  if (typeof window === 'undefined') {
    return new Set()
  }

  try {
    const localStorageApi = window.localStorage as Partial<Storage> | undefined
    if (!localStorageApi || typeof localStorageApi.getItem !== 'function') {
      return new Set()
    }

    const rawValue = localStorageApi.getItem(storageKey)
    if (!rawValue) {
      return new Set()
    }

    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) {
      return new Set()
    }

    return new Set(parsed.filter((value): value is string => typeof value === 'string'))
  } catch {
    return new Set()
  }
}

function persistStoredIds(storageKey: string, ids: Set<string>): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const localStorageApi = window.localStorage as Partial<Storage> | undefined
    if (!localStorageApi || typeof localStorageApi.setItem !== 'function') {
      return
    }

    localStorageApi.setItem(storageKey, JSON.stringify(Array.from(ids)))
  } catch {
    // Best effort persistence only.
  }
}

export function JournalPanel({ apiUrl, token, sessionId, role }: JournalPanelProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishingNoteId, setPublishingNoteId] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState<string>('all')
  const [viewMode, setViewMode] = useState<JournalViewMode>('all')
  const [pinnedEntryIds, setPinnedEntryIds] = useState<Set<string>>(new Set())
  const [favoriteEntryIds, setFavoriteEntryIds] = useState<Set<string>>(new Set())

  const sessionNotes = useStore((state) => state.notes[sessionId] ?? EMPTY_NOTES)
  const addNote = useStore((state) => state.addNote)
  const updateNote = useStore((state) => state.updateNote)

  const entries = useMemo(() => {
    const sortedByTime = Object.values(sessionNotes).sort((left, right) => {
      const leftTimestamp = left.publishedAt ?? left.updatedAt
      const rightTimestamp = right.publishedAt ?? right.updatedAt
      return rightTimestamp - leftTimestamp
    })

    return sortedByTime.sort((left, right) => {
      const leftPinned = pinnedEntryIds.has(left.id as string) ? 1 : 0
      const rightPinned = pinnedEntryIds.has(right.id as string) ? 1 : 0
      if (leftPinned !== rightPinned) {
        return rightPinned - leftPinned
      }

      const leftFavorite = favoriteEntryIds.has(left.id as string) ? 1 : 0
      const rightFavorite = favoriteEntryIds.has(right.id as string) ? 1 : 0
      if (leftFavorite !== rightFavorite) {
        return rightFavorite - leftFavorite
      }

      return 0
    })
  }, [favoriteEntryIds, pinnedEntryIds, sessionNotes])

  const availableTags = useMemo(() => {
    const tags = new Set<string>()
    for (const entry of entries) {
      for (const tag of entry.tags) {
        tags.add(tag)
      }
    }
    return Array.from(tags).sort((left, right) => left.localeCompare(right))
  }, [entries])

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (selectedTag !== 'all' && !entry.tags.includes(selectedTag)) {
        return false
      }

      if (viewMode === 'favorites' && !favoriteEntryIds.has(entry.id as string)) {
        return false
      }

      if (viewMode === 'pinned' && !pinnedEntryIds.has(entry.id as string)) {
        return false
      }

      return true
    })
  }, [entries, favoriteEntryIds, pinnedEntryIds, selectedTag, viewMode])

  useEffect(() => {
    const scopedPinnedKey = `${JOURNAL_PINNED_STORAGE_KEY}:${sessionId}`
    const scopedFavoriteKey = `${JOURNAL_FAVORITE_STORAGE_KEY}:${sessionId}`

    setPinnedEntryIds(readStoredIds(scopedPinnedKey))
    setFavoriteEntryIds(readStoredIds(scopedFavoriteKey))
  }, [sessionId])

  useEffect(() => {
    const scopedPinnedKey = `${JOURNAL_PINNED_STORAGE_KEY}:${sessionId}`
    persistStoredIds(scopedPinnedKey, pinnedEntryIds)
  }, [pinnedEntryIds, sessionId])

  useEffect(() => {
    const scopedFavoriteKey = `${JOURNAL_FAVORITE_STORAGE_KEY}:${sessionId}`
    persistStoredIds(scopedFavoriteKey, favoriteEntryIds)
  }, [favoriteEntryIds, sessionId])

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

  const handleTogglePinned = (entryId: string) => {
    setPinnedEntryIds((prev) => {
      const next = new Set(prev)
      if (next.has(entryId)) {
        next.delete(entryId)
      } else {
        next.add(entryId)
      }
      return next
    })
  }

  const handleToggleFavorite = (entryId: string) => {
    setFavoriteEntryIds((prev) => {
      const next = new Set(prev)
      if (next.has(entryId)) {
        next.delete(entryId)
      } else {
        next.add(entryId)
      }
      return next
    })
  }

  const handleQuickPublish = async (entry: Note) => {
    if (role !== 'DM' || entry.publishedAt) {
      return
    }

    setPublishError(null)
    setPublishingNoteId(entry.id as string)

    try {
      const response = await fetch(`${apiUrl}/api/notes/${entry.id}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json().catch(() => ({}))
      const publishedAt =
        typeof data?.note?.publishedAt === 'number'
          ? data.note.publishedAt
          : typeof data?.publishedAt === 'number'
            ? data.publishedAt
            : Date.now()

      updateNote(sessionId, entry.id, {
        publishedAt,
        updatedAt: Math.max(entry.updatedAt, publishedAt),
      })
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Unable to publish entry')
    } finally {
      setPublishingNoteId(null)
    }
  }

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

      <div className="knowledge-panel-toolbar" aria-label="Journal filters">
        <label className="knowledge-panel-filter-field">
          <span>View</span>
          <select
            aria-label="Journal view"
            value={viewMode}
            onChange={(event) => setViewMode(event.target.value as JournalViewMode)}
          >
            <option value="all">All entries</option>
            <option value="favorites">Favorites</option>
            <option value="pinned">Pinned</option>
          </select>
        </label>

        <label className="knowledge-panel-filter-field">
          <span>Tag</span>
          <select
            aria-label="Tag"
            value={selectedTag}
            onChange={(event) => setSelectedTag(event.target.value)}
          >
            <option value="all">All tags</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
      </div>

      {publishError ? <p className="knowledge-panel-error">{publishError}</p> : null}

      {isLoading ? <p className="knowledge-panel-meta">Loading entries…</p> : null}
      {error ? <p className="knowledge-panel-error">{error}</p> : null}

      {!isLoading && filteredEntries.length === 0 ? (
        <div className="knowledge-panel-empty">
          <p>No journal entries match the active filters.</p>
        </div>
      ) : (
        <div className="knowledge-panel-results" role="list" aria-label="Journal entries">
          {filteredEntries.map((entry) => (
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

              <div className="knowledge-panel-action-row" aria-label="Journal entry actions">
                <button
                  type="button"
                  className="knowledge-panel-action"
                  onClick={() => handleTogglePinned(entry.id as string)}
                >
                  {pinnedEntryIds.has(entry.id as string) ? 'Unpin' : 'Pin'} entry
                </button>
                <button
                  type="button"
                  className="knowledge-panel-action"
                  onClick={() => handleToggleFavorite(entry.id as string)}
                >
                  {favoriteEntryIds.has(entry.id as string) ? 'Unfavorite' : 'Favorite'} entry
                </button>
                {role === 'DM' && !entry.publishedAt ? (
                  <button
                    type="button"
                    className="knowledge-panel-action"
                    onClick={() => handleQuickPublish(entry)}
                    disabled={publishingNoteId === (entry.id as string)}
                  >
                    {publishingNoteId === (entry.id as string) ? 'Publishing...' : 'Quick publish'}
                  </button>
                ) : null}
              </div>

              <div className="knowledge-panel-chip-row" aria-label="Journal status">
                {pinnedEntryIds.has(entry.id as string) ? (
                  <span className="knowledge-panel-chip muted">Pinned</span>
                ) : null}
                {favoriteEntryIds.has(entry.id as string) ? (
                  <span className="knowledge-panel-chip muted">Favorite</span>
                ) : null}
                {entry.publishedAt ? (
                  <span className="knowledge-panel-chip muted">Published</span>
                ) : (
                  <span className="knowledge-panel-chip muted">Draft</span>
                )}
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
