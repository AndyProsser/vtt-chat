import { useMemo } from 'react'
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
          <span className="session-note-shared-card__label">Handout Shared</span>
          <h3 className="session-note-shared-card__title">{note.title}</h3>
        </div>
      </div>

      {hasBody ? (
        // Lightweight renderer: convert inline image markdown with data: URLs
        // into <img> elements while keeping the rest as pre-wrapped text.
        // This avoids mounting the full editor while still supporting
        // embedded base64 images in history/handouts.
        <div className="session-note-shared-card__markdown">
          <div className="session-note-shared-card__markdown-pre">
            {(() => {
              const parts: Array<string | JSX.Element> = []
              const md = note.markdown || ''
              // Match image markdown: ![alt](url)
              const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g
              let lastIndex = 0
              let match: RegExpExecArray | null

              while ((match = imgRe.exec(md))) {
                const before = md.slice(lastIndex, match.index)
                if (before) parts.push(before)

                const alt = match[1] || ''
                const url = match[2] || ''

                // Only render data: image URLs here for safety
                if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(url)) {
                  parts.push(
                    <img
                      key={parts.length}
                      src={url}
                      alt={alt}
                      className="session-note-shared-card__inline-image"
                      loading="lazy"
                    />
                  )
                } else {
                  // Leave non-data URLs as literal markdown text
                  parts.push(match[0])
                }

                lastIndex = imgRe.lastIndex
              }

              const rest = md.slice(lastIndex)
              if (rest) parts.push(rest)

              // Render array with preserved line breaks
              return parts.map((p, i) =>
                typeof p === 'string' ? (
                  <span key={i} style={{ whiteSpace: 'pre-wrap' }}>
                    {p}
                  </span>
                ) : (
                  p
                )
              )
            })()}
          </div>
        </div>
      ) : null}
      {timestampLabel ? (
        <div className="session-note-shared-card__footer">
          <time dateTime={timestampDateTime}>{timestampLabel}</time>
          {hashtagsSummary ? (
            <span className="session-note-shared-card__hashtags" title={hashtags.join(', ')}>
              {hashtagsSummary}
            </span>
          ) : null}
        </div>
      ) : hashtagsSummary ? (
        <div className="session-note-shared-card__footer session-note-shared-card__footer--hashtags-only">
          <span className="session-note-shared-card__hashtags" title={hashtags.join(', ')}>
            {hashtagsSummary}
          </span>
        </div>
      ) : null}
    </article>
  )
}
