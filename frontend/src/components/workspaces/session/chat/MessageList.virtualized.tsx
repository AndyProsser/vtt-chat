import { Fragment, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { CSSProperties, RefObject, UIEventHandler, WheelEventHandler } from 'react'
import {
  List,
  type DynamicRowHeight,
  type RowComponentProps,
  useDynamicRowHeight,
  useListCallbackRef,
} from 'react-window'
import { MessageType, findConditionPreset } from '@shared'
import { NoteSharedCard } from '@/components/workspaces/shared/panels/NoteSharedCard'
import type { MessageListProps, PreparedMessage } from './MessageList'

interface MessageListVirtualizedProps extends Omit<MessageListProps, 'messages'> {
  preparedMessages: PreparedMessage[]
}

interface VirtualizedListData {
  messages: PreparedMessage[]
  currentUserId: string
  currentUserRole?: string
  sessionDmId?: string
  groupingWindowMs: number
  roomDirectory?: Record<string, { name: string }>
  activeRoomId?: string
  hideIntermissionMarkers: boolean
  rowHeightCache: DynamicRowHeight
}

const TYPE_LABEL_BY_VARIANT: Record<'ic' | 'ooc' | 'whisper' | 'dm' | 'system', string> = {
  ic: 'In Character',
  ooc: 'Out of Character',
  whisper: 'Whisper',
  dm: 'DM',
  system: 'System',
}

const BOOKEND_META: Record<
  NonNullable<PreparedMessage['sessionBookendState']>,
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

function getAuthorInitial(username: string): string {
  return username.trim().charAt(0).toUpperCase() || '?'
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

function estimateMessageHeight(message: PreparedMessage): number {
  if (message.isSessionSummary) return message.summaryStats ? 184 : 120
  if (message.isSessionRecap) return 112
  if (message.isSessionBookend || message.isSessionNote) return 78
  if (message.noteShared) return 140

  let estimate = message.hasWhisperRoute ? 122 : 94
  if (message.showDaySeparator) estimate += 24
  if (message.showRoomShift) estimate += 20
  if (message.isGroupedWithPrevious) estimate -= 10
  if (message.whisperRouteEntries.length > 1) estimate += 18

  return Math.max(68, estimate)
}

function renderPreparedMessage(prepared: PreparedMessage, data: VirtualizedListData) {
  const {
    msg,
    variant,
    isSystem,
    isSessionBookend,
    sessionBookendState,
    isSessionNote,
    noteShared,
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
    data.hideIntermissionMarkers &&
    (sessionBookendState === 'paused' || sessionBookendState === 'resumed')
  ) {
    return null
  }

  if (isSessionSummary) {
    const stats = summaryStats
    if (!stats) return null
    const durationMs = stats.endedAt && stats.startedAt ? stats.endedAt - stats.startedAt : null
    const startedDisplay = stats.startedAt
      ? new Date(stats.startedAt).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : null

    return (
      <article className="session-message-list__session-summary">
        <div className="session-message-list__session-summary-header">
          <span
            className="session-message-list__session-summary-icon material-symbols-outlined"
            aria-hidden="true"
          >
            summarize
          </span>
          <span className="session-message-list__session-summary-title">{stats.sessionName}</span>
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
        {stats.quip && <p className="session-message-list__session-summary-quip">{stats.quip}</p>}
      </article>
    )
  }

  if (isSessionRecap) {
    const recapBody = msg.content.slice(recapPrefix.length).trim()
    const recapLabel = recapPrefix === '[Campaign Brief]' ? 'Campaign Brief' : 'Last Session'
    return (
      <article className="session-message-list__session-recap">
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
        className={`session-message-list__session-marker ${isSessionBookend ? 'session-message-list__session-marker--bookend' : 'session-message-list__session-marker--note'} ${markerMeta?.className || ''}`}
      >
        {isSessionBookend && markerMeta ? (
          <div className="session-message-list__session-marker-content">
            <div className="session-message-list__session-marker-label-row">
              <span className="session-message-list__session-marker-line" aria-hidden="true" />
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
              <span className="session-message-list__session-marker-line" aria-hidden="true" />
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

  if (noteShared) {
    return (
      <NoteSharedCard
        note={noteShared}
        timestampLabel={`${msg.editedAt ? 'edited · ' : ''}${relativeTime}`}
        timestampDateTime={new Date(msg.createdAt).toISOString()}
      />
    )
  }

  if (prepared.conditionMessage) {
    const conditionPreset = prepared.conditionMessage.presetName
      ? findConditionPreset(prepared.conditionMessage.presetName)
      : undefined
    const iconName = prepared.conditionMessage.isRemoval
      ? 'check_circle'
      : (conditionPreset?.icon ?? 'psychology')
    const conditionText = prepared.conditionMessage.isRemoval
      ? `${prepared.authorName}'s condition was cleared`
      : `${prepared.authorName} is ${conditionPreset?.label ?? prepared.conditionMessage.presetName ?? 'affected'}`

    return (
      <Fragment>
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
              className={`session-message-list__room-shift-pill ${msg.roomId === data.activeRoomId ? 'session-message-list__room-shift-pill--active' : ''}`}
            >
              {msg.roomId === data.activeRoomId ? 'In ' : 'From '}
              {roomName}
            </span>
          </div>
        ) : null}

        <article
          className={`session-message-list__message ${msg.type === MessageType.WHISPER ? 'session-message-list__message--whisper' : ''} ${isSelf ? 'session-message-list__message--self' : ''} ${isGroupedWithPrevious ? 'session-message-list__message--grouped' : ''}`}
        >
          <div className="session-message-list__message-row">
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

            <div className="session-message-list__message-content session-message-list__message-content--condition">
              <div className="session-message-list__message-bubble session-message-list__message-bubble--condition">
                <span
                  className="session-message-list__message-condition-icon material-symbols-outlined"
                  aria-hidden="true"
                >
                  {iconName}
                </span>
                <span className="session-message-list__message-bubble-text">{conditionText}</span>
              </div>
              <div className="session-message-list__message-footer">
                <div className="session-message-list__message-timestamp">
                  {msg.editedAt ? 'edited · ' : ''}
                  {relativeTime}
                </div>
              </div>
            </div>
          </div>
        </article>
      </Fragment>
    )
  }

  return (
    <Fragment>
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
        <div className="session-message-list__room-shift" aria-label={`Room shift to ${roomName}`}>
          <span className="session-message-list__room-shift-line" aria-hidden="true" />
          <span
            className={`session-message-list__room-shift-pill ${msg.roomId === data.activeRoomId ? 'session-message-list__room-shift-pill--active' : ''}`}
          >
            {msg.roomId === data.activeRoomId ? 'In ' : 'From '}
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
                <span
                  className={`session-message-list__message-type-icon ${typeIconClass} material-symbols-outlined`}
                  aria-label={TYPE_LABEL_BY_VARIANT[variant]}
                >
                  {typeIcon}
                </span>
              ) : null}
              <span className="session-message-list__message-bubble-text">{msg.content}</span>
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
                              <span className="material-symbols-outlined" aria-hidden="true">
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
                              <span className="material-symbols-outlined" aria-hidden="true">
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
}

function MessageRow({
  ariaAttributes,
  index,
  style,
  ...data
}: RowComponentProps<VirtualizedListData>) {
  const prepared = data.messages[index]
  const contentRef = useRef<HTMLDivElement | null>(null)
  const lastHeightRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const node = contentRef.current
    if (!node || !prepared) {
      return
    }

    // Debounced size reporting to reduce ResizeObserver overhead
    let timeoutId: NodeJS.Timeout | null = null

    const reportSize = () => {
      const height = Math.ceil(node.getBoundingClientRect().height)
      // Only update cache if height actually changed—avoid redundant cache updates
      if (height > 0 && lastHeightRef.current !== height) {
        lastHeightRef.current = height
        data.rowHeightCache.setRowHeight(index, height)
      }
    }

    // Initial measurement
    reportSize()

    if (typeof ResizeObserver === 'undefined') {
      const handleResize = () => {
        if (timeoutId) clearTimeout(timeoutId)
        timeoutId = setTimeout(reportSize, 50)
      }
      window.addEventListener('resize', handleResize)
      return () => {
        window.removeEventListener('resize', handleResize)
        if (timeoutId) clearTimeout(timeoutId)
      }
    }

    // Use ResizeObserver with debounced callback
    const observer = new ResizeObserver(() => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(reportSize, 16) // ~60fps debounce
    })
    observer.observe(node)

    return () => {
      observer.disconnect()
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [data.rowHeightCache, index, prepared])

  if (!prepared) {
    return null
  }

  return (
    <div
      {...ariaAttributes}
      style={style as CSSProperties}
      className="session-message-list__virtual-row"
    >
      <div ref={contentRef} className="session-message-list__virtual-row-content">
        {renderPreparedMessage(prepared, data)}
      </div>
    </div>
  )
}

export function MessageListVirtualized({
  preparedMessages,
  currentUserId,
  currentUserRole,
  sessionDmId,
  groupingWindowMs = 5 * 60 * 1000,
  listRef,
  topSentinelRef,
  onListScroll,
  onListWheel,
  roomDirectory,
  activeRoomId,
  hideIntermissionMarkers = false,
  emptyDayLabel,
}: MessageListVirtualizedProps) {
  const [listApi, setListApi] = useListCallbackRef(null)

  const visibleMessages = useMemo(
    () =>
      preparedMessages.filter((prepared) => {
        if (
          hideIntermissionMarkers &&
          (prepared.sessionBookendState === 'paused' || prepared.sessionBookendState === 'resumed')
        ) {
          return false
        }

        return !(prepared.isSessionSummary && !prepared.summaryStats)
      }),
    [hideIntermissionMarkers, preparedMessages]
  )

  const defaultRowHeight = useMemo(() => {
    if (visibleMessages.length === 0) {
      return 96
    }

    const sampleSize = Math.min(16, visibleMessages.length)
    let total = 0

    for (let index = 0; index < sampleSize; index += 1) {
      total += estimateMessageHeight(visibleMessages[index])
    }

    return Math.max(68, Math.round(total / sampleSize))
  }, [visibleMessages])

  const rowHeightCache = useDynamicRowHeight({ defaultRowHeight })

  useEffect(() => {
    if (!listRef || visibleMessages.length === 0) {
      return
    }

    ;(listRef as { current: HTMLDivElement | null }).current = listApi?.element ?? null

    return () => {
      ;(listRef as { current: HTMLDivElement | null }).current = null
    }
  }, [listApi, listRef, visibleMessages.length])

  if (visibleMessages.length === 0) {
    return (
      <div style={{ flex: '1 1 0', minHeight: 0, height: '100%', overflow: 'hidden' }}>
        <div
          ref={listRef}
          onScroll={onListScroll}
          onWheel={onListWheel}
          className="session-message-list"
          style={{ height: '100%' }}
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
      </div>
    )
  }

  const rowProps: VirtualizedListData = {
    messages: visibleMessages,
    currentUserId,
    currentUserRole,
    sessionDmId,
    groupingWindowMs,
    roomDirectory,
    activeRoomId,
    hideIntermissionMarkers,
    rowHeightCache,
  }

  return (
    <div style={{ flex: '1 1 0', minHeight: 0, height: '100%', overflow: 'hidden' }}>
      <List
        listRef={setListApi}
        className="session-message-list"
        defaultHeight={420}
        style={{ height: '100%' }}
        onScroll={onListScroll}
        onWheel={onListWheel}
        rowCount={visibleMessages.length}
        rowHeight={rowHeightCache}
        rowProps={rowProps}
        rowComponent={MessageRow}
        overscanCount={6}
      >
        {topSentinelRef ? (
          <div
            ref={topSentinelRef}
            aria-hidden="true"
            className="session-message-list__sentinel"
            style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
          />
        ) : null}
      </List>
    </div>
  )
}
