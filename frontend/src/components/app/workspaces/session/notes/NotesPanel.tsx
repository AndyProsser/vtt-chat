import { useEffect, useMemo, useState } from 'react'
import { NoteVisibility } from '@shared'
import type { UUID, Role } from '@shared'
import { useStore } from '@/hooks/useStore'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import type { Note } from '@/types/notes'
import { fetchSessionNotesOnce } from '@/utils/notesFetch'
import { NoteCard } from './NoteCard'

interface NotesPanelProps {
  apiUrl: string
  token: string
  sessionId: UUID
  user: { id: UUID; username: string; role: Role | string }
}

interface SessionUserSummary {
  id: UUID
  username: string
  role: Role | string
}

export function NotesPanel({ apiUrl, token, sessionId, user }: NotesPanelProps) {
  const notesBySession = useStore((state) => (state.notes as any)[sessionId]) as
    | Record<UUID, Note>
    | undefined
  const addNote = useStore((state) => state.addNote)
  const clearNotes = useStore((state) => state.clearNotes)
  const updateNote = useStore((state) => state.updateNote)
  const deleteNote = useStore((state) => state.deleteNote)
  const notes = useMemo(
    () =>
      Object.values(notesBySession || {}).sort((a, b) => {
        return b.updatedAt - a.updatedAt
      }),
    [notesBySession]
  )

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState<NoteVisibility>(NoteVisibility.PLAYERS_VISIBLE)
  const [tagsText, setTagsText] = useState('')
  const [shareUsers, setShareUsers] = useState<SessionUserSummary[]>([])
  const [selectedShareUserId, setSelectedShareUserId] = useState('')
  const [allowedUsers, setAllowedUsers] = useState<string[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [showPublishedOnly, setShowPublishedOnly] = useState(false)

  const displayedNotes = useMemo(() => {
    if (!showPublishedOnly) return notes
    return notes.filter((note) => !!note.publishedAt)
  }, [notes, showPublishedOnly])

  useEffect(() => {
    let cancelled = false

    const loadNotes = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const notes = await fetchSessionNotesOnce(apiUrl, sessionId, token)
        if (!cancelled) {
          clearNotes(sessionId)
          for (const note of notes) {
            addNote(sessionId, note)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load notes')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadNotes()
    return () => {
      cancelled = true
    }
  }, [addNote, apiUrl, clearNotes, sessionId, token])

  useEffect(() => {
    let cancelled = false

    const loadShareUsers = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/session/${sessionId}/members`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!res.ok) {
          return
        }

        const data = await res.json()
        if (!cancelled) {
          const users = Array.isArray(data.users) ? data.users : []
          setShareUsers(users.filter((u: SessionUserSummary) => u.id !== user.id))
        }
      } catch {
        if (!cancelled) {
          setShareUsers([])
        }
      }
    }

    void loadShareUsers()
    return () => {
      cancelled = true
    }
  }, [apiUrl, token, sessionId, user.id])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsCreating(true)

    try {
      const tags = tagsText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)

      const res = await fetch(`${apiUrl}/api/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          title,
          content,
          visibility,
          tags,
          allowedUsers: visibility === NoteVisibility.CUSTOM ? allowedUsers : [],
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message ?? `HTTP ${res.status}`)
      }

      const data = await res.json()
      const note = data.note
      addNote(sessionId, {
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
      })

      setTitle('')
      setContent('')
      setTagsText('')
      setAllowedUsers([])
      setSelectedShareUserId('')
      setVisibility(NoteVisibility.PLAYERS_VISIBLE)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create note')
    } finally {
      setIsCreating(false)
    }
  }

  const handleSave = async (
    noteId: string,
    updates: Partial<Pick<Note, 'title' | 'content' | 'visibility' | 'tags' | 'allowedUsers'>>
  ) => {
    const res = await fetch(`${apiUrl}/api/notes/${noteId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(updates),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.message ?? `HTTP ${res.status}`)
    }

    const data = await res.json()
    const note = data.note
    updateNote(sessionId, note.id, {
      title: note.title,
      content: note.content,
      visibility: note.visibility,
      tags: note.tags || [],
      allowedUsers: note.allowedUsers || [],
      publishedAt: note.publishedAt,
      updatedAt: note.updatedAt,
    })
  }

  const handlePublish = async (noteId: string) => {
    const res = await fetch(`${apiUrl}/api/notes/${noteId}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sessionId }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.message ?? `HTTP ${res.status}`)
    }
  }

  const addAllowedUser = (candidate: string) => {
    const next = candidate.trim()
    if (!next) return
    if (!allowedUsers.includes(next)) {
      setAllowedUsers((prev) => [...prev, next])
    }
  }

  const handleAddSelectedUser = () => {
    const candidate = selectedShareUserId.trim()
    if (!candidate) return
    addAllowedUser(candidate)
    setSelectedShareUserId('')
  }

  const removeAllowedUser = (userId: string) => {
    setAllowedUsers((prev) => prev.filter((id) => id !== userId))
  }

  const handleDelete = async (noteId: string) => {
    const res = await fetch(`${apiUrl}/api/notes/${noteId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.message ?? `HTTP ${res.status}`)
    }

    deleteNote(sessionId, noteId as UUID)
  }

  return (
    <section className="overflow-hidden rounded-ui-lg border border-ui-border bg-ui-surface">
      <div className="border-b border-ui-border bg-ui-surface-subtle px-4 py-3 font-semibold text-ui-primary">
        Notes
      </div>

      <form onSubmit={handleCreate} className="space-y-2 border-b border-ui-border p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          required
          className="w-full rounded-ui-sm border border-ui-border-soft bg-ui-surface px-3 py-2 text-sm text-ui-primary"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write note content"
          required
          className="min-h-22 w-full rounded-ui-sm border border-ui-border-soft bg-ui-surface px-3 py-2 text-sm text-ui-primary"
        />
        <div className="flex gap-2">
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as NoteVisibility)}
            className="flex-1 rounded-ui-sm border border-ui-border-soft bg-ui-surface px-3 py-2 text-sm text-ui-primary"
          >
            <option value={NoteVisibility.PLAYERS_VISIBLE}>Shared</option>
            <option value={NoteVisibility.CUSTOM}>Custom</option>
            {user.role === 'DM' && <option value={NoteVisibility.DM_ONLY}>DM Only</option>}
          </select>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="tag1, tag2"
            className="flex-2 rounded-ui-sm border border-ui-border-soft bg-ui-surface px-3 py-2 text-sm text-ui-primary"
          />
        </div>
        {visibility === NoteVisibility.CUSTOM && (
          <div className="mb-2 space-y-1.5">
            <div className="flex gap-2">
              <select
                value={selectedShareUserId}
                onChange={(e) => setSelectedShareUserId(e.target.value)}
                className="flex-1 rounded-ui-sm border border-ui-border-soft bg-ui-surface px-3 py-2 text-sm text-ui-primary"
              >
                <option value="">Select player to share with</option>
                {shareUsers.map((shareUser) => (
                  <option key={shareUser.id} value={shareUser.id}>
                    {shareUser.username}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddSelectedUser}
                disabled={!selectedShareUserId}
                className="rounded-ui-sm border border-ui-border px-3 py-2 text-sm text-ui-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Add
              </button>
            </div>
            {shareUsers.length === 0 && (
              <p className="m-0 text-xs text-ui-secondary">
                No session users available yet. Users appear here after joining the session.
              </p>
            )}
            <TooltipProvider delayDuration={140}>
              <div className="flex flex-wrap gap-1.5">
                {allowedUsers.map((userId) => (
                  <Tooltip key={userId}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => removeAllowedUser(userId)}
                        className="rounded-full border border-ui-border-soft bg-ui-surface-subtle px-2 py-1 text-xs text-ui-secondary"
                      >
                        {shareUsers.find((u) => u.id === userId)?.username || userId} x
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Click to remove</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          </div>
        )}
        <button
          type="submit"
          disabled={isCreating}
          className="rounded-ui-sm bg-ui-brand px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isCreating ? 'Creating...' : 'Create Note'}
        </button>
      </form>

      {error && <p className="m-3 text-sm text-ui-error-text">{error}</p>}

      <div className="flex items-center gap-2 border-b border-ui-border px-3 pb-3 text-sm text-ui-primary">
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={showPublishedOnly}
            onChange={(e) => setShowPublishedOnly(e.target.checked)}
          />
          Show published only
        </label>
        <span className="text-ui-secondary">
          {showPublishedOnly ? `${displayedNotes.length} published` : `${notes.length} total`}
        </span>
      </div>

      <div className="max-h-90 overflow-y-auto p-3">
        {isLoading ? (
          <p className="text-sm text-ui-secondary">Loading notes...</p>
        ) : displayedNotes.length === 0 ? (
          <p className="text-sm text-ui-secondary">
            {showPublishedOnly ? 'No published notes yet.' : 'No notes yet.'}
          </p>
        ) : (
          displayedNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              shareUsers={shareUsers}
              canEdit={user.role === 'DM' || note.ownerId === user.id}
              canPublish={user.role === 'DM' || note.ownerId === user.id}
              onSave={handleSave}
              onDelete={handleDelete}
              onPublish={handlePublish}
            />
          ))
        )}
      </div>
    </section>
  )
}
