/**
 * ChatWindow
 * Main chat container. Loads history on mount and renders message list + input.
 * New messages arrive via WS events (CHAT:MESSAGE_SENT) dispatched to chatSlice.
 */

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { UIEvent, WheelEvent } from 'react'
import type { EventEnvelope, UUID } from '@shared'
import { isGreenroomSessionState, MessageType, Role, RoomType, SessionState } from '@shared'
import { useStore } from '@/hooks/useStore'
import { ROOM_NAMES } from '@/constants/roomPresence.constants'
import { CHAT_HISTORY_PAGE_SIZE } from '@/constants/chatPresence.constants'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { useChatVisibleMessages } from '@/hooks/session/useChatVisibleMessages'
import { ChatWindowHeader } from './ChatWindowHeader'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { TypingIndicator } from './TypingIndicator'
import type { OutgoingChatMessage } from '@/state/chatSlice'
import type { Message } from '@/types/chat'
import { generateClientId } from '@/utils/uuid'
import '@/styles/components/workspaces/session/chat/ChatWindow.css'

interface ChatWindowProps {
  apiUrl: string
  token: string
  sessionId: UUID
  roomId: UUID
  campaignId?: UUID
  roomName?: string
  roomType?: RoomType
  user: { id: UUID; username: string; role: Role | string }
  messageGroupingWindowMs?: number
  forceMessageType?: MessageType
  sendWsEvent?: (event: EventEnvelope) => void
  onPendingNewMessageCountChange?: (count: number) => void
}

function areChatWindowPropsEqual(previous: ChatWindowProps, next: ChatWindowProps): boolean {
  return (
    previous.apiUrl === next.apiUrl &&
    previous.token === next.token &&
    previous.sessionId === next.sessionId &&
    previous.roomId === next.roomId &&
    previous.campaignId === next.campaignId &&
    previous.roomName === next.roomName &&
    previous.roomType === next.roomType &&
    previous.user.id === next.user.id &&
    previous.user.username === next.user.username &&
    previous.user.role === next.user.role &&
    previous.messageGroupingWindowMs === next.messageGroupingWindowMs &&
    previous.forceMessageType === next.forceMessageType &&
    previous.sendWsEvent === next.sendWsEvent &&
    previous.onPendingNewMessageCountChange === next.onPendingNewMessageCountChange
  )
}

const DEFAULT_MESSAGE_GROUPING_WINDOW_MS = 5 * 60 * 1000
const AUTO_FOLLOW_BOTTOM_THRESHOLD_PX = 48
const AUTO_FOLLOW_SMOOTH_SETTLE_MS = 480
const EMPTY_OUTGOING_QUEUE: OutgoingChatMessage[] = []

function toTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsedNumeric = Number(value)
    if (Number.isFinite(parsedNumeric)) {
      return parsedNumeric
    }

    const parsedDate = Date.parse(value)
    if (Number.isFinite(parsedDate)) {
      return parsedDate
    }
  }

  return Date.now()
}

