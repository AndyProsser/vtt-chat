/**
 * ChatWindow
 * Main chat container. Loads history on mount and renders message list + input.
 * New messages arrive via WS events (CHAT:MESSAGE_SENT) dispatched to chatSlice.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EventEnvelope, UUID } from '@shared'
import { MessageType, Role, RoomType } from '@shared'
import { useStore } from '../../hooks/useStore'
import { isGreenRoomName, ROOM_NAMES } from '../../constants/roomPresence.constants'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../core-ui'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import type { OutgoingChatMessage } from '../../state/chatSlice'
import type { Message } from '@/types/chat'
import '../../styles/components/chat/ChatWindow.css'

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
const CHAT_HISTORY_PAGE_SIZE = 20
type BookendState = 'started' | 'ended' | 'paused' | 'resumed' | 'cooldown' | null

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
  const messageListRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const isLoadingOlderRef = useRef(false)
  const oldestLoadedTimestampRef = useRef<number | undefined>(undefined)
  const lastSeenLatestMessageAtRef = useRef<number | undefined>(undefined)
  const pendingScrollRestoreRef = useRef<{ previousTop: number; previousHeight: number } | null>(
    null
  )
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
  const messageList: Message[] = Object.values(sessionMessages ?? {}).sort(
    (a, b) => a.createdAt - b.createdAt
  )

  const [typingClock, setTypingClock] = useState(() => Date.now())

  useEffect(() => {
    if (!sessionTypingIndicators || sessionTypingIndicators.length === 0) {
      return
    }

    const intervalId = window.setInterval(() => {
      setTypingClock(Date.now())
    }, 500)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [sessionTypingIndicators])

  useEffect(() => {
    isLoadingOlderRef.current = isLoadingOlder
  }, [isLoadingOlder])

  const loadHistoryPage = useCallback(
    async ({ before, older }: { before?: number; older: boolean }) => {
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
        if (before && Number.isFinite(before)) {
          params.set('before', String(before))
        }
        if (isGreenroomMode && sessionId) {
          params.set('sessionId', sessionId)
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
          createdAt: m.createdAt as number,
          editedAt: m.editedAt as number | undefined,
        }))

        for (const msg of msgs) {
          addMessage(sessionId, msg)
        }

        const oldestInPage = msgs.length > 0 ? msgs[0]?.createdAt : undefined
        if (oldestInPage && Number.isFinite(oldestInPage)) {
          oldestLoadedTimestampRef.current = oldestInPage
        }

        const hasMore = Boolean(data.pagination?.hasMore ?? data.hasMore)
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
    [addMessage, apiUrl, campaignId, isGreenroomMode, roomId, sessionId, token]
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
      setPendingNewMessageCount(0)
      lastSeenLatestMessageAtRef.current =
        visibleMessages[visibleMessages.length - 1]?.createdAt ?? lastSeenLatestMessageAtRef.current
    }
  }, [visibleMessages])

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

  const visibleMessages = useMemo(() => {
    const roomScopedMessages = messageList.filter((message) => {
      if (Array.isArray(message.visibleTo) && !message.visibleTo.includes(user.id)) {
        return false
      }

      const bookendState = getBookendState(message.content, message.type)

      if (!isGreenroomMode) {
        const roomNameForMessage = message.roomId ? roomDirectory[message.roomId]?.name : undefined
        const isGreenroomMessage =
          message.roomId === greenroomRoomId ||
          (message.roomId === roomId
            ? isGreenRoomName(resolvedRoomName)
            : typeof roomNameForMessage === 'string' && isGreenRoomName(roomNameForMessage))

        if (isGreenroomMessage) {
          return false
        }

        return true
      }

      const roomNameForMessage = message.roomId ? roomDirectory[message.roomId]?.name : undefined
      const isGreenroomMessage =
        message.roomId === roomId ||
        (typeof roomNameForMessage === 'string' && isGreenRoomName(roomNameForMessage))

      if (!isGreenroomMessage) {
        return false
      }

      if (bookendState && bookendState !== 'started' && bookendState !== 'ended') {
        return false
      }

      return true
    })

    // In greenroom mode, all campaign messages should be visible (old greenroom messages appear
    // before the STARTED bookend). Only trim to the latest STARTED bookend in session chat.
    if (isGreenroomMode) {
      return roomScopedMessages
    }

    let latestSessionStartIndex = -1
    for (let index = roomScopedMessages.length - 1; index >= 0; index -= 1) {
      const message = roomScopedMessages[index]
      if (getBookendState(message.content, message.type) === 'started') {
        latestSessionStartIndex = index
        break
      }
    }

    if (latestSessionStartIndex <= 0) {
      return roomScopedMessages
    }

    return roomScopedMessages.slice(latestSessionStartIndex)
  }, [
    greenroomRoomId,
    isGreenroomMode,
    messageList,
    resolvedRoomName,
    roomDirectory,
    roomId,
    user.id,
    user.role,
  ])

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

  const visibleRoomCount = useMemo(
    () => new Set(visibleMessages.map((message) => message.roomId).filter(Boolean)).size,
    [visibleMessages]
  )

  const typingUsers = useMemo(() => {
    return (sessionTypingIndicators ?? [])
      .filter((indicator) => indicator.until > typingClock)
      .filter((indicator) => indicator.userId !== user.id)
      .filter((indicator) => !indicator.roomId || indicator.roomId === roomId)
  }, [roomId, sessionTypingIndicators, typingClock, user.id])

  const typingDisplayNames = useMemo(
    () =>
      typingUsers.map(
        (indicator) => participantDirectory[indicator.userId]?.displayName || indicator.username
      ),
    [participantDirectory, typingUsers]
  )

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
        id: crypto.randomUUID() as UUID,
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

  const typingSummary =
    typingDisplayNames.length === 1
      ? `${typingDisplayNames[0]} is typing`
      : `${typingDisplayNames[0]} +${typingDisplayNames.length - 1} are typing`

  const latestVisibleMessageCreatedAt = visibleMessages[visibleMessages.length - 1]?.createdAt

  // After initial hydrate (or room/session switch), pin viewport to newest message.
  useEffect(() => {
    if (isLoading || visibleMessages.length === 0) {
      return
    }

    requestAnimationFrame(() => {
      scrollToLatest('auto')
    })
    setPendingNewMessageCount(0)
    lastSeenLatestMessageAtRef.current = latestVisibleMessageCreatedAt
  }, [isLoading, latestVisibleMessageCreatedAt, roomId, scrollToLatest, sessionId, visibleMessages.length])

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
      setPendingNewMessageCount(0)
      lastSeenLatestMessageAtRef.current = latestVisibleMessageCreatedAt
      return
    }

    setPendingNewMessageCount((count) => count + 1)
  }, [isUserPinnedToBottom, latestVisibleMessageCreatedAt, scrollToLatest])

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
    const queuedMessageId = crypto.randomUUID() as UUID

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
    <section className="chat-window">
      <header className="chat-window__header">
        <div className="chat-window__header-copy">
          <h3 className="chat-window__title">{headerTitle}</h3>
          <p className="chat-window__subtitle">{headerSubtitle}</p>
        </div>
        <div className="chat-window__header-pills" aria-label="Timeline context">
          <span className="chat-window__pill">{visibleRoomCount || 1} room focus</span>
          <span className="chat-window__pill">
            {visibleMessages.length} {visibleMessages.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      </header>

      {/* Error banner */}
      {error && <div className="chat-window__error">{error}</div>}

      {failedQueueItems.length > 0 ? (
        <section className="chat-window__queue-debug" aria-live="polite">
          <div className="chat-window__queue-debug-title">
            Failed sends ({failedQueueItems.length})
          </div>
          <div className="chat-window__queue-debug-list">
            {failedQueueItems.slice(0, 3).map((entry) => (
              <div key={entry.id} className="chat-window__queue-debug-item">
                <p className="chat-window__queue-debug-content">{entry.content}</p>
                <div className="chat-window__queue-debug-actions">
                  <button
                    type="button"
                    className="chat-window__queue-debug-button"
                    onClick={() => {
                      void retryFailedMessage(entry)
                    }}
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    className="chat-window__queue-debug-button chat-window__queue-debug-button--quiet"
                    onClick={() => {
                      removeOutgoingMessage(sessionId, entry.id)
                    }}
                  >
                    Dismiss
                  </button>
                </div>
                {entry.error ? (
                  <p className="chat-window__queue-debug-error">{entry.error}</p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Message list */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-ui-muted">
          Loading messages…
        </div>
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
          participantDirectory={participantDirectory}
          roomDirectory={roomDirectory}
          activeRoomId={roomId}
          hideIntermissionMarkers={isGreenroomMode}
        />
      )}

      {!isLoading && visibleMessages.length > 0 && !isUserPinnedToBottom ? (
        <TooltipProvider delayDuration={140}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`chat-window__jump-to-latest ${pendingNewMessageCount > 0 ? 'chat-window__jump-to-latest--new' : ''}`}
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

      <div className="chat-window__typing-slot" aria-live="polite">
        <div
          className={`chat-window__typing-overlay ${typingUsers.length > 0 ? 'chat-window__typing-overlay--active' : ''}`}
          aria-hidden={typingUsers.length === 0}
        >
          <span className="chat-window__typing-text">
            {typingUsers.length > 0 ? typingSummary : ''}
          </span>
          <span className="chat-window__typing-dots" aria-hidden="true">
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
