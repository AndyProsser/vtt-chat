import { useEffect, useMemo, useState } from 'react'
import type { UIEvent } from 'react'
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
  userId?: UUID
}

type JournalViewMode = 'all' | 'favorites' | 'pinned'

interface JournalFilterPreset {
  name: string
  viewMode: JournalViewMode
  tag: string
  isDefault?: boolean
}

const EMPTY_NOTES: Record<UUID, Note> = {}
const JOURNAL_PINNED_STORAGE_KEY = 'vtt-chat:journal:pinned'
const JOURNAL_FAVORITE_STORAGE_KEY = 'vtt-chat:journal:favorites'
const JOURNAL_PRESETS_STORAGE_KEY = 'vtt-chat:journal:filter-presets'
const JOURNAL_PAGE_SIZE = 30
const JOURNAL_SCROLL_THRESHOLD_PX = 200

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

function readJournalPresets(storageKey: string): JournalFilterPreset[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const localStorageApi = window.localStorage as Partial<Storage> | undefined
    if (!localStorageApi || typeof localStorageApi.getItem !== 'function') {
      return []
    }

    const rawValue = localStorageApi.getItem(storageKey)
    if (!rawValue) {
      return []
    }

    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) {
      return []
    }

    const validated = parsed
      .filter((candidate): candidate is JournalFilterPreset => {
        if (!candidate || typeof candidate !== 'object') {
          return false
        }

        const preset = candidate as Partial<JournalFilterPreset>
        return (
          typeof preset.name === 'string' &&
          typeof preset.viewMode === 'string' &&
          ['all', 'favorites', 'pinned'].includes(preset.viewMode) &&
          typeof preset.tag === 'string'
        )
      })
      .slice(0, 8)

    let foundDefault = false
    return validated.map((preset) => {
      const shouldBeDefault = Boolean(preset.isDefault) && !foundDefault
      if (shouldBeDefault) {
        foundDefault = true
      }

      return {
        ...preset,
        isDefault: shouldBeDefault,
      }
    })
  } catch {
    return []
  }
}

function persistJournalPresets(storageKey: string, presets: JournalFilterPreset[]): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const localStorageApi = window.localStorage as Partial<Storage> | undefined
    if (!localStorageApi || typeof localStorageApi.setItem !== 'function') {
      return
    }

    localStorageApi.setItem(storageKey, JSON.stringify(presets))
  } catch {
    // Best-effort persistence only.
  }
}

function createInitialJournalState(params: { sessionId: UUID; presetStorageKey: string }): {
  selectedTag: string
  viewMode: JournalViewMode
  pinnedEntryIds: Set<string>
  favoriteEntryIds: Set<string>
  savedPresets: JournalFilterPreset[]
} {
  const scopedPinnedKey = `${JOURNAL_PINNED_STORAGE_KEY}:${params.sessionId}`
  const scopedFavoriteKey = `${JOURNAL_FAVORITE_STORAGE_KEY}:${params.sessionId}`
  const savedPresets = readJournalPresets(params.presetStorageKey)
  const defaultPreset = savedPresets.find((preset) => preset.isDefault)

  return {
    selectedTag: defaultPreset?.tag ?? 'all',
    viewMode: defaultPreset?.viewMode ?? 'all',
    pinnedEntryIds: readStoredIds(scopedPinnedKey),
    favoriteEntryIds: readStoredIds(scopedFavoriteKey),
    savedPresets,
  }
}

