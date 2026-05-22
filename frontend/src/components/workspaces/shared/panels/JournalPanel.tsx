/**
 * JournalPanel
 *
 * One journal entry per session chapter.
 * - DM gets the MarkdownEditor to author the session journal.
 * - Players and spectators see the rendered read-only view.
 *
 * Current backing: notes store (legacy NoteEntity shape).
 * Future: dedicated SessionJournal API (GET/PUT /api/journal/:sessionId).
 * See: docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Role, UUID } from '@shared'
import {
  JOURNAL_AI_UNAVAILABLE_COPY,
  getPlayerPerspectiveJournalRoast,
  getRandomJournalDmRoast,
} from '@/constants/journal.constants'
import { useStore } from '@/hooks/useStore'
import {
  MarkdownEditor,
  type MarkdownEditorInsertAction,
} from '@/components/workspaces/shared/panels/MarkdownEditor'
import '@/styles/components/workspaces/shared/panels/KnowledgePanels.css'
import '@/styles/components/workspaces/shared/panels/MarkdownEditor.css'

const AUTO_SAVE_DEBOUNCE_MS = 900
const JOURNAL_TAG = '_journal'

interface JournalPanelProps {
  apiUrl: string
  token: string
  sessionId: UUID
  sessionName?: string
  role: Role
  userId?: UUID
  autoEdit?: boolean
  autoSave?: boolean
  hideHeader?: boolean
  onSaved?: (payload: { sessionId: UUID; hasContent: boolean; hasJournal: boolean }) => void
}

interface JournalEntry {
  id: string
  hashtags: string[]
  markdown: string
  updatedAt: number
  authorUsername?: string
}

interface RawNote {
  id: string
  title?: string
  content?: string
  name?: string
  markdown?: string
  tags?: string[]
  visibility?: string
  publishedAt?: number
  createdAt?: number
  updatedAt?: number
  authorId?: string
  authorUsername?: string
}

function normalizeJournalHashtag(value: string, fallbackSeed = 'session-journal'): string {
  const stripped = value.trim().replace(/^#+/, '')
  const normalized = stripped
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')

  return `#${normalized || fallbackSeed}`
}

function buildDefaultJournalHashtag(sessionName?: string, sessionId?: UUID): string {
  const fallbackSeed = sessionId ? `session-${String(sessionId).slice(0, 8)}` : 'session-journal'
  return normalizeJournalHashtag(sessionName || fallbackSeed, fallbackSeed)
}

function parseJournalHashtags(value: string, fallbackSeed: string): string[] {
  const matches = value.match(/#?[a-z0-9][a-z0-9\s_-]*/gi) ?? []
  const normalized = matches
    .map((match) => normalizeJournalHashtag(match, fallbackSeed))
    .filter((tag, index, tags) => tags.indexOf(tag) === index)

  return normalized.length > 0 ? normalized : [normalizeJournalHashtag('', fallbackSeed)]
}

