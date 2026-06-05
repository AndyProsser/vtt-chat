/**
 * NotesPanelCompact
 *
 * In-session compact notes view. Shows a dense stacked list of note titles —
 * like physical index cards with the title written on the tab. Tapping any card
 * slides in a full-panel read-only view with a back button and DMDX rendering.
 *
 * Used when the notes panel is in the session right rail (limited vertical space).
 * The lobby/editor view uses the full two-column NotesPanel instead.
 */

import { useState, useMemo } from 'react'
import type { UUID } from '@shared'
import { DmdxMarkdownRenderer } from '@/components/workspaces/shared/panels/dmdx/DmdxMarkdownRenderer'
import type { Note } from '@/types/notes'
import '@/styles/components/workspaces/shared/panels/NotesPanel.compact.css'

interface NotesPanelCompactProps {
  notes: Note[]
  isLoading: boolean
  canEdit: boolean
  onCreateRequest: () => void
}

// ---------------------------------------------------------------------------
// NoteDetailOverlay — full-panel read-only view for a single note
// ---------------------------------------------------------------------------

interface NoteDetailOverlayProps {
  note: Note
  onBack: () => void
}

function NoteDetailOverlay({ note, onBack }: NoteDetailOverlayProps) {
  const displayTags = note.tags.map((t) => (t.startsWith('#') ? t : `#${t}`))

  return (
    <div className="notes-compact__overlay" aria-label={`Note: ${note.title}`}>
      <div className="notes-compact__overlay-header">
        <button
          type="button"
          className="notes-compact__back-btn"
          onClick={onBack}
          aria-label="Back to notes list"
        >
          <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          <span>Notes</span>
        </button>

        <div className="notes-compact__overlay-meta">
          {displayTags.slice(0, 4).map((tag) => (
            <span key={tag} className="knowledge-panel-chip muted">
              {tag}
            </span>
          ))}
          {displayTags.length > 4 ? (
            <span className="knowledge-panel-chip muted">+{displayTags.length - 4}</span>
          ) : null}
        </div>
      </div>

      <h3 className="notes-compact__overlay-title">{note.title}</h3>

      <div className="notes-compact__overlay-body">
        <DmdxMarkdownRenderer
          value={note.content}
          placeholder="No content yet."
        />
      </div>
    </div>
  )
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
  // Subtle visual stagger: cards deeper in the list get a tiny downward offset
  // so the stack feels physical — like looking at the top edges of a card deck.
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
  onCreateRequest,
}: NotesPanelCompactProps) {
  const [selectedId, setSelectedId] = useState<UUID | null>(null)

  const selectedNote = useMemo(
    () => (selectedId ? (notes.find((n) => n.id === selectedId) ?? null) : null),
    [notes, selectedId]
  )

  if (selectedNote) {
    return (
      <NoteDetailOverlay
        note={selectedNote}
        onBack={() => setSelectedId(null)}
      />
    )
  }

  return (
    <div className="notes-compact">
      <div className="notes-compact__header">
        <h3 className="notes-compact__heading">
          <span className="material-symbols-outlined" aria-hidden="true">notes</span>
          Handouts
        </h3>
        {canEdit ? (
          <button
            type="button"
            className="session-icon-action session-icon-action--icon"
            onClick={onCreateRequest}
            aria-label="Create handout"
          >
            <span className="material-symbols-outlined" aria-hidden="true">note_add</span>
          </button>
        ) : null}
      </div>

      <div className="notes-compact__stack" role="list" aria-label="Handouts">
        {isLoading ? (
          <p className="notes-compact__empty">Loading handouts…</p>
        ) : notes.length === 0 ? (
          <div className="ui-empty-panel" role="status">
            <span className="material-symbols-outlined" aria-hidden="true">auto_awesome</span>
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
