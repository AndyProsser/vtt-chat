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
  const [shareWithInput, setShareWithInput] = useState('')
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
      setShareWithInput('')
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

  const addAllowedUser = () => {
    const candidate = shareWithInput.trim()
    if (!candidate) return
    if (!allowedUsers.includes(candidate)) {
      setAllowedUsers((prev) => [...prev, candidate])
    }
    setShareWithInput('')
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
              <input
                value={shareWithInput}
                onChange={(e) => setShareWithInput(e.target.value)}
                placeholder="Share with user ID"
                style={{ flex: 1, padding: '0.5rem' }}
              />
              <button type="button" onClick={addAllowedUser} style={{ padding: '0.4rem 0.75rem' }}>
                Add
              </button>
            </div>
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
                  {userId} x
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