function collectJournalHashtags(value: string, fallbackSeed: string): string[] {
  const matches = value.match(/#?[a-z0-9][a-z0-9\s_-]*/gi) ?? []

  return matches
    .map((match) => normalizeJournalHashtag(match, fallbackSeed))
    .filter((tag, index, tags) => tags.indexOf(tag) === index)
}

function getPendingJournalHashtag(value: string): string {
  const trimmed = value.trimEnd()
  if (!trimmed) {
    return ''
  }

  const segments = trimmed.split(/\s+/)
  return segments[segments.length - 1] ?? ''
}

function commitJournalHashtagInput(
  value: string,
  nextTag: string,
  fallbackSeed: string
): string | null {
  const normalizedTag = normalizeJournalHashtag(nextTag, fallbackSeed)
  const trimmed = value.trimEnd()
  const hasTrailingBoundary = /\s$/.test(value)
  const baseValue =
    !trimmed || hasTrailingBoundary ? trimmed : trimmed.replace(/\S+$/, '').trimEnd()
  const existingTags = collectJournalHashtags(baseValue, fallbackSeed)

  if (existingTags.includes(normalizedTag)) {
    return existingTags.length > 0 ? serializeJournalHashtags(existingTags) : normalizedTag
  }

  return serializeJournalHashtags([...existingTags, normalizedTag])
}

function serializeJournalHashtags(tags: string[]): string {
  return tags.join(' ')
}

function buildHashtagSuggestions(sessionName?: string, sessionId?: UUID): string[] {
  const base = buildDefaultJournalHashtag(sessionName, sessionId)
  const sessionWords = (sessionName ?? '')
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(0, 4)
    .map((token) => normalizeJournalHashtag(token, token))

  return [base, '#recap', '#cliffhanger', '#loot', '#npc', ...sessionWords].filter(
    (tag, index, tags) => tags.indexOf(tag) === index
  )
}

function buildContentHashtagSuggestions(markdown: string): string[] {
  const stopWords = new Set([
    'about',
    'after',
    'again',
    'along',
    'also',
    'been',
    'before',
    'being',
    'between',
    'campaign',
    'could',
    'didnt',
    'from',
    'have',
    'into',
    'journal',
    'last',
    'next',
    'over',
    'party',
    'players',
    'recap',
    'session',
    'some',
    'that',
    'their',
    'them',
    'then',
    'there',
    'they',
    'this',
    'what',
    'when',
    'with',
    'were',
    'your',
  ])

  const counts = new Map<string, number>()
  const tokens = markdown.toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? []

  for (const token of tokens) {
    const normalized = token.replace(/^-+|-+$/g, '')
    if (normalized.length < 4 || stopWords.has(normalized)) {
      continue
    }

    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([token]) => normalizeJournalHashtag(token, token))
}

function extractJournalHashtag(
  tags: string[] | undefined,
  sessionName?: string,
  sessionId?: UUID
): string[] {
  const fallbackSeed = buildDefaultJournalHashtag(sessionName, sessionId).slice(1)
  const journalTags = (tags ?? [])
    .filter((tag) => tag !== JOURNAL_TAG)
    .map((tag) => normalizeJournalHashtag(tag, fallbackSeed))
    .filter((tag, index, allTags) => allTags.indexOf(tag) === index)

  return journalTags.length > 0 ? journalTags : [normalizeJournalHashtag('', fallbackSeed)]
}

function noteToEntry(note: RawNote, sessionName?: string, sessionId?: UUID): JournalEntry {
  return {
    id: note.id,
    hashtags: extractJournalHashtag(note.tags, sessionName, sessionId),
    markdown: note.markdown ?? note.content ?? '',
    updatedAt: note.updatedAt ?? note.createdAt ?? Date.now(),
    authorUsername: note.authorUsername,
  }
}

export function JournalPanel({
  apiUrl,
  token,
  sessionId,
  sessionName,
  role,
  autoEdit = false,
  autoSave = false,
  hideHeader = false,
  onSaved,
}: JournalPanelProps) {
  const isDm = role === 'DM'
  const resolvedJournalTitle = sessionName ? `Journal - ${sessionName}` : 'Session Journal'

  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [draft, setDraft] = useState('')
  const [draftHashtagsInput, setDraftHashtagsInput] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [helperMessage, setHelperMessage] = useState<string | null>(null)

  const addNote = useStore((state) => state.addNote)
  const defaultHashtag = useMemo(
    () => buildDefaultJournalHashtag(sessionName, sessionId),
    [sessionId, sessionName]
  )
  const hashtagSuggestions = useMemo(
    () => buildHashtagSuggestions(sessionName, sessionId),
    [sessionId, sessionName]
  )
  const contentHashtagSuggestions = useMemo(() => buildContentHashtagSuggestions(draft), [draft])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setIsLoading(true)
      setSaveError(null)

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
          setDraftHashtagsInput(defaultHashtag)
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
  }, [apiUrl, token, sessionId, sessionName, defaultHashtag, resolvedJournalTitle])

  useEffect(() => {
    setIsEditing(isDm && autoEdit)
  }, [autoEdit, isDm, sessionId])

  const normalizedDraftHashtags = useMemo(
    () => parseJournalHashtags(draftHashtagsInput, defaultHashtag.slice(1)),
    [defaultHashtag, draftHashtagsInput]
  )
  const hasDraftContent = draft.trim().length > 0
  const hasUnsavedChanges = entry
    ? draft !== entry.markdown ||
      serializeJournalHashtags(normalizedDraftHashtags) !== serializeJournalHashtags(entry.hashtags)
    : hasDraftContent

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
      setDraft(saved.markdown)
      setDraftHashtagsInput(serializeJournalHashtags(saved.hashtags))

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
    }, AUTO_SAVE_DEBOUNCE_MS)

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
      setDraftHashtagsInput(defaultHashtag)
    }

    setIsEditing(false)
    setSaveError(null)
    setHelperMessage(null)
  }, [defaultHashtag, entry])

  const handleAskAi = useCallback(() => {
    setHelperMessage(JOURNAL_AI_UNAVAILABLE_COPY)
  }, [])

  const handleApplyTagHelp = useCallback(() => {
    const nextTags = [...contentHashtagSuggestions, ...hashtagSuggestions]
      .filter((tag, index, tags) => tags.indexOf(tag) === index)
      .slice(0, 4)

    if (nextTags.length === 0) {
      setHelperMessage(
        'No obvious tags yet. Write a sentence first so the panel has something to steal.'
      )
      return
    }

    setDraftHashtagsInput(serializeJournalHashtags(nextTags))
    setHelperMessage(`Suggested tags applied: ${nextTags.join(' ')}`)
  }, [contentHashtagSuggestions, hashtagSuggestions])

  const handleRoastDm = useCallback(() => {
    setHelperMessage(getRandomJournalDmRoast())
  }, [])

  const handleInsertRoast = useCallback(async () => {
    return `> ${getPlayerPerspectiveJournalRoast(`${sessionId}:${draft}`, sessionName)}`
  }, [draft, sessionId, sessionName])

  const mergedHashtagSuggestions = useMemo(
    () =>
      [...contentHashtagSuggestions, ...hashtagSuggestions].filter(
        (tag, index, tags) => tags.indexOf(tag) === index
      ),
    [contentHashtagSuggestions, hashtagSuggestions]
  )
  const hashtagFallbackSeed = defaultHashtag.slice(1)
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
      const nextValue = commitJournalHashtagInput(draftHashtagsInput, rawTag, hashtagFallbackSeed)
      if (!nextValue) {
        return
      }

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
        onSelect: handleInsertRoast,
      },
    ],
    [handleInsertRoast]
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
              className="knowledge-panel-chip"
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
            {autocompleteHashtagSuggestions.length > 0 ? (
              <div className="knowledge-panel-chip-row">
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
              </div>
            ) : null}
            {contentHashtagSuggestions.length > 0 ? (
              <div className="knowledge-panel-chip-row">
                {contentHashtagSuggestions.slice(0, 4).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="knowledge-panel-chip muted"
                    onClick={() => applyJournalHashtag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="knowledge-panel__journal-helper-actions">
              <button type="button" className="knowledge-panel-chip muted" onClick={handleAskAi}>
                Ask AI
              </button>
              <button
                type="button"
                className="knowledge-panel-chip muted"
                onClick={handleApplyTagHelp}
              >
                Help with tags
              </button>
              <button type="button" className="knowledge-panel-chip muted" onClick={handleRoastDm}>
                Roast the DM
              </button>
            </div>
            <p
              className={`knowledge-panel-copy knowledge-panel-copy--meta-inline knowledge-panel__journal-helper-message ${helperMessage ? 'is-visible' : ''}`}
              aria-live="polite"
            >
              {helperMessage ?? ' '}
            </p>
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
            className="knowledge-panel-chip"
            onClick={() => void handleSave()}
            disabled={isSaving}
            aria-label="Save journal"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="knowledge-panel-chip muted"
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
