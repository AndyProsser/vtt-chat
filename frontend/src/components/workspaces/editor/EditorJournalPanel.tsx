import type { Role, UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import { JournalPanel } from '@/components/workspaces/shared/panels/JournalPanel'
import type { Session } from '@/types/session'
import '@/styles/components/workspaces/shared/panels/KnowledgePanels.css'

interface EditorJournalPanelProps {
  apiUrl: string
  token: string
  role: Role
  sessions: Session[]
  selectedSessionId: UUID | null
  onSessionChange: (sessionId: UUID) => void
}

export function EditorJournalPanel({
  apiUrl,
  token,
  role,
  sessions,
  selectedSessionId,
  onSessionChange,
}: EditorJournalPanelProps) {
  const sortedSessions = [...sessions].sort((left, right) => right.createdAt - left.createdAt)
  const fallbackSession = sortedSessions[0] ?? null
  const effectiveSessionId = selectedSessionId ?? fallbackSession?.id ?? null
  const effectiveSession =
    sortedSessions.find((session) => session.id === effectiveSessionId) ?? fallbackSession
  const recentSessions = sortedSessions.slice(0, 6)

  if (!effectiveSessionId || !effectiveSession) {
    return (
      <section className="knowledge-panel knowledge-panel--compact" aria-label="Campaign journal">
        <header className="knowledge-panel-header">
          <div>
            <p className="knowledge-panel-eyebrow">Campaign Journal</p>
            <h3 className="knowledge-panel-title">
              <Icon name="journal" />
              Session Recaps
            </h3>
          </div>
        </header>
        <p className="knowledge-panel-empty">
          No sessions exist yet. Start and complete a session before writing the campaign journal.
        </p>
      </section>
    )
  }

  return (
    <section className="knowledge-panel knowledge-panel--compact" aria-label="Campaign journal">
      <header className="knowledge-panel-header">
        <div>
          <p className="knowledge-panel-eyebrow">Campaign Journal</p>
          <h3 className="knowledge-panel-title">
            <Icon name="journal" />
            Session Recaps
          </h3>
          <p className="knowledge-panel-copy">
            One markdown journal per session. Each recap carries the reserved journal tag and one
            searchable hashtag.
          </p>
          <div className="knowledge-panel-chip-row">
            <span className="knowledge-panel-chip muted">Recapping: {effectiveSession.name}</span>
            <span className="knowledge-panel-chip muted">
              {new Date(effectiveSession.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </header>

      <div className="knowledge-panel-group">
        <p className="knowledge-panel-group-title">Recent Sessions</p>
        <div className="knowledge-panel-session-list" role="list" aria-label="Recent sessions">
          {recentSessions.map((session, index) => {
            const isSelected = session.id === effectiveSessionId
            return (
              <button
                key={session.id}
                type="button"
                role="listitem"
                className={`knowledge-panel-card knowledge-panel-card--interactive ${isSelected ? 'selected' : ''}`}
                onClick={() => onSessionChange(session.id)}
                aria-pressed={isSelected}
              >
                <div className="knowledge-panel-card-header">
                  <div>
                    <h4 className="knowledge-panel-card-title">{session.name}</h4>
                    <p className="knowledge-panel-card-subtitle">
                      {new Date(session.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="knowledge-panel-chip-row">
                    {index === 0 ? <span className="knowledge-panel-chip">Latest</span> : null}
                    {isSelected ? <span className="knowledge-panel-chip muted">Open</span> : null}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <JournalPanel
        apiUrl={apiUrl}
        token={token}
        sessionId={effectiveSessionId}
        sessionName={effectiveSession.name}
        role={role}
      />
    </section>
  )
}
