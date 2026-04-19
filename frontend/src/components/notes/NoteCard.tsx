import { useState } from 'react'
import { NoteVisibility } from '@shared'
import type { UUID, Role } from '@shared'
import type { Note } from '../../state/notesSlice'

interface NoteCardProps {
  note: Note
  canEdit: boolean
  canPublish: boolean
  shareUsers?: Array<{ id: UUID; username: string; role: Role | string }>
  onSave: (
    noteId: string,
    updates: Partial<Pick<Note, 'title' | 'content' | 'visibility' | 'tags' | 'allowedUsers'>>
  ) => Promise<void>
  onDelete: (noteId: string) => Promise<void>
  onPublish: (noteId: string) => Promise<void>
}

const visibilityLabel: Record<NoteVisibility, string> = {
  [NoteVisibility.DM_ONLY]: 'DM Only',
  [NoteVisibility.PLAYERS_VISIBLE]: 'Shared',
  [NoteVisibility.CUSTOM]: 'Custom',
}

export function NoteCard({
  note,
  canEdit,
  canPublish,
  shareUsers = [],
  onSave,
  onDelete,
  onPublish,
}: NoteCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [visibility, setVisibility] = useState<NoteVisibility>(note.visibility)
  const [tagsText, setTagsText] = useState(note.tags.join(', '))
  const [shareWithInput, setShareWithInput] = useState('')
  const [selectedShareUserId, setSelectedShareUserId] = useState('')
  const [allowedUsers, setAllowedUsers] = useState<string[]>(note.allowedUsers || [])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cancelEdit = () => {
    setTitle(note.title)
    setContent(note.content)
    setVisibility(note.visibility)
    setTagsText(note.tags.join(', '))
    setAllowedUsers(note.allowedUsers || [])
    setShareWithInput('')
    setSelectedShareUserId('')
    setError(null)
    setIsEditing(false)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const tags = tagsText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)

      await onSave(note.id, {
        title,
        content,
        visibility,
        tags,
        allowedUsers: visibility === NoteVisibility.CUSTOM ? (allowedUsers as any) : [],
      })
      setIsEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this note?')) return
    setIsSaving(true)
    setError(null)
    try {
      await onDelete(note.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete note')
    } finally {
      setIsSaving(false)
    }
  }

  const handlePublish = async () => {
    setIsSaving(true)
    setError(null)
    try {
      await onPublish(note.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish note')
    } finally {
      setIsSaving(false)
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

  const handleAddManualUser = () => {
    const candidate = shareWithInput.trim()
    if (!candidate) return
    addAllowedUser(candidate)
    setShareWithInput('')
  }

  const removeAllowedUser = (userId: string) => {
    setAllowedUsers((prev) => prev.filter((id) => id !== userId))
  }

  const publishedLabel = note.publishedAt ? new Date(note.publishedAt).toLocaleString() : null

  return (
    <article
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '0.75rem',
        backgroundColor: '#fff',
        marginBottom: '0.75rem',
      }}
    >
      {isEditing ? (
        <>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title"
            style={{ width: '100%', marginBottom: '0.5rem', padding: '0.5rem' }}
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your note"
            style={{ width: '100%', minHeight: '100px', marginBottom: '0.5rem', padding: '0.5rem' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as NoteVisibility)}
              style={{ flex: 1, padding: '0.5rem' }}
            >
              <option value={NoteVisibility.PLAYERS_VISIBLE}>Shared</option>
              <option value={NoteVisibility.CUSTOM}>Custom</option>
              <option value={NoteVisibility.DM_ONLY}>DM Only</option>
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
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <input
                  value={shareWithInput}
                  onChange={(e) => setShareWithInput(e.target.value)}
                  placeholder="Or paste user ID"
                  style={{ flex: 1, padding: '0.5rem' }}
                />
                <button
                  type="button"
                  onClick={handleAddManualUser}
                  style={{ padding: '0.4rem 0.75rem' }}
                >
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
                    {shareUsers.find((u) => u.id === userId)?.username || userId} x
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && <p style={{ margin: '0 0 0.5rem 0', color: '#b91c1c' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleSave} disabled={isSaving} style={{ padding: '0.4rem 0.75rem' }}>
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={cancelEdit} disabled={isSaving} style={{ padding: '0.4rem 0.75rem' }}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0 }}>{note.title}</h4>
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              {note.publishedAt && (
                <span
                  style={{
                    fontSize: '0.72rem',
                    color: '#065f46',
                    backgroundColor: '#d1fae5',
                    border: '1px solid #6ee7b7',
                    borderRadius: '999px',
                    padding: '0.1rem 0.45rem',
                    lineHeight: 1.4,
                  }}
                  title={`Published ${publishedLabel}`}
                >
                  Published
                </span>
              )}
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {visibilityLabel[note.visibility]}
              </span>
            </div>
          </div>
          <p style={{ margin: '0.5rem 0', whiteSpace: 'pre-wrap' }}>{note.content}</p>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: '#64748b' }}>
            by {note.ownerUsername}
          </p>
          {note.publishedAt && (
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: '#047857' }}>
              Published to chat: {publishedLabel}
            </p>
          )}
          {note.tags.length > 0 && (
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: '#475569' }}>
              Tags: {note.tags.join(', ')}
            </p>
          )}
          {error && <p style={{ margin: '0 0 0.5rem 0', color: '#b91c1c' }}>{error}</p>}
          {canEdit && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setIsEditing(true)} style={{ padding: '0.4rem 0.75rem' }}>
                Edit
              </button>
              {canPublish && (
                <button
                  onClick={handlePublish}
                  disabled={isSaving || !!note.publishedAt}
                  style={{ padding: '0.4rem 0.75rem' }}
                >
                  {note.publishedAt ? 'Published' : isSaving ? 'Publishing...' : 'Publish'}
                </button>
              )}
              <button
                onClick={handleDelete}
                disabled={isSaving}
                style={{ padding: '0.4rem 0.75rem' }}
              >
                {isSaving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          )}
        </>
      )}
    </article>
  )
}
