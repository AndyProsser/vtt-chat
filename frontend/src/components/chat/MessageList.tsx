/**
 * MessageList
 * Renders the chronological list of messages for the current session.
 * Messages arrive pre-filtered by the server (visibility-safe).
 */

import type { Message } from '@/types/chat'
import { MessageType } from '@shared'

interface MessageListProps {
  messages: Message[]
  currentUserId: string
  groupingWindowMs?: number
}

const DEFAULT_GROUPING_WINDOW_MS = 5 * 60 * 1000

const TYPE_LABELS: Record<string, string> = {
  [MessageType.IC]: 'IC',
  [MessageType.OOC]: 'OOC',
  [MessageType.WHISPER]: 'Whisper',
  [MessageType.SYSTEM]: 'System',
}

const TYPE_VARIANTS: Record<string, 'ic' | 'ooc' | 'whisper' | 'system'> = {
  [MessageType.IC]: 'ic',
  [MessageType.OOC]: 'ooc',
  [MessageType.WHISPER]: 'whisper',
  [MessageType.SYSTEM]: 'system',
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

export function MessageList({
  messages,
  currentUserId,
  groupingWindowMs = DEFAULT_GROUPING_WINDOW_MS,
}: MessageListProps) {
  if (messages.length === 0) {
    return <div className="chat-message-list__empty">No messages yet. Say something!</div>
  }

  return (
    <div className="chat-message-list">
      {messages.map((msg, index) => {
        const previous = index > 0 ? messages[index - 1] : undefined
        const variant = TYPE_VARIANTS[msg.type] ?? TYPE_VARIANTS[MessageType.OOC]
        const isSelf = msg.authorId === currentUserId
        const isGroupedWithPrevious = Boolean(
          groupingWindowMs > 0 &&
          previous &&
          previous.authorId === msg.authorId &&
          msg.createdAt - previous.createdAt <= groupingWindowMs
        )

        return (
          <article
            key={msg.id}
            className={`chat-message ${isSelf ? 'chat-message--self' : ''} ${isGroupedWithPrevious ? 'chat-message--grouped' : ''}`}
          >
            {/* Author */}
            {!isGroupedWithPrevious ? (
              <div className="chat-message__meta">
                <span className="chat-message__author">{msg.authorUsername}</span>
              </div>
            ) : null}

            {/* Message bubble */}
            <div className={`chat-message__bubble ${isSelf ? 'chat-message__bubble--self' : ''}`}>
              <span className={`chat-message__type chat-message__type--${variant}`}>
                {TYPE_LABELS[msg.type] ?? msg.type}
              </span>{' '}
              {msg.content}
            </div>

            <div className="chat-message__timestamp">
              {msg.editedAt ? 'edited · ' : ''}
              {formatRelativeTime(msg.createdAt)}
            </div>
          </article>
        )
      })}
    </div>
  )
}
