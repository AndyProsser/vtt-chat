/**
 * MessageList
 * Renders the chronological list of messages for the current session.
 * Messages arrive pre-filtered by the server (visibility-safe).
 */

import { Fragment } from 'react'
import type { RefObject, UIEventHandler } from 'react'
import type { Message } from '@/types/chat'
import { MessageType } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../core-ui'
interface MessageListProps {
  messages: Message[]
  currentUserId: string
  groupingWindowMs?: number
  listRef?: RefObject<HTMLDivElement | null>
  topSentinelRef?: RefObject<HTMLDivElement | null>
  onListScroll?: UIEventHandler<HTMLDivElement>
  participantDirectory?: Record<string, { displayName?: string; avatarUrl?: string | null }>
  roomDirectory?: Record<string, { name: string }>
  activeRoomId?: string
  hideIntermissionMarkers?: boolean
}

const DEFAULT_GROUPING_WINDOW_MS = 5 * 60 * 1000

const TYPE_VARIANTS: Record<string, 'ic' | 'ooc' | 'whisper' | 'system'> = {
  [MessageType.IC]: 'ic',
  [MessageType.OOC]: 'ooc',
  [MessageType.WHISPER]: 'whisper',
  [MessageType.SYSTEM]: 'system',
}

const TYPE_ICON_BY_VARIANT: Record<'ic' | 'ooc' | 'whisper' | 'system', string> = {
  ic: 'swords',
  ooc: 'chat_bubble',
  whisper: 'visibility_off',
  system: 'info',
}

