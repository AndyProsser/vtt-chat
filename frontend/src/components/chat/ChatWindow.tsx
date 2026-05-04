/**
 * ChatWindow
 * Main chat container. Loads history on mount and renders message list + input.
 * New messages arrive via WS events (CHAT:MESSAGE_SENT) dispatched to chatSlice.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { UUID, Role } from '@shared'
import { MessageType } from '@shared'
import { useStore } from '../../hooks/useStore'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import type { Message } from '@/types/chat'
import '../../styles/components/chat/ChatWindow.css'

interface ChatWindowProps {
  apiUrl: string
  token: string
  sessionId: UUID
  roomId: UUID
  user: { id: UUID; username: string; role: Role | string }
  messageGroupingWindowMs?: number
}

const DEFAULT_MESSAGE_GROUPING_WINDOW_MS = 5 * 60 * 1000

export function ChatWindow({
  apiUrl,
  token,
  sessionId,
  roomId,
  user,
  messageGroupingWindowMs = DEFAULT_MESSAGE_GROUPING_WINDOW_MS,
}: ChatWindowProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isUserPinnedToBottom, setIsUserPinnedToBottom] = useState(true)
  const messageListRef = useRef<HTMLDivElement>(null)

  const sessionMessages = useStore((state) => (state.messages as any)[sessionId]) as
    | Record<UUID, Message>
    | undefined
  const addMessage = useStore((state) => state.addMessage)

  // Derive ordered message list for this session
  // messages shape: Record<UUID, Record<UUID, Message>> (session → id → Message)
  const messageList: Message[] = Object.values(sessionMessages ?? {}).sort(
    (a, b) => a.createdAt - b.createdAt
  )

  // Load message history on mount
  useEffect(() => {
    let cancelled = false

    const loadHistory = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const res = await fetch(`${apiUrl}/api/chat/messages/${sessionId}?roomId=${roomId}`, {
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
  }, [addMessage, apiUrl, roomId, sessionId, token])

  const scrollToLatest = useCallback((behavior: ScrollBehavior = 'auto') => {
    const scrollContainer = messageListRef.current
    if (!scrollContainer) {
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

  const visibleMessages = messageList.filter((message) => message.roomId === roomId)

  // Auto-scroll to newest message only while user stays pinned at bottom.
  useEffect(() => {
    if (!visibleMessages.length) {
      return
    }

    if (isUserPinnedToBottom) {
      scrollToLatest('smooth')
    }
  }, [isUserPinnedToBottom, scrollToLatest, visibleMessages.length])

  const handleSend = async (content: string, type: MessageType, recipientId?: string) => {
    setError(null)
    try {
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
    } catch (err: any) {
      setError(err.message ?? 'Failed to send message')
    }
  }

  return (
    <section className="chat-window">
      <header className="chat-window__header">
        <div>
          <h3 className="chat-window__title"># general</h3>
          <p className="chat-window__subtitle">Live session chat</p>
        </div>
      </header>

      {/* Error banner */}
      {error && <div className="chat-window__error">{error}</div>}

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
        />
      )}

      {!isLoading && visibleMessages.length > 0 && !isUserPinnedToBottom ? (
        <button
          type="button"
          className="chat-window__jump-to-latest"
          onClick={() => {
            scrollToLatest('smooth')
            setIsUserPinnedToBottom(true)
          }}
          aria-label="Jump to latest message"
          title="Jump to latest"
        >
          ↓
        </button>
      ) : null}

      {/* Input */}
      <MessageInput onSend={handleSend} role={user.role} disabled={isLoading} />
    </section>
  )
}
