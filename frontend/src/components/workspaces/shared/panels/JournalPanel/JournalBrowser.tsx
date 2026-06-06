import { useCallback, useEffect, useMemo, useState } from 'react'
import { SessionState, type Role, type UUID } from '@shared'
import { getRandomJournalDmRoast, getSeededJournalDmRoast } from '@/constants/journal.constants'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { Icon } from '@/components/ui/Icon'
import { TruncatedTextWithTooltip } from '@/components/ui/TruncatedTextWithTooltip'
import { useStore } from '@/hooks/useStore'
import type { OptimisticSessionSelection } from '@/types/journalPanel'
import type { Session } from '@/types/session'
import { buildMissingRecapCopy, normalizeCardHashtag } from '@/utils/journalPanel'
import { JournalEditor } from './JournalEditor'
import { useJournalStatuses } from './useJournalStatuses'

interface JournalBrowserProps {
  apiUrl: string
  token: string
  campaignId?: UUID
  role: Role
  sessions: Session[]
  selectedSessionId: UUID | null
  onSessionChange: (sessionId: UUID) => void
}

export function JournalBrowser({
  apiUrl,
  token,
  campaignId,
  role,
  sessions,
  selectedSessionId,
  onSessionChange,
}: JournalBrowserProps) {
  const isDm = role === 'DM'
  const currentSessionId = useStore((state) => state.currentSessionId)
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)
  const [editingSessionId, setEditingSessionId] = useState<UUID | null>(null)
  const [saveRequestVersionBySession, setSaveRequestVersionBySession] = useState<
    Record<string, number>
  >({})
  // Track every session whose editor has been mounted; keep it mounted (hidden) thereafter
  // so re-expanding a card doesn't trigger a second fetch.
  const [mountedEditorIds, setMountedEditorIds] = useState<Set<string>>(new Set())

  const eligibleSessions = useMemo(
    () =>
      sessions.filter(
        (session) =>
          session.id !== currentSessionId &&
          (session.state === SessionState.ENDED || session.state === SessionState.CLEANUP)
      ),
    [currentSessionId, sessions]
  )
  const sortedSessions = useMemo(
    () => [...eligibleSessions].sort((left, right) => right.createdAt - left.createdAt),
    [eligibleSessions]
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
  const recentSessionsStatusKey = useMemo(
    () =>
      recentSessions
        .map(
          (session) =>
            `${session.id}:${session.createdAt}:${session.startedAt ?? ''}:${session.endedAt ?? ''}`
        )
        .join('|'),
    [recentSessions]
  )

  const { journalStatusBySession, updateJournalStatus } = useJournalStatuses({
    apiUrl,
    token,
    campaignId,
    recentSessions,
    recentSessionsStatusKey,
  })

  // When a session is selected, register its editor for keep-alive mounting.
  useEffect(() => {
    if (!effectiveSessionId) {
      return
    }
    setMountedEditorIds((prev) => {
      if (prev.has(effectiveSessionId)) {
        return prev
      }
      const next = new Set(prev)
      next.add(effectiveSessionId)
      return next
    })
  }, [effectiveSessionId])

  const getSessionRunDateLabel = useCallback((session: Session): string => {
    const sessionRunTimestamp = session.endedAt ?? session.startedAt ?? session.createdAt
    return new Date(sessionRunTimestamp).toLocaleDateString()
  }, [])

  const getDmRoastOptions = useCallback((seed: string): string[] => {
    const options = new Set<string>()

    for (let index = 0; index < 200 && options.size < 50; index += 1) {
      options.add(getSeededJournalDmRoast(`${seed}:${index}`))
    }

    return [...options]
  }, [])

  const handleToggleEditSelected = useCallback(() => {
    if (!isDm || !effectiveSessionId) {
      return
    }

    if (editingSessionId === effectiveSessionId) {
      setSaveRequestVersionBySession((current) => ({
        ...current,
        [effectiveSessionId]: (current[effectiveSessionId] ?? 0) + 1,
      }))
      setEditingSessionId(null)
      return
    }

    setEditingSessionId(effectiveSessionId)
  }, [editingSessionId, effectiveSessionId, isDm])

  const handleCancelEditSelected = useCallback(() => {
    setEditingSessionId(null)
  }, [])

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

  const isSelectedSessionEditing = editingSessionId === effectiveSessionId

  if (!effectiveSessionId || !effectiveSession) {
    return (
      <section
        className="knowledge-panel knowledge-panel--compact"
        aria-label="Session journal"
        data-testid="journal-panel"
      >
        <header className="knowledge-panel-header">
          <div>
            <h3 className="knowledge-panel-title">
              <Icon name="journal" />
              Session Journal
            </h3>
            <p className="knowledge-panel-subtitle">
              Capture recaps, tag key moments, and keep session lore searchable.
            </p>
          </div>
        </header>
        <p className="knowledge-panel-empty">
          No ended sessions found yet. The journal appears after a session reaches ENDED or CLEANUP.
        </p>
      </section>
    )
  }

  return (
    <section
      className="knowledge-panel knowledge-panel--compact"
      aria-label="Session journal"
      data-testid="journal-panel"
    >
      <header className="knowledge-panel-header">
        <div>
          <h3 className="knowledge-panel-title">
            <Icon name="journal" />
            Session Journal
          </h3>
          <p className="knowledge-panel-subtitle">
            Capture recaps, tag key moments, and keep session lore searchable.
          </p>
        </div>
        {isDm ? (
          <TooltipProvider delayDuration={140}>
            <div className="cip-inline-actions" aria-label="Journal actions">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="session-icon-action session-icon-action--icon"
                    onClick={handleToggleEditSelected}
                    aria-label={isSelectedSessionEditing ? 'Save journal' : 'Edit journal'}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {isSelectedSessionEditing ? 'save' : 'edit'}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {isSelectedSessionEditing ? 'Save journal' : 'Edit journal'}
                </TooltipContent>
              </Tooltip>
              {isSelectedSessionEditing ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="session-icon-action session-icon-action--icon"
                      onClick={handleCancelEditSelected}
                      aria-label="Cancel editing journal"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        undo
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Cancel editing</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </TooltipProvider>
        ) : null}
      </header>

      <div className="knowledge-panel-group">
        <div className="knowledge-panel-group-title">
          <div className="knowledge-panel-chip-row">
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
        <div
          className="knowledge-panel-session-list knowledge-panel-results--scroll"
          role="list"
          aria-label="Recent sessions"
        >
          {visibleSessions.map((session, index) => {
            const isSelected = session.id === effectiveSessionId
            const sessionStatus = journalStatusBySession[session.id]
            const hasContent = Boolean(sessionStatus?.hasContent)
            const needsRecap = sessionStatus?.needsRecap ?? !hasContent
            const isEditorMounted = isSelected || mountedEditorIds.has(session.id)
            const sessionHashtags = sessionStatus?.hashtags ?? []
            const visibleSessionHashtags = sessionHashtags.slice(0, 3)
            const hiddenTagCount = Math.max(
              0,
              sessionHashtags.length - visibleSessionHashtags.length
            )
            const cardTitle = sessionStatus?.journalTitle || session.name
            const cardDate = sessionStatus?.journalUpdatedAt
              ? new Date(sessionStatus.journalUpdatedAt).toLocaleDateString()
              : getSessionRunDateLabel(session)
            const nextSession = index > 0 ? visibleSessions[index - 1] : undefined
            const missingCopy = buildMissingRecapCopy(session, nextSession)
            const selectedRoastOptions = getDmRoastOptions(`${session.id}:${session.name}`)
            const fallbackRoast = selectedRoastOptions[0] ?? getRandomJournalDmRoast()
            const emptyRecapContent = `${missingCopy.cardBody}\n\n> ${fallbackRoast}`

            return (
              <div key={session.id} role="listitem" className="knowledge-panel-session-item">
                <div
                  role="button"
                  tabIndex={0}
                  className={`knowledge-panel-card knowledge-panel-card--interactive ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    setOptimisticSelection({
                      sessionId: session.id,
                      baselineControlledSessionId: controlledSessionId,
                    })
                    onSessionChange(session.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') {
                      return
                    }

                    event.preventDefault()
                    setOptimisticSelection({
                      sessionId: session.id,
                      baselineControlledSessionId: controlledSessionId,
                    })
                    onSessionChange(session.id)
                  }}
                  aria-pressed={isSelected}
                >
                  <div className="knowledge-panel-card-header">
                    <div className="knowledge-panel-card-header__left">
                      <TruncatedTextWithTooltip
                        as="h4"
                        className="knowledge-panel-card-title knowledge-panel-card-title--truncate"
                        text={cardTitle}
                      />
                    </div>
                    <div className="knowledge-panel-card-header__right">
                      <div className="knowledge-panel-chip-row">
                        {index === 0 ? <span className="knowledge-panel-chip">Latest</span> : null}
                        {needsRecap ? (
                          <span className="knowledge-panel-chip knowledge-panel-chip--warn">
                            Needs Recap
                          </span>
                        ) : null}
                      </div>
                      <span
                        className="material-symbols-outlined knowledge-panel-card__expand-icon"
                        aria-hidden="true"
                      >
                        {isSelected ? 'expand_less' : 'expand_more'}
                      </span>
                    </div>
                  </div>
                  <div className="knowledge-panel-card-subheader">
                    <p className="knowledge-panel-card-subtitle">{cardDate}</p>
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
                  </div>
                </div>

                {isEditorMounted ? (
                  <div
                    className="knowledge-panel-session-item__editor"
                    hidden={!isSelected || undefined}
                    aria-hidden={!isSelected || undefined}
                  >
                    <JournalEditor
                      key={`journal-editor:${session.id}`}
                      apiUrl={apiUrl}
                      token={token}
                      campaignId={campaignId}
                      sessionId={session.id}
                      sessionName={session.name}
                      role={role}
                      autoSave
                      isEditingOverride={editingSessionId === session.id}
                      saveRequestVersion={saveRequestVersionBySession[session.id] ?? 0}
                      emptyStateContent={!hasContent ? emptyRecapContent : undefined}
                      hideHeader
                      onSaved={({ hasContent: nextHasContent, hasJournal, hashtags }) => {
                        updateJournalStatus(session.id, {
                          hasContent: nextHasContent,
                          hasJournal,
                          hashtags,
                          journalTitle: session.name ? `${session.name}` : 'Session Journal',
                          journalUpdatedAt: Date.now(),
                          needsRecap: !nextHasContent,
                        })
                      }}
                    />
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
