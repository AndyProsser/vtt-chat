import type { UUID } from '@shared'
import type { Note } from '@/types/notes'
import type { NotesShareRoom, NotesShareUser } from '@/types/notesShare'
import type { NotesSurfaceTarget } from '@/types/notesPublish'
import { NoteCard } from './NoteCard'

interface NotesBrowserCardProps {
  note: Note
  isExpanded: boolean
  isMounted: boolean
  activeHashtagFilter: string | null
  onToggle: () => void
  onTagSelect: (tag: string | null) => void
  apiUrl: string
  token: string
  canEdit: boolean
  canManageShare: boolean
  canPublish: boolean
  isPublishDisabled: boolean
  isSharingDisabled: boolean
  shareUsers?: NotesShareUser[]
  shareRooms?: NotesShareRoom[]
  roomMemberIdsByRoomId?: Record<UUID, UUID[]>
  onSave: (
    noteId: string,
    updates: Partial<
      Pick<Note, 'title' | 'content' | 'visibility' | 'tags' | 'allowedUsers' | 'attachments'>
    >
  ) => Promise<void>
  onDelete: (noteId: string) => Promise<void>
  onSurface: (noteId: string, target: NotesSurfaceTarget) => Promise<void>
}

function toDisplayDate(ts: number): string {
  return new Date(ts).toLocaleDateString()
}

/** Strips common markdown syntax and truncates to a plain-text preview. */
function stripMarkdownPreview(content: string, maxLen = 120): string {
  const stripped = content
    .replace(/#{1,6} /g, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/`[^`]+`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+] /gm, '')
    .replace(/\n+/g, ' ')
    .trim()
  return stripped.length > maxLen ? stripped.slice(0, maxLen) + '…' : stripped
}

function getVisibilityLabel(visibility: string): string {
  if (visibility === 'DM_ONLY') return 'DM Only'
  if (visibility === 'PLAYERS_VISIBLE') return 'Shared'
  return 'Custom'
}

function getVisibilityChipClass(visibility: string): string {
  if (visibility === 'PLAYERS_VISIBLE') return 'knowledge-panel-chip'
  return 'knowledge-panel-chip muted'
}

/**
 * Renders a single note as a collapsible browser card.
 * Clicking the card header toggles the inline NoteCard editor.
 * Hashtag chips on the card set the active filter without toggling expansion.
 * The editor subtree stays mounted once opened to avoid re-fetching on re-expand.
 */
export function NotesBrowserCard({
  note,
  isExpanded,
  isMounted,
  activeHashtagFilter,
  onToggle,
  onTagSelect,
  apiUrl,
  token,
  canEdit,
  canManageShare,
  canPublish,
  isPublishDisabled,
  isSharingDisabled,
  shareUsers,
  shareRooms,
  roomMemberIdsByRoomId,
  onSave,
  onDelete,
  onSurface,
}: NotesBrowserCardProps) {
  const displayTags = note.tags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
  const visibleTags = displayTags.slice(0, 4)
  const hiddenTagCount = Math.max(0, displayTags.length - visibleTags.length)
  const preview = stripMarkdownPreview(note.content)
  const dateLabel = toDisplayDate(note.updatedAt)

  return (
    <div className="knowledge-panel-session-item" role="listitem">
      <div
        role="button"
        tabIndex={0}
        className={`knowledge-panel-card knowledge-panel-card--interactive${isExpanded ? ' selected' : ''}`}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          onToggle()
        }}
        aria-expanded={isExpanded}
      >
        <div className="knowledge-panel-card-header">
          <div className="knowledge-panel-card-header__left">
            <h4
              className="knowledge-panel-card-title knowledge-panel-card-title--truncate"
              title={note.title}
            >
              {note.title || 'Untitled'}
            </h4>
          </div>
          <div className="knowledge-panel-card-header__right">
            <div className="knowledge-panel-chip-row">
              <span className={getVisibilityChipClass(note.visibility)}>
                {getVisibilityLabel(note.visibility)}
              </span>
            </div>
            <span
              className="material-symbols-outlined knowledge-panel-card__expand-icon"
              aria-hidden="true"
            >
              {isExpanded ? 'expand_less' : 'expand_more'}
            </span>
          </div>
        </div>

        <div className="knowledge-panel-card-subheader">
          <p className="knowledge-panel-card-subtitle">{dateLabel}</p>
          <div className="knowledge-panel-chip-row knowledge-panel-chip-row--right">
            {visibleTags.map((tag) => {
              const isActive = activeHashtagFilter === tag
              return (
                <button
                  key={`${note.id}:${tag}`}
                  type="button"
                  className={`knowledge-panel-chip muted${isActive ? ' knowledge-panel-chip--active' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onTagSelect(isActive ? null : tag)
                  }}
                  aria-label={`Filter by ${tag}`}
                >
                  {tag}
                </button>
              )
            })}
            {hiddenTagCount > 0 ? (
              <span className="knowledge-panel-card-tags-more muted">{hiddenTagCount} more…</span>
            ) : null}
          </div>
        </div>
      </div>

      {isMounted ? (
        <div
          className="knowledge-panel-session-item__editor"
          hidden={!isExpanded || undefined}
          aria-hidden={!isExpanded || undefined}
        >
          <NoteCard
            key={note.id}
            note={note}
            apiUrl={apiUrl}
            token={token}
            canEdit={canEdit}
            canManageShare={canManageShare}
            canPublish={canPublish}
            isPublishDisabled={isPublishDisabled}
            isSharingDisabled={isSharingDisabled}
            shareUsers={shareUsers}
            shareRooms={shareRooms}
            roomMemberIdsByRoomId={roomMemberIdsByRoomId}
            onSave={onSave}
            onDelete={onDelete}
            onSurface={onSurface}
          />
        </div>
      ) : null}
    </div>
  )
}
