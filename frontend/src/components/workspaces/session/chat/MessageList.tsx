/**
 * MessageList
 * Renders the chronological list of messages for the current session.
 * Messages arrive pre-filtered by the server (visibility-safe).
 */

import { Fragment, useMemo } from 'react'
import type { RefObject, UIEventHandler, WheelEventHandler } from 'react'
import type { Message, SessionBookendState, SessionSummaryStats } from '@/types/chat'
import { MessageType } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
interface MessageListProps {
  messages: Message[]
  currentUserId: string
  currentUserRole?: string
  sessionDmId?: string
  groupingWindowMs?: number
  listRef?: RefObject<HTMLDivElement | null>
  topSentinelRef?: RefObject<HTMLDivElement | null>
  onListScroll?: UIEventHandler<HTMLDivElement>
  onListWheel?: WheelEventHandler<HTMLDivElement>
  participantDirectory?: Record<string, { displayName?: string; avatarUrl?: string | null }>
  roomDirectory?: Record<string, { name: string }>
  activeRoomId?: string
  hideIntermissionMarkers?: boolean
  emptyDayLabel?: string
}

const DEFAULT_GROUPING_WINDOW_MS = 5 * 60 * 1000

const TYPE_VARIANTS: Record<string, 'ic' | 'ooc' | 'whisper' | 'dm' | 'system'> = {
  [MessageType.IC]: 'ic',
  [MessageType.OOC]: 'ooc',
  [MessageType.WHISPER]: 'whisper',
  [MessageType.DM]: 'dm',
  [MessageType.SYSTEM]: 'system',
}

const TYPE_ICON_BY_VARIANT: Record<'ic' | 'ooc' | 'whisper' | 'dm' | 'system', string> = {
  ic: 'swords',
  ooc: 'chat_bubble',
  whisper: 'visibility_off',
  dm: 'mail',
  system: 'info',
}

const TYPE_LABEL_BY_VARIANT: Record<'ic' | 'ooc' | 'whisper' | 'dm' | 'system', string> = {
  ic: 'In Character',
  ooc: 'Out of Character',
  whisper: 'Whisper',
  dm: 'DM',
  system: 'System',
}

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000'
const SESSION_BOOKEND_PREFIXES = [
  'Session Start:',
  'Session End:',
  '[Session Started]',
  '[Session Ended]',
  '[Session Paused]',
  '[Session Resumed]',
  '[Session Cooldown]',
]
const SESSION_NOTE_PREFIX = 'Session Note:'
const SESSION_RECAP_PREFIX = '[Last Session]'
const CAMPAIGN_BRIEF_PREFIX = '[Campaign Brief]'
const SESSION_SUMMARY_PREFIX = '[Session Summary]'

function parseSessionSummary(content: string): SessionSummaryStats | null {
  try {
    const json = content.slice(SESSION_SUMMARY_PREFIX.length).trim()
    return JSON.parse(json) as SessionSummaryStats
  } catch {
    return null
  }
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}
const BOOKEND_META: Record<
  SessionBookendState,
  { label: string; icon: string; className: string }
> = {
  started: {
    label: 'STARTED',
    icon: 'play_circle',
    className: 'session-message-list__session-marker--started',
  },
  ended: {
    label: 'ENDED',
    icon: 'stop_circle',
    className: 'session-message-list__session-marker--ended',
  },
  paused: {
    label: 'PAUSED',
    icon: 'pause_circle',
    className: 'session-message-list__session-marker--paused',
  },
  resumed: {
    label: 'RESUMED',
    icon: 'play_circle',
    className: 'session-message-list__session-marker--resumed',
  },
  cooldown: {
    label: 'CLOSED',
    icon: 'theaters',
    className: 'session-message-list__session-marker--cooldown',
  },
}

function getSessionBookendState(content: string): SessionBookendState | null {
  if (content.startsWith('[Session Started]') || content.startsWith('Session Start:')) {
    return 'started'
  }
  if (content.startsWith('[Session Ended]') || content.startsWith('Session End:')) {
    return 'ended'
  }
  if (content.startsWith('[Session Paused]')) {
    return 'paused'
  }
  if (content.startsWith('[Session Resumed]')) {
    return 'resumed'
  }
  if (content.startsWith('[Session Cooldown]')) {
    return 'cooldown'
  }

  return null
}

function formatBookendTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getAuthorInitial(username: string): string {
  return username.trim().charAt(0).toUpperCase() || '?'
}

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts
  const seconds = Math.max(1, Math.floor(diffMs / 1000))

  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? '' : 's'} ago`
  }

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }

  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function dayKey(ts: number): string {
  const date = new Date(ts)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function formatDayLabel(ts: number): string {
  const targetDate = new Date(ts)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfTarget = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate()
  )
  const deltaDays = Math.round(
    (startOfTarget.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000)
  )

  if (deltaDays === 0) {
    return 'Today'
  }

  if (deltaDays === -1) {
    return 'Yesterday'
  }

  return targetDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function MessageList({
  messages,
  currentUserId,
  currentUserRole,
  sessionDmId,
  groupingWindowMs = DEFAULT_GROUPING_WINDOW_MS,
  listRef,
  topSentinelRef,
  onListScroll,
  onListWheel,
  participantDirectory,
  roomDirectory,
  activeRoomId,
  hideIntermissionMarkers = false,
  emptyDayLabel,
}: MessageListProps) {
  const isDmViewer = currentUserRole === 'DM'

  const preparedMessages = useMemo(
    () =>
      messages.map((msg, index) => {
        const previous = index > 0 ? messages[index - 1] : undefined
        const variant = TYPE_VARIANTS[msg.type] ?? TYPE_VARIANTS[MessageType.OOC]
        const isSystem = msg.type === MessageType.SYSTEM || msg.authorId === SYSTEM_USER_ID
        const isSessionBookend =
          isSystem && SESSION_BOOKEND_PREFIXES.some((prefix) => msg.content.startsWith(prefix))
        const sessionBookendState = isSessionBookend ? getSessionBookendState(msg.content) : null
        const isSessionNote = isSystem && msg.content.startsWith(SESSION_NOTE_PREFIX)
        const recapPrefix = msg.content.startsWith(CAMPAIGN_BRIEF_PREFIX)
          ? CAMPAIGN_BRIEF_PREFIX
          : SESSION_RECAP_PREFIX
        const isSessionRecap = isSystem && msg.content.startsWith(recapPrefix)
        const isSessionSummary = isSystem && msg.content.startsWith(SESSION_SUMMARY_PREFIX)
        const summaryStats = isSessionSummary ? parseSessionSummary(msg.content) : null
        const isSelf = !isSystem && msg.authorId === currentUserId
        const roomName = msg.roomId ? roomDirectory?.[msg.roomId]?.name : undefined
        const authorProfile = participantDirectory?.[msg.authorId]
        const authorName = isSystem
          ? 'SYSTEM'
          : authorProfile?.displayName || msg.authorUsername || 'Unknown'
        const authorAvatarUrl = isSystem ? null : (authorProfile?.avatarUrl ?? null)
        const whisperTargetNames =
          (msg.type === MessageType.WHISPER || msg.type === MessageType.DM) &&
          Array.isArray(msg.targetIds) &&
          msg.targetIds.length > 0
            ? msg.targetIds
                .map((targetId) => participantDirectory?.[targetId]?.displayName || 'Unknown')
                .filter((name) => name.trim().length > 0)
            : []
        const whisperRouteText =
          msg.type === MessageType.DM
            ? 'DM'
            : msg.type === MessageType.WHISPER && whisperTargetNames.length === 1
              ? whisperTargetNames[0]
              : null
        const whisperRouteLines =
          msg.type === MessageType.WHISPER && whisperTargetNames.length > 1
            ? whisperTargetNames
            : []
        const whisperRouteEntries =
          whisperRouteLines.length > 0
            ? whisperRouteLines
            : whisperRouteText
              ? [whisperRouteText]
              : []
        const hasWhisperRoute = whisperRouteEntries.length > 0
        const isDmWhisper =
          msg.type === MessageType.DM ||
          (msg.type === MessageType.WHISPER && Boolean(sessionDmId) && msg.authorId === sessionDmId)
        const bubbleWhisperClass =
          (msg.type === MessageType.WHISPER || msg.type === MessageType.DM) && isDmWhisper
            ? 'session-message-list__message-bubble--whisper-dm'
            : ''
        const typeIconClass = `session-message-list__message-type-icon--${variant}`
        const typeIcon = TYPE_ICON_BY_VARIANT[variant]
        const isGroupedWithPrevious = Boolean(
          groupingWindowMs > 0 &&
          previous &&
          previous.authorId === msg.authorId &&
          msg.createdAt - previous.createdAt <= groupingWindowMs
        )
        const showRoomShift = Boolean(
          !isSystem &&
          roomName &&
          (!previous || previous.roomId !== msg.roomId || previous.type === MessageType.SYSTEM)
        )
        const showDaySeparator = !previous || dayKey(previous.createdAt) !== dayKey(msg.createdAt)
        const dayLabel = showDaySeparator ? formatDayLabel(msg.createdAt) : null
        const relativeTime = formatRelativeTime(msg.createdAt)
        const bookendTime = isSessionBookend ? formatBookendTimestamp(msg.createdAt) : null

        return {
          msg,
          variant,
          isSystem,
          isSessionBookend,
          sessionBookendState,
          isSessionNote,
          recapPrefix,
          isSessionRecap,
          isSessionSummary,
          summaryStats,
          isSelf,
          roomName,
          authorName,
          authorAvatarUrl,
          whisperRouteEntries,
          hasWhisperRoute,
          isDmWhisper,
          bubbleWhisperClass,
          typeIconClass,
          typeIcon,
          isGroupedWithPrevious,
          showRoomShift,
          showDaySeparator,
          dayLabel,
          relativeTime,
          bookendTime,
        }
      }),
    [currentUserId, groupingWindowMs, messages, participantDirectory, roomDirectory, sessionDmId]
  )

  if (messages.length === 0) {
    return (
      <TooltipProvider delayDuration={120}>
        <div
          ref={listRef}
          onScroll={onListScroll}
          onWheel={onListWheel}
          className="session-message-list"
        >
          <div ref={topSentinelRef} aria-hidden="true" className="session-message-list__sentinel" />
          {emptyDayLabel ? (
            <div
              className="session-message-list__day-separator"
              aria-label={`Messages from ${emptyDayLabel}`}
            >
              <span className="session-message-list__day-separator-line" aria-hidden="true" />
              <span className="session-message-list__day-separator-pill">{emptyDayLabel}</span>
              <span className="session-message-list__day-separator-line" aria-hidden="true" />
            </div>
          ) : null}
          <div className="session-message-list__empty">No messages yet. Say something!</div>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider delayDuration={120}>
      <div
        ref={listRef}
        onScroll={onListScroll}
        onWheel={onListWheel}
        className="session-message-list"
      >
        {/* Sentinel used by IntersectionObserver to trigger older-history paging. */}
        <div ref={topSentinelRef} aria-hidden="true" className="session-message-list__sentinel" />
        {preparedMessages.map((prepared) => {
          const {
            msg,
            variant,
            isSystem,
            isSessionBookend,
            sessionBookendState,
            isSessionNote,
            recapPrefix,
            isSessionRecap,
            isSessionSummary,
            summaryStats,
            isSelf,
            roomName,
            authorName,
            authorAvatarUrl,
            whisperRouteEntries,
            hasWhisperRoute,
            isDmWhisper,
            bubbleWhisperClass,
            typeIconClass,
            typeIcon,
            isGroupedWithPrevious,
            showRoomShift,
            showDaySeparator,
            dayLabel,
            relativeTime,
            bookendTime,
          } = prepared

          if (
            hideIntermissionMarkers &&
            (sessionBookendState === 'paused' ||
              sessionBookendState === 'resumed' ||
              sessionBookendState === 'cooldown')
          ) {
            return null
          }

          if (isSessionSummary) {
            const stats = summaryStats
            if (!stats) return null
            const durationMs =
              stats.endedAt && stats.startedAt ? stats.endedAt - stats.startedAt : null
            const startedDisplay = stats.startedAt
              ? new Date(stats.startedAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : null
            return (
              <article key={msg.id} className="session-message-list__session-summary">
                <div className="session-message-list__session-summary-header">
                  <span
                    className="session-message-list__session-summary-icon material-symbols-outlined"
                    aria-hidden="true"
                  >
                    summarize
                  </span>
                  <span className="session-message-list__session-summary-title">
                    {stats.sessionName}
                  </span>
                </div>
                <dl className="session-message-list__session-summary-stats">
                  {startedDisplay && (
                    <>
                      <dt>Started</dt>
                      <dd>{startedDisplay}</dd>
                    </>
                  )}
                  {durationMs !== null && (
                    <>
                      <dt>Session Time</dt>
                      <dd>{formatDuration(durationMs)}</dd>
                    </>
                  )}
                  <dt>Players</dt>
                  <dd>{stats.playerCount}</dd>
                  {(stats.cumulativePauseMs > 0 || stats.pauseCount > 0) && (
                    <>
                      <dt>Paused</dt>
                      <dd>
                        {formatDuration(stats.cumulativePauseMs)}
                        {stats.pauseCount >= 1 && ` (${stats.pauseCount}×)`}
                      </dd>
                    </>
                  )}
                </dl>
                {stats.quip && (
                  <p className="session-message-list__session-summary-quip">{stats.quip}</p>
                )}
              </article>
            )
          }

          if (isSessionRecap) {
            const recapBody = msg.content.slice(recapPrefix.length).trim()
            const recapLabel =
              recapPrefix === CAMPAIGN_BRIEF_PREFIX ? 'Campaign Brief' : 'Last Session'
            return (
              <article key={msg.id} className="session-message-list__session-recap">
                <span
                  className="session-message-list__session-recap-icon material-symbols-outlined"
                  aria-hidden="true"
                >
                  menu_book
                </span>
                <div className="session-message-list__session-recap-body">
                  <span className="session-message-list__session-recap-label">{recapLabel}</span>
                  <p className="session-message-list__session-recap-text">{recapBody}</p>
                </div>
              </article>
            )
          }

          if (isSessionBookend || isSessionNote) {
            const markerMeta = sessionBookendState ? BOOKEND_META[sessionBookendState] : null
            return (
              <article
                key={msg.id}
                className={`session-message-list__session-marker ${isSessionBookend ? 'session-message-list__session-marker--bookend' : 'session-message-list__session-marker--note'} ${markerMeta?.className || ''}`}
              >
                {isSessionBookend && markerMeta ? (
                  <div className="session-message-list__session-marker-content">
                    <div className="session-message-list__session-marker-label-row">
                      <span
                        className="session-message-list__session-marker-line"
                        aria-hidden="true"
                      />
                      <span className="session-message-list__session-marker-badge">
                        <span
                          className="session-message-list__session-marker-icon material-symbols-outlined"
                          aria-hidden="true"
                        >
                          {markerMeta.icon}
                        </span>
                        <span className="session-message-list__session-marker-text">
                          {markerMeta.label}
                        </span>
                        <span
                          className="session-message-list__session-marker-icon material-symbols-outlined"
                          aria-hidden="true"
                        >
                          {markerMeta.icon}
                        </span>
                      </span>
                      <span
                        className="session-message-list__session-marker-line"
                        aria-hidden="true"
                      />
                    </div>
                    <time
                      className="session-message-list__session-marker-time"
                      dateTime={new Date(msg.createdAt).toISOString()}
                    >
                      {bookendTime}
                    </time>
                  </div>
                ) : (
                  <span className="session-message-list__session-marker-text">{msg.content}</span>
                )}
              </article>
            )
          }

          return (
            <Fragment key={msg.id}>
              {showDaySeparator ? (
                <div
                  className="session-message-list__day-separator"
                  aria-label={`Messages from ${dayLabel}`}
                >
                  <span className="session-message-list__day-separator-line" aria-hidden="true" />
                  <span className="session-message-list__day-separator-pill">{dayLabel}</span>
                  <span className="session-message-list__day-separator-line" aria-hidden="true" />
                </div>
              ) : null}

              {showRoomShift ? (
                <div
                  className="session-message-list__room-shift"
                  aria-label={`Room shift to ${roomName}`}
                >
                  <span className="session-message-list__room-shift-line" aria-hidden="true" />
                  <span
                    className={`session-message-list__room-shift-pill ${msg.roomId === activeRoomId ? 'session-message-list__room-shift-pill--active' : ''}`}
                  >
                    {msg.roomId === activeRoomId ? 'In ' : 'From '}
                    {roomName}
                  </span>
                </div>
              ) : null}

              <article
                className={`session-message-list__message ${msg.type === MessageType.WHISPER ? 'session-message-list__message--whisper' : ''} ${isSelf ? 'session-message-list__message--self' : ''} ${isGroupedWithPrevious ? 'session-message-list__message--grouped' : ''}`}
              >
                <div className="session-message-list__message-row">
                  {!isSelf && !isGroupedWithPrevious ? (
                    <span
                      className={`session-message-list__message-avatar ${isSystem ? 'session-message-list__message-avatar--system' : ''}`}
                      aria-hidden="true"
                    >
                      {authorAvatarUrl ? (
                        <img src={authorAvatarUrl} alt="" />
                      ) : (
                        getAuthorInitial(authorName)
                      )}
                    </span>
                  ) : (
                    <span
                      className="session-message-list__message-avatar session-message-list__message-avatar--spacer"
                      aria-hidden="true"
                    />
                  )}

                  <div className="session-message-list__message-content">
                    {!isGroupedWithPrevious ? (
                      <div className="session-message-list__message-meta">
                        <span className="session-message-list__message-author">{authorName}</span>
                      </div>
                    ) : null}

                    <div
                      className={`session-message-list__message-bubble session-message-list__message-bubble--${variant} ${bubbleWhisperClass} ${isSelf ? 'session-message-list__message-bubble--self' : ''}`}
                    >
                      {msg.type !== MessageType.WHISPER ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={`session-message-list__message-type-icon ${typeIconClass} material-symbols-outlined`}
                              aria-hidden="true"
                            >
                              {typeIcon}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {TYPE_LABEL_BY_VARIANT[variant]}
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                      <span className="session-message-list__message-bubble-text">
                        {msg.content}
                      </span>
                    </div>

                    <div
                      className={`session-message-list__message-footer ${hasWhisperRoute ? `session-message-list__message-footer--whisper ${isSelf ? 'session-message-list__message-footer--whisper-outgoing' : 'session-message-list__message-footer--whisper-incoming'}` : ''}`}
                    >
                      {hasWhisperRoute ? (
                        <div
                          className={`session-message-list__message-whisper-meta ${isSelf ? 'session-message-list__message-whisper-meta--outgoing' : 'session-message-list__message-whisper-meta--incoming'}`}
                        >
                          {!isSelf ? (
                            <div className="session-message-list__message-whisper-meta-row--incoming">
                              <div className="session-message-list__message-timestamp session-message-list__message-timestamp--whisper">
                                {msg.editedAt ? 'edited · ' : ''}
                                {relativeTime}
                              </div>
                              <div
                                className={`session-message-list__message-whisper-route session-message-list__message-whisper-route--incoming-list ${isDmWhisper ? 'session-message-list__message-whisper-route--dm' : ''}`}
                              >
                                {whisperRouteEntries.map((line, index) => (
                                  <div
                                    key={`${msg.id}-whisper-${index}`}
                                    className="session-message-list__message-whisper-route-line"
                                  >
                                    <span
                                      className="session-message-list__message-whisper-connector"
                                      aria-hidden="true"
                                    >
                                      <span
                                        className="material-symbols-outlined"
                                        aria-hidden="true"
                                      >
                                        subdirectory_arrow_right
                                      </span>
                                    </span>
                                    <span className="session-message-list__message-whisper-route-label">
                                      {line}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <>
                              <div
                                className={`session-message-list__message-whisper-route session-message-list__message-whisper-route--stacked session-message-list__message-whisper-route--outgoing ${isDmWhisper ? 'session-message-list__message-whisper-route--dm' : ''}`}
                              >
                                {whisperRouteEntries.map((line, index) => (
                                  <div
                                    key={`${msg.id}-whisper-${index}`}
                                    className="session-message-list__message-whisper-route-line"
                                  >
                                    <span className="session-message-list__message-whisper-route-label">
                                      {line}
                                    </span>
                                    <span
                                      className="session-message-list__message-whisper-connector"
                                      aria-hidden="true"
                                    >
                                      <span
                                        className="material-symbols-outlined"
                                        aria-hidden="true"
                                      >
                                        subdirectory_arrow_left
                                      </span>
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <div className="session-message-list__message-timestamp session-message-list__message-timestamp--whisper">
                                {msg.editedAt ? 'edited · ' : ''}
                                {relativeTime}
                              </div>
                            </>
                          )}
                        </div>
                      ) : null}
                      {!hasWhisperRoute ? (
                        <div className="session-message-list__message-timestamp">
                          {msg.editedAt ? 'edited · ' : ''}
                          {relativeTime}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            </Fragment>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
