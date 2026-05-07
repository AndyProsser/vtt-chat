import { useCallback, useEffect, useMemo, useState } from 'react'
import type { UIEvent } from 'react'
import type { Role, UUID } from '@shared'
import '../../styles/components/session/KnowledgePanels.css'

interface HistoryPanelProps {
  apiUrl: string
  token: string
  sessionId: UUID
  role: Role
  userId?: UUID
}

interface SessionLogEntry {
  id: string
  sessionId: string
  userId: string | null
  username: string
  eventType: string
  detail: string | null
  createdAt: string
}

type HistoryWindow = '1h' | '6h' | '24h' | '7d' | 'all'

interface HistoryFilterPreset {
  name: string
  eventType: string
  actor: string
  window: HistoryWindow
  isDefault?: boolean
}

const HISTORY_PRESETS_STORAGE_KEY = 'vtt-chat:history:filter-presets'
const HISTORY_PAGE_SIZE = 100
const HISTORY_SCROLL_THRESHOLD_PX = 200

function formatEventLabel(eventType: string): string {
  return eventType
    .toLowerCase()
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function getWindowDurationMs(windowValue: HistoryWindow): number | null {
  switch (windowValue) {
    case '1h':
      return 60 * 60 * 1000
    case '6h':
      return 6 * 60 * 60 * 1000
    case '24h':
      return 24 * 60 * 60 * 1000
    case '7d':
      return 7 * 24 * 60 * 60 * 1000
    case 'all':
      return null
    default:
      return 24 * 60 * 60 * 1000
  }
}

function groupByDay(
  events: SessionLogEntry[]
): Array<{ dayLabel: string; items: SessionLogEntry[] }> {
  const groups = new Map<string, SessionLogEntry[]>()

  for (const event of events) {
    const dayLabel = new Date(event.createdAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })

    const dayEvents = groups.get(dayLabel) ?? []
    dayEvents.push(event)
    groups.set(dayLabel, dayEvents)
  }

  return Array.from(groups.entries()).map(([dayLabel, items]) => ({ dayLabel, items }))
}

