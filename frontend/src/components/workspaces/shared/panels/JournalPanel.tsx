/**
 * JournalPanel
 *
 * Unified journal component used in both the editor workspace (browser mode)
 * and the live session workspace (focused mode).
 *
 * Browser mode: pass `sessions`, `selectedSessionId`, `onSessionChange` →
 *   multi-session journal browser with recap status tracking and hashtag filtering.
 *
 * Focused mode: pass `sessionId` (no `sessions`) →
 *   single-session journal editor/viewer rendered directly, browser UI suppressed.
 *
 * Current backing: notes store (legacy NoteEntity shape).
 * Future: dedicated SessionJournal API (GET/PUT /api/journal/:sessionId).
 * See: docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Role, type UUID } from '@shared'
import {
  JOURNAL_AUTO_SAVE_DEBOUNCE_MS,
  JOURNAL_AI_UNAVAILABLE_COPY,
  JOURNAL_TAG,
  getPlayerPerspectiveJournalRoast,
  getRandomJournalDmRoast,
  getSeededJournalPlayerRoast,
} from '@/constants/journal.constants'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { Icon } from '@/components/ui/Icon'
import { useStore } from '@/hooks/useStore'
import { useToast } from '@/hooks/useToast'
import {
  MarkdownEditor,
  type MarkdownEditorInsertAction,
} from '@/components/workspaces/shared/panels/MarkdownEditor'
import type {
  JournalEntry,
  JournalSavedPayload,
  OptimisticSessionSelection,
  RawNote,
  SessionJournalStatus,
} from '@/types/journalPanel'
import type { Session } from '@/types/session'
import {
  appendJournalHashtagInput,
  buildContentHashtagSuggestions,
  buildHashtagFallbackSeed,
  buildHashtagSuggestions,
  buildMissingRecapCopy,
  collectJournalHashtags,
  getPendingJournalHashtag,
  normalizeCardHashtag,
  noteToEntry,
  parseJournalHashtags,
  serializeJournalHashtags,
} from '@/utils/journalPanel'
import '@/styles/components/workspaces/shared/panels/KnowledgePanels.css'
import '@/styles/components/workspaces/shared/panels/MarkdownEditor.css'

// ---------------------------------------------------------------------------
// JournalEditor — single-session editor / viewer (internal)
// ---------------------------------------------------------------------------

interface JournalEditorProps {
  apiUrl: string
  token: string
  sessionId: UUID
  sessionName?: string
  role: Role
  userId?: UUID
  autoEdit?: boolean
  autoSave?: boolean
  hideHeader?: boolean
  onSaved?: (payload: JournalSavedPayload) => void
}

function JournalEditor({
  apiUrl,
  token,
  sessionId,
  sessionName,
  role,
  autoEdit = false,
  autoSave = false,
  hideHeader = false,
  onSaved,
}: JournalEditorProps) {
  const isDm = role === 'DM'
  const resolvedJournalTitle = sessionName ? `Journal - ${sessionName}` : 'Session Journal'

  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [draft, setDraft] = useState('')
  const [draftHashtagsInput, setDraftHashtagsInput] = useState('')
  const [isEditing, setIsEditing] = useState(() => isDm && autoEdit)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)

  const addNote = useStore((state) => state.addNote)
  const hashtagFallbackSeed = useMemo(() => buildHashtagFallbackSeed(sessionId), [sessionId])
  const hashtagSuggestions = useMemo(
    () => buildHashtagSuggestions(sessionName, sessionId),
    [sessionId, sessionName]
  )
  const contentHashtagSuggestions = useMemo(() => buildContentHashtagSuggestions(draft), [draft])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/notes/${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!res.ok) {
          return
        }

        const data = (await res.json()) as { notes?: RawNote[] }
        const notes = data.notes ?? []
        const journalNote = notes.find(
          (note) =>
            note.tags?.includes(JOURNAL_TAG) ||
            note.title === 'Session Journal' ||
            note.title === resolvedJournalTitle
        )

        if (cancelled) {
          return
        }

        if (journalNote) {
          const mapped = noteToEntry(journalNote, sessionName, sessionId)
          setEntry(mapped)
          setDraft(mapped.markdown)
          setDraftHashtagsInput(serializeJournalHashtags(mapped.hashtags))
        } else {
          setEntry(null)
          setDraft('')
          setDraftHashtagsInput('')
        }
      } catch {
        // Non-critical: editor still usable
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [apiUrl, token, sessionId, sessionName, resolvedJournalTitle])

  const normalizedDraftHashtags = parseJournalHashtags(draftHashtagsInput, hashtagFallbackSeed)
  const hasDraftContent = draft.trim().length > 0
  const normalizedDraftHashtagsValue = serializeJournalHashtags(normalizedDraftHashtags)
  const hasUnsavedChanges = entry
    ? draft !== entry.markdown ||
      normalizedDraftHashtagsValue !== serializeJournalHashtags(entry.hashtags)
    : hasDraftContent || normalizedDraftHashtags.length > 0

  const handleSave = useCallback(async () => {
    if (!isDm || isSaving || !hasUnsavedChanges) {
      return
    }

    setIsSaving(true)
    setSaveError(null)

    try {
      let res: Response

      if (entry) {
        res = await fetch(`${apiUrl}/api/notes/${entry.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: resolvedJournalTitle,
            name: resolvedJournalTitle,
            content: draft,
            markdown: draft,
            tags: [JOURNAL_TAG, ...normalizedDraftHashtags],
          }),
        })
      } else {
        res = await fetch(`${apiUrl}/api/notes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sessionId,
            title: resolvedJournalTitle,
            name: resolvedJournalTitle,
            content: draft,
            markdown: draft,
            visibility: 'PLAYERS_VISIBLE',
            tags: [JOURNAL_TAG, ...normalizedDraftHashtags],
          }),
        })
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`)
      }

      const data = (await res.json()) as { note?: RawNote }
      if (!data.note) {
        return
      }

      const saved = noteToEntry(data.note, sessionName, sessionId)
      setEntry(saved)

      addNote(sessionId, {
        id: saved.id as UUID,
        ownerId: undefined,
        ownerUsername: saved.authorUsername,
        title: resolvedJournalTitle,
        content: saved.markdown,
        visibility: 'PLAYERS_VISIBLE' as any,
        tags: [JOURNAL_TAG, ...saved.hashtags],
        allowedUsers: [],
        createdAt: saved.updatedAt,
        updatedAt: saved.updatedAt,
      })

      onSaved?.({
        sessionId,
        hasJournal: true,
        hasContent: saved.markdown.trim().length > 0,
        hashtags: saved.hashtags,
      })

      if (!autoEdit) {
        setIsEditing(false)
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save journal')
    } finally {
      setIsSaving(false)
    }
  }, [
    addNote,
    apiUrl,
    autoEdit,
    draft,
    entry,
    hasUnsavedChanges,
    isDm,
    isSaving,
    normalizedDraftHashtags,
    onSaved,
    resolvedJournalTitle,
    sessionId,
    sessionName,
    token,
  ])

  useEffect(() => {
    if (!autoSave || !isDm || isLoading || !isEditing || isSaving || !hasUnsavedChanges) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void handleSave()
    }, JOURNAL_AUTO_SAVE_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [autoSave, handleSave, hasUnsavedChanges, isDm, isEditing, isLoading, isSaving])

  const handleBlurSave = useCallback(
    (event?: React.FocusEvent<HTMLElement>) => {
      if (!autoSave || !isDm || isSaving || !hasUnsavedChanges) {
        return
      }

      const nextTarget = event?.relatedTarget
      if (nextTarget instanceof Node && event?.currentTarget.contains(nextTarget)) {
        return
      }

      void handleSave()
    },
    [autoSave, handleSave, hasUnsavedChanges, isDm, isSaving]
  )

  const handleCancel = useCallback(() => {
    if (entry) {
      setDraft(entry.markdown)
      setDraftHashtagsInput(serializeJournalHashtags(entry.hashtags))
    } else {
      setDraft('')
      setDraftHashtagsInput('')
    }

    setIsEditing(false)
    setSaveError(null)
  }, [entry])

  const showToast = useToast()

  const handleAskAi = useCallback(() => {
    showToast({ message: JOURNAL_AI_UNAVAILABLE_COPY })
  }, [showToast])

  const handleInsertDmRoast = useCallback(async () => {
    return `> ${getRandomJournalDmRoast()}`
  }, [])

  const handleInsertPlayerRoast = useCallback(async () => {
    return `> ${getSeededJournalPlayerRoast(`${sessionId}:${draft}`, sessionName)}`
  }, [draft, sessionId, sessionName])

  const handleApplyTagHelp = useCallback(() => {
    const existingTags = collectJournalHashtags(draftHashtagsInput, hashtagFallbackSeed)
    const nextTags = [...contentHashtagSuggestions, ...hashtagSuggestions]
      .filter((tag, index, tags) => tags.indexOf(tag) === index)
      .filter((tag) => !existingTags.includes(tag))
      .slice(0, 4)

    if (nextTags.length === 0) {
      return
    }

    const mergedTags = nextTags.reduce(
      (currentValue, tag) => appendJournalHashtagInput(currentValue, tag, hashtagFallbackSeed),
      draftHashtagsInput
    )

    setDraftHashtagsInput(mergedTags)
  }, [contentHashtagSuggestions, draftHashtagsInput, hashtagFallbackSeed, hashtagSuggestions])

  const mergedHashtagSuggestions = useMemo(
    () =>
      [...contentHashtagSuggestions, ...hashtagSuggestions].filter(
        (tag, index, tags) => tags.indexOf(tag) === index
      ),
    [contentHashtagSuggestions, hashtagSuggestions]
  )
  const pendingHashtag = useMemo(
    () => getPendingJournalHashtag(draftHashtagsInput),
    [draftHashtagsInput]
  )
  const pendingHashtagQuery = useMemo(
    () => pendingHashtag.trim().replace(/^#+/, '').toLowerCase(),
    [pendingHashtag]
  )
  const autocompleteHashtagSuggestions = useMemo(() => {
    const committedTags = collectJournalHashtags(
      /\s$/.test(draftHashtagsInput)
        ? draftHashtagsInput.trim()
        : draftHashtagsInput.trimEnd().replace(/\S+$/, '').trim(),
      hashtagFallbackSeed
    )

    return mergedHashtagSuggestions
      .filter((tag) => !committedTags.includes(tag))
      .filter((tag) => {
        if (!pendingHashtagQuery) {
          return true
        }

        return tag.slice(1).includes(pendingHashtagQuery)
      })
      .slice(0, 6)
  }, [draftHashtagsInput, hashtagFallbackSeed, mergedHashtagSuggestions, pendingHashtagQuery])

  const applyJournalHashtag = useCallback(
    (rawTag: string) => {
      const nextValue = appendJournalHashtagInput(draftHashtagsInput, rawTag, hashtagFallbackSeed)
      setDraftHashtagsInput(nextValue)
    },
    [draftHashtagsInput, hashtagFallbackSeed]
  )

  const handleHashtagInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') {
        return
      }

      const rawTag = pendingHashtag.trim()
      if (!rawTag) {
        return
      }

      event.preventDefault()
      applyJournalHashtag(rawTag)
    },
    [applyJournalHashtag, pendingHashtag]
  )

  const insertActions = useMemo<MarkdownEditorInsertAction[]>(
    () => [
      {
        id: 'insert-dm-roast',
        icon: 'theater_comedy',
        label: 'Insert DM roast',
        onSelect: handleInsertDmRoast,
      },
      {
        id: 'insert-player-roast',
        icon: 'mood',
        label: 'Insert player roast',
        onSelect: handleInsertPlayerRoast,
      },
      {
        id: 'ask-ai',
        icon: 'auto_awesome',
        label: 'Ask AI',
        dividerBefore: true,
        onSelect: () => {
          handleAskAi()
          return ''
        },
      },
    ],
    [handleAskAi, handleInsertDmRoast, handleInsertPlayerRoast]
  )

  const playerFacingRoast = useMemo(
    () => getPlayerPerspectiveJournalRoast(String(sessionId), sessionName),
    [sessionId, sessionName]
  )

  if (isLoading) {
    return (
      <section className="knowledge-panel" aria-label="Journal" data-testid="journal-panel">
        <p className="knowledge-panel-copy">Loading journal…</p>
      </section>
    )
  }

  const displayHashtags = entry?.hashtags ?? normalizedDraftHashtags
  const lastUpdated = entry?.updatedAt ? new Date(entry.updatedAt).toLocaleDateString() : null

  return (
    <section
      className={`knowledge-panel ${hideHeader ? 'knowledge-panel--journal-embedded' : ''}`}
      aria-label="Journal"
      data-testid="journal-panel"
    >
      {!hideHeader ? (
        <header className="knowledge-panel-header">
          <div>
            <h3 className="knowledge-panel-title">{sessionName || 'Session Journal'}</h3>
            <div className="knowledge-panel-chip-row">
              {lastUpdated && !isEditing ? (
                <p className="knowledge-panel-copy knowledge-panel-copy--meta-inline">
                  Last updated {lastUpdated}
                </p>
              ) : null}
            </div>
          </div>

          {isDm && !isEditing ? (
            <button
              type="button"
              className="knowledge-panel-action"
              onClick={() => setIsEditing(true)}
              aria-label="Edit journal"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                edit
              </span>
              Edit
            </button>
          ) : null}
        </header>
      ) : null}

      {saveError ? (
        <p className="knowledge-panel-copy knowledge-panel-copy--error">{saveError}</p>
      ) : null}

      <MarkdownEditor
        value={draft}
        onChange={setDraft}
        onBlur={handleBlurSave}
        placeholder={
          isDm
            ? 'Write your session journal here — what happened, who was there, what changed…'
            : playerFacingRoast
        }
        readOnly={!isDm || !isEditing}
        variant="full"
        insertActions={isDm && isEditing ? insertActions : []}
      />

      <div className="knowledge-panel__journal-meta">
        {isEditing ? (
          <>
            <div className="knowledge-panel__journal-tag-row-wrap">
              <input
                className="knowledge-panel__journal-tag-input knowledge-panel__journal-tag-input--wide"
                value={draftHashtagsInput}
                onChange={(event) => setDraftHashtagsInput(event.target.value)}
                onKeyDown={handleHashtagInputKeyDown}
                onBlur={handleBlurSave}
                placeholder="#recap #loot #npc"
                maxLength={160}
                aria-label="Journal hashtags"
              />
              <TooltipProvider delayDuration={140}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="knowledge-panel__journal-tag-help-btn"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={handleApplyTagHelp}
                      aria-label="Insert Recommended Tags"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        sell
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Insert Recommended Tags</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="knowledge-panel__journal-tag-row">
              {autocompleteHashtagSuggestions.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="knowledge-panel-chip muted"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyJournalHashtag(tag)}
                >
                  {tag}
                </button>
              ))}
              {contentHashtagSuggestions.slice(0, 4).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="knowledge-panel-chip muted"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyJournalHashtag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="knowledge-panel-chip-row">
            {displayHashtags.map((tag) => (
              <span key={tag} className="knowledge-panel-chip muted">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {isDm && isEditing && !autoSave ? (
        <div className="knowledge-panel__journal-actions">
          <button
            type="button"
            className="knowledge-panel-action"
            onClick={() => void handleSave()}
            disabled={isSaving}
            aria-label="Save journal"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="knowledge-panel-action"
            onClick={handleCancel}
            disabled={isSaving}
            aria-label="Cancel editing"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {!isDm && !entry ? <p className="knowledge-panel-copy">{playerFacingRoast}</p> : null}
    </section>
  )
}

// ---------------------------------------------------------------------------
// JournalBrowser — multi-session browser (internal, used by browser mode)
// ---------------------------------------------------------------------------

interface JournalBrowserProps {
  apiUrl: string
  token: string
  role: Role
  sessions: Session[]
  selectedSessionId: UUID | null
  onSessionChange: (sessionId: UUID) => void
}

function JournalBrowser({
  apiUrl,
  token,
  role,
  sessions,
  selectedSessionId,
  onSessionChange,
}: JournalBrowserProps) {
  const [journalStatusBySession, setJournalStatusBySession] = useState<
    Record<string, SessionJournalStatus>
  >({})
  const [closingSessionId, setClosingSessionId] = useState<UUID | null>(null)
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)
  const prevEffectiveSessionIdRef = useRef<UUID | null>(null)

  const updateJournalStatus = useCallback((sessionId: UUID, nextStatus: SessionJournalStatus) => {
    setJournalStatusBySession((current) => ({
      ...current,
      [sessionId]: nextStatus,
    }))
  }, [])

  const sortedSessions = useMemo(
    () => [...sessions].sort((left, right) => right.createdAt - left.createdAt),
    [sessions]
  )
  const fallbackSession = sortedSessions[0] ?? null
  const controlledSessionId = selectedSessionId || fallbackSession?.id || null
  const [optimisticSelection, setOptimisticSelection] = useState<OptimisticSessionSelection | null>(
    controlledSessionId
      ? {
          sessionId: controlledSessionId,
          baselineControlledSessionId: controlledSessionId,
        }
      : null
  )
  const effectiveSessionId =
    optimisticSelection && optimisticSelection.baselineControlledSessionId === controlledSessionId
      ? optimisticSelection.sessionId
      : controlledSessionId
  const effectiveSession =
    sortedSessions.find((session) => session.id === effectiveSessionId) ?? fallbackSession
  const recentSessions = sortedSessions

  useEffect(() => {
    const prev = prevEffectiveSessionIdRef.current
    prevEffectiveSessionIdRef.current = effectiveSessionId ?? null

    if (prev && effectiveSessionId && prev !== effectiveSessionId) {
      setClosingSessionId(prev)
      const timer = window.setTimeout(() => setClosingSessionId(null), 300)
      return () => window.clearTimeout(timer)
    }
  }, [effectiveSessionId])

  useEffect(() => {
    let cancelled = false

    const loadStatuses = async () => {
      const entries = await Promise.all(
        recentSessions.map(async (session) => {
          try {
            const response = await fetch(`${apiUrl}/api/notes/${session.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            })

            if (!response.ok) {
              return [session.id, { hasJournal: false, hasContent: false }] as const
            }

            const data = (await response.json()) as { notes?: RawNote[] }
            const journalNote = (data.notes ?? []).find(
              (note) => note.tags?.includes(JOURNAL_TAG) || note.title === 'Session Journal'
            )
            const markdown = (journalNote?.markdown ?? journalNote?.content ?? '').trim()
            const hashtags = (journalNote?.tags ?? []).filter((tag) => tag !== JOURNAL_TAG)

            return [
              session.id,
              {
                hasJournal: Boolean(journalNote),
                hasContent: markdown.length > 0,
                hashtags,
              },
            ] as const
          } catch {
            return [session.id, { hasJournal: false, hasContent: false, hashtags: [] }] as const
          }
        })
      )

      if (!cancelled) {
        setJournalStatusBySession(Object.fromEntries(entries))
      }
    }

    if (recentSessions.length > 0) {
      void loadStatuses()
    }

    return () => {
      cancelled = true
    }
  }, [apiUrl, token, recentSessions])

  const recapSummary = useMemo(() => {
    const statuses = recentSessions.map((session) => journalStatusBySession[session.id])
    return {
      completed: statuses.filter((status) => status?.hasContent).length,
      missing: statuses.filter((status) => !status?.hasContent).length,
    }
  }, [journalStatusBySession, recentSessions])

  const visibleSessions = useMemo(() => {
    if (!activeTagFilter) {
      return recentSessions
    }

    return recentSessions.filter((session) => {
      const tags = journalStatusBySession[session.id]?.hashtags ?? []
      return tags.some((tag) => normalizeCardHashtag(tag) === activeTagFilter)
    })
  }, [activeTagFilter, journalStatusBySession, recentSessions])

  if (!effectiveSessionId || !effectiveSession) {
    return (
      <section className="knowledge-panel knowledge-panel--compact" aria-label="Campaign journal">
        <header className="knowledge-panel-header">
          <div>
            <h3 className="knowledge-panel-title">
              <Icon name="journal" />
              Campaign Journal
            </h3>
            <p className="knowledge-panel-subtitle">
              Capture recaps, tag key moments, and keep session lore searchable.
            </p>
          </div>
        </header>
        <p className="knowledge-panel-empty">
          No sessions exist yet. Start and complete a session before writing the campaign journal.
        </p>
      </section>
    )
  }

  return (
    <section className="knowledge-panel knowledge-panel--compact" aria-label="Campaign journal">
      <header className="knowledge-panel-header">
        <div>
          <h3 className="knowledge-panel-title">
            <Icon name="journal" />
            Campaign Journal
          </h3>
          <p className="knowledge-panel-subtitle">
            Capture recaps, tag key moments, and keep session lore searchable.
          </p>
        </div>
      </header>

      <div className="knowledge-panel-group">
        <div className="knowledge-panel-group-title">
          <div className="knowledge-panel-chip-row">
            <span className="knowledge-panel-chip muted">
              {recapSummary.completed} done / {recapSummary.missing} need recap
            </span>
            {activeTagFilter ? (
              <button
                type="button"
                className="knowledge-panel-chip muted"
                onClick={() => setActiveTagFilter(null)}
              >
                Filter: {activeTagFilter} x
              </button>
            ) : null}
          </div>
        </div>
        <div className="knowledge-panel-session-list" role="list" aria-label="Recent sessions">
          {visibleSessions.map((session, index) => {
            const isSelected = session.id === effectiveSessionId
            const sessionStatus = journalStatusBySession[session.id]
            const hasContent = Boolean(sessionStatus?.hasContent)
            const isClosing = session.id === closingSessionId
            const sessionHashtags = sessionStatus?.hashtags ?? []
            const visibleSessionHashtags = sessionHashtags.slice(0, 5)
            const hiddenTagCount = Math.max(
              0,
              sessionHashtags.length - visibleSessionHashtags.length
            )
            const nextSession = index > 0 ? visibleSessions[index - 1] : undefined
            const missingCopy = buildMissingRecapCopy(session, nextSession)

            return (
              <div key={session.id} role="listitem" className="knowledge-panel-session-item">
                <div
                  role="button"
                  tabIndex={0}
                  className={`knowledge-panel-card knowledge-panel-card--interactive ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    setOptimisticSelection({
                      sessionId: session.id,
                      baselineControlledSessionId: controlledSessionId,
                    })
                    onSessionChange(session.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') {
                      return
                    }

                    event.preventDefault()
                    setOptimisticSelection({
                      sessionId: session.id,
                      baselineControlledSessionId: controlledSessionId,
                    })
                    onSessionChange(session.id)
                  }}
                  aria-pressed={isSelected}
                >
                  <div className="knowledge-panel-card-header">
                    <div>
                      <h4 className="knowledge-panel-card-title">{session.name}</h4>
                      <p className="knowledge-panel-card-subtitle">
                        {new Date(session.createdAt).toLocaleDateString()}
                      </p>
                      {!hasContent ? (
                        <p className="knowledge-panel-card-body knowledge-panel-card-body--compact">
                          {missingCopy.cardBody}
                        </p>
                      ) : null}
                    </div>
                    <div className="knowledge-panel-card-header__right">
                      <div className="knowledge-panel-chip-row">
                        {index === 0 ? <span className="knowledge-panel-chip">Latest</span> : null}
                        {!hasContent ? (
                          <span className="knowledge-panel-chip knowledge-panel-chip--warn">
                            Needs Recap
                          </span>
                        ) : null}
                        <span
                          className="material-symbols-outlined knowledge-panel-card__expand-icon"
                          aria-hidden="true"
                        >
                          {isSelected ? 'expand_less' : 'expand_more'}
                        </span>
                      </div>
                      {sessionHashtags.length > 0 ? (
                        <div className="knowledge-panel-chip-row knowledge-panel-chip-row--right">
                          {visibleSessionHashtags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              className={`knowledge-panel-chip muted ${
                                activeTagFilter === normalizeCardHashtag(tag)
                                  ? 'knowledge-panel-chip--active'
                                  : ''
                              }`}
                              onClick={(event) => {
                                event.stopPropagation()
                                const normalizedTag = normalizeCardHashtag(tag)
                                setActiveTagFilter((current) =>
                                  current === normalizedTag ? null : normalizedTag
                                )
                                setOptimisticSelection({
                                  sessionId: session.id,
                                  baselineControlledSessionId: controlledSessionId,
                                })
                                onSessionChange(session.id)
                              }}
                              aria-label={`Filter by ${normalizeCardHashtag(tag)}`}
                            >
                              {normalizeCardHashtag(tag)}
                            </button>
                          ))}
                          {hiddenTagCount > 0 ? (
                            <span className="knowledge-panel-card-tags-more muted">
                              {hiddenTagCount} more...
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {isSelected || isClosing ? (
                  <div
                    className={`knowledge-panel-session-item__editor${isClosing ? ' is-closing' : ''}`}
                    aria-hidden={isClosing || undefined}
                  >
                    {isSelected || isClosing ? (
                      <JournalEditor
                        key={`journal-editor:${session.id}`}
                        apiUrl={apiUrl}
                        token={token}
                        sessionId={session.id}
                        sessionName={session.name}
                        role={role}
                        autoEdit
                        autoSave
                        hideHeader
                        onSaved={({ hasContent: nextHasContent, hasJournal, hashtags }) => {
                          updateJournalStatus(session.id, {
                            hasContent: nextHasContent,
                            hasJournal,
                            hashtags,
                          })
                        }}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
          {visibleSessions.length === 0 ? (
            <p className="knowledge-panel-empty">No journals found for {activeTagFilter}.</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// JournalPanel — public API
//
// Browser mode (editor workspace):
//   <JournalPanel sessions={sessions} selectedSessionId={id} onSessionChange={fn} ... />
//
// Focused mode (session workspace — single session, no browser chrome):
//   <JournalPanel sessionId={currentSessionId} sessionName={name} ... />
// ---------------------------------------------------------------------------

type JournalPanelFocusedProps = {
  apiUrl: string
  token: string
  role: Role
  sessions?: undefined
  sessionId: UUID
  sessionName?: string
  userId?: UUID
  autoEdit?: boolean
  autoSave?: boolean
  hideHeader?: boolean
  onSaved?: (payload: JournalSavedPayload) => void
}

type JournalPanelBrowserProps = {
  apiUrl: string
  token: string
  role: Role
  sessions: Session[]
  selectedSessionId: UUID | null
  onSessionChange: (sessionId: UUID) => void
}

export type JournalPanelProps = JournalPanelFocusedProps | JournalPanelBrowserProps

export function JournalPanel(props: JournalPanelProps) {
  if (props.sessions !== undefined) {
    return (
      <JournalBrowser
        apiUrl={props.apiUrl}
        token={props.token}
        role={props.role}
        sessions={props.sessions}
        selectedSessionId={props.selectedSessionId}
        onSessionChange={props.onSessionChange}
      />
    )
  }

  return (
    <JournalEditor
      key={`journal-editor:${props.sessionId}`}
      apiUrl={props.apiUrl}
      token={props.token}
      role={props.role}
      sessionId={props.sessionId}
      sessionName={props.sessionName}
      userId={props.userId}
      autoEdit={props.autoEdit}
      autoSave={props.autoSave}
      hideHeader={props.hideHeader}
      onSaved={props.onSaved}
    />
  )
}
