/**
 * ChatWindow
 * Main chat container. Loads history on mount and renders message list + input.
 * New messages arrive via WS events (CHAT:MESSAGE_SENT) dispatched to chatSlice.
 */

import { useEffect, useRef, useState } from 'react'
import type { UUID, Role } from '@shared'
import { MessageType } from '@shared'
import { useStore } from '../../hooks/useStore'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import type { Message } from '../../state/chatSlice'

interface ChatWindowProps {
  apiUrl: string
  token: string
  sessionId: UUID
  user: { id: UUID; username: string; role: Role | string }
}

export function ChatWindow({ apiUrl, token, sessionId, user }: ChatWindowProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const store = useStore()

  // Derive ordered message list for this session
  // messages shape: Record<UUID, Record<UUID, Message>> (session → id → Message)
  const sessionMessages = (store.messages as any)[sessionId] as Record<UUID, Message> | undefined
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
            store.addMessage(sessionId, msg)
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
  }, [apiUrl, sessionId, store, token])

  // Auto-scroll to newest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messageList.length])

  const handleSend = async (content: string, type: MessageType, recipientId?: string) => {
    setError(null)
    try {
      const res = await fetch(`${apiUrl}/api/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId, content, type, recipientId }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message ?? `HTTP ${res.status}`)
      }
      // Message will appear via WS:EVENT → dispatcher → chatSlice
    } catch (err: any) {
      setError(err.message ?? 'Failed to send message')
    }
  }

  return (
    <div className="flex h-full min-h-100 flex-col overflow-hidden rounded-ui-lg border border-ui-border bg-ui-surface">
      {/* Header */}
      <div className="shrink-0 border-b border-ui-border bg-ui-surface-subtle px-4 py-3 text-sm font-semibold text-ui-primary">
        Chat
      </div>

      {/* Error banner */}
      {error && (
        <div className="shrink-0 border-b border-red-300 bg-ui-error-surface px-4 py-2 text-xs text-ui-error-text">
          {error}
        </div>
      )}

      {/* Message list */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-ui-muted">
          Loading messages…
        </div>
      ) : (
        <MessageList messages={messageList} currentUserId={user.id} />
      )}

      {/* Scroll anchor */}
      <div ref={messagesEndRef} />

      {/* Input */}
      <MessageInput onSend={handleSend} role={user.role} disabled={isLoading} />
    </div>
  )
}