function getStartOfTodayTimestamp(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

function isNearBottom(
  scrollContainer: HTMLDivElement,
  thresholdPx = AUTO_FOLLOW_BOTTOM_THRESHOLD_PX
) {
  const distanceFromBottom =
    scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight
  return distanceFromBottom <= thresholdPx
}

function ChatWindowComponent({
  apiUrl,
  token,
  sessionId,
  roomId,
  campaignId,
  roomName,
  roomType,
  user,
  messageGroupingWindowMs = DEFAULT_MESSAGE_GROUPING_WINDOW_MS,
  forceMessageType,
  sendWsEvent,
  onPendingNewMessageCountChange,
}: ChatWindowProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isUserPinnedToBottom, setIsUserPinnedToBottom] = useState(true)
  const [isAutoFollowInProgress, setIsAutoFollowInProgress] = useState(false)
  const [pendingNewMessageCount, setPendingNewMessageCount] = useState(0)
  const [hasHiddenOlderGreenroomHistory, setHasHiddenOlderGreenroomHistory] = useState(false)
  const messageListRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const isLoadingOlderRef = useRef(false)
  // Tracks the createdAt timestamp of the oldest in-memory message; used as the
  // history cursor in the IntersectionObserver without re-creating the observer.
  const oldestMessageTimestampRef = useRef<number | undefined>(undefined)
  // Timestamp of the last completed older-page load. Used to gate the
  // IntersectionObserver so it can't re-fire within OBSERVER_LOAD_COOLDOWN_MS.
  const lastLoadCompletedAtRef = useRef(0)
  const OBSERVER_LOAD_COOLDOWN_MS = 600
  const prevMessageCountRef = useRef(0)
  const lastSeenLatestMessageKeyRef = useRef<string | undefined>(undefined)
  const autoFollowResetTimeoutRef = useRef<number | null>(null)
  const bottomSnapRafRef = useRef<number | null>(null)
  const bottomSnapTimerRef = useRef<number | null>(null)
  const initialScrollContextRef = useRef<string | null>(null)
  const greenroomTodayStartRef = useRef(getStartOfTodayTimestamp())
  const lastHydratedGreenroomStateRef = useRef<string | null | undefined>(undefined)
  const pendingScrollRestoreRef = useRef<{ previousTop: number; previousHeight: number } | null>(
    null
  )
  const clearPendingNewMessageCount = useCallback(() => {
    setPendingNewMessageCount((count) => (count === 0 ? count : 0))
  }, [])
  const isGreenroomMode = forceMessageType === MessageType.OOC
  const resolvedRoomName =
    roomName?.trim() || (isGreenroomMode ? ROOM_NAMES.greenRoom : ROOM_NAMES.mainRoom)
  const { roomDirectory, visibleMessages } = useChatVisibleMessages({
    sessionId,
    roomId,
    resolvedRoomName,
    isGreenroomMode,
    currentUserId: user.id,
  })

  // Typing indicators are intentionally NOT read here. They flip at keystroke
  // frequency and would re-render the whole chat window. See <TypingIndicator />
  // below for the leaf subscription.
  const sessionRecord = useStore((state) => (state.sessions as any)[sessionId]) as
    | { dmId?: UUID; state?: SessionState }
    | undefined
  const addMessage = useStore((state) => state.addMessage)
  const addMessages = useStore((state) => state.addMessages)
  const enqueueOutgoingMessage = useStore((state) => state.enqueueOutgoingMessage)
  const updateOutgoingMessage = useStore((state) => state.updateOutgoingMessage)
  const removeOutgoingMessage = useStore((state) => state.removeOutgoingMessage)
  const sessionOutgoingQueue = useStore(
    (state) =>
      ((state.outgoingQueue as any)[sessionId] as OutgoingChatMessage[]) ?? EMPTY_OUTGOING_QUEUE
  )

  useEffect(() => {
    isLoadingOlderRef.current = isLoadingOlder
  }, [isLoadingOlder])

  // Keep the oldest-message timestamp ref in sync so the IntersectionObserver
  // always uses the correct cursor without needing messageList in its own deps.
  useEffect(() => {
    oldestMessageTimestampRef.current = visibleMessages[0]?.createdAt
  }, [visibleMessages])

  // Restore scroll position after prepended history messages are committed to the DOM.
  // Using useLayoutEffect (not RAF) guarantees we read scrollHeight AFTER React has
  // painted the new messages, so nextHeight - previousHeight reflects the real delta.
  // Fired when isLoadingOlder transitions to false — by that point addMessages has run
  // and the component has re-rendered with the prepended messages.
  useLayoutEffect(() => {
    if (isLoadingOlder || !pendingScrollRestoreRef.current || !messageListRef.current) {
      return
    }

    const { previousTop, previousHeight } = pendingScrollRestoreRef.current
    pendingScrollRestoreRef.current = null

    const nextHeight = messageListRef.current.scrollHeight
    // When the user was already at the very top (scrollTop === 0), the newly
    // loaded messages are already visible there — no position adjustment needed.
    if (previousTop > 0 && nextHeight > previousHeight) {
      messageListRef.current.scrollTop = previousTop + (nextHeight - previousHeight)
    }
  }, [isLoadingOlder])

  // Detect when the in-memory cache was pruned (count went down). This happens when
  // the user is auto-scrolling and new messages arrive past the MAX threshold — the
  // slice trims the oldest messages. Re-enable "load older" so the user can scroll
  // back up and rehydrate the pruned history from the server.
  const messageCount = visibleMessages.length
  useEffect(() => {
    const prevCount = prevMessageCountRef.current
    if (messageCount < prevCount && prevCount > 0 && !isLoadingOlderRef.current) {
      setHasMoreHistory(true)
    }
    prevMessageCountRef.current = messageCount
  }, [messageCount])

  useEffect(
    () => () => {
      if (autoFollowResetTimeoutRef.current) {
        window.clearTimeout(autoFollowResetTimeoutRef.current)
        autoFollowResetTimeoutRef.current = null
      }
      if (bottomSnapRafRef.current) {
        window.cancelAnimationFrame(bottomSnapRafRef.current)
        bottomSnapRafRef.current = null
      }
      if (bottomSnapTimerRef.current) {
        window.clearTimeout(bottomSnapTimerRef.current)
        bottomSnapTimerRef.current = null
      }
    },
    []
  )

  const loadHistoryPage = useCallback(
    async ({ before, older }: { before?: number; older: boolean }) => {
      if (isGreenroomMode && !campaignId) {
        setIsLoading(false)
        setIsLoadingOlder(false)
        return
      }

      if (older) {
        setIsLoadingOlder(true)
      } else {
        setIsLoading(true)
      }

      setError(null)

      try {
        const params = new URLSearchParams()
        params.set('limit', String(CHAT_HISTORY_PAGE_SIZE))
        if (!isGreenroomMode) {
          params.set('sinceLatestStart', '1')
        }
        if (isGreenroomMode && !older && before === undefined) {
          params.set('todayOnly', '1')
        }
        if (before && Number.isFinite(before)) {
          params.set('before', String(before))
        }
        const historyUrl =
          isGreenroomMode && campaignId
            ? `${apiUrl}/api/chat/campaign/${campaignId}/chat/page?${params.toString()}`
            : `${apiUrl}/api/chat/messages/${sessionId}?${params.toString()}`
        const res = await fetch(historyUrl, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.message ?? `HTTP ${res.status}`)
        }

        const data = await res.json()
        const msgs: Message[] = (data.messages ?? []).map((m: any) => ({
          id: m.id as UUID,
          sessionId: m.sessionId as UUID | undefined,
          roomId: (m.roomId as UUID | undefined) || roomId,
          authorId: m.authorId as UUID,
          authorUsername: m.authorUsername as string,
          content: m.content as string,
          type: m.type as MessageType,
          isDmOnly: m.isDmOnly as boolean,
          visibleTo: Array.isArray(m.visibleTo) ? (m.visibleTo as UUID[]) : undefined,
          targetIds: Array.isArray(m.targetIds) ? (m.targetIds as UUID[]) : undefined,
          metadata: m.metadata,
          createdAt: toTimestamp(m.createdAt),
          editedAt: m.editedAt !== undefined ? toTimestamp(m.editedAt) : undefined,
        }))

        addMessages(sessionId, msgs, { skipPrune: older })

        const hasMore = Boolean(data.pagination?.hasMore ?? data.hasMore)
        const hasEarlier = Boolean(data.pagination?.hasEarlier ?? data.hasEarlier)
        setHasHiddenOlderGreenroomHistory(
          isGreenroomMode && !older && before === undefined ? hasEarlier : false
        )
        setHasMoreHistory(hasMore)
      } catch (err: any) {
        setError(err.message ?? 'Failed to load messages')
      } finally {
        if (older) {
          lastLoadCompletedAtRef.current = Date.now()
          setIsLoadingOlder(false)
        } else {
          setIsLoading(false)
        }
      }
    },
    [addMessages, apiUrl, campaignId, isGreenroomMode, roomId, sessionId, token]
  )

  // Load latest history page on mount/change.
  useEffect(() => {
    const bootstrapTimer = window.setTimeout(() => {
      void loadHistoryPage({ older: false })
    }, 0)

    return () => {
      window.clearTimeout(bootstrapTimer)
    }
  }, [loadHistoryPage])

  useEffect(() => {
    if (!isGreenroomMode) {
      lastHydratedGreenroomStateRef.current = sessionRecord?.state
      return
    }

    if (lastHydratedGreenroomStateRef.current === undefined) {
      lastHydratedGreenroomStateRef.current = sessionRecord?.state
      return
    }

    if (lastHydratedGreenroomStateRef.current === sessionRecord?.state) {
      return
    }

    lastHydratedGreenroomStateRef.current = sessionRecord?.state

    if (!isGreenroomSessionState(sessionRecord?.state)) {
      return
    }

    prevMessageCountRef.current = 0
    lastSeenLatestMessageKeyRef.current = undefined
    void loadHistoryPage({ older: false })
  }, [isGreenroomMode, loadHistoryPage, sessionRecord?.state])

  const scrollToLatest = useCallback((behavior: ScrollBehavior = 'auto') => {
    const scrollContainer = messageListRef.current
    if (!scrollContainer) {
      return
    }

    if (typeof scrollContainer.scrollTo !== 'function') {
      scrollContainer.scrollTop = scrollContainer.scrollHeight
      return
    }

    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior,
    })
  }, [])

  const scrollToPosition = useCallback((top: number, behavior: ScrollBehavior = 'auto') => {
    const scrollContainer = messageListRef.current
    if (!scrollContainer) {
      return
    }

    if (typeof scrollContainer.scrollTo !== 'function') {
      scrollContainer.scrollTop = top
      return
    }

    scrollContainer.scrollTo({ top, behavior })
  }, [])

  const scheduleSettledBottomSnap = useCallback(() => {
    if (bottomSnapRafRef.current) {
      window.cancelAnimationFrame(bottomSnapRafRef.current)
      bottomSnapRafRef.current = null
    }
    if (bottomSnapTimerRef.current) {
      window.clearTimeout(bottomSnapTimerRef.current)
      bottomSnapTimerRef.current = null
    }

    const MAX_SETTLE_FRAMES = 24
    const REQUIRED_STABLE_FRAMES = 3
    let frameCount = 0
    let stableFrameCount = 0
    let previousHeight = -1

    const tick = () => {
      const scrollContainer = messageListRef.current
      if (!scrollContainer) {
        bottomSnapRafRef.current = null
        return
      }

      // Keep pinning to the true bottom while virtual row heights converge.
      scrollToLatest('auto')

      const nextHeight = scrollContainer.scrollHeight
      if (nextHeight === previousHeight) {
        stableFrameCount += 1
      } else {
        stableFrameCount = 0
        previousHeight = nextHeight
      }

      frameCount += 1
      if (stableFrameCount >= REQUIRED_STABLE_FRAMES || frameCount >= MAX_SETTLE_FRAMES) {
        bottomSnapRafRef.current = null
        return
      }

      bottomSnapRafRef.current = window.requestAnimationFrame(tick)
    }

    // Hard cap for safety; ensures no lingering loop on edge-case layout churn.
    bottomSnapTimerRef.current = window.setTimeout(() => {
      if (bottomSnapRafRef.current) {
        window.cancelAnimationFrame(bottomSnapRafRef.current)
        bottomSnapRafRef.current = null
      }
      scrollToLatest('auto')
      bottomSnapTimerRef.current = null
    }, 700)

    bottomSnapRafRef.current = window.requestAnimationFrame(tick)
  }, [scrollToLatest])

  const handleListScroll = useCallback(() => {
    const scrollContainer = messageListRef.current
    if (!scrollContainer) {
      return
    }

    const nearBottom = isNearBottom(scrollContainer)
    setIsUserPinnedToBottom(nearBottom)

    if (nearBottom) {
      if (isAutoFollowInProgress) {
        setIsAutoFollowInProgress(false)
        if (autoFollowResetTimeoutRef.current) {
          window.clearTimeout(autoFollowResetTimeoutRef.current)
          autoFollowResetTimeoutRef.current = null
        }
      }
      clearPendingNewMessageCount()
    } else if (isAutoFollowInProgress) {
      // User scrolled away from bottom — cancel the auto-follow settle timeout so
      // the jump-to-latest button appears immediately rather than staying hidden
      // for up to AUTO_FOLLOW_SMOOTH_SETTLE_MS.
      setIsAutoFollowInProgress(false)
      if (autoFollowResetTimeoutRef.current) {
        window.clearTimeout(autoFollowResetTimeoutRef.current)
        autoFollowResetTimeoutRef.current = null
      }
    }
  }, [clearPendingNewMessageCount, isAutoFollowInProgress])

  const revealOlderGreenroomHistory = useCallback(() => {
    if (
      !isGreenroomMode ||
      !hasHiddenOlderGreenroomHistory ||
      isLoadingOlderRef.current ||
      !messageListRef.current
    ) {
      return
    }

    const scrollContainer = messageListRef.current
    isLoadingOlderRef.current = true
    pendingScrollRestoreRef.current = {
      previousTop: scrollContainer.scrollTop,
      previousHeight: scrollContainer.scrollHeight,
    }
    setHasHiddenOlderGreenroomHistory(false)
    void loadHistoryPage({ before: greenroomTodayStartRef.current, older: true })
  }, [hasHiddenOlderGreenroomHistory, isGreenroomMode, loadHistoryPage])

  const handleListWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!isGreenroomMode || !hasHiddenOlderGreenroomHistory) {
        return
      }

      const scrollContainer = messageListRef.current
      if (!scrollContainer || event.deltaY >= 0 || scrollContainer.scrollTop > 8) {
        return
      }

      revealOlderGreenroomHistory()
    },
    [hasHiddenOlderGreenroomHistory, isGreenroomMode, revealOlderGreenroomHistory]
  )

  useEffect(() => {
    if (isLoading || !hasMoreHistory) {
      return
    }

    const root = messageListRef.current
    const target = topSentinelRef.current

    if (!root || !target || typeof IntersectionObserver === 'undefined') {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting || isLoadingOlderRef.current) {
          return
        }

        // Cooldown: prevent rapid re-firing after a page load completes.
        // Without this guard the observer immediately re-triggers because the
        // sentinel stays at scrollTop=0 after loading older content.
        if (Date.now() - lastLoadCompletedAtRef.current < OBSERVER_LOAD_COOLDOWN_MS) {
          return
        }

        // Use the live ref rather than messageList from closure — allows us to
        // remove messageList from deps and avoid recreating the observer on every
        // new message.
        const before = oldestMessageTimestampRef.current
        if (!before) {
          return
        }

        isLoadingOlderRef.current = true
        pendingScrollRestoreRef.current = {
          previousTop: root.scrollTop,
          previousHeight: root.scrollHeight,
        }

        void loadHistoryPage({ before, older: true })
      },
      {
        root,
        rootMargin: '120px 0px 0px 0px',
        threshold: 0,
      }
    )

    observer.observe(target)
    return () => {
      observer.disconnect()
    }
  }, [hasMoreHistory, isLoading, loadHistoryPage])

  const emitTypingEvent = useCallback(
    (type: 'CHAT:TYPING_STARTED' | 'CHAT:TYPING_STOPPED') => {
      if (!sendWsEvent) {
        return
      }

      if (user.role === Role.SPECTATOR || String(user.role) === 'SPECTATOR') {
        return
      }

      if (!roomId) {
        return
      }

      const now = Date.now()
      sendWsEvent({
        id: generateClientId('ws') as UUID,
        type,
        version: 1,
        userId: user.id,
        userRole: user.role as Role,
        sessionId,
        roomId,
        timestamp: now,
        payload:
          type === 'CHAT:TYPING_STARTED'
            ? {
                userId: user.id,
                username: user.username,
                roomId,
                startedAt: now,
              }
            : {
                userId: user.id,
                username: user.username,
                roomId,
                stoppedAt: now,
              },
      })
    },
    [roomId, sendWsEvent, sessionId, user.id, user.role, user.username]
  )

  const failedQueueItems = useMemo(
    () =>
      sessionOutgoingQueue
        .filter((entry) => entry.roomId === roomId && entry.status === 'failed')
        .sort((a, b) => b.createdAt - a.createdAt),
    [roomId, sessionOutgoingQueue]
  )

  const latestVisibleMessage = visibleMessages[visibleMessages.length - 1]
  const latestVisibleMessageKey = latestVisibleMessage
    ? `${latestVisibleMessage.id}:${latestVisibleMessage.createdAt}`
    : undefined

  useEffect(() => {
    onPendingNewMessageCountChange?.(pendingNewMessageCount)
  }, [onPendingNewMessageCountChange, pendingNewMessageCount])

  useEffect(() => {
    if (isUserPinnedToBottom) {
      window.requestAnimationFrame(() => {
        clearPendingNewMessageCount()
      })
    }
  }, [clearPendingNewMessageCount, isUserPinnedToBottom])

  // After initial hydrate (or room/session switch), pin viewport to newest message.
  useEffect(() => {
    if (isLoading || visibleMessages.length === 0) {
      return
    }

    const contextKey = `${sessionId}:${roomId}`
    if (initialScrollContextRef.current === contextKey) {
      return
    }

    scheduleSettledBottomSnap()
    setIsUserPinnedToBottom(true)
    initialScrollContextRef.current = contextKey
    clearPendingNewMessageCount()
    lastSeenLatestMessageKeyRef.current = latestVisibleMessageKey
  }, [
    clearPendingNewMessageCount,
    isLoading,
    latestVisibleMessageKey,
    roomId,
    scheduleSettledBottomSnap,
    sessionId,
    visibleMessages.length,
  ])

  useEffect(() => {
    const node = messageListRef.current
    if (!node || typeof ResizeObserver === 'undefined') {
      return
    }

    let prevWidth = node.clientWidth
    let prevHeight = node.clientHeight

    const observer = new ResizeObserver(() => {
      if (!messageListRef.current) {
        return
      }

      const nextWidth = messageListRef.current.clientWidth
      const nextHeight = messageListRef.current.clientHeight
      const sizeChanged = nextWidth !== prevWidth || nextHeight !== prevHeight

      if (!sizeChanged) {
        return
      }

      prevWidth = nextWidth
      prevHeight = nextHeight

      const shouldStickToBottom =
        isAutoFollowInProgress ||
        isUserPinnedToBottom ||
        isNearBottom(messageListRef.current, AUTO_FOLLOW_BOTTOM_THRESHOLD_PX)

      if (shouldStickToBottom) {
        scheduleSettledBottomSnap()
      }
    })

    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [isAutoFollowInProgress, isUserPinnedToBottom, scheduleSettledBottomSnap])

  // Follow new messages only when user is already pinned to bottom.
  // If user is reading history, keep their position and surface a subtle jump cue.
  useLayoutEffect(() => {
    if (!latestVisibleMessageKey) {
      return
    }

    const lastSeen = lastSeenLatestMessageKeyRef.current
    const isNewLatest = latestVisibleMessageKey !== lastSeen

    if (!isNewLatest) {
      return
    }

    const scrollContainer = messageListRef.current
    const shouldAutoFollow =
      isAutoFollowInProgress ||
      isUserPinnedToBottom ||
      (scrollContainer ? isNearBottom(scrollContainer) : false)

    if (shouldAutoFollow) {
      setIsAutoFollowInProgress(true)
      if (autoFollowResetTimeoutRef.current) {
        window.clearTimeout(autoFollowResetTimeoutRef.current)
      }
      autoFollowResetTimeoutRef.current = window.setTimeout(() => {
        setIsAutoFollowInProgress(false)
        autoFollowResetTimeoutRef.current = null
      }, AUTO_FOLLOW_SMOOTH_SETTLE_MS)

      // Smooth follow can land short while virtual rows are still being
      // remeasured in bursts; settle with multi-pass snapping.
      scheduleSettledBottomSnap()
      setIsUserPinnedToBottom(true)
      clearPendingNewMessageCount()
      lastSeenLatestMessageKeyRef.current = latestVisibleMessageKey
      return
    }

    window.requestAnimationFrame(() => {
      setPendingNewMessageCount((count) => count + 1)
    })
  }, [
    clearPendingNewMessageCount,
    isAutoFollowInProgress,
    isUserPinnedToBottom,
    latestVisibleMessageKey,
    scheduleSettledBottomSnap,
  ])

  const postMessage = useCallback(
    async (content: string, type: MessageType, recipientId?: UUID) => {
      const res = await fetch(
        isGreenroomMode && campaignId
          ? `${apiUrl}/api/chat/campaign/${campaignId}/chat`
          : `${apiUrl}/api/chat/message`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(
            isGreenroomMode && campaignId
              ? { content }
              : { sessionId, roomId, content, type, recipientId }
          ),
        }
      )

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message ?? `HTTP ${res.status}`)
      }

      const responseBody = await res.json().catch(() => null)
      const rawMessage = responseBody?.message ?? responseBody

      if (rawMessage && typeof rawMessage === 'object') {
        const createdAtRaw = (rawMessage as any).createdAt
        const createdAt =
          typeof createdAtRaw === 'number'
            ? createdAtRaw
            : createdAtRaw
              ? new Date(createdAtRaw).getTime()
              : Date.now()

        const optimisticMessage: Message = {
          id: ((rawMessage as any).id ?? (rawMessage as any).messageId) as UUID,
          roomId,
          authorId: ((rawMessage as any).authorId ?? user.id) as UUID,
          authorUsername: ((rawMessage as any).authorUsername ?? user.username) as string,
          content: ((rawMessage as any).content ?? content) as string,
          type: ((rawMessage as any).type ?? type) as MessageType,
          isDmOnly: Boolean((rawMessage as any).isDmOnly),
          visibleTo: Array.isArray((rawMessage as any).visibleTo)
            ? ((rawMessage as any).visibleTo as UUID[])
            : undefined,
          targetIds: Array.isArray((rawMessage as any).targetIds)
            ? ((rawMessage as any).targetIds as UUID[])
            : undefined,
          createdAt,
          editedAt: (rawMessage as any).editedAt as number | undefined,
        }

        if (optimisticMessage.id) {
          // WS still remains source-of-truth; this only backfills missing echo.
          addMessage(sessionId, optimisticMessage)
        }
      }
    },
    [
      addMessage,
      apiUrl,
      campaignId,
      isGreenroomMode,
      roomId,
      sessionId,
      token,
      user.id,
      user.username,
    ]
  )

  const handleSend = useCallback(
    async (content: string, type: MessageType, recipientId?: string) => {
      setError(null)
      const queuedMessageId = generateClientId('queued-message') as UUID

      enqueueOutgoingMessage(sessionId, {
        id: queuedMessageId,
        roomId,
        content,
        type,
        recipientId: recipientId as UUID | undefined,
        createdAt: Date.now(),
        status: 'sending',
      })

      try {
        await postMessage(content, type, recipientId as UUID | undefined)
        removeOutgoingMessage(sessionId, queuedMessageId)
      } catch (err: any) {
        const message = err.message ?? 'Failed to send message'
        updateOutgoingMessage(sessionId, queuedMessageId, {
          status: 'failed',
          error: message,
        })
        setError(message)
      }
    },
    [
      enqueueOutgoingMessage,
      postMessage,
      removeOutgoingMessage,
      roomId,
      sessionId,
      updateOutgoingMessage,
    ]
  )

  const handleTypingStarted = useCallback(() => {
    emitTypingEvent('CHAT:TYPING_STARTED')
  }, [emitTypingEvent])

  const handleTypingStopped = useCallback(() => {
    emitTypingEvent('CHAT:TYPING_STOPPED')
  }, [emitTypingEvent])

  const retryFailedMessage = useCallback(
    async (entry: OutgoingChatMessage) => {
      setError(null)
      updateOutgoingMessage(sessionId, entry.id, {
        status: 'sending',
        error: undefined,
      })

      try {
        await postMessage(entry.content, entry.type, entry.recipientId)
        removeOutgoingMessage(sessionId, entry.id)
      } catch (err: any) {
        const message = err.message ?? 'Failed to send message'
        updateOutgoingMessage(sessionId, entry.id, {
          status: 'failed',
          error: message,
        })
        setError(message)
      }
    },
    [postMessage, removeOutgoingMessage, sessionId, updateOutgoingMessage]
  )

  return (
    <section className="session-chat-window">
      <ChatWindowHeader
        apiUrl={apiUrl}
        token={token}
        sessionId={sessionId}
        roomName={roomName}
        isGreenroomMode={isGreenroomMode}
        isLoading={isLoading}
        visibleMessageCount={visibleMessages.length}
      />

      {/* Error banner */}
      {error && <div className="session-chat-window__error">{error}</div>}

      {failedQueueItems.length > 0 ? (
        <section className="session-chat-window__queue-debug" aria-live="polite">
          <div className="session-chat-window__queue-debug-title">
            Failed sends ({failedQueueItems.length})
          </div>
          <div className="session-chat-window__queue-debug-list">
            {failedQueueItems.slice(0, 3).map((entry) => (
              <div key={entry.id} className="session-chat-window__queue-debug-item">
                <p className="session-chat-window__queue-debug-content">{entry.content}</p>
                <div className="session-chat-window__queue-debug-actions">
                  <button
                    type="button"
                    className="session-chat-window__queue-debug-button"
                    onClick={() => {
                      void retryFailedMessage(entry)
                    }}
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    className="session-chat-window__queue-debug-button session-chat-window__queue-debug-button--quiet"
                    onClick={() => {
                      removeOutgoingMessage(sessionId, entry.id)
                    }}
                  >
                    Dismiss
                  </button>
                </div>
                {entry.error ? (
                  <p className="session-chat-window__queue-debug-error">{entry.error}</p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Message list */}
      {isLoading ? (
        <div className="session-chat-window__loading-state">Loading messages…</div>
      ) : (
        <>
          {isGreenroomMode && hasHiddenOlderGreenroomHistory ? (
            <div className="session-chat-window__hidden-older">
              <button
                type="button"
                className="session-chat-window__hidden-older-button"
                onClick={() => {
                  revealOlderGreenroomHistory()
                }}
              >
                Load earlier messages
              </button>
            </div>
          ) : null}

          <MessageList
            messages={visibleMessages}
            sessionId={sessionId}
            currentUserId={user.id}
            currentUserRole={String(user.role)}
            sessionDmId={sessionRecord?.dmId}
            groupingWindowMs={messageGroupingWindowMs}
            listRef={messageListRef}
            topSentinelRef={topSentinelRef}
            onListScroll={handleListScroll}
            onListWheel={handleListWheel}
            roomDirectory={roomDirectory}
            activeRoomId={roomId}
            hideIntermissionMarkers={isGreenroomMode}
            emptyDayLabel={isGreenroomMode ? 'Today' : undefined}
          />
        </>
      )}

      {!isLoading &&
      visibleMessages.length > 0 &&
      !isUserPinnedToBottom &&
      !isAutoFollowInProgress ? (
        <TooltipProvider delayDuration={140}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`session-chat-window__jump-to-latest ${pendingNewMessageCount > 0 ? 'session-chat-window__jump-to-latest--new' : ''}`}
                onClick={() => {
                  scrollToLatest('auto')
                  setIsUserPinnedToBottom(true)
                  setPendingNewMessageCount(0)
                  lastSeenLatestMessageKeyRef.current = latestVisibleMessageKey
                }}
                aria-label="Jump to latest message"
              >
                ↓
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {pendingNewMessageCount > 0
                ? `Jump to latest (${pendingNewMessageCount} new)`
                : 'Jump to latest'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}

      <TypingIndicator sessionId={sessionId} roomId={roomId} currentUserId={user.id} />

      {/* Input */}
      <MessageInput
        onSend={handleSend}
        onTypingStarted={handleTypingStarted}
        onTypingStopped={handleTypingStopped}
        role={user.role}
        sessionId={sessionId}
        currentUserId={user.id}
        currentRoomId={roomId}
        disabled={isLoading}
        forceMessageType={forceMessageType}
        roomType={roomType}
      />
    </section>
  )
}

export const ChatWindow = memo(ChatWindowComponent, areChatWindowPropsEqual)
