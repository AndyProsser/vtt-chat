/**
 * NotesPanelCompact
 *
 * In-session compact notes view. Shows a dense stacked list of note titles.
 * Tapping any card slides in a full NoteCard (edit / share / surface enabled).
 *
 * Used when the notes panel is in the session right rail (limited vertical space).
 * The lobby/editor view uses the full two-column NotesPanel instead.
 */

import { useState, useMemo } from 'react'
import type { UUID } from '@shared'
import type { Note } from '@/types/notes'
import type { NotesShareRoom, NotesShareUser } from '@/types/notesShare'
import type { NotesSurfaceTarget } from '@/types/notesPublish'
import { NoteCard } from './NoteCard'
import '@/styles/components/workspaces/shared/panels/NotesPanel.compact.css'

interface NotesPanelCompactProps {
  notes: Note[]
  isLoading: boolean
  canEdit: boolean
  canPublish: boolean
  isPublishDisabled: boolean
  isSharingDisabled: boolean
  apiUrl?: string
  token?: string
  shareUsers?: NotesShareUser[]
  shareRooms?: NotesShareRoom[]
  roomMemberIdsByRoomId?: Record<UUID, UUID[]>
  onCreateRequest: () => void
  onSave: (
    noteId: string,
    updates: Partial<
      Pick<Note, 'title' | 'content' | 'visibility' | 'tags' | 'allowedUsers' | 'attachments'>
    >
  ) => Promise<void>
  onDelete: (noteId: string) => Promise<void>
  onSurface: (noteId: string, target: NotesSurfaceTarget) => Promise<void>
}

// ---------------------------------------------------------------------------
// NoteStackCard — a single title card in the list
// ---------------------------------------------------------------------------

interface NoteStackCardProps {
  note: Note
  index: number
  total: number
  onSelect: (id: UUID) => void
}

function NoteStackCard({ note, index, total, onSelect }: NoteStackCardProps) {
  const stackOffset = Math.min(index * 1.5, 6)
  const displayTags = note.tags
    .filter((t) => !t.startsWith('_'))
    .slice(0, 2)
    .map((t) => (t.startsWith('#') ? t : `#${t}`))

  const isLast = index === total - 1

  return (
    <button
      type="button"
      className="notes-stack-card"
      style={{ '--stack-offset': `${stackOffset}px` } as React.CSSProperties}
      onClick={() => onSelect(note.id)}
      aria-label={`Open note: ${note.title}`}
      data-last={isLast || undefined}
    >
      <span className="notes-stack-card__title">{note.title}</span>

      <div className="notes-stack-card__footer">
        <div className="notes-stack-card__tags">
          {displayTags.map((tag) => (
            <span key={tag} className="notes-stack-card__tag">
              {tag}
            </span>
          ))}
        </div>

        <span className="material-symbols-outlined notes-stack-card__arrow" aria-hidden="true">
          chevron_right
        </span>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// NotesPanelCompact — public component
// ---------------------------------------------------------------------------

export function NotesPanelCompact({
  notes,
  isLoading,
  canEdit,
  canPublish,
  isPublishDisabled,
  isSharingDisabled,
  apiUrl,
  token,
  shareUsers = [],
  shareRooms = [],
  roomMemberIdsByRoomId = {},
  onCreateRequest,
  onSave,
  onDelete,
  onSurface,
}: NotesPanelCompactProps) {
  const [selectedId, setSelectedId] = useState<UUID | null>(null)

  const selectedNote = useMemo(
    () => (selectedId ? (notes.find((n) => n.id === selectedId) ?? null) : null),
    [notes, selectedId]
  )

  if (selectedNote) {
    return (
      <div className="notes-compact__overlay" aria-label={`Note: ${selectedNote.title}`}>
        <div className="notes-compact__overlay-header">
          <button
            type="button"
            className="notes-compact__back-btn"
            onClick={() => setSelectedId(null)}
            aria-label="Back to notes list"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              arrow_back
            </span>
            <span>Notes</span>
          </button>
        </div>

        <div className="notes-compact__overlay-body">
          <NoteCard
            key={selectedNote.id}
            note={selectedNote}
            apiUrl={apiUrl}
            token={token}
            canEdit={canEdit}
            canManageShare={canEdit}
            canPublish={canPublish}
            isPublishDisabled={isPublishDisabled}
            isSharingDisabled={isSharingDisabled}
            shareUsers={shareUsers}
            shareRooms={shareRooms}
            roomMemberIdsByRoomId={roomMemberIdsByRoomId}
            onSave={onSave}
            onDelete={async (noteId) => {
              await onDelete(noteId)
              setSelectedId(null)
            }}
            onSurface={onSurface}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="notes-compact">
      <div className="notes-compact__header">
        <h3 className="notes-compact__heading">
          <span className="material-symbols-outlined" aria-hidden="true">
            notes
          </span>
          Handouts
        </h3>
        {canEdit ? (
          <button
            type="button"
            className="session-icon-action session-icon-action--icon"
            onClick={onCreateRequest}
            aria-label="Create handout"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              note_add
            </span>
          </button>
        ) : null}
      </div>

      <div className="notes-compact__stack" role="list" aria-label="Handouts">
        {isLoading ? (
          <p className="notes-compact__empty">Loading handouts…</p>
        ) : notes.length === 0 ? (
          <div className="ui-empty-panel" role="status">
            <span className="material-symbols-outlined" aria-hidden="true">
              auto_awesome
            </span>
            <span>No handouts yet.</span>
          </div>
        ) : (
          notes.map((note, index) => (
            <NoteStackCard
              key={note.id}
              note={note}
              index={index}
              total={notes.length}
              onSelect={setSelectedId}
            />
          ))
        )}
      </div>
    </div>
  )
}
