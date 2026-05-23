import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SessionState, type Role, type UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import { JournalPanel } from '@/components/workspaces/shared/panels/JournalPanel'
import type { Session } from '@/types/session'
import '@/styles/components/workspaces/shared/panels/KnowledgePanels.css'

interface SessionJournalStatus {
  hasJournal: boolean
  hasContent: boolean
  hashtags: string[]
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

function normalizeCardHashtag(tag: string): string {
  const trimmed = tag.trim().toLowerCase()
  if (!trimmed) {
    return ''
  }

  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`
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
  const [closingSessionId, setClosingSessionId] = useState<UUID | null>(null)
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)
  const prevEffectiveSessionIdRef = useRef<UUID | null>(null)

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
    const prev = prevEffectiveSessionIdRef.current
    prevEffectiveSessionIdRef.current = effectiveSessionId ?? null

    if (prev && effectiveSessionId && prev !== effectiveSessionId) {
      setClosingSessionId(prev)
      const timer = window.setTimeout(() => setClosingSessionId(null), 300)
      return () => window.clearTimeout(timer)
    }
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
            const hashtags = (journalNote?.tags ?? []).filter((tag) => tag !== JOURNAL_TAG)

            return [
              session.id,
              {
                hasJournal: Boolean(journalNote),
                hasContent: markdown.length > 0,
                hashtags,
              },
            ] as const
          } catch {
            return [session.id, { hasJournal: false, hasContent: false, hashtags: [] }] as const
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
  const visibleSessions = useMemo(() => {
    if (!activeTagFilter) {
      return recentSessions
    }

    return recentSessions.filter((session) => {
      const tags = journalStatusBySession[session.id]?.hashtags ?? []
      return tags.some((tag) => normalizeCardHashtag(tag) === activeTagFilter)
    })
  }, [activeTagFilter, journalStatusBySession, recentSessions])

  if (!effectiveSessionId || !effectiveSession) {
    return (
      <section className="knowledge-panel knowledge-panel--compact" aria-label="Campaign journal">
        <header className="knowledge-panel-header">
          <div>
            <h3 className="knowledge-panel-title">
              <Icon name="journal" />
              Campaign Journal
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
          <h3 className="knowledge-panel-title">
            <Icon name="journal" />
            Campaign Journal
          </h3>
          <div className="knowledge-panel-chip-row">
            <span className="knowledge-panel-chip muted">Recapping: {effectiveSession.name}</span>
            <span className="knowledge-panel-chip muted">
              {new Date(effectiveSession.createdAt).toLocaleDateString()}
            </span>
            <span className="knowledge-panel-chip muted">
              {recapSummary.completed} done / {recapSummary.missing} need recap
            </span>
            {activeTagFilter ? (
              <button
                type="button"
                className="knowledge-panel-chip muted"
                onClick={() => setActiveTagFilter(null)}
              >
                Filter: {activeTagFilter} x
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="knowledge-panel-group">
        <p className="knowledge-panel-group-title">Recent Sessions</p>
        <div className="knowledge-panel-session-list" role="list" aria-label="Recent sessions">
          {visibleSessions.map((session, index) => {
            const isSelected = session.id === effectiveSessionId
            const sessionStatus = journalStatusBySession[session.id]
            const hasContent = Boolean(sessionStatus?.hasContent)
            const isClosing = session.id === closingSessionId
            const sessionHashtags = sessionStatus?.hashtags ?? []
            const visibleSessionHashtags = sessionHashtags.slice(0, 5)
            const hiddenTagCount = Math.max(
              0,
              sessionHashtags.length - visibleSessionHashtags.length
            )
            const nextSession = index > 0 ? visibleSessions[index - 1] : undefined
            const missingCopy = buildMissingRecapCopy(session, nextSession)

            return (
              <div key={session.id} role="listitem" className="knowledge-panel-session-item">
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
                      {!hasContent ? (
                        <p className="knowledge-panel-card-body knowledge-panel-card-body--compact">
                          {missingCopy.cardBody}
                        </p>
                      ) : null}
                    </div>
                    <div className="knowledge-panel-card-header__right">
                      <div className="knowledge-panel-chip-row">
                        {index === 0 ? <span className="knowledge-panel-chip">Latest</span> : null}
                        {!hasContent ? (
                          <span className="knowledge-panel-chip knowledge-panel-chip--warn">
                            Needs recap
                          </span>
                        ) : null}
                        <span
                          className="material-symbols-outlined knowledge-panel-card__expand-icon"
                          aria-hidden="true"
                        >
                          {isSelected ? 'expand_less' : 'expand_more'}
                        </span>
                      </div>
                      {sessionHashtags.length > 0 ? (
                        <div className="knowledge-panel-chip-row knowledge-panel-chip-row--right">
                          {visibleSessionHashtags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              className={`knowledge-panel-chip muted ${
                                activeTagFilter === normalizeCardHashtag(tag)
                                  ? 'knowledge-panel-chip--active'
                                  : ''
                              }`}
                              onClick={(event) => {
                                event.stopPropagation()
                                const normalizedTag = normalizeCardHashtag(tag)
                                setActiveTagFilter((current) =>
                                  current === normalizedTag ? null : normalizedTag
                                )
                                setOptimisticSelection({
                                  sessionId: session.id,
                                  baselineControlledSessionId: controlledSessionId,
                                })
                                onSessionChange(session.id)
                              }}
                              aria-label={`Filter by ${normalizeCardHashtag(tag)}`}
                            >
                              {normalizeCardHashtag(tag)}
                            </button>
                          ))}
                          {hiddenTagCount > 0 ? (
                            <span className="knowledge-panel-card-tags-more muted">
                              {hiddenTagCount} more...
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>

                {isSelected || isClosing ? (
                  <div
                    className={`knowledge-panel-session-item__editor${isClosing ? ' is-closing' : ''}`}
                    aria-hidden={isClosing || undefined}
                  >
                    {isSelected || isClosing ? (
                      <JournalPanel
                        apiUrl={apiUrl}
                        token={token}
                        sessionId={session.id}
                        sessionName={session.name}
                        role={role}
                        autoEdit
                        autoSave
                        hideHeader
                        onSaved={({ hasContent: nextHasContent, hasJournal, hashtags }) => {
                          updateJournalStatus(session.id, {
                            hasContent: nextHasContent,
                            hasJournal,
                            hashtags,
                          })
                        }}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
          {visibleSessions.length === 0 ? (
            <p className="knowledge-panel-empty">No journals found for {activeTagFilter}.</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
