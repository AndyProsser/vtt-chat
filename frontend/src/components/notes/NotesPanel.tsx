import { useEffect, useMemo, useState } from 'react'
import { NoteVisibility } from '@shared'
import type { UUID, Role } from '@shared'
import { useStore } from '../../hooks/useStore'
import type { Note } from '../../state/notesSlice'
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
  const store = useStore()
  const notesBySession = (store.notes as any)[sessionId] as Record<UUID, Note> | undefined
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
        const res = await fetch(`${apiUrl}/api/notes/${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.message ?? `HTTP ${res.status}`)
        }

        const data = await res.json()
        if (!cancelled) {
          store.clearNotes(sessionId)
          for (const note of data.notes || []) {
            store.addNote(sessionId, {
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
  }, [apiUrl, token, sessionId, store])

  useEffect(() => {
    let cancelled = false

    const loadShareUsers = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/session/${sessionId}/users`, {
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
      store.addNote(sessionId, {
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
    store.updateNote(sessionId, note.id, {
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

    store.deleteNote(sessionId, noteId as UUID)
  }

  return (
    <section
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: '#fff',
      }}
    >
      <div
        style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc',
          fontWeight: 600,
          color: '#334155',
        }}
      >
        Notes
      </div>

      <form
        onSubmit={handleCreate}
        style={{ padding: '0.75rem', borderBottom: '1px solid #e2e8f0' }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          required
          style={{ width: '100%', marginBottom: '0.5rem', padding: '0.5rem' }}
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write note content"
          required
          style={{ width: '100%', minHeight: '88px', marginBottom: '0.5rem', padding: '0.5rem' }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as NoteVisibility)}
            style={{ flex: 1, padding: '0.5rem' }}
          >
            <option value={NoteVisibility.PLAYERS_VISIBLE}>Shared</option>
            <option value={NoteVisibility.CUSTOM}>Custom</option>
            {user.role === 'DM' && <option value={NoteVisibility.DM_ONLY}>DM Only</option>}
          </select>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="tag1, tag2"
            style={{ flex: 2, padding: '0.5rem' }}
          />
        </div>
        {visibility === NoteVisibility.CUSTOM && (
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <select
                value={selectedShareUserId}
                onChange={(e) => setSelectedShareUserId(e.target.value)}
                style={{ flex: 1, padding: '0.5rem' }}
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
                style={{ padding: '0.4rem 0.75rem' }}
              >
                Add
              </button>
            </div>
            {shareUsers.length === 0 && (
              <p style={{ margin: '0 0 0.35rem 0', color: '#64748b', fontSize: '0.8rem' }}>
                No session users available yet. Users appear here after joining the session.
              </p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {allowedUsers.map((userId) => (
                <button
                  key={userId}
                  type="button"
                  onClick={() => removeAllowedUser(userId)}
                  style={{
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc',
                    borderRadius: '999px',
                    padding: '0.2rem 0.5rem',
                    fontSize: '0.75rem',
                  }}
                  title="Click to remove"
                >
                  {shareUsers.find((u) => u.id === userId)?.username || userId} x
                </button>
              ))}
            </div>
          </div>
        )}
        <button type="submit" disabled={isCreating} style={{ padding: '0.45rem 0.75rem' }}>
          {isCreating ? 'Creating...' : 'Create Note'}
        </button>
      </form>

      {error && <p style={{ margin: '0.75rem', color: '#b91c1c' }}>{error}</p>}

      <div
        style={{
          padding: '0 0.75rem 0.75rem 0.75rem',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          color: '#334155',
          fontSize: '0.875rem',
        }}
      >
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <input
            type="checkbox"
            checked={showPublishedOnly}
            onChange={(e) => setShowPublishedOnly(e.target.checked)}
          />
          Show published only
        </label>
        <span style={{ color: '#64748b' }}>
          {showPublishedOnly ? `${displayedNotes.length} published` : `${notes.length} total`}
        </span>
      </div>

      <div style={{ padding: '0.75rem', maxHeight: '360px', overflowY: 'auto' }}>
        {isLoading ? (
          <p style={{ color: '#64748b' }}>Loading notes...</p>
        ) : displayedNotes.length === 0 ? (
          <p style={{ color: '#64748b' }}>
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
