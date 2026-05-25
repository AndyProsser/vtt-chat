/**
 * ChatWindow
 * Main chat container. Loads history on mount and renders message list + input.
 * New messages arrive via WS events (CHAT:MESSAGE_SENT) dispatched to chatSlice.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { UIEvent, WheelEvent } from 'react'
import type { EventEnvelope, UUID } from '@shared'
import { MessageType, Role, RoomType } from '@shared'
import { useStore } from '@/hooks/useStore'
import { isGreenRoomName, ROOM_NAMES } from '@/constants/roomPresence.constants'
import { CHAT_HISTORY_PAGE_SIZE } from '@/constants/chatPresence.constants'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import type { OutgoingChatMessage } from '@/state/chatSlice'
import type { BookendState, Message } from '@/types/chat'
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
}

const DEFAULT_MESSAGE_GROUPING_WINDOW_MS = 5 * 60 * 1000

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

function getBookendState(content: string, type: MessageType): BookendState {
  if (type !== MessageType.SYSTEM) {
    return null
  }

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

function getStartOfTodayTimestamp(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

export function ChatWindow({
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
}: ChatWindowProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isUserPinnedToBottom, setIsUserPinnedToBottom] = useState(true)
  const [pendingNewMessageCount, setPendingNewMessageCount] = useState(0)
  const [hasHiddenOlderGreenroomHistory, setHasHiddenOlderGreenroomHistory] = useState(false)
  const messageListRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const isLoadingOlderRef = useRef(false)
  const oldestLoadedTimestampRef = useRef<number | undefined>(undefined)
  const lastSeenLatestMessageAtRef = useRef<number | undefined>(undefined)
  const initialScrollContextRef = useRef<string | null>(null)
  const greenroomTodayStartRef = useRef(getStartOfTodayTimestamp())
  const pendingScrollRestoreRef = useRef<{ previousTop: number; previousHeight: number } | null>(
    null
  )
  const clearPendingNewMessageCount = useCallback(() => {
    setPendingNewMessageCount((count) => (count === 0 ? count : 0))
  }, [])
  const isGreenroomMode = forceMessageType === MessageType.OOC
  const headerTitle = isGreenroomMode ? 'Greenroom (OOC)' : 'Main Room'
  const resolvedRoomName =
    roomName?.trim() || (isGreenroomMode ? ROOM_NAMES.greenRoom : ROOM_NAMES.mainRoom)
  const headerSubtitle = `${headerTitle} • ${resolvedRoomName}`

  const sessionMessages = useStore((state) => (state.messages as any)[sessionId]) as
    | Record<UUID, Message>
    | undefined
  const sessionTypingIndicators = useStore(
    (state) => (state.typingIndicators as any)[sessionId]
  ) as Array<{ userId: UUID; username: string; roomId?: UUID; until: number }> | undefined
  const sessionPresence = useStore((state) => (state.sessionPresence as any)[sessionId]) as
    | Record<
        UUID,
        {
          username: string
          avatarUrl?: string | null
          characterName?: string | null
          role?: Role | string
          primaryRoomId?: UUID
        }
      >
    | undefined
  const sessionRooms = useStore((state) => (state.rooms as any)[sessionId]) as
    | Record<UUID, { id: UUID; name: string }>
    | undefined
  const sessionRecord = useStore((state) => (state.sessions as any)[sessionId]) as
    | { dmId?: UUID }
    | undefined
  const addMessage = useStore((state) => state.addMessage)
  const addMessages = useStore((state) => state.addMessages)
  const enqueueOutgoingMessage = useStore((state) => state.enqueueOutgoingMessage)
  const updateOutgoingMessage = useStore((state) => state.updateOutgoingMessage)
  const removeOutgoingMessage = useStore((state) => state.removeOutgoingMessage)
  const sessionOutgoingQueue = useStore((state) => (state.outgoingQueue as any)[sessionId]) as
    | OutgoingChatMessage[]
    | undefined

  const participantDirectory = useMemo(() => {
    const entries = Object.entries(sessionPresence ?? {}) as Array<
      [UUID, { username: string; avatarUrl?: string | null; characterName?: string | null }]
    >
    return entries.reduce(
      (acc, [participantUserId, participant]) => {
        acc[participantUserId] = {
          displayName: participant.characterName || participant.username,
          avatarUrl: participant.avatarUrl,
        }
        return acc
      },
      {} as Record<UUID, { displayName: string; avatarUrl?: string | null }>
    )
  }, [sessionPresence])

  const roomDirectory = useMemo(() => {
    const entries = Object.values(sessionRooms ?? {}) as Array<{ id: UUID; name: string }>
    return entries.reduce(
      (acc, room) => {
        acc[room.id] = { name: room.name }
        return acc
      },
      {} as Record<string, { name: string }>
    )
  }, [sessionRooms])

  const greenroomRoomId = useMemo(() => {
    const rooms = Object.values(sessionRooms ?? {}) as Array<{ id: UUID; name: string }>
    const greenroom = rooms.find((room) => isGreenRoomName(room.name))
    return greenroom?.id
  }, [sessionRooms])

  // Derive ordered message list for this session
  // messages shape: Record<UUID, Record<UUID, Message>> (session → id → Message)
  const messageList = useMemo(() => {
    const values = Object.values(sessionMessages ?? {}) as Message[]
    if (values.length < 2) {
      return values
    }

    let isChronological = true
    for (let index = 1; index < values.length; index += 1) {
      if (values[index - 1].createdAt > values[index].createdAt) {
        isChronological = false
        break
      }
    }

    if (isChronological) {
      return values
    }

    return [...values].sort((a, b) => a.createdAt - b.createdAt)
  }, [sessionMessages])

  const [typingClock, setTypingClock] = useState(() => Date.now())

  useEffect(() => {
    const nextTypingExpiryAt = (sessionTypingIndicators ?? [])
      .filter((indicator) => indicator.until > typingClock)
      .reduce<
        number | null
      >((earliest, indicator) => (earliest === null || indicator.until < earliest ? indicator.until : earliest), null)

    if (!nextTypingExpiryAt) {
      return
    }

    const timeoutDelayMs = Math.max(0, nextTypingExpiryAt - Date.now() + 12)
    const timeoutId = window.setTimeout(() => {
      setTypingClock(Date.now())
    }, timeoutDelayMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [sessionTypingIndicators, typingClock])

  useEffect(() => {
    isLoadingOlderRef.current = isLoadingOlder
  }, [isLoadingOlder])

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
        oldestLoadedTimestampRef.current = undefined
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
          roomId: (m.roomId as UUID | undefined) || roomId,
          authorId: m.authorId as UUID,
          authorUsername: m.authorUsername as string,
          content: m.content as string,
          type: m.type as MessageType,
          isDmOnly: m.isDmOnly as boolean,
          visibleTo: Array.isArray(m.visibleTo) ? (m.visibleTo as UUID[]) : undefined,
          targetIds: Array.isArray(m.targetIds) ? (m.targetIds as UUID[]) : undefined,
          createdAt: toTimestamp(m.createdAt),
          editedAt: m.editedAt !== undefined ? toTimestamp(m.editedAt) : undefined,
        }))

        addMessages(sessionId, msgs)

        const oldestInPage = msgs.length > 0 ? msgs[0]?.createdAt : undefined
        if (oldestInPage && Number.isFinite(oldestInPage)) {
          oldestLoadedTimestampRef.current = oldestInPage
        }

        const hasMore = Boolean(data.pagination?.hasMore ?? data.hasMore)
        const hasEarlier = Boolean(data.pagination?.hasEarlier ?? data.hasEarlier)
        setHasHiddenOlderGreenroomHistory(
          isGreenroomMode && !older && before === undefined ? hasEarlier : false
        )
        setHasMoreHistory(hasMore)

        if (older && pendingScrollRestoreRef.current && messageListRef.current) {
          const { previousTop, previousHeight } = pendingScrollRestoreRef.current
          pendingScrollRestoreRef.current = null

          requestAnimationFrame(() => {
            const container = messageListRef.current
            if (!container) {
              return
            }

            const nextHeight = container.scrollHeight
            container.scrollTop = previousTop + (nextHeight - previousHeight)
          })
        }
      } catch (err: any) {
        setError(err.message ?? 'Failed to load messages')
      } finally {
        if (older) {
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

  const handleListScroll = useCallback(() => {
    const scrollContainer = messageListRef.current
    if (!scrollContainer) {
      return
    }

    const distanceFromBottom =
      scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight
    const isNearBottom = distanceFromBottom <= 24
    setIsUserPinnedToBottom(isNearBottom)

    if (isNearBottom) {
      clearPendingNewMessageCount()
    }
  }, [clearPendingNewMessageCount])

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

        const before = oldestLoadedTimestampRef.current
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
  }, [hasMoreHistory, isLoading, loadHistoryPage, messageList.length])

  const messageView = useMemo(() => {
    const roomScopedMessages: Message[] = []
    const startedIndices: number[] = []
    const isResolvedRoomGreen = isGreenRoomName(resolvedRoomName)

    for (const message of messageList) {
      if (Array.isArray(message.visibleTo) && !message.visibleTo.includes(user.id)) {
        continue
      }

      const roomNameForMessage = message.roomId ? roomDirectory[message.roomId]?.name : undefined
      const isGreenroomMessage =
        message.roomId === greenroomRoomId ||
        (message.roomId === roomId
          ? isResolvedRoomGreen
          : typeof roomNameForMessage === 'string' && isGreenRoomName(roomNameForMessage))
      const bookendState = getBookendState(message.content, message.type)

      if (!isGreenroomMode) {
        if (isGreenroomMessage) {
          continue
        }

        if (bookendState === 'started') {
          startedIndices.push(roomScopedMessages.length)
        }

        roomScopedMessages.push(message)
        continue
      }

      const isGreenroomContextMessage =
        message.roomId === roomId ||
        (typeof roomNameForMessage === 'string' && isGreenRoomName(roomNameForMessage))

      if (!isGreenroomContextMessage) {
        continue
      }

      if (bookendState && bookendState !== 'started' && bookendState !== 'ended') {
        continue
      }

      roomScopedMessages.push(message)
    }

    // In greenroom mode, all campaign messages should be visible (old greenroom messages appear
    // before the STARTED bookend). Only trim to the latest STARTED bookend in session chat.
    const visibleMessages =
      isGreenroomMode || startedIndices.length === 0
        ? roomScopedMessages
        : roomScopedMessages.slice(startedIndices[startedIndices.length - 1])

    const visibleRoomIds = new Set<UUID>()
    for (const message of visibleMessages) {
      if (message.roomId) {
        visibleRoomIds.add(message.roomId)
      }
    }

    return {
      visibleMessages,
      visibleRoomCount: visibleRoomIds.size,
    }
  }, [
    greenroomRoomId,
    isGreenroomMode,
    messageList,
    resolvedRoomName,
    roomDirectory,
    roomId,
    user.id,
  ])

  const { visibleMessages, visibleRoomCount } = messageView

  const whisperRecipients = useMemo(() => {
    const participants = Object.entries(sessionPresence ?? {}) as Array<
      [
        UUID,
        {
          username: string
          characterName?: string | null
          avatarUrl?: string | null
          role?: Role | string
          primaryRoomId?: UUID
        },
      ]
    >

    const dmId = sessionRecord?.dmId
    const isDmUser = user.role === Role.DM || String(user.role) === 'DM'

    return participants
      .filter(([participantUserId, participant]) => {
        if (participantUserId === user.id) {
          return false
        }

        if (isDmUser) {
          return true
        }

        if (participantUserId === dmId) {
          return false
        }

        return participant.primaryRoomId === roomId
      })
      .map(([participantUserId, participant]) => ({
        id: participantUserId,
        label:
          participant.characterName && participant.characterName.trim().length > 0
            ? participant.characterName
            : participant.username,
        avatarUrl: participant.avatarUrl,
      }))
      .sort((left, right) => left.label.localeCompare(right.label))
  }, [roomId, sessionPresence, sessionRecord?.dmId, user.id, user.role])

  const typingProjection = useMemo(() => {
    const activeTypingUsers = (sessionTypingIndicators ?? [])
      .filter((indicator) => indicator.until > typingClock)
      .filter((indicator) => indicator.userId !== user.id)
      .filter((indicator) => !indicator.roomId || indicator.roomId === roomId)

    const typingDisplayNames = activeTypingUsers.map(
      (indicator) => participantDirectory[indicator.userId]?.displayName || indicator.username
    )

    const typingSummary =
      typingDisplayNames.length === 1
        ? `${typingDisplayNames[0]} is typing`
        : `${typingDisplayNames[0]} +${typingDisplayNames.length - 1} are typing`

    return {
      typingUsers: activeTypingUsers,
      typingSummary,
    }
  }, [participantDirectory, roomId, sessionTypingIndicators, typingClock, user.id])

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
      (sessionOutgoingQueue ?? [])
        .filter((entry) => entry.roomId === roomId && entry.status === 'failed')
        .sort((a, b) => b.createdAt - a.createdAt),
    [roomId, sessionOutgoingQueue]
  )

  const { typingUsers, typingSummary } = typingProjection

  const latestVisibleMessageCreatedAt = visibleMessages[visibleMessages.length - 1]?.createdAt
  const earliestVisibleMessageCreatedAt = visibleMessages[0]?.createdAt

  useEffect(() => {
    if (isUserPinnedToBottom && latestVisibleMessageCreatedAt) {
      lastSeenLatestMessageAtRef.current = latestVisibleMessageCreatedAt
      window.requestAnimationFrame(() => {
        clearPendingNewMessageCount()
      })
    }
  }, [clearPendingNewMessageCount, isUserPinnedToBottom, latestVisibleMessageCreatedAt])

  // After initial hydrate (or room/session switch), pin viewport to newest message.
  useEffect(() => {
    if (isLoading || visibleMessages.length === 0) {
      return
    }

    const contextKey = `${sessionId}:${roomId}`
    if (initialScrollContextRef.current === contextKey) {
      return
    }

    requestAnimationFrame(() => {
      if (isGreenroomMode && earliestVisibleMessageCreatedAt) {
        const todayStart = greenroomTodayStartRef.current
        const newestVisibleMessageCreatedAt = latestVisibleMessageCreatedAt

        if (newestVisibleMessageCreatedAt && newestVisibleMessageCreatedAt < todayStart) {
          scrollToPosition(0, 'auto')
        } else {
          scrollToPosition(0, 'auto')
        }
        return
      }

      scrollToLatest('auto')
    })
    initialScrollContextRef.current = contextKey
    clearPendingNewMessageCount()
    lastSeenLatestMessageAtRef.current = latestVisibleMessageCreatedAt
  }, [
    clearPendingNewMessageCount,
    earliestVisibleMessageCreatedAt,
    isLoading,
    isGreenroomMode,
    latestVisibleMessageCreatedAt,
    roomId,
    scrollToPosition,
    scrollToLatest,
    sessionId,
    visibleMessages.length,
  ])

  // Follow new messages only when user is already pinned to bottom.
  // If user is reading history, keep their position and surface a subtle jump cue.
  useEffect(() => {
    if (!latestVisibleMessageCreatedAt) {
      return
    }

    const lastSeen = lastSeenLatestMessageAtRef.current
    const isNewLatest = !lastSeen || latestVisibleMessageCreatedAt > lastSeen

    if (!isNewLatest) {
      return
    }

    if (isUserPinnedToBottom) {
      scrollToLatest('smooth')
      window.requestAnimationFrame(() => {
        clearPendingNewMessageCount()
      })
      lastSeenLatestMessageAtRef.current = latestVisibleMessageCreatedAt
      return
    }

    window.requestAnimationFrame(() => {
      setPendingNewMessageCount((count) => count + 1)
    })
  }, [
    clearPendingNewMessageCount,
    isUserPinnedToBottom,
    latestVisibleMessageCreatedAt,
    scrollToLatest,
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

  const handleSend = async (content: string, type: MessageType, recipientId?: string) => {
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
  }

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
      <header className="session-chat-window__header">
        <div className="session-chat-window__header-copy">
          <h3 className="session-chat-window__title">{headerTitle}</h3>
          <p className="session-chat-window__subtitle">{headerSubtitle}</p>
        </div>
        <div className="session-chat-window__header-pills" aria-label="Timeline context">
          <span className="session-chat-window__pill">{visibleRoomCount || 1} room focus</span>
          <span className="session-chat-window__pill">
            {visibleMessages.length} {visibleMessages.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      </header>

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
        <MessageList
          messages={visibleMessages}
          currentUserId={user.id}
          currentUserRole={String(user.role)}
          sessionDmId={sessionRecord?.dmId}
          groupingWindowMs={messageGroupingWindowMs}
          listRef={messageListRef}
          topSentinelRef={topSentinelRef}
          onListScroll={handleListScroll}
          onListWheel={handleListWheel}
          participantDirectory={participantDirectory}
          roomDirectory={roomDirectory}
          activeRoomId={roomId}
          hideIntermissionMarkers={isGreenroomMode}
          emptyDayLabel={isGreenroomMode ? 'Today' : undefined}
        />
      )}

      {!isLoading && visibleMessages.length > 0 && !isUserPinnedToBottom ? (
        <TooltipProvider delayDuration={140}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`session-chat-window__jump-to-latest ${pendingNewMessageCount > 0 ? 'session-chat-window__jump-to-latest--new' : ''}`}
                onClick={() => {
                  scrollToLatest('smooth')
                  setIsUserPinnedToBottom(true)
                  setPendingNewMessageCount(0)
                  lastSeenLatestMessageAtRef.current = latestVisibleMessageCreatedAt
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

      <div className="session-chat-window__typing-slot" aria-live="polite">
        <div
          className={`session-chat-window__typing-overlay ${typingUsers.length > 0 ? 'session-chat-window__typing-overlay--active' : ''}`}
          aria-hidden={typingUsers.length === 0}
        >
          <span className="session-chat-window__typing-text">
            {typingUsers.length > 0 ? typingSummary : ''}
          </span>
          <span className="session-chat-window__typing-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </div>
      </div>

      {/* Input */}
      <MessageInput
        onSend={handleSend}
        onTypingStarted={() => emitTypingEvent('CHAT:TYPING_STARTED')}
        onTypingStopped={() => emitTypingEvent('CHAT:TYPING_STOPPED')}
        role={user.role}
        disabled={isLoading}
        forceMessageType={forceMessageType}
        whisperRecipients={whisperRecipients}
        roomType={roomType}
      />
    </section>
  )
}