export function JournalPanel({ apiUrl, token, sessionId, role, userId }: JournalPanelProps) {
  const userScope = String(userId ?? 'anonymous')
  const presetStorageKey = `${JOURNAL_PRESETS_STORAGE_KEY}:${userScope}:${sessionId}`
  const [initialState] = useState(() =>
    createInitialJournalState({
      sessionId,
      presetStorageKey,
    })
  )

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishingNoteId, setPublishingNoteId] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState<string>(initialState.selectedTag)
  const [viewMode, setViewMode] = useState<JournalViewMode>(initialState.viewMode)
  const [keyword, setKeyword] = useState('')
  const [visibleEntryCount, setVisibleEntryCount] = useState<number>(JOURNAL_PAGE_SIZE)
  const [pinnedEntryIds, setPinnedEntryIds] = useState<Set<string>>(initialState.pinnedEntryIds)
  const [favoriteEntryIds, setFavoriteEntryIds] = useState<Set<string>>(
    initialState.favoriteEntryIds
  )
  const [presetName, setPresetName] = useState('')
  const [savedPresets, setSavedPresets] = useState<JournalFilterPreset[]>(initialState.savedPresets)
  const [renamingPresetName, setRenamingPresetName] = useState<string | null>(null)
  const [renamePresetInput, setRenamePresetInput] = useState('')
  const [importPayload, setImportPayload] = useState('')
  const [presetFeedback, setPresetFeedback] = useState<string | null>(null)

  const exportPayload = JSON.stringify(
    {
      panel: 'journal',
      version: 1,
      scope: userScope,
      presets: savedPresets,
    },
    null,
    2
  )

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
    const normalizedKeyword = keyword.trim().toLowerCase()

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

      if (normalizedKeyword) {
        const searchable =
          `${entry.title} ${entry.content} ${entry.ownerUsername} ${entry.tags.join(' ')}`
            .toLowerCase()
            .trim()
        if (!searchable.includes(normalizedKeyword)) {
          return false
        }
      }

      return true
    })
  }, [entries, favoriteEntryIds, keyword, pinnedEntryIds, selectedTag, viewMode])

  const visibleEntries = useMemo(
    () => filteredEntries.slice(0, visibleEntryCount),
    [filteredEntries, visibleEntryCount]
  )

  const hasMoreVisibleEntries = visibleEntryCount < filteredEntries.length

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibleEntryCount(JOURNAL_PAGE_SIZE)
  }, [keyword, selectedTag, viewMode, favoriteEntryIds, pinnedEntryIds, sessionId])

  useEffect(() => {
    const scopedPinnedKey = `${JOURNAL_PINNED_STORAGE_KEY}:${sessionId}`
    persistStoredIds(scopedPinnedKey, pinnedEntryIds)
  }, [pinnedEntryIds, sessionId])

  useEffect(() => {
    const scopedFavoriteKey = `${JOURNAL_FAVORITE_STORAGE_KEY}:${sessionId}`
    persistStoredIds(scopedFavoriteKey, favoriteEntryIds)
  }, [favoriteEntryIds, sessionId])

  useEffect(() => {
    persistJournalPresets(presetStorageKey, savedPresets)
  }, [presetStorageKey, savedPresets])

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

  const handleSavePreset = () => {
    const normalizedName = presetName.trim()
    if (!normalizedName) {
      return
    }

    const nextPreset: JournalFilterPreset = {
      name: normalizedName,
      viewMode,
      tag: selectedTag,
    }

    setSavedPresets((prev) => {
      const existing = prev.find(
        (preset) => preset.name.toLowerCase() === normalizedName.toLowerCase()
      )
      const withoutCurrentName = prev.filter(
        (preset) => preset.name.toLowerCase() !== normalizedName.toLowerCase()
      )
      return [
        { ...nextPreset, isDefault: existing?.isDefault ?? false },
        ...withoutCurrentName,
      ].slice(0, 8)
    })
    setPresetName('')
    setPresetFeedback(null)
  }

  const handleApplyPreset = (preset: JournalFilterPreset) => {
    setViewMode(preset.viewMode)
    setSelectedTag(preset.tag)
    setPresetFeedback(null)
  }

  const handleDeletePreset = (name: string) => {
    setSavedPresets((prev) => prev.filter((preset) => preset.name !== name))
    if (renamingPresetName === name) {
      setRenamingPresetName(null)
      setRenamePresetInput('')
    }
  }

  const handleSetDefaultPreset = (name: string) => {
    setSavedPresets((prev) =>
      prev.map((preset) => ({
        ...preset,
        isDefault: preset.name === name,
      }))
    )
    setPresetFeedback(null)
  }

  const handleClearDefaultPreset = () => {
    setSavedPresets((prev) => prev.map((preset) => ({ ...preset, isDefault: false })))
    setPresetFeedback(null)
  }

  const handleStartRenamePreset = (name: string) => {
    setRenamingPresetName(name)
    setRenamePresetInput(name)
    setPresetFeedback(null)
  }

  const handleRenamePreset = () => {
    if (!renamingPresetName) {
      return
    }

    const nextName = renamePresetInput.trim()
    if (!nextName) {
      setPresetFeedback('Preset name cannot be empty.')
      return
    }

    setSavedPresets((prev) => {
      const duplicate = prev.some(
        (preset) =>
          preset.name !== renamingPresetName && preset.name.toLowerCase() === nextName.toLowerCase()
      )

      if (duplicate) {
        return prev
      }

      return prev.map((preset) =>
        preset.name === renamingPresetName
          ? {
              ...preset,
              name: nextName,
            }
          : preset
      )
    })

    const hasDuplicate = savedPresets.some(
      (preset) =>
        preset.name !== renamingPresetName && preset.name.toLowerCase() === nextName.toLowerCase()
    )

    if (hasDuplicate) {
      setPresetFeedback('A preset with that name already exists.')
      return
    }

    setRenamingPresetName(null)
    setRenamePresetInput('')
    setPresetFeedback(null)
  }

  const handleExportPresets = async () => {
    setPresetFeedback(null)

    if (!savedPresets.length) {
      setPresetFeedback('No presets available to export.')
      return
    }

    try {
      await navigator.clipboard.writeText(exportPayload)
      setPresetFeedback('Presets copied to clipboard.')
    } catch {
      setPresetFeedback('Clipboard unavailable. Copy the JSON manually from the export field.')
    }
  }

  const handleImportPresets = () => {
    setPresetFeedback(null)

    try {
      const parsed = JSON.parse(importPayload) as {
        panel?: string
        version?: number
        scope?: string
        presets?: unknown
      }

      if (!parsed || parsed.panel !== 'journal' || parsed.scope !== userScope) {
        setPresetFeedback('Import payload does not match this user journal scope.')
        return
      }

      if (!Array.isArray(parsed.presets)) {
        setPresetFeedback('Import payload is missing presets.')
        return
      }

      const normalizedPresets = parsed.presets
        .filter((candidate): candidate is JournalFilterPreset => {
          if (!candidate || typeof candidate !== 'object') {
            return false
          }

          const preset = candidate as Partial<JournalFilterPreset>
          return (
            typeof preset.name === 'string' &&
            typeof preset.viewMode === 'string' &&
            ['all', 'favorites', 'pinned'].includes(preset.viewMode) &&
            typeof preset.tag === 'string'
          )
        })
        .slice(0, 8)

      let foundDefault = false
      const sanitized = normalizedPresets.map((preset) => {
        const shouldBeDefault = Boolean(preset.isDefault) && !foundDefault
        if (shouldBeDefault) {
          foundDefault = true
        }
        return {
          ...preset,
          isDefault: shouldBeDefault,
        }
      })

      setSavedPresets(sanitized)

      const defaultPreset = sanitized.find((preset) => preset.isDefault)
      if (defaultPreset) {
        handleApplyPreset(defaultPreset)
      }

      setPresetFeedback(`Imported ${sanitized.length} preset${sanitized.length === 1 ? '' : 's'}.`)
    } catch {
      setPresetFeedback('Import payload is not valid JSON.')
    }
  }

  const handleResultsScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!hasMoreVisibleEntries) {
      return
    }

    const element = event.currentTarget
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight
    if (remaining > JOURNAL_SCROLL_THRESHOLD_PX) {
      return
    }

    setVisibleEntryCount((count) => count + JOURNAL_PAGE_SIZE)
  }

  return (
    <section className="knowledge-panel knowledge-panel--compact" data-testid="journal-panel">
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

      <div className="knowledge-panel-search">
        <label className="knowledge-panel-search-label" htmlFor="journal-keyword-search">
          Search
        </label>
        <input
          id="journal-keyword-search"
          type="search"
          value={keyword}
          placeholder="Find by title, content, owner, or tag"
          onChange={(event) => setKeyword(event.target.value)}
        />
      </div>

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

      <div className="knowledge-panel-presets" aria-label="Journal presets">
        <div className="knowledge-panel-presets-save-row">
          <input
            type="text"
            aria-label="Journal preset name"
            value={presetName}
            placeholder="Save current filters as preset"
            onChange={(event) => setPresetName(event.target.value)}
          />
          <button
            type="button"
            className="knowledge-panel-action"
            onClick={handleSavePreset}
            disabled={!presetName.trim()}
          >
            Save preset
          </button>
        </div>

        <div className="knowledge-panel-presets-import-export-row">
          <button type="button" className="knowledge-panel-action" onClick={handleExportPresets}>
            Copy export
          </button>
          <button
            type="button"
            className="knowledge-panel-action"
            onClick={handleImportPresets}
            disabled={!importPayload.trim()}
          >
            Import presets
          </button>
          <button
            type="button"
            className="knowledge-panel-action"
            onClick={handleClearDefaultPreset}
            disabled={!savedPresets.some((preset) => preset.isDefault)}
          >
            Clear default
          </button>
        </div>

        <label className="knowledge-panel-filter-field">
          <span>Preset export (same user)</span>
          <textarea
            aria-label="Journal preset export"
            readOnly
            className="knowledge-panel-presets-json"
            value={exportPayload}
          />
        </label>

        <label className="knowledge-panel-filter-field">
          <span>Preset import (same user)</span>
          <textarea
            aria-label="Journal preset import"
            className="knowledge-panel-presets-json"
            value={importPayload}
            placeholder="Paste a journal preset export JSON payload"
            onChange={(event) => setImportPayload(event.target.value)}
          />
        </label>

        {presetFeedback ? <p className="knowledge-panel-meta">{presetFeedback}</p> : null}

        {savedPresets.length > 0 ? (
          <div
            className="knowledge-panel-presets-list"
            role="list"
            aria-label="Saved journal presets"
          >
            {savedPresets.map((preset) => (
              <div key={preset.name} className="knowledge-panel-preset-card" role="listitem">
                {renamingPresetName === preset.name ? (
                  <>
                    <input
                      type="text"
                      aria-label={`Rename ${preset.name}`}
                      className="knowledge-panel-preset-inline-input"
                      value={renamePresetInput}
                      onChange={(event) => setRenamePresetInput(event.target.value)}
                    />
                    <button
                      type="button"
                      className="knowledge-panel-action"
                      onClick={handleRenamePreset}
                    >
                      Save name
                    </button>
                    <button
                      type="button"
                      className="knowledge-panel-action"
                      onClick={() => {
                        setRenamingPresetName(null)
                        setRenamePresetInput('')
                        setPresetFeedback(null)
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="knowledge-panel-action"
                      onClick={() => handleApplyPreset(preset)}
                    >
                      Apply {preset.name}
                    </button>
                    <button
                      type="button"
                      className="knowledge-panel-action"
                      onClick={() => handleSetDefaultPreset(preset.name)}
                    >
                      {preset.isDefault ? 'Default preset' : 'Set default'}
                    </button>
                    <button
                      type="button"
                      className="knowledge-panel-action"
                      onClick={() => handleStartRenamePreset(preset.name)}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="knowledge-panel-action"
                      onClick={() => handleDeletePreset(preset.name)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {publishError ? <p className="knowledge-panel-error">{publishError}</p> : null}
      {!isLoading ? (
        <p className="knowledge-panel-meta">
          Showing {visibleEntries.length} of {filteredEntries.length} filtered entries.
        </p>
      ) : null}

      {isLoading ? <p className="knowledge-panel-meta">Loading entries…</p> : null}
      {error ? <p className="knowledge-panel-error">{error}</p> : null}

      {!isLoading && filteredEntries.length === 0 ? (
        <div className="knowledge-panel-empty">
          <p>No journal entries match the active filters.</p>
        </div>
      ) : (
        <div
          className="knowledge-panel-results knowledge-panel-results--scroll"
          role="list"
          aria-label="Journal entries"
          onScroll={handleResultsScroll}
        >
          {visibleEntries.map((entry) => (
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

          {hasMoreVisibleEntries ? (
            <p className="knowledge-panel-meta">Scroll to load more entries…</p>
          ) : null}
        </div>
      )}
    </section>
  )
}
