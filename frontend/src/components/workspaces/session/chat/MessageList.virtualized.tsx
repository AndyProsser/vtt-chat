import {
  Fragment,
  createContext,
  forwardRef,
  memo,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { CSSProperties, RefObject, UIEventHandler, WheelEventHandler } from 'react'
import {
  VariableSizeList as List,
  type ListChildComponentProps,
  type VariableSizeList as VariableSizeListType,
} from 'react-window'
import { MessageType } from '@shared'
import { NoteSharedCard } from '@/components/workspaces/shared/panels/NoteSharedCard'
import type { MessageListProps, PreparedMessage } from './MessageList'

interface MessageListVirtualizedProps extends Omit<MessageListProps, 'messages'> {
  preparedMessages: PreparedMessage[]
}

interface VirtualizedContextValue {
  topSentinelRef?: RefObject<HTMLDivElement | null>
  onListScroll?: UIEventHandler<HTMLDivElement>
  onListWheel?: WheelEventHandler<HTMLDivElement>
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
  setMeasuredSize: (messageId: string, index: number, size: number) => void
  getEstimatedSize: (message: PreparedMessage) => number
}

const VirtualizedListContext = createContext<VirtualizedContextValue | null>(null)

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
                  title={TYPE_LABEL_BY_VARIANT[variant]}
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

function VirtualizedOuterElement(
  props: React.HTMLAttributes<HTMLDivElement>,
  ref: React.ForwardedRef<HTMLDivElement>
) {
  const context = use(VirtualizedListContext)

  return (
    <div
      {...props}
      ref={ref}
      onScroll={(event) => {
        props.onScroll?.(event)
        context?.onListScroll?.(event)
      }}
      onWheel={(event) => {
        props.onWheel?.(event)
        context?.onListWheel?.(event)
      }}
    />
  )
}

function VirtualizedInnerElement(
  props: React.HTMLAttributes<HTMLDivElement>,
  ref: React.ForwardedRef<HTMLDivElement>
) {
  const context = use(VirtualizedListContext)

  return (
    <div {...props} ref={ref}>
      {context?.topSentinelRef ? (
        <div
          ref={context.topSentinelRef}
          aria-hidden="true"
          className="session-message-list__sentinel"
        />
      ) : null}
      {props.children}
    </div>
  )
}

const OuterElement = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  VirtualizedOuterElement
)
const InnerElement = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  VirtualizedInnerElement
)

function MessageRow({ index, style, data }: ListChildComponentProps<VirtualizedListData>) {
  const prepared = data.messages[index]
  const contentRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const node = contentRef.current
    if (!node) {
      return
    }

    // Measure the inner content node — never the wrapper, because react-window
    // pins the wrapper to its currently estimated `height`. Reading the wrapper
    // would just echo that estimate back and tall messages would overflow into
    // the next row.
    const reportSize = () => {
      const height = Math.ceil(node.getBoundingClientRect().height)
      if (height > 0) {
        data.setMeasuredSize(prepared.msg.id, index, height)
      }
    }

    reportSize()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', reportSize)
      return () => {
        window.removeEventListener('resize', reportSize)
      }
    }

    const observer = new ResizeObserver(reportSize)
    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [data, index, prepared.msg.id])

  return (
    <div style={style as CSSProperties} className="session-message-list__virtual-row">
      <div ref={contentRef} className="session-message-list__virtual-row-content">
        {renderPreparedMessage(prepared, data)}
      </div>
    </div>
  )
}

const MemoizedMessageRow = memo(MessageRow)

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
  const shellRef = useRef<HTMLDivElement | null>(null)
  const listInstanceRef = useRef<VariableSizeListType | null>(null)
  const [viewportHeight, setViewportHeight] = useState(1)
  const [listViewportWidth, setListViewportWidth] = useState(1)
  const sizeCacheRef = useRef<Record<string, number>>({})

  useLayoutEffect(() => {
    const node = shellRef.current
    if (!node) {
      return
    }

    const updateHeight = () => {
      const nextHeight = Math.max(1, node.clientHeight)
      const nextWidth = Math.max(
        1,
        Math.round(
          (listRef?.current?.getBoundingClientRect().width ?? node.getBoundingClientRect().width) *
            100
        ) / 100
      )

      setViewportHeight((currentHeight) =>
        currentHeight === nextHeight ? currentHeight : nextHeight
      )
      setListViewportWidth((currentWidth) =>
        currentWidth === nextWidth ? currentWidth : nextWidth
      )
    }

    updateHeight()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHeight)
      return () => {
        window.removeEventListener('resize', updateHeight)
      }
    }

    const observer = new ResizeObserver(updateHeight)
    observer.observe(node)
    const listNode = listRef?.current
    if (listNode && listNode !== node) {
      observer.observe(listNode)
    }

    return () => {
      observer.disconnect()
    }
  }, [listRef])

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

  useEffect(() => {
    listInstanceRef.current?.resetAfterIndex(0, true)
  }, [visibleMessages])

  useEffect(() => {
    // Width changes can alter text wrapping, so previously measured row heights
    // are no longer valid and must be recomputed.
    sizeCacheRef.current = {}
    listInstanceRef.current?.resetAfterIndex(0, true)
  }, [listViewportWidth])

  useEffect(() => {
    // Height-only container changes do not affect bubble intrinsic height.
    // Keep the existing size cache and just relayout offsets to avoid
    // regressing into estimate-only rows.
    listInstanceRef.current?.resetAfterIndex(0, false)
  }, [viewportHeight])

  const getEstimatedSize = useCallback(
    (message: PreparedMessage) => estimateMessageHeight(message),
    []
  )

  const setMeasuredSize = useCallback((messageId: string, index: number, size: number) => {
    const previousSize = sizeCacheRef.current[messageId]
    if (previousSize === size) {
      return
    }

    sizeCacheRef.current[messageId] = size
    listInstanceRef.current?.resetAfterIndex(index, false)
  }, [])

  if (visibleMessages.length === 0) {
    return (
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
    )
  }

  const itemData: VirtualizedListData = {
    messages: visibleMessages,
    currentUserId,
    currentUserRole,
    sessionDmId,
    groupingWindowMs,
    roomDirectory,
    activeRoomId,
    hideIntermissionMarkers,
    setMeasuredSize,
    getEstimatedSize,
  }

  return (
    <div ref={shellRef} style={{ flex: '1 1 0', minHeight: 0, height: '100%', overflow: 'hidden' }}>
      <VirtualizedListContext value={{ topSentinelRef, onListScroll, onListWheel }}>
        <List
          ref={listInstanceRef}
          outerRef={listRef}
          outerElementType={OuterElement}
          innerElementType={InnerElement}
          className="session-message-list"
          height={viewportHeight}
          width="100%"
          itemCount={visibleMessages.length}
          itemData={itemData}
          itemKey={(index: number, items: VirtualizedListData) =>
            `${listViewportWidth}:${items.messages[index]?.msg.id ?? index}`
          }
          itemSize={(index: number) => {
            const message = visibleMessages[index]
            if (!message) {
              return 1
            }
            return sizeCacheRef.current[message.msg.id] ?? getEstimatedSize(message)
          }}
          overscanCount={6}
        >
          {MemoizedMessageRow}
        </List>
      </VirtualizedListContext>
    </div>
  )
}
