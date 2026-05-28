import { MarkdownEditor } from '@/components/workspaces/shared/panels/MarkdownEditor'
import type { ParsedNoteSharedMessage } from '@/utils/noteSharedMessage'
import '@/styles/components/workspaces/shared/panels/NoteSharedCard.css'

interface NoteSharedCardProps {
  note: ParsedNoteSharedMessage
  timestampLabel?: string
  timestampDateTime?: string
  className?: string
}

/**
 * Dedicated renderer for shared handout system messages in chat and history views.
 */
export function NoteSharedCard({
  note,
  timestampLabel,
  timestampDateTime,
  className,
}: NoteSharedCardProps) {
  const rootClass = ['session-note-shared-card', className ?? ''].filter(Boolean).join(' ')
  const hasBody = note.markdown.trim().length > 0

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
          <span className="session-note-shared-card__label">Handout Shared</span>
          <h3 className="session-note-shared-card__title">{note.title}</h3>
        </div>
      </div>

      {note.sharedWith || note.hashtags ? (
        <dl className="session-note-shared-card__meta">
          {note.sharedWith ? (
            <>
              <dt>Shared with</dt>
              <dd>{note.sharedWith}</dd>
            </>
          ) : null}
          {note.hashtags ? (
            <>
              <dt>Hashtags</dt>
              <dd>{note.hashtags}</dd>
            </>
          ) : null}
        </dl>
      ) : null}

      {hasBody ? (
        <MarkdownEditor
          value={note.markdown}
          readOnly
          variant="full"
          className="session-note-shared-card__markdown"
        />
      ) : null}

      {timestampLabel ? (
        <div className="session-note-shared-card__footer">
          <time dateTime={timestampDateTime}>{timestampLabel}</time>
        </div>
      ) : null}
    </article>
  )
}
