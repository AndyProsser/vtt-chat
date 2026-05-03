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

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  [MessageType.IC]: { bg: 'bg-sky-100', text: 'text-sky-800' },
  [MessageType.OOC]: { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  [MessageType.WHISPER]: { bg: 'bg-violet-100', text: 'text-violet-800' },
  [MessageType.SYSTEM]: { bg: 'bg-slate-200', text: 'text-slate-700' },
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
        const colors = TYPE_COLORS[msg.type] ?? TYPE_COLORS[MessageType.OOC]
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
            {/* Author + type badge */}
            {!isGroupedWithPrevious ? (
              <div className="chat-message__meta">
                {!isSelf && <span className="font-semibold">{msg.authorUsername}</span>}
                <span
                  className={`chat-message__type rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${colors.bg} ${colors.text}`}
                >
                  {TYPE_LABELS[msg.type] ?? msg.type}
                </span>
                {msg.editedAt && <span className="italic">edited</span>}
                <span>{formatTime(msg.createdAt)}</span>
              </div>
            ) : null}

            {/* Message bubble */}
            <div className={`chat-message__bubble ${isSelf ? 'chat-message__bubble--self' : ''}`}>
              {msg.content}
            </div>
          </article>
        )
      })}
    </div>
  )
}
