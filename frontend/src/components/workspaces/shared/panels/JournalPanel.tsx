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

import { useCallback, useEffect, useState } from 'react'
import type { Role, UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import { useStore } from '@/hooks/useStore'
import { MarkdownEditor } from '@/components/workspaces/shared/panels/MarkdownEditor'
import '@/styles/components/workspaces/shared/panels/KnowledgePanels.css'
import '@/styles/components/workspaces/shared/panels/MarkdownEditor.css'

interface JournalPanelProps {
  apiUrl: string
  token: string
  sessionId: UUID
  sessionName?: string
  role: Role
  userId?: UUID
  autoEdit?: boolean
}

interface JournalEntry {
  id: string
  name: string
  hashtag: string
  markdown: string
  updatedAt: number
  authorUsername?: string
}

// Shape returned by the current notes API (legacy NoteEntity)
interface RawNote {
  id: string
  title?: string
  content?: string
  // new contract fields (may not exist yet on backend)
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

const JOURNAL_TAG = '_journal'

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

function extractJournalHashtag(
  tags: string[] | undefined,
  sessionName?: string,
  sessionId?: UUID
): string {
  const journalHashtag = (tags ?? []).find((tag) => tag !== JOURNAL_TAG)
  return normalizeJournalHashtag(
    journalHashtag || '',
    buildDefaultJournalHashtag(sessionName, sessionId).slice(1)
  )
}

function noteToEntry(note: RawNote, sessionName?: string, sessionId?: UUID): JournalEntry {
  return {
    id: note.id,
    name: note.name ?? note.title ?? 'Session Journal',
    hashtag: extractJournalHashtag(note.tags, sessionName, sessionId),
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
}: JournalPanelProps) {
  const isDm = role === 'DM'

  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [draft, setDraft] = useState<string>('')
  const [draftName, setDraftName] = useState<string>('')
  const [draftHashtag, setDraftHashtag] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)

  const addNote = useStore((state) => state.addNote)

  // ── Load journal entry for this session ──────────────────────────
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setIsLoading(true)
      setSaveError(null)
      try {
        // Future: GET /api/journal/:sessionId
        const res = await fetch(`${apiUrl}/api/notes/${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return

        const data = (await res.json()) as { notes?: RawNote[] }
        const notes = data.notes ?? []

        // Find the note tagged as the session journal
        const journalNote = notes.find(
          (n) => n.tags?.includes(JOURNAL_TAG) || n.title === 'Session Journal'
        )

        if (!cancelled) {
          if (journalNote) {
            const mapped = noteToEntry(journalNote, sessionName, sessionId)
            setEntry(mapped)
            setDraft(mapped.markdown)
            setDraftName(mapped.name)
            setDraftHashtag(mapped.hashtag)
          } else {
            // No journal note yet — seed an empty draft
            const defaultName = sessionName ? `Journal — ${sessionName}` : 'Session Journal'
            setEntry(null)
            setDraft('')
            setDraftName(defaultName)
            setDraftHashtag(buildDefaultJournalHashtag(sessionName, sessionId))
          }
        }
      } catch {
        // Non-critical: editor still usable
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [apiUrl, token, sessionId, sessionName])

  useEffect(() => {
    setIsEditing(isDm && autoEdit)
  }, [autoEdit, isDm, sessionId])

  // ── Save (create or update) ──────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!isDm) return
    setIsSaving(true)
    setSaveError(null)
    const normalizedHashtag = normalizeJournalHashtag(
      draftHashtag,
      buildDefaultJournalHashtag(sessionName, sessionId).slice(1)
    )

    try {
      let res: Response

      if (entry) {
        // Update existing note
        // Future: PUT /api/journal/:sessionId
        res = await fetch(`${apiUrl}/api/notes/${sessionId}/${entry.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: draftName,
            content: draft,
            // new contract fields
            name: draftName,
            markdown: draft,
            tags: [JOURNAL_TAG, normalizedHashtag],
          }),
        })
      } else {
        // Create new journal note
        res = await fetch(`${apiUrl}/api/notes/${sessionId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: draftName,
            content: draft,
            // new contract fields
            name: draftName,
            markdown: draft,
            visibility: 'PLAYERS_VISIBLE',
            tags: [JOURNAL_TAG, normalizedHashtag],
          }),
        })
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`)
      }

      const data = (await res.json()) as { note?: RawNote }
      if (data.note) {
        const saved = noteToEntry(data.note, sessionName, sessionId)
        setEntry(saved)
        setDraft(saved.markdown)
        setDraftName(saved.name)
        setDraftHashtag(saved.hashtag)
        // Sync into notes store so other panels see it
        addNote(sessionId, {
          id: saved.id as UUID,
          ownerId: undefined,
          ownerUsername: saved.authorUsername,
          title: saved.name,
          content: saved.markdown,
          visibility: 'PLAYERS_VISIBLE' as any,
          tags: [JOURNAL_TAG, saved.hashtag],
          allowedUsers: [],
          createdAt: saved.updatedAt,
          updatedAt: saved.updatedAt,
        })
      }

      setIsEditing(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save journal')
    } finally {
      setIsSaving(false)
    }
  }, [apiUrl, token, sessionId, entry, draft, draftName, draftHashtag, isDm, addNote, sessionName])

  const handleCancel = useCallback(() => {
    if (entry) {
      setDraft(entry.markdown)
      setDraftName(entry.name)
      setDraftHashtag(entry.hashtag)
    } else {
      setDraftHashtag(buildDefaultJournalHashtag(sessionName, sessionId))
    }
    setIsEditing(false)
    setSaveError(null)
  }, [entry, sessionId, sessionName])

  // ── Render ───────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <section className="knowledge-panel" aria-label="Journal" data-testid="journal-panel">
        <p className="knowledge-panel-copy">Loading journal…</p>
      </section>
    )
  }

  const displayName = entry?.name ?? draftName
  const displayHashtag = entry?.hashtag ?? draftHashtag
  const lastUpdated = entry?.updatedAt ? new Date(entry.updatedAt).toLocaleDateString() : null

  return (
    <section className="knowledge-panel" aria-label="Journal" data-testid="journal-panel">
      <header className="knowledge-panel-header">
        <div>
          <p className="knowledge-panel-eyebrow">Session Journal</p>
          {isEditing ? (
            <div className="knowledge-panel__journal-edit-fields">
              <input
                className="knowledge-panel__journal-title-input"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Journal title…"
                maxLength={120}
                aria-label="Journal title"
              />
              <input
                className="knowledge-panel__journal-tag-input"
                value={draftHashtag}
                onChange={(e) => setDraftHashtag(e.target.value)}
                placeholder="#last-session"
                maxLength={64}
                aria-label="Journal hashtag"
              />
            </div>
          ) : (
            <h3 className="knowledge-panel-title">
              <Icon name="journal" />
              {displayName || 'Session Journal'}
            </h3>
          )}
          <div className="knowledge-panel-chip-row">
            {displayHashtag ? (
              <span className="knowledge-panel-chip muted">{displayHashtag}</span>
            ) : null}
            {lastUpdated && !isEditing ? (
              <p className="knowledge-panel-copy knowledge-panel-copy--meta-inline">
                Last updated {lastUpdated}
              </p>
            ) : null}
          </div>
        </div>

        {isDm && !isEditing && (
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
        )}
      </header>

      {saveError && <p className="knowledge-panel-copy knowledge-panel-copy--error">{saveError}</p>}

      <MarkdownEditor
        value={draft}
        onChange={setDraft}
        placeholder={
          isDm
            ? 'Write your session journal here — what happened, who was there, what changed…'
            : 'No journal entry yet.'
        }
        readOnly={!isDm || !isEditing}
        variant="full"
      />

      {isDm && isEditing && (
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
      )}

      {!isDm && !entry && (
        <p className="knowledge-panel-copy">The DM has not written a session journal entry yet.</p>
      )}
    </section>
  )
}
