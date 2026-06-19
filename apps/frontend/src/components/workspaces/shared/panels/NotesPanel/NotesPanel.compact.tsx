/**
 * NotesPanelCompact
 *
 * In-session compact notes view for the right rail.
 * Shows a searchable, hashtag-filterable card list using the same
 * NotesBrowserCard inline-expand pattern as the full lobby panel.
 */

import { useState, useMemo } from 'react'
import type { UUID } from '@shared'
import type { Note } from '@/types/notes'
import type { NotesShareRoom, NotesShareUser } from '@/types/notesShare'
import type { NotesSurfaceTarget } from '@/types/notesPublish'
import { Icon } from '@/components/ui/Icon'
import { NotesBrowserCard } from './NotesBrowserCard'
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

export function NotesPanelCompact({
  notes,
  isLoading,
  canEdit,
  canPublish,
  isPublishDisabled,
  isSharingDisabled,
  apiUrl = '',
  token = '',
  shareUsers = [],
  shareRooms = [],
  roomMemberIdsByRoomId = {},
  onCreateRequest,
  onSave,
  onDelete,
  onSurface,
}: NotesPanelCompactProps) {
  const [expandedNoteId, setExpandedNoteId] = useState<UUID | null>(null)
  const [mountedEditorIds, setMountedEditorIds] = useState<Set<UUID>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [activeHashtagFilter, setActiveHashtagFilter] = useState<string | null>(null)

  const allHashtags = useMemo(() => {
    const set = new Set<string>()
    for (const note of notes) {
      for (const tag of note.tags) {
        const normalized = tag.startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`
        if (normalized.length > 1) set.add(normalized)
      }
    }
    return [...set].sort()
  }, [notes])

  const displayedNotes = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    const bySearch = normalizedQuery
      ? notes.filter((note) =>
          [note.title, note.content, ...note.tags].join(' ').toLowerCase().includes(normalizedQuery)
        )
      : notes

    if (!activeHashtagFilter) return bySearch
    return bySearch.filter((note) =>
      note.tags.some((tag) => {
        const normalized = tag.startsWith('#') ? tag : `#${tag}`
        return normalized.toLowerCase() === activeHashtagFilter.toLowerCase()
      })
    )
  }, [notes, searchQuery, activeHashtagFilter])

  const expandNote = (noteId: UUID) => {
    setExpandedNoteId(noteId)
    setMountedEditorIds((prev) => {
      if (prev.has(noteId)) return prev
      const next = new Set(prev)
      next.add(noteId)
      return next
    })
  }

  const handleDelete = async (noteId: string) => {
    await onDelete(noteId)
    if (expandedNoteId === (noteId as UUID)) {
      setExpandedNoteId(null)
    }
    setMountedEditorIds((prev) => {
      if (!prev.has(noteId as UUID)) return prev
      const next = new Set(prev)
      next.delete(noteId as UUID)
      return next
    })
  }

  const emptyMessage = searchQuery.trim()
    ? `No handouts match "${searchQuery.trim()}".`
    : activeHashtagFilter
      ? `No handouts tagged ${activeHashtagFilter}.`
      : 'No handouts yet.'

  return (
    <div className="notes-compact">
      <div className="notes-compact__header">
        <h3 className="notes-compact__heading">
          <Icon name="notes" />
          Handouts
        </h3>
        {canEdit ? (
          <button
            type="button"
            className="session-icon-action session-icon-action--icon"
            onClick={onCreateRequest}
            aria-label="Create handout"
          >
            <Icon name="note_add" />
          </button>
        ) : null}
      </div>

      <div className="notes-compact__toolbar">
        <div className="knowledge-panel-history__search-input-wrap">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search handouts"
            autoComplete="off"
            className="notes-compact__search"
          />
          {searchQuery.length > 0 ? (
            <button
              type="button"
              className="knowledge-panel-history__search-clear"
              aria-label="Clear search"
              onClick={() => setSearchQuery('')}
            >
              <Icon name="close" />
            </button>
          ) : null}
        </div>

        {allHashtags.length > 0 ? (
          <div className="notes-toolbar-hashtags" aria-label="Filter by hashtag">
            {allHashtags.map((tag) => {
              const isActive = activeHashtagFilter === tag
              return (
                <button
                  key={tag}
                  type="button"
                  className={`knowledge-panel-chip muted${isActive ? ' knowledge-panel-chip--active' : ''}`}
                  onClick={() => setActiveHashtagFilter(isActive ? null : tag)}
                  aria-pressed={isActive}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      <div className="notes-compact__list" role="list" aria-label="Handouts">
        {isLoading ? (
          <p className="notes-compact__empty">Loading handouts…</p>
        ) : displayedNotes.length === 0 ? (
          <div className="ui-empty-panel" role="status">
            <Icon name="auto_awesome" />
            <span>{emptyMessage}</span>
          </div>
        ) : (
          <div className="knowledge-panel-session-list">
            {displayedNotes.map((note) => {
              const isExpanded = expandedNoteId === note.id
              const isMounted = isExpanded || mountedEditorIds.has(note.id)
              return (
                <NotesBrowserCard
                  key={note.id}
                  note={note}
                  isExpanded={isExpanded}
                  isMounted={isMounted}
                  activeHashtagFilter={activeHashtagFilter}
                  onToggle={() => {
                    if (isExpanded) {
                      setExpandedNoteId(null)
                    } else {
                      expandNote(note.id)
                    }
                  }}
                  onTagSelect={setActiveHashtagFilter}
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
                  onDelete={handleDelete}
                  onSurface={onSurface}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
