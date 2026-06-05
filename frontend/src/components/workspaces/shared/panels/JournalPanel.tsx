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
import { SessionState, type Role, type UUID } from '@shared'
import {
  JOURNAL_AUTO_SAVE_DEBOUNCE_MS,
  JOURNAL_AI_UNAVAILABLE_COPY,
  JOURNAL_TAG,
  getPlayerPerspectiveJournalRoast,
  getRandomJournalDmRoast,
  getSeededJournalDmRoast,
  getSeededJournalPlayerRoast,
} from '@/constants/journal.constants'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { Icon } from '@/components/ui/Icon'
import { TruncatedTextWithTooltip } from '@/components/ui/TruncatedTextWithTooltip'
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
import { openJournalPopout } from '@/utils/route-view'
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
  campaignId?: UUID
  sessionId: UUID
  sessionName?: string
  role: Role
  userId?: UUID
  autoEdit?: boolean
  autoSave?: boolean
  hideHeader?: boolean
  isEditingOverride?: boolean
  saveRequestVersion?: number
  emptyStateContent?: string
  onSaved?: (payload: JournalSavedPayload) => void
}

function JournalEditor({
  apiUrl,
  token,
  campaignId,
  sessionId,
  sessionName,
  role,
  autoEdit = false,
  autoSave = false,
  hideHeader = false,
  isEditingOverride,
  saveRequestVersion = 0,
  emptyStateContent,
  onSaved,
}: JournalEditorProps) {
  const isDm = role === 'DM'
  const resolvedJournalTitle = sessionName ? `${sessionName}` : 'Session Journal'

  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [draft, setDraft] = useState('')
  const [draftHashtagsInput, setDraftHashtagsInput] = useState('')
  const [isEditing, setIsEditing] = useState(() => isDm && autoEdit)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)
  const lastSaveRequestVersionRef = useRef(0)
  const resolvedIsEditing =
    isDm && (typeof isEditingOverride === 'boolean' ? isEditingOverride : isEditing)

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
        const res = await fetch(`${apiUrl}/api/journals/${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!res.ok) {
          return
        }

        const data = (await res.json()) as { journal?: RawNote }
        const journalNote = data.journal

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
      // Use the new /api/journals/:sessionId endpoint for session-specific journal operations
      const res = await fetch(`${apiUrl}/api/journals/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: resolvedJournalTitle,
          content: draft,
          markdown: draft,
          tags: normalizedDraftHashtags,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`)
      }

      const data = (await res.json()) as { journal?: RawNote }
      if (!data.journal) {
        return
      }

      const saved = noteToEntry(data.journal, sessionName, sessionId)
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
    if (!autoSave || !isDm || isLoading || !resolvedIsEditing || isSaving || !hasUnsavedChanges) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void handleSave()
    }, JOURNAL_AUTO_SAVE_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [autoSave, handleSave, hasUnsavedChanges, isDm, isLoading, isSaving, resolvedIsEditing])

  useEffect(() => {
    if (!isDm || saveRequestVersion <= lastSaveRequestVersionRef.current) {
      return
    }

    lastSaveRequestVersionRef.current = saveRequestVersion
    void handleSave()
  }, [handleSave, isDm, saveRequestVersion])

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
  const hasDraftMarkdown = draft.trim().length > 0
  const resolvedMarkdown =
    hasDraftMarkdown || resolvedIsEditing
      ? draft
      : entry?.markdown?.trim().length
        ? entry.markdown
        : (emptyStateContent ?? '')

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
              {lastUpdated && !resolvedIsEditing ? (
                <p className="knowledge-panel-copy knowledge-panel-copy--meta-inline">
                  Last updated {lastUpdated}
                </p>
              ) : null}
            </div>
          </div>
          <div className="cip-inline-actions" aria-label="Journal actions">
            <TooltipProvider delayDuration={140}>
              {isDm && resolvedIsEditing ? (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="session-icon-action session-icon-action--icon"
                        aria-label={isSaving ? 'Saving journal' : 'Save journal'}
                        onClick={() => void handleSave()}
                        disabled={isSaving}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          {isSaving ? 'hourglass_top' : 'save'}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Save journal</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="session-icon-action session-icon-action--icon"
                        aria-label="Cancel editing journal"
                        onClick={handleCancel}
                        disabled={isSaving}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          undo
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Cancel editing</TooltipContent>
                  </Tooltip>
                </>
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="session-icon-action session-icon-action--icon"
                    aria-label="Pop out journal"
                    onClick={() => openJournalPopout(sessionId, token, apiUrl)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      open_in_new
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Open in separate window</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </header>
      ) : null}

      {saveError ? (
        <p className="knowledge-panel-copy knowledge-panel-copy--error">{saveError}</p>
      ) : null}

      <MarkdownEditor
        value={resolvedMarkdown}
        onChange={setDraft}
        placeholder={
          isDm
            ? 'Write your session journal here — what happened, who was there, what changed…'
            : playerFacingRoast
        }
        readOnly={!isDm || !resolvedIsEditing}
        variant="full"
        insertActions={isDm && resolvedIsEditing ? insertActions : []}
      />

      <div className="knowledge-panel__journal-meta">
        {resolvedIsEditing ? (
          <>
            <div className="knowledge-panel__journal-tag-row-wrap">
              <input
                className="knowledge-panel__journal-tag-input knowledge-panel__journal-tag-input--wide"
                value={draftHashtagsInput}
                onChange={(event) => setDraftHashtagsInput(event.target.value)}
                onKeyDown={handleHashtagInputKeyDown}
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
  campaignId?: UUID
  role: Role
  sessions: Session[]
  selectedSessionId: UUID | null
  onSessionChange: (sessionId: UUID) => void
}

function JournalBrowser({
  apiUrl,
  token,
  campaignId,
  role,
  sessions,
  selectedSessionId,
  onSessionChange,
}: JournalBrowserProps) {
  const isDm = role === 'DM'
  const currentSessionId = useStore((state) => state.currentSessionId)
  const [journalStatusBySession, setJournalStatusBySession] = useState<
    Record<string, SessionJournalStatus>
  >({})
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)
  const [editingSessionId, setEditingSessionId] = useState<UUID | null>(null)
  const [saveRequestVersionBySession, setSaveRequestVersionBySession] = useState<
    Record<string, number>
  >({})
  // Track every session whose editor has been mounted; keep it mounted (hidden) thereafter
  // so re-expanding a card doesn't trigger a second fetch.
  const [mountedEditorIds, setMountedEditorIds] = useState<Set<string>>(new Set())

  const updateJournalStatus = useCallback((sessionId: UUID, nextStatus: SessionJournalStatus) => {
    setJournalStatusBySession((current) => ({
      ...current,
      [sessionId]: nextStatus,
    }))
  }, [])

  const eligibleSessions = useMemo(
    () =>
      sessions.filter(
        (session) =>
          session.id !== currentSessionId &&
          (session.state === SessionState.ENDED || session.state === SessionState.CLEANUP)
      ),
    [currentSessionId, sessions]
  )
  const sortedSessions = useMemo(
    () => [...eligibleSessions].sort((left, right) => right.createdAt - left.createdAt),
    [eligibleSessions]
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
  const recentSessionsStatusKey = useMemo(
    () =>
      recentSessions
        .map(
          (session) =>
            `${session.id}:${session.createdAt}:${session.startedAt ?? ''}:${session.endedAt ?? ''}`
        )
        .join('|'),
    [recentSessions]
  )

  // When a session is selected, register its editor for keep-alive mounting.
  useEffect(() => {
    if (!effectiveSessionId) {
      return
    }
    setMountedEditorIds((prev) => {
      if (prev.has(effectiveSessionId)) {
        return prev
      }
      const next = new Set(prev)
      next.add(effectiveSessionId)
      return next
    })
  }, [effectiveSessionId])

  const getSessionRunDateLabel = useCallback((session: Session): string => {
    const sessionRunTimestamp = session.endedAt ?? session.startedAt ?? session.createdAt
    return new Date(sessionRunTimestamp).toLocaleDateString()
  }, [])

  const getDmRoastOptions = useCallback((seed: string): string[] => {
    const options = new Set<string>()

    for (let index = 0; index < 200 && options.size < 50; index += 1) {
      options.add(getSeededJournalDmRoast(`${seed}:${index}`))
    }

    return [...options]
  }, [])

  const handleToggleEditSelected = useCallback(() => {
    if (!isDm || !effectiveSessionId) {
      return
    }

    if (editingSessionId === effectiveSessionId) {
      setSaveRequestVersionBySession((current) => ({
        ...current,
        [effectiveSessionId]: (current[effectiveSessionId] ?? 0) + 1,
      }))
      setEditingSessionId(null)
      return
    }

    setEditingSessionId(effectiveSessionId)
  }, [editingSessionId, effectiveSessionId, isDm])

  const handleCancelEditSelected = useCallback(() => {
    setEditingSessionId(null)
  }, [])

  useEffect(() => {
    let cancelled = false

    if (recentSessions.length === 0) {
      return () => {
        cancelled = true
      }
    }

    const loadStatuses = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/journals/status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            campaignId,
            sessionIds: recentSessions.map((s) => s.id),
          }),
        })

        if (!res.ok) {
          return
        }

        const data = (await res.json()) as {
          statuses?: Record<
            string,
            {
              hasJournal: boolean
              hasContent: boolean
              hashtags: string[]
              journalTitle?: string
              journalUpdatedAt?: number
              needsRecap?: boolean
            }
          >
          statusList?: Array<{
            sessionId?: string
            hasJournal?: boolean
            hasContent?: boolean
            hashtags?: string[]
            tags?: string[]
            journalTitle?: string
            title?: string
            journalUpdatedAt?: number
            updatedAt?: number
            needsRecap?: boolean
          }>
          journals?: Record<
            string,
            {
              hasJournal?: boolean
              hasContent?: boolean
              hashtags?: string[]
              tags?: string[]
              journalTitle?: string
              title?: string
              journalUpdatedAt?: number
              updatedAt?: number
              needsRecap?: boolean
            }
          >
        }

        if (!cancelled) {
          const incomingStatuses = data.statuses ?? data.journals ?? {}
          const statusListMap = (data.statusList ?? []).reduce<
            Record<
              string,
              {
                hasJournal?: boolean
                hasContent?: boolean
                hashtags?: string[]
                tags?: string[]
                journalTitle?: string
                title?: string
                journalUpdatedAt?: number
                updatedAt?: number
                needsRecap?: boolean
              }
            >
          >((accumulator, entry) => {
            const sessionId = entry.sessionId
            if (!sessionId) {
              return accumulator
            }

            accumulator[sessionId] = entry
            return accumulator
          }, {})

          const resolvedIncoming = {
            ...incomingStatuses,
            ...statusListMap,
          }

          const normalizeStatus = (rawStatus?: {
            hasJournal?: boolean
            hasContent?: boolean
            hashtags?: string[]
            tags?: string[]
            journalTitle?: string
            title?: string
            journalUpdatedAt?: number
            updatedAt?: number
            needsRecap?: boolean
          }): SessionJournalStatus => {
            if (!rawStatus) {
              return {
                hasJournal: false,
                hasContent: false,
                hashtags: [],
                journalTitle: undefined,
                journalUpdatedAt: undefined,
                needsRecap: true,
              }
            }

            const hashtags = Array.isArray(rawStatus.hashtags)
              ? rawStatus.hashtags
              : Array.isArray(rawStatus.tags)
                ? rawStatus.tags
                : []
            const hasContent = Boolean(rawStatus.hasContent)
            const hasJournal =
              typeof rawStatus.hasJournal === 'boolean'
                ? rawStatus.hasJournal
                : hasContent || hashtags.length > 0

            return {
              hasJournal,
              hasContent,
              hashtags,
              journalTitle: rawStatus.journalTitle ?? rawStatus.title,
              journalUpdatedAt: rawStatus.journalUpdatedAt ?? rawStatus.updatedAt,
              needsRecap:
                typeof rawStatus.needsRecap === 'boolean' ? rawStatus.needsRecap : !hasContent,
            }
          }

          // Rebuild status entries for current sessions so stale values cannot linger.
          setJournalStatusBySession((prev) => {
            const merged = { ...prev }

            for (const session of recentSessions) {
              const direct = resolvedIncoming[session.id]
              const lower = resolvedIncoming[session.id.toLowerCase()]
              const upper = resolvedIncoming[session.id.toUpperCase()]
              merged[session.id] = normalizeStatus(direct ?? lower ?? upper)
            }

            return merged
          })
        }
      } catch {
        // Non-critical: cards degrade to unknown recap status
      }
    }

    if (campaignId && recentSessions.length > 0) {
      void loadStatuses()
    }

    return () => {
      cancelled = true
    }
  }, [apiUrl, campaignId, recentSessions, recentSessionsStatusKey, token])

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

  const isSelectedSessionEditing = editingSessionId === effectiveSessionId

  if (!effectiveSessionId || !effectiveSession) {
    return (
      <section
        className="knowledge-panel knowledge-panel--compact"
        aria-label="Session journal"
        data-testid="journal-panel"
      >
        <header className="knowledge-panel-header">
          <div>
            <h3 className="knowledge-panel-title">
              <Icon name="journal" />
              Session Journal
            </h3>
            <p className="knowledge-panel-subtitle">
              Capture recaps, tag key moments, and keep session lore searchable.
            </p>
          </div>
        </header>
        <p className="knowledge-panel-empty">
          No ended sessions found yet. The journal appears after a session reaches ENDED or CLEANUP.
        </p>
      </section>
    )
  }

  return (
    <section
      className="knowledge-panel knowledge-panel--compact"
      aria-label="Session journal"
      data-testid="journal-panel"
    >
      <header className="knowledge-panel-header">
        <div>
          <h3 className="knowledge-panel-title">
            <Icon name="journal" />
            Session Journal
          </h3>
          <p className="knowledge-panel-subtitle">
            Capture recaps, tag key moments, and keep session lore searchable.
          </p>
        </div>
        {isDm ? (
          <TooltipProvider delayDuration={140}>
            <div className="cip-inline-actions" aria-label="Journal actions">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="session-icon-action session-icon-action--icon"
                    onClick={handleToggleEditSelected}
                    aria-label={isSelectedSessionEditing ? 'Save journal' : 'Edit journal'}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {isSelectedSessionEditing ? 'save' : 'edit'}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {isSelectedSessionEditing ? 'Save journal' : 'Edit journal'}
                </TooltipContent>
              </Tooltip>
              {isSelectedSessionEditing ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="session-icon-action session-icon-action--icon"
                      onClick={handleCancelEditSelected}
                      aria-label="Cancel editing journal"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        undo
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Cancel editing</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </TooltipProvider>
        ) : null}
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
        <div
          className="knowledge-panel-session-list knowledge-panel-results--scroll"
          role="list"
          aria-label="Recent sessions"
        >
          {visibleSessions.map((session, index) => {
            const isSelected = session.id === effectiveSessionId
            const sessionStatus = journalStatusBySession[session.id]
            const hasContent = Boolean(sessionStatus?.hasContent)
            const needsRecap = sessionStatus?.needsRecap ?? !hasContent
            const isEditorMounted = isSelected || mountedEditorIds.has(session.id)
            const sessionHashtags = sessionStatus?.hashtags ?? []
            const visibleSessionHashtags = sessionHashtags.slice(0, 3)
            const hiddenTagCount = Math.max(
              0,
              sessionHashtags.length - visibleSessionHashtags.length
            )
            const cardTitle = sessionStatus?.journalTitle || session.name
            const cardDate = sessionStatus?.journalUpdatedAt
              ? new Date(sessionStatus.journalUpdatedAt).toLocaleDateString()
              : getSessionRunDateLabel(session)
            const nextSession = index > 0 ? visibleSessions[index - 1] : undefined
            const missingCopy = buildMissingRecapCopy(session, nextSession)
            const selectedRoastOptions = getDmRoastOptions(`${session.id}:${session.name}`)
            const fallbackRoast = selectedRoastOptions[0] ?? getRandomJournalDmRoast()
            const emptyRecapContent = `${missingCopy.cardBody}\n\n> ${fallbackRoast}`

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
                    <div className="knowledge-panel-card-header__left">
                      <TruncatedTextWithTooltip
                        as="h4"
                        className="knowledge-panel-card-title knowledge-panel-card-title--truncate"
                        text={cardTitle}
                      />
                    </div>
                    <div className="knowledge-panel-card-header__right">
                      <div className="knowledge-panel-chip-row">
                        {index === 0 ? <span className="knowledge-panel-chip">Latest</span> : null}
                        {needsRecap ? (
                          <span className="knowledge-panel-chip knowledge-panel-chip--warn">
                            Needs Recap
                          </span>
                        ) : null}
                      </div>
                      <span
                        className="material-symbols-outlined knowledge-panel-card__expand-icon"
                        aria-hidden="true"
                      >
                        {isSelected ? 'expand_less' : 'expand_more'}
                      </span>
                    </div>
                  </div>
                  <div className="knowledge-panel-card-subheader">
                    <p className="knowledge-panel-card-subtitle">{cardDate}</p>
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
                  </div>
                </div>

                {isEditorMounted ? (
                  <div
                    className="knowledge-panel-session-item__editor"
                    hidden={!isSelected || undefined}
                    aria-hidden={!isSelected || undefined}
                  >
                    <JournalEditor
                      key={`journal-editor:${session.id}`}
                      apiUrl={apiUrl}
                      token={token}
                      campaignId={campaignId}
                      sessionId={session.id}
                      sessionName={session.name}
                      role={role}
                      autoSave
                      isEditingOverride={editingSessionId === session.id}
                      saveRequestVersion={saveRequestVersionBySession[session.id] ?? 0}
                      emptyStateContent={!hasContent ? emptyRecapContent : undefined}
                      hideHeader
                      onSaved={({ hasContent: nextHasContent, hasJournal, hashtags }) => {
                        updateJournalStatus(session.id, {
                          hasContent: nextHasContent,
                          hasJournal,
                          hashtags,
                          journalTitle: session.name ? `${session.name}` : 'Session Journal',
                          journalUpdatedAt: Date.now(),
                          needsRecap: !nextHasContent,
                        })
                      }}
                    />
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
  campaignId?: UUID
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
  campaignId?: UUID
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
        campaignId={props.campaignId}
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
      campaignId={props.campaignId}
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
