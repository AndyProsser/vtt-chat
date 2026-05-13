import { useMemo, useState } from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import type { Role, UUID } from '@shared'
import { useStore } from '../../hooks/useStore'
import type { Note } from '@/types/notes'
import '../../styles/components/session/KnowledgePanels.css'

interface JournalPanelProps {
  apiUrl?: string
  token?: string
  sessionId: UUID
  role: Role
  userId?: UUID
}

const EMPTY_NOTES: Record<UUID, Note> = {}

export function JournalPanel({ sessionId, role }: JournalPanelProps) {
  const [viewMode, setViewMode] = useState<'recent' | 'all'>('recent')
  const sessionNotes = useStore((state) => state.notes[sessionId] ?? EMPTY_NOTES)

  // Simply list all notes in reverse chronological order
  const entries = useMemo(() => {
    return Object.values(sessionNotes).sort((left, right) => {
      const leftTimestamp = left.publishedAt ?? left.updatedAt
      const rightTimestamp = right.publishedAt ?? right.updatedAt
      return rightTimestamp - leftTimestamp
    })
  }, [sessionNotes])

  const visibleEntries = useMemo(
    () => (viewMode === 'recent' ? entries.slice(0, 8) : entries),
    [entries, viewMode]
  )

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
      <TabsPrimitive.Root
        value={viewMode}
        onValueChange={(value) => setViewMode(value as 'recent' | 'all')}
        className="knowledge-panel-tabs"
      >
        <TabsPrimitive.List className="knowledge-panel-tabs__list" aria-label="Journal view">
          <TabsPrimitive.Trigger value="recent" className="knowledge-panel-tabs__trigger">
            Recent
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="all" className="knowledge-panel-tabs__trigger">
            All
          </TabsPrimitive.Trigger>
        </TabsPrimitive.List>
      </TabsPrimitive.Root>

      <div className="knowledge-panel__content" aria-label="Journal entries">
        {visibleEntries.map((entry) => (
          <article key={entry.id} className="knowledge-panel__entry">
            <header className="knowledge-panel__entry-header">
              <span className="knowledge-panel__entry-title">{entry.title}</span>
              <span className="knowledge-panel__entry-meta">
                By {entry.ownerUsername}
                {entry.tags.length > 0 && ` · ${entry.tags.join(', ')}`}
              </span>
            </header>

            <div className="knowledge-panel__entry-body">
              <p>{entry.content}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
