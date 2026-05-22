import { useEffect, useMemo, useState } from 'react'
import { SessionState, type Role, type UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import { JournalPanel } from '@/components/workspaces/shared/panels/JournalPanel'
import type { Session } from '@/types/session'
import '@/styles/components/workspaces/shared/panels/KnowledgePanels.css'

interface SessionJournalStatus {
  hasJournal: boolean
  hasContent: boolean
}

interface RawNote {
  id: string
  title?: string
  content?: string
  markdown?: string
  tags?: string[]
}

const JOURNAL_TAG = '_journal'
const DAY_IN_MS = 24 * 60 * 60 * 1000

interface MissingRecapCopy {
  cardBody: string
  sectionHint: string
}

function getSessionReferenceTime(session: Session): number {
  return session.endedAt ?? session.startedAt ?? session.createdAt
}

function isSessionLive(session: Session | undefined): boolean {
  if (!session) {
    return false
  }

  return (
    session.state === SessionState.ACTIVE ||
    session.state === SessionState.PAUSED ||
    session.state === SessionState.COOLDOWN
  )
}

function buildMissingRecapCopy(
  session: Session,
  nextSession: Session | undefined
): MissingRecapCopy {
  const hoursSinceSession = Math.floor(
    (Date.now() - getSessionReferenceTime(session)) / (60 * 60 * 1000)
  )

  if (isSessionLive(nextSession)) {
    return {
      cardBody:
        'Next session is live. The recap scroll is still missing and the summary hamsters are visibly overworked.',
      sectionHint:
        'No recap yet. The players are here now, the summary hamsters are still busy, and the bard is buying time.',
    }
  }

  if (hoursSinceSession < 24) {
    return {
      cardBody:
        'No recap yet. Fair enough. The scribes or the machine spirits may still be sorting the dragonfire.',
      sectionHint:
        'No recap yet. Be nice to yourself: it has been less than 24 hours, so either the system is still grinding or the human is.',
    }
  }

  return {
    cardBody:
      'No recap yet. More than 24 hours have passed, so this now qualifies as a failed lore check.',
    sectionHint:
      'No recap yet. More than 24 hours have passed. The party managed a long rest; apparently the chronicler did not manage one page of notes.',
  }
}

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
  const [journalStatusBySession, setJournalStatusBySession] = useState<
    Record<string, SessionJournalStatus>
  >({})

  const sortedSessions = [...sessions].sort((left, right) => right.createdAt - left.createdAt)
  const fallbackSession = sortedSessions[0] ?? null
  const effectiveSessionId = selectedSessionId ?? fallbackSession?.id ?? null
  const effectiveSession =
    sortedSessions.find((session) => session.id === effectiveSessionId) ?? fallbackSession
  const recentSessions = sortedSessions.slice(0, 6)
  const effectiveStatus = effectiveSessionId
    ? journalStatusBySession[effectiveSessionId]
    : undefined
  const sessionIndexById = useMemo(
    () => new Map(sortedSessions.map((session, index) => [session.id, index])),
    [sortedSessions]
  )
  const effectiveSessionIndex = effectiveSessionId
    ? sessionIndexById.get(effectiveSessionId)
    : undefined
  const effectiveNextSession =
    typeof effectiveSessionIndex === 'number' && effectiveSessionIndex > 0
      ? sortedSessions[effectiveSessionIndex - 1]
      : undefined
  const effectiveMissingCopy = effectiveSession
    ? buildMissingRecapCopy(effectiveSession, effectiveNextSession)
    : null

  useEffect(() => {
    let cancelled = false

    const loadStatuses = async () => {
      const entries = await Promise.all(
        recentSessions.map(async (session) => {
          try {
            const response = await fetch(`${apiUrl}/api/notes/${session.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            })

            if (!response.ok) {
              return [session.id, { hasJournal: false, hasContent: false }] as const
            }

            const data = (await response.json()) as { notes?: RawNote[] }
            const journalNote = (data.notes ?? []).find(
              (note) => note.tags?.includes(JOURNAL_TAG) || note.title === 'Session Journal'
            )
            const markdown = (journalNote?.markdown ?? journalNote?.content ?? '').trim()

            return [
              session.id,
              {
                hasJournal: Boolean(journalNote),
                hasContent: markdown.length > 0,
              },
            ] as const
          } catch {
            return [session.id, { hasJournal: false, hasContent: false }] as const
          }
        })
      )

      if (!cancelled) {
        setJournalStatusBySession(Object.fromEntries(entries))
      }
    }

    if (recentSessions.length > 0) {
      void loadStatuses()
    }

    return () => {
      cancelled = true
    }
  }, [apiUrl, token, recentSessions])

  const recapSummary = useMemo(() => {
    const statuses = recentSessions.map((session) => journalStatusBySession[session.id])
    return {
      completed: statuses.filter((status) => status?.hasContent).length,
      missing: statuses.filter((status) => !status?.hasContent).length,
    }
  }, [journalStatusBySession, recentSessions])

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
            <span className="knowledge-panel-chip muted">
              {recapSummary.completed} done / {recapSummary.missing} need recap
            </span>
          </div>
        </div>
      </header>

      <div className="knowledge-panel-group">
        <p className="knowledge-panel-group-title">Recent Sessions</p>
        <div className="knowledge-panel-session-list" role="list" aria-label="Recent sessions">
          {recentSessions.map((session, index) => {
            const isSelected = session.id === effectiveSessionId
            const sessionStatus = journalStatusBySession[session.id]
            const hasContent = Boolean(sessionStatus?.hasContent)
            const hasJournal = Boolean(sessionStatus?.hasJournal)
            const nextSession = index > 0 ? recentSessions[index - 1] : undefined
            const missingCopy = buildMissingRecapCopy(session, nextSession)

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
                    <p className="knowledge-panel-card-body knowledge-panel-card-body--compact">
                      {hasContent
                        ? 'Recap ready for players.'
                        : hasJournal
                          ? missingCopy.cardBody
                          : missingCopy.cardBody}
                    </p>
                  </div>
                  <div className="knowledge-panel-chip-row">
                    {index === 0 ? <span className="knowledge-panel-chip">Latest</span> : null}
                    {hasContent ? (
                      <span className="knowledge-panel-chip muted">Has recap</span>
                    ) : (
                      <span className="knowledge-panel-chip knowledge-panel-chip--warn">
                        Needs recap
                      </span>
                    )}
                    {isSelected ? <span className="knowledge-panel-chip muted">Open</span> : null}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <section className="knowledge-panel-group" aria-label="Selected session journal">
        <div className="knowledge-panel-section-summary">
          <span className="knowledge-panel-group-title">Session Journal</span>
          <strong className="knowledge-panel-section-summary__title">
            {effectiveSession.name}
          </strong>
          {!effectiveStatus?.hasContent && effectiveMissingCopy ? (
            <span className="knowledge-panel-section-summary__hint">
              {effectiveMissingCopy.sectionHint}
            </span>
          ) : null}
        </div>

        <JournalPanel
          apiUrl={apiUrl}
          token={token}
          sessionId={effectiveSessionId}
          sessionName={effectiveSession.name}
          role={role}
          autoEdit
        />
      </section>
    </section>
  )
}