function readHistoryPresets(storageKey: string): HistoryFilterPreset[] {
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
      .filter((candidate): candidate is HistoryFilterPreset => {
        if (!candidate || typeof candidate !== 'object') {
          return false
        }

        const preset = candidate as Partial<HistoryFilterPreset>
        return (
          typeof preset.name === 'string' &&
          typeof preset.eventType === 'string' &&
          typeof preset.actor === 'string' &&
          typeof preset.window === 'string' &&
          ['1h', '6h', '24h', '7d', 'all'].includes(preset.window)
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

function persistHistoryPresets(storageKey: string, presets: HistoryFilterPreset[]): void {
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

function createInitialHistoryState(storageKey: string): {
  presets: HistoryFilterPreset[]
  selectedEventType: string
  selectedActor: string
  selectedWindow: HistoryWindow
} {
  const presets = readHistoryPresets(storageKey)
  const defaultPreset = presets.find((preset) => preset.isDefault)

  return {
    presets,
    selectedEventType: defaultPreset?.eventType ?? 'all',
    selectedActor: defaultPreset?.actor ?? 'all',
    selectedWindow: defaultPreset?.window ?? 'all',
  }
}

export function HistoryPanel({ apiUrl, token, sessionId, role, userId }: HistoryPanelProps) {
  const userScope = String(userId ?? 'anonymous')
  const presetStorageKey = `${HISTORY_PRESETS_STORAGE_KEY}:${userScope}:${sessionId}`
  const [initialState] = useState(() => createInitialHistoryState(presetStorageKey))

  const [events, setEvents] = useState<SessionLogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [loadedCount, setLoadedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [selectedEventType, setSelectedEventType] = useState<string>(initialState.selectedEventType)
  const [selectedActor, setSelectedActor] = useState<string>(initialState.selectedActor)
  const [selectedWindow, setSelectedWindow] = useState<HistoryWindow>(initialState.selectedWindow)
  const [presetName, setPresetName] = useState('')
  const [savedPresets, setSavedPresets] = useState<HistoryFilterPreset[]>(initialState.presets)
  const [renamingPresetName, setRenamingPresetName] = useState<string | null>(null)
  const [renamePresetInput, setRenamePresetInput] = useState('')
  const [importPayload, setImportPayload] = useState('')
  const [presetFeedback, setPresetFeedback] = useState<string | null>(null)

  const exportPayload = JSON.stringify(
    {
      panel: 'history',
      version: 1,
      scope: userScope,
      presets: savedPresets,
    },
    null,
    2
  )

  useEffect(() => {
    persistHistoryPresets(presetStorageKey, savedPresets)
  }, [presetStorageKey, savedPresets])

  const fetchHistoryPage = useCallback(
    async (offset: number, append: boolean) => {
      if (append) {
        setIsLoadingMore(true)
      } else {
        setIsLoading(true)
        setError(null)
      }

      try {
        const response = await fetch(
          `${apiUrl}/api/v1/session/${sessionId}/logs?limit=${HISTORY_PAGE_SIZE}&offset=${offset}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        )

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = await response.json()
        const nextLogs: SessionLogEntry[] = data.logs || []

        setEvents((prev) => (append ? [...prev, ...nextLogs] : nextLogs))
        setLoadedCount(offset + nextLogs.length)
        setHasMore(nextLogs.length === HISTORY_PAGE_SIZE)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load history')
      } finally {
        if (append) {
          setIsLoadingMore(false)
        } else {
          setIsLoading(false)
        }
      }
    },
    [apiUrl, sessionId, token]
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEvents([])
    setLoadedCount(0)
    setHasMore(true)
    void fetchHistoryPage(0, false)
  }, [fetchHistoryPage])

  const eventTypeOptions = Array.from(new Set(events.map((event) => event.eventType))).sort(
    (left, right) => left.localeCompare(right)
  )

  const actorOptions = Array.from(new Set(events.map((event) => event.username))).sort(
    (left, right) => left.localeCompare(right)
  )

  const windowDurationMs = getWindowDurationMs(selectedWindow)
  const mostRecentEventTimestamp = events.reduce<number | null>((latest, event) => {
    const parsed = Date.parse(event.createdAt)
    if (!Number.isFinite(parsed)) {
      return latest
    }

    if (latest === null || parsed > latest) {
      return parsed
    }

    return latest
  }, null)
  const threshold =
    windowDurationMs === null || mostRecentEventTimestamp === null
      ? null
      : mostRecentEventTimestamp - windowDurationMs

  const normalizedKeyword = keyword.trim().toLowerCase()

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        if (selectedEventType !== 'all' && event.eventType !== selectedEventType) {
          return false
        }

        if (selectedActor !== 'all' && event.username !== selectedActor) {
          return false
        }

        if (threshold !== null) {
          const createdAt = Date.parse(event.createdAt)
          if (Number.isFinite(createdAt) && createdAt < threshold) {
            return false
          }
        }

        if (normalizedKeyword) {
          const searchable =
            `${event.eventType} ${event.username} ${event.detail || ''}`.toLowerCase()
          if (!searchable.includes(normalizedKeyword)) {
            return false
          }
        }

        return true
      }),
    [events, normalizedKeyword, selectedActor, selectedEventType, threshold]
  )

  const groupedEvents = groupByDay(filteredEvents)

  const handleResultsScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!hasMore || isLoading || isLoadingMore) {
      return
    }

    const element = event.currentTarget
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight
    if (remaining > HISTORY_SCROLL_THRESHOLD_PX) {
      return
    }

    void fetchHistoryPage(loadedCount, true)
  }

  const handleSavePreset = () => {
    const normalizedName = presetName.trim()
    if (!normalizedName) {
      return
    }

    const nextPreset: HistoryFilterPreset = {
      name: normalizedName,
      eventType: selectedEventType,
      actor: selectedActor,
      window: selectedWindow,
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

  const handleApplyPreset = (preset: HistoryFilterPreset) => {
    setSelectedEventType(preset.eventType)
    setSelectedActor(preset.actor)
    setSelectedWindow(preset.window)
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

      if (!parsed || parsed.panel !== 'history' || parsed.scope !== userScope) {
        setPresetFeedback('Import payload does not match this user history scope.')
        return
      }

      if (!Array.isArray(parsed.presets)) {
        setPresetFeedback('Import payload is missing presets.')
        return
      }

      const normalizedPresets = parsed.presets
        .filter((candidate): candidate is HistoryFilterPreset => {
          if (!candidate || typeof candidate !== 'object') {
            return false
          }

          const preset = candidate as Partial<HistoryFilterPreset>
          return (
            typeof preset.name === 'string' &&
            typeof preset.eventType === 'string' &&
            typeof preset.actor === 'string' &&
            typeof preset.window === 'string' &&
            ['1h', '6h', '24h', '7d', 'all'].includes(preset.window)
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

  return (
    <section className="knowledge-panel knowledge-panel--compact" data-testid="history-panel">
      <header className="knowledge-panel-header">
        <div>
          <p className="knowledge-panel-eyebrow">Knowledge</p>
          <h3 className="knowledge-panel-title">History</h3>
        </div>
        <span className="knowledge-panel-badge">
          {role === 'DM' ? 'Live timeline' : 'Read only'}
        </span>
      </header>

      <p className="knowledge-panel-copy">
        Session lifecycle events and participation history from the persisted session log.
      </p>

      <div className="knowledge-panel-search">
        <label className="knowledge-panel-search-label" htmlFor="history-keyword-search">
          Search
        </label>
        <input
          id="history-keyword-search"
          type="search"
          value={keyword}
          placeholder="Find by event, actor, or detail"
          onChange={(event) => setKeyword(event.target.value)}
        />
      </div>

      <div className="knowledge-panel-toolbar" aria-label="History filters">
        <label className="knowledge-panel-filter-field">
          <span>Event type</span>
          <select
            aria-label="Event type"
            value={selectedEventType}
            onChange={(event) => setSelectedEventType(event.target.value)}
          >
            <option value="all">All events</option>
            {eventTypeOptions.map((eventType) => (
              <option key={eventType} value={eventType}>
                {formatEventLabel(eventType)}
              </option>
            ))}
          </select>
        </label>

        <label className="knowledge-panel-filter-field">
          <span>Actor</span>
          <select
            aria-label="Actor"
            value={selectedActor}
            onChange={(event) => setSelectedActor(event.target.value)}
          >
            <option value="all">All actors</option>
            {actorOptions.map((actor) => (
              <option key={actor} value={actor}>
                {actor}
              </option>
            ))}
          </select>
        </label>

        <label className="knowledge-panel-filter-field">
          <span>Time window</span>
          <select
            aria-label="Time window"
            value={selectedWindow}
            onChange={(event) => setSelectedWindow(event.target.value as HistoryWindow)}
          >
            <option value="1h">Last hour</option>
            <option value="6h">Last 6 hours</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="all">All time</option>
          </select>
        </label>
      </div>

      <div className="knowledge-panel-presets" aria-label="History presets">
        <div className="knowledge-panel-presets-save-row">
          <input
            type="text"
            aria-label="History preset name"
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
            aria-label="History preset export"
            readOnly
            className="knowledge-panel-presets-json"
            value={exportPayload}
          />
        </label>

        <label className="knowledge-panel-filter-field">
          <span>Preset import (same user)</span>
          <textarea
            aria-label="History preset import"
            className="knowledge-panel-presets-json"
            value={importPayload}
            placeholder="Paste a history preset export JSON payload"
            onChange={(event) => setImportPayload(event.target.value)}
          />
        </label>

        {presetFeedback ? <p className="knowledge-panel-meta">{presetFeedback}</p> : null}

        {savedPresets.length > 0 ? (
          <div
            className="knowledge-panel-presets-list"
            role="list"
            aria-label="Saved history presets"
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

      {!isLoading ? (
        <p className="knowledge-panel-meta">
          Showing {filteredEvents.length} filtered events from {loadedCount} loaded.
        </p>
      ) : null}

      {isLoading ? <p className="knowledge-panel-meta">Loading timeline…</p> : null}
      {error ? <p className="knowledge-panel-error">{error}</p> : null}

      {!isLoading && filteredEvents.length === 0 ? (
        <div className="knowledge-panel-empty">
          <p>No history events match the active filters.</p>
        </div>
      ) : (
        <div
          className="knowledge-panel-results knowledge-panel-results--scroll"
          aria-label="History events"
          onScroll={handleResultsScroll}
        >
          {groupedEvents.map((group) => (
            <section key={group.dayLabel} className="knowledge-panel-group" role="group">
              <h4 className="knowledge-panel-group-title">{group.dayLabel}</h4>
              <div role="list" aria-label={`History events for ${group.dayLabel}`}>
                {group.items.map((event) => (
                  <article key={event.id} className="knowledge-panel-card timeline" role="listitem">
                    <div className="knowledge-panel-card-header">
                      <div>
                        <p className="knowledge-panel-card-title">
                          {formatEventLabel(event.eventType)}
                        </p>
                        <p className="knowledge-panel-card-subtitle">
                          {event.username} • {new Date(event.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <span className="knowledge-panel-chip">{event.eventType}</span>
                    </div>
                    <p className="knowledge-panel-card-body">
                      {event.detail || 'No additional detail.'}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ))}

          {isLoadingMore ? <p className="knowledge-panel-meta">Loading more events…</p> : null}
          {!isLoadingMore && !hasMore ? (
            <p className="knowledge-panel-meta">Reached the end of session history.</p>
          ) : null}
        </div>
      )}
    </section>
  )
}
