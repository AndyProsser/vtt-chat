import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SessionState, type Role, type UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import { JournalPanel } from '@/components/workspaces/shared/panels/JournalPanel'
import type { Session } from '@/types/session'
import '@/styles/components/workspaces/shared/panels/KnowledgePanels.css'

interface SessionJournalStatus {
  hasJournal: boolean
  hasContent: boolean
}

interface OptimisticSessionSelection {
  sessionId: UUID
  baselineControlledSessionId: UUID | null
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
    }
  }

  if (hoursSinceSession < 24) {
    return {
      cardBody:
        'No recap yet. Fair enough. The scribes or the machine spirits may still be sorting the dragonfire.',
    }
  }

  return {
    cardBody:
      'No recap yet. More than 24 hours have passed, so this now qualifies as a failed lore check.',
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
  const sessionItemRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const updateJournalStatus = useCallback((sessionId: UUID, nextStatus: SessionJournalStatus) => {
    setJournalStatusBySession((current) => ({
      ...current,
      [sessionId]: nextStatus,
    }))
  }, [])

  const sortedSessions = useMemo(
    () => [...sessions].sort((left, right) => right.createdAt - left.createdAt),
    [sessions]
  )
  const fallbackSession = sortedSessions[0] ?? null
  const controlledSessionId = selectedSessionId || fallbackSession?.id || null
  const [optimisticSelection, setOptimisticSelection] = useState<OptimisticSessionSelection | null>(
    controlledSessionId
      ? {
          sessionId: controlledSessionId,
          baselineControlledSessionId: controlledSessionId,
        }
      : null
  )
  const effectiveSessionId =
    optimisticSelection && optimisticSelection.baselineControlledSessionId === controlledSessionId
      ? optimisticSelection.sessionId
      : controlledSessionId
  const effectiveSession =
    sortedSessions.find((session) => session.id === effectiveSessionId) ?? fallbackSession
  const recentSessions = sortedSessions
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

  useEffect(() => {
    if (!effectiveSessionId) {
      return
    }

    const selectedItem = sessionItemRefs.current[effectiveSessionId]
    if (!selectedItem) {
      return
    }

    selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [effectiveSessionId])

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
            const nextSession = index > 0 ? recentSessions[index - 1] : undefined
            const missingCopy = buildMissingRecapCopy(session, nextSession)

            return (
              <div
                key={session.id}
                role="listitem"
                className={`knowledge-panel-session-item ${isSelected ? 'is-selected' : ''}`}
                ref={(node) => {
                  sessionItemRefs.current[session.id] = node
                }}
              >
                <button
                  type="button"
                  className={`knowledge-panel-card knowledge-panel-card--interactive ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    setOptimisticSelection({
                      sessionId: session.id,
                      baselineControlledSessionId: controlledSessionId,
                    })
                    onSessionChange(session.id)
                  }}
                  aria-pressed={isSelected}
                >
                  <div className="knowledge-panel-card-header">
                    <div>
                      <h4 className="knowledge-panel-card-title">{session.name}</h4>
                      <p className="knowledge-panel-card-subtitle">
                        {new Date(session.createdAt).toLocaleDateString()}
                      </p>
                      <p className="knowledge-panel-card-body knowledge-panel-card-body--compact">
                        {hasContent ? 'Recap ready for players.' : missingCopy.cardBody}
                      </p>
                    </div>
                    <div className="knowledge-panel-chip-row">
                      {index === 0 ? <span className="knowledge-panel-chip">Latest</span> : null}
                      {!hasContent ? (
                        <span className="knowledge-panel-chip knowledge-panel-chip--warn">
                          Needs recap
                        </span>
                      ) : null}
                      <span className="knowledge-panel-chip muted">
                        {isSelected ? 'Open' : 'Open journal'}
                      </span>
                    </div>
                  </div>
                </button>

                {isSelected ? (
                  <div className="knowledge-panel-session-item__editor">
                    {!hasContent ? (
                      <p className="knowledge-panel-copy knowledge-panel-copy--meta-inline">
                        No recap yet for this session. Open the markdown journal below and write
                        what happened.
                      </p>
                    ) : null}

                    <JournalPanel
                      key={session.id}
                      apiUrl={apiUrl}
                      token={token}
                      sessionId={session.id}
                      sessionName={session.name}
                      role={role}
                      autoEdit
                      autoSave
                      hideHeader
                      onSaved={({ hasContent: nextHasContent, hasJournal }) => {
                        updateJournalStatus(session.id, {
                          hasContent: nextHasContent,
                          hasJournal,
                        })
                      }}
                    />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