const TYPE_LABEL_BY_VARIANT: Record<'ic' | 'ooc' | 'whisper' | 'system', string> = {
  ic: 'In Character',
  ooc: 'Out of Character',
  whisper: 'Whisper',
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
type SessionBookendState = 'started' | 'ended' | 'paused' | 'resumed' | 'cooldown'

const BOOKEND_META: Record<
  SessionBookendState,
  { label: string; icon: string; className: string }
> = {
  started: {
    label: 'Session Started',
    icon: 'play_circle',
    className: 'chat-session-marker--started',
  },
  ended: {
    label: 'Session Ended',
    icon: 'stop_circle',
    className: 'chat-session-marker--ended',
  },
  paused: {
    label: 'Session Paused',
    icon: 'pause_circle',
    className: 'chat-session-marker--paused',
  },
  resumed: {
    label: 'Session Resumed',
    icon: 'play_circle',
    className: 'chat-session-marker--resumed',
  },
  cooldown: {
    label: 'Cooldown Started',
    icon: 'theaters',
    className: 'chat-session-marker--cooldown',
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
  groupingWindowMs = DEFAULT_GROUPING_WINDOW_MS,
  listRef,
  topSentinelRef,
  onListScroll,
  participantDirectory,
  roomDirectory,
  activeRoomId,
  hideIntermissionMarkers = false,
}: MessageListProps) {
  if (messages.length === 0) {
    return <div className="chat-message-list__empty">No messages yet. Say something!</div>
  }

  return (
    <TooltipProvider delayDuration={120}>
      <div ref={listRef} onScroll={onListScroll} className="chat-message-list">
        {/* Sentinel used by IntersectionObserver to trigger older-history paging. */}
        <div ref={topSentinelRef} aria-hidden="true" className="chat-message-list__sentinel" />
        {messages.map((msg, index) => {
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
          const isSelf = !isSystem && msg.authorId === currentUserId
          const roomName = msg.roomId ? roomDirectory?.[msg.roomId]?.name : undefined
          const authorProfile = participantDirectory?.[msg.authorId]
          const authorName = isSystem
            ? 'SYSTEM'
            : authorProfile?.displayName || msg.authorUsername || 'Unknown'
          const authorAvatarUrl = isSystem ? null : (authorProfile?.avatarUrl ?? null)
          const whisperAudience =
            msg.type === MessageType.WHISPER &&
            Array.isArray(msg.targetIds) &&
            msg.targetIds.length > 0
              ? msg.targetIds
                  .map((targetId) => participantDirectory?.[targetId]?.displayName || 'Unknown')
                  .join(', ')
              : null
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

          if (
            hideIntermissionMarkers &&
            (sessionBookendState === 'paused' ||
              sessionBookendState === 'resumed' ||
              sessionBookendState === 'cooldown')
          ) {
            return null
          }

          if (isSessionRecap) {
            const recapBody = msg.content.slice(recapPrefix.length).trim()
            const recapLabel =
              recapPrefix === CAMPAIGN_BRIEF_PREFIX ? 'Campaign Brief' : 'Last Session'
            return (
              <article key={msg.id} className="chat-session-recap">
                <span
                  className="chat-session-recap__icon material-symbols-outlined"
                  aria-hidden="true"
                >
                  menu_book
                </span>
                <div className="chat-session-recap__body">
                  <span className="chat-session-recap__label">{recapLabel}</span>
                  <p className="chat-session-recap__text">{recapBody}</p>
                </div>
              </article>
            )
          }

          if (isSessionBookend || isSessionNote) {
            const markerMeta = sessionBookendState ? BOOKEND_META[sessionBookendState] : null
            return (
              <article
                key={msg.id}
                className={`chat-session-marker ${isSessionBookend ? 'chat-session-marker--bookend' : 'chat-session-marker--note'} ${markerMeta?.className || ''}`}
              >
                {isSessionBookend && markerMeta ? (
                  <div className="chat-session-marker__content">
                    <div className="chat-session-marker__label-row">
                      <span
                        className="chat-session-marker__icon material-symbols-outlined"
                        aria-hidden="true"
                      >
                        {markerMeta.icon}
                      </span>
                      <span className="chat-session-marker__text">{msg.content}</span>
                      <span
                        className="chat-session-marker__icon material-symbols-outlined"
                        aria-hidden="true"
                      >
                        {markerMeta.icon}
                      </span>
                    </div>
                    <time
                      className="chat-session-marker__time"
                      dateTime={new Date(msg.createdAt).toISOString()}
                    >
                      {formatBookendTimestamp(msg.createdAt)}
                    </time>
                  </div>
                ) : (
                  <span className="chat-session-marker__text">{msg.content}</span>
                )}
              </article>
            )
          }

          return (
            <Fragment key={msg.id}>
              {showDaySeparator ? (
                <div
                  className="chat-day-separator"
                  aria-label={`Messages from ${formatDayLabel(msg.createdAt)}`}
                >
                  <span className="chat-day-separator__line" aria-hidden="true" />
                  <span className="chat-day-separator__pill">{formatDayLabel(msg.createdAt)}</span>
                  <span className="chat-day-separator__line" aria-hidden="true" />
                </div>
              ) : null}

              {showRoomShift ? (
                <div className="chat-room-shift" aria-label={`Room shift to ${roomName}`}>
                  <span className="chat-room-shift__line" aria-hidden="true" />
                  <span
                    className={`chat-room-shift__pill ${msg.roomId === activeRoomId ? 'chat-room-shift__pill--active' : ''}`}
                  >
                    {msg.roomId === activeRoomId ? 'In ' : 'From '}
                    {roomName}
                  </span>
                </div>
              ) : null}

              <article
                className={`chat-message ${isSelf ? 'chat-message--self' : ''} ${isGroupedWithPrevious ? 'chat-message--grouped' : ''}`}
              >
                <div className="chat-message__row">
                  {!isSelf && !isGroupedWithPrevious ? (
                    <span
                      className={`chat-message__avatar ${isSystem ? 'chat-message__avatar--system' : ''}`}
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
                      className="chat-message__avatar chat-message__avatar--spacer"
                      aria-hidden="true"
                    />
                  )}

                  <div className="chat-message__content">
                    {!isGroupedWithPrevious ? (
                      <div className="chat-message__meta">
                        <span className="chat-message__author">{authorName}</span>
                        {whisperAudience ? (
                          <span className="chat-message__whisper-pill">To {whisperAudience}</span>
                        ) : null}
                      </div>
                    ) : null}

                    <div
                      className={`chat-message__bubble chat-message__bubble--${variant} ${isSelf ? 'chat-message__bubble--self' : ''}`}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={`chat-message__type-icon chat-message__type-icon--${variant} material-symbols-outlined`}
                            aria-hidden="true"
                          >
                            {TYPE_ICON_BY_VARIANT[variant]}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">{TYPE_LABEL_BY_VARIANT[variant]}</TooltipContent>
                      </Tooltip>
                      <span className="chat-message__bubble-text">{msg.content}</span>
                    </div>

                    <div className="chat-message__timestamp">
                      {msg.editedAt ? 'edited · ' : ''}
                      {formatRelativeTime(msg.createdAt)}
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
