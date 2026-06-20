import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { CSSProperties, RefObject, UIEventHandler, WheelEventHandler } from 'react'
import { List, type RowComponentProps, useDynamicRowHeight, useListCallbackRef } from 'react-window'
import type { MessageListProps, PreparedMessage } from './MessageList'
import type { VirtualizedListData } from '@/types/messageList'
import { MessageListSystemRow } from './rows/MessageListSystemRow'
import { MessageListChatRow } from './rows/MessageListChatRow'
import { MessageListRollRow } from './rows/MessageListRollRow'
import { MessageType } from '@shared'

import type { UUID } from '@shared'

interface MessageListVirtualizedProps extends Omit<MessageListProps, 'messages'> {
  preparedMessages: PreparedMessage[]
  campaignId?: UUID
  participantDirectory?: Record<string, { displayName: string; avatarUrl?: string | null }>
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
  if (
    data.hideIntermissionMarkers &&
    (prepared.sessionBookendState === 'paused' || prepared.sessionBookendState === 'resumed')
  ) {
    return null
  }

  const isLootSplitCard = Boolean(prepared.msg.metadata?.lootSplitCard)

  if (
    prepared.isSessionSummary ||
    prepared.isSessionRecap ||
    prepared.isSessionBookend ||
    prepared.isSessionNote ||
    prepared.noteShared ||
    isLootSplitCard
  ) {
    const lootSplitContext =
      isLootSplitCard && data.campaignId
        ? {
            campaignId: data.campaignId,
            currentUserId: data.currentUserId as UUID,
            participantDirectory: data.participantDirectory ?? {},
          }
        : undefined
    return <MessageListSystemRow prepared={prepared} lootSplitContext={lootSplitContext} />
  }

  if (prepared.msg.type === MessageType.ROLL) {
    return <MessageListRollRow prepared={prepared} />
  }

  return <MessageListChatRow prepared={prepared} activeRoomId={data.activeRoomId} />
}

function MessageRow({
  ariaAttributes,
  index,
  style,
  ...data
}: RowComponentProps<VirtualizedListData>) {
  const prepared = data.messages[index]
  const { setRowHeight } = data
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
        setRowHeight(index, height)
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
  }, [setRowHeight, index, prepared])

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
  campaignId,
  participantDirectory,
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

  // setRowHeight is a stable useCallback([]) inside useDynamicRowHeight — safe as a dep.
  // Keeping it separate from rowHeightCache prevents all visible rows from re-rendering
  // whenever ResizeObserver measurements update the height cache object reference.
  const rowProps = useMemo<VirtualizedListData>(
    () => ({
      messages: visibleMessages,
      currentUserId,
      currentUserRole,
      sessionDmId,
      groupingWindowMs,
      roomDirectory,
      activeRoomId,
      hideIntermissionMarkers,
      setRowHeight: rowHeightCache.setRowHeight,
      campaignId,
      participantDirectory,
    }),
    [
      visibleMessages,
      currentUserId,
      currentUserRole,
      sessionDmId,
      groupingWindowMs,
      roomDirectory,
      activeRoomId,
      hideIntermissionMarkers,
      rowHeightCache.setRowHeight,
      campaignId,
      participantDirectory,
    ]
  )

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
