import { useMemo } from 'react'
import { MarkdownEditor } from '@/components/workspaces/shared/panels/MarkdownEditor'
import { openNotePopout } from '@/utils/route-view'
import type { ParsedNoteSharedMessage } from '@/utils/noteSharedMessage'
import '@/styles/components/workspaces/shared/panels/NoteSharedCard.css'

function handleOpenNotePopout(noteId: string) {
  const token = sessionStorage.getItem('authToken') ?? ''
  const apiUrl =
    (import.meta.env.VITE_API_URL as string | undefined)?.trim() || window.location.origin
  openNotePopout(noteId, token, apiUrl)
}

interface NoteSharedCardProps {
  note: ParsedNoteSharedMessage
  timestampLabel?: string
  timestampDateTime?: string
  className?: string
  /** When true, an "excerpt" badge is shown and a "View in Notes" hint is displayed. */
  isExcerpt?: boolean
}

/**
 * Dedicated renderer for shared handout system messages in chat and history views.
 * Uses MarkdownEditor readOnly for consistent rendering with Notes and Journal panels.
 */
export function NoteSharedCard({
  note,
  timestampLabel,
  timestampDateTime,
  className,
  isExcerpt,
}: NoteSharedCardProps) {
  const rootClass = ['session-note-shared-card', className ?? ''].filter(Boolean).join(' ')
  const hasBody = note.markdown.trim().length > 0
  const hashtags = useMemo(() => {
    if (!note.hashtags) {
      return []
    }

    return note.hashtags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0 && tag.toLowerCase() !== 'none')
      .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
  }, [note.hashtags])
  const visibleHashtags = hashtags.slice(0, 3)
  const hiddenHashtagCount = Math.max(hashtags.length - visibleHashtags.length, 0)
  const hashtagsSummary =
    hiddenHashtagCount > 0
      ? `${visibleHashtags.join(' ')} +${hiddenHashtagCount} more`
      : visibleHashtags.join(' ')

  return (
    <article className={rootClass} aria-label={`Shared handout ${note.title}`}>
      <div className="session-note-shared-card__header">
        <span
          className="session-note-shared-card__icon material-symbols-outlined"
          aria-hidden="true"
        >
          menu_book
        </span>
        <div className="session-note-shared-card__headline">
          <div className="session-note-shared-card__label-row">
            <span className="session-note-shared-card__label">Handout Shared</span>
            {isExcerpt ? (
              <span
                className="session-note-shared-card__excerpt-badge"
                title="Excerpt — open Notes tab for the full handout"
              >
                excerpt
              </span>
            ) : null}
          </div>
          <h3 className="session-note-shared-card__title">{note.title}</h3>
        </div>
      </div>

      {isExcerpt ? (
        <p className="session-note-shared-card__full-note-hint">
          <span
            className="material-symbols-outlined"
            aria-hidden="true"
            style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}
          >
            menu_book
          </span>
          Full note available in the Notes tab
        </p>
      ) : null}

      {hasBody ? (
        <div className="session-note-shared-card__markdown">
          <MarkdownEditor
            key={note.markdown.length}
            value={note.markdown}
            readOnly
            variant="full"
          />
        </div>
      ) : null}
      {timestampLabel ? (
        <div className="session-note-shared-card__footer">
          <time dateTime={timestampDateTime}>{timestampLabel}</time>
          <div className="session-note-shared-card__footer-right">
            {hashtagsSummary ? (
              <span className="session-note-shared-card__hashtags" title={hashtags.join(', ')}>
                {hashtagsSummary}
              </span>
            ) : null}
            {note.noteId ? (
              <button
                className="session-note-shared-card__more-link"
                onClick={() => handleOpenNotePopout(note.noteId!)}
                type="button"
              >
                more...
              </button>
            ) : null}
          </div>
        </div>
      ) : hashtagsSummary || note.noteId ? (
        <div className="session-note-shared-card__footer session-note-shared-card__footer--hashtags-only">
          {hashtagsSummary ? (
            <span className="session-note-shared-card__hashtags" title={hashtags.join(', ')}>
              {hashtagsSummary}
            </span>
          ) : null}
          {note.noteId ? (
            <button
              className="session-note-shared-card__more-link"
              onClick={() => handleOpenNotePopout(note.noteId!)}
              type="button"
            >
              more...
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
