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
import {
  MarkdownEditor,
  type MarkdownEditorInsertAction,
} from '@/components/workspaces/shared/panels/MarkdownEditor'
import type { JournalEntry, JournalSavedPayload, RawNote } from '@/types/journalPanel'
import { openJournalPopout } from '@/utils/route-view'
import {
  appendJournalHashtagInput,
  buildContentHashtagSuggestions,
  buildHashtagFallbackSeed,
  buildHashtagSuggestions,
  collectJournalHashtags,
  getPendingJournalHashtag,
  noteToEntry,
  parseJournalHashtags,
  serializeJournalHashtags,
} from '@/utils/journalPanel'
import { useStore } from '@/hooks/useStore'
import { useToast } from '@/hooks/useToast'

export interface JournalEditorProps {
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

export function JournalEditor({
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
        id: 'insert-roast',
        icon: 'theater_comedy',
        label: 'Insert roast',
        children: [
          {
            id: 'insert-dm-roast',
            icon: 'theater_comedy',
            label: 'Roast DM',
            onSelect: handleInsertDmRoast,
          },
          {
            id: 'insert-player-roast',
            icon: 'mood',
            label: 'Roast Players',
            onSelect: handleInsertPlayerRoast,
          },
        ],
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
