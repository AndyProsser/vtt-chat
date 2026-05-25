import { type UUID } from '@shared'
import type { Note } from '@/types/notes'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'

type NotesListWidgetProps = {
  notes: Note[]
  selectedNoteId: UUID | null
  onSelectNote: (noteId: UUID) => void
  activeHashtagFilter: string | null
  onTagSelect: (tag: string | null) => void
}

function toDisplayTags(note: Note): string[] {
  return note.tags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
}

export function NotesListWidget(props: NotesListWidgetProps) {
  return (
    <section className="notes-list-widget" aria-label="Handouts list">
      <header className="notes-list-widget-header">
        <span>Handouts</span>
        <span>{props.notes.length}</span>
      </header>

      <div className="notes-list-widget-body">
        {props.notes.map((note) => {
          const isSelected = props.selectedNoteId === note.id
          const displayTags = toDisplayTags(note)
          const visibleTags = displayTags.slice(0, 3)
          const hiddenTagCount = Math.max(0, displayTags.length - visibleTags.length)

          return (
            <button
              key={note.id}
              type="button"
              onClick={() => props.onSelectNote(note.id)}
              className={`notes-list-item${isSelected ? ' is-selected' : ''}`}
            >
              <TooltipProvider delayDuration={140}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="notes-list-item-title">{note.title}</div>
                  </TooltipTrigger>
                  <TooltipContent side="top">{note.title}</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <div className="notes-list-item-tags" aria-label="Note hashtags">
                {visibleTags.length > 0 ? (
                  visibleTags.map((tag) => {
                    const isTagActive = props.activeHashtagFilter === tag
                    return (
                      <span
                        key={`${note.id}:${tag}`}
                        className={`knowledge-panel-chip muted${isTagActive ? ' knowledge-panel-chip--active' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation()
                          props.onTagSelect(isTagActive ? null : tag)
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') {
                            return
                          }

                          event.preventDefault()
                          event.stopPropagation()
                          props.onTagSelect(isTagActive ? null : tag)
                        }}
                      >
                        {tag}
                      </span>
                    )
                  })
                ) : (
                  <span className="knowledge-panel-card-tags-more muted">
                    No hashtags
                  </span>
                )}
                {hiddenTagCount > 0 ? (
                  <span className="knowledge-panel-card-tags-more muted">
                    {hiddenTagCount} more...
                  </span>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
