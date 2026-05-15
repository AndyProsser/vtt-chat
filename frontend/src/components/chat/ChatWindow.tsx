/**
 * ChatWindow
 * Main chat container. Loads history on mount and renders message list + input.
 * New messages arrive via WS events (CHAT:MESSAGE_SENT) dispatched to chatSlice.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EventEnvelope, UUID, Role } from '@shared'
import { MessageType } from '@shared'
import { useStore } from '../../hooks/useStore'
import { ROOM_NAMES } from '../../constants/roomPresence.constants'
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
  roomName?: string
  user: { id: UUID; username: string; role: Role | string }
  messageGroupingWindowMs?: number
  forceMessageType?: MessageType
  sendWsEvent?: (event: EventEnvelope) => void
}

const DEFAULT_MESSAGE_GROUPING_WINDOW_MS = 5 * 60 * 1000
const INTERMISSION_BOOKEND_PREFIXES = ['[Session Paused]', '[Session Resumed]'] as const

function isIntermissionBookend(content: string, type: MessageType): boolean {
  return (
    type === MessageType.SYSTEM &&
    INTERMISSION_BOOKEND_PREFIXES.some((prefix) => content.startsWith(prefix))
  )
}

export function ChatWindow({
  apiUrl,
  token,
  sessionId,
  roomId,
  roomName,
  user,
  messageGroupingWindowMs = DEFAULT_MESSAGE_GROUPING_WINDOW_MS,
  forceMessageType,
  sendWsEvent,
}: ChatWindowProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isUserPinnedToBottom, setIsUserPinnedToBottom] = useState(true)
  const messageListRef = useRef<HTMLDivElement>(null)
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
    | Record<UUID, { username: string; avatarUrl?: string | null; characterName?: string | null }>
    | undefined
  const sessionRooms = useStore((state) => (state.rooms as any)[sessionId]) as
    | Record<UUID, { id: UUID; name: string }>
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

  // Load message history on mount
  useEffect(() => {
    let cancelled = false

    const loadHistory = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const res = await fetch(`${apiUrl}/api/chat/messages/${sessionId}`, {
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
          createdAt: m.createdAt as number,
          editedAt: m.editedAt as number | undefined,
        }))

        if (!cancelled) {
          for (const msg of msgs) {
            addMessage(sessionId, msg)
          }
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message ?? 'Failed to load messages')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadHistory()
    return () => {
      cancelled = true
    }
  }, [addMessage, apiUrl, sessionId, token])

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
  }, [])

  const visibleMessages = useMemo(
    () =>
      messageList.filter((message) => {
        if (!isGreenroomMode) {
          return true
        }

        return !isIntermissionBookend(message.content, message.type)
      }),
    [isGreenroomMode, messageList]
  )

  const visibleRoomCount = useMemo(
    () => new Set(visibleMessages.map((message) => message.roomId).filter(Boolean)).size,
    [visibleMessages]
  )

  const offFocusMessageCount = useMemo(
    () => visibleMessages.filter((message) => message.roomId && message.roomId !== roomId).length,
    [roomId, visibleMessages]
  )

  const typingUsers = useMemo(() => {
    return (sessionTypingIndicators ?? [])
      .filter((indicator) => indicator.until > typingClock)
      .filter((indicator) => indicator.userId !== user.id)
      .filter((indicator) => !indicator.roomId || indicator.roomId === roomId)
  }, [roomId, sessionTypingIndicators, typingClock, user.id])

  const emitTypingEvent = useCallback(
    (type: 'CHAT:TYPING_STARTED' | 'CHAT:TYPING_STOPPED') => {
      if (!sendWsEvent) {
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

  const timelineSummary = useMemo(() => {
    if (isLoading) {
      return 'Rehydrating remembered timeline'
    }

    if (visibleMessages.length === 0) {
      return isGreenroomMode
        ? 'Greenroom stays quiet until someone breaks the silence'
        : 'No witnessed chat yet in this session'
    }

    if (offFocusMessageCount > 0) {
      return `${offFocusMessageCount} remembered ${offFocusMessageCount === 1 ? 'moment' : 'moments'} from other rooms`
    }

    return isGreenroomMode
      ? 'Greenroom shows only chatter that matters before the curtain rises'
      : 'Everything here is happening in your current room'
  }, [isGreenroomMode, isLoading, offFocusMessageCount, visibleMessages.length])

  const typingSummary =
    typingUsers.length === 1
      ? `${typingUsers[0]?.username} is typing…`
      : `${typingUsers.length} people are typing…`

  // Auto-scroll to newest message only while user stays pinned at bottom.
  useEffect(() => {
    if (!visibleMessages.length) {
      return
    }

    if (isUserPinnedToBottom) {
      scrollToLatest('smooth')
    }
  }, [isUserPinnedToBottom, scrollToLatest, visibleMessages.length])

  const postMessage = useCallback(
    async (content: string, type: MessageType, recipientId?: UUID) => {
      const res = await fetch(`${apiUrl}/api/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId, roomId, content, type, recipientId }),
      })

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
          createdAt,
          editedAt: (rawMessage as any).editedAt as number | undefined,
        }

        if (optimisticMessage.id) {
          // WS still remains source-of-truth; this only backfills missing echo.
          addMessage(sessionId, optimisticMessage)
        }
      }
    },
    [addMessage, apiUrl, roomId, sessionId, token, user.id, user.username]
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
          <span className="chat-window__pill chat-window__pill--accent">Unified Timeline</span>
          <span className="chat-window__pill">{visibleRoomCount || 1} room focus</span>
          <span className="chat-window__pill">
            {visibleMessages.length} {visibleMessages.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      </header>

      <section className="chat-window__timeline-bar" aria-label="Timeline status">
        <div>
          <p className="chat-window__timeline-kicker">
            {isGreenroomMode ? 'Greenroom relay' : 'Live room focus'}
          </p>
          <p className="chat-window__timeline-summary">{timelineSummary}</p>
        </div>
        <div className="chat-window__timeline-badges">
          <span className="chat-window__timeline-badge chat-window__timeline-badge--focus">
            Now viewing {resolvedRoomName}
          </span>
          {typingUsers.length > 0 ? (
            <span
              className="chat-window__timeline-badge chat-window__timeline-badge--typing"
              aria-live="polite"
            >
              {typingSummary}
            </span>
          ) : null}
        </div>
      </section>

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
          groupingWindowMs={messageGroupingWindowMs}
          listRef={messageListRef}
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
                className="chat-window__jump-to-latest"
                onClick={() => {
                  scrollToLatest('smooth')
                  setIsUserPinnedToBottom(true)
                }}
                aria-label="Jump to latest message"
              >
                ↓
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">Jump to latest</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}

      {/* Input */}
      <MessageInput
        onSend={handleSend}
        onTypingStarted={() => emitTypingEvent('CHAT:TYPING_STARTED')}
        onTypingStopped={() => emitTypingEvent('CHAT:TYPING_STOPPED')}
        role={user.role}
        disabled={isLoading}
        forceMessageType={forceMessageType}
      />
    </section>
  )
}
