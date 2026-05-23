import { type UUID } from '@shared'
import type { Note } from '@/types/notes'

type NotesListWidgetProps = {
  notes: Note[]
  selectedNoteId: UUID | null
  onSelectNote: (noteId: UUID) => void
  getSharedWithLabel: (note: Note) => string
}

function formatTags(note: Note): string {
  if (!note.tags.length) {
    return 'No hashtags'
  }

  return note.tags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(', ')
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
          return (
            <button
              key={note.id}
              type="button"
              onClick={() => props.onSelectNote(note.id)}
              className={`notes-list-item${isSelected ? ' is-selected' : ''}`}
            >
              <div className="notes-list-item-title">{note.title}</div>
              <div className="notes-list-item-meta">by {note.ownerUsername}</div>
              <div className="notes-list-item-meta">
                Shared with: {props.getSharedWithLabel(note)}
              </div>
              <div className="notes-list-item-meta">Tags: {formatTags(note)}</div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
