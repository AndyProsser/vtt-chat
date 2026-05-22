import { useMemo, useState } from 'react'
import type { Role, UUID } from '@shared'
import { useStore } from '@/hooks/useStore'
import type { Note } from '@/types/notes'
import '@/styles/components/session/KnowledgePanels.css'

interface JournalPanelSimplifiedProps {
  sessionId: UUID
  role: Role
}

const EMPTY_NOTES: Record<UUID, Note> = {}

export function JournalPanelSimplified({ sessionId, role }: JournalPanelSimplifiedProps) {
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)

  const sessionNotes = useStore((state) => state.notes[sessionId] ?? EMPTY_NOTES)

  // Simply list all notes in reverse chronological order
  const entries = useMemo(() => {
    return Object.values(sessionNotes).sort((left, right) => {
      const leftTimestamp = left.publishedAt ?? left.updatedAt
      const rightTimestamp = right.publishedAt ?? right.updatedAt
      return rightTimestamp - leftTimestamp
    })
  }, [sessionNotes])

  const isDm = role === 'DM'

  if (entries.length === 0) {
    return (
      <section className="knowledge-panel" aria-label="Journal">
        <h3 className="knowledge-panel__heading">Journal</h3>
        <p className="knowledge-panel__empty">No journal entries yet.</p>
      </section>
    )
  }

  return (
    <section className="knowledge-panel" aria-label="Journal">
      <h3 className="knowledge-panel__heading">Journal</h3>
      <div className="knowledge-panel__content">
        {entries.map((entry) => (
          <div key={entry.id} className="knowledge-panel__entry">
            <button
              type="button"
              onClick={() =>
                setExpandedNoteId(expandedNoteId === entry.id ? null : (entry.id as string))
              }
              className="knowledge-panel__entry-header"
            >
              <span className="knowledge-panel__entry-title">{entry.title}</span>
              <span className="knowledge-panel__entry-meta">
                {entry.ownerUsername}
                {entry.tags.length > 0 && ` · ${entry.tags.join(', ')}`}
              </span>
            </button>
            {expandedNoteId === entry.id && (
              <div className="knowledge-panel__entry-body">
                <p>{entry.content}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
