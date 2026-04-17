/**
 * MessageList
 * Renders the chronological list of messages for the current session.
 * Messages arrive pre-filtered by the server (visibility-safe).
 */

import type { Message } from '../../state/chatSlice'
import { MessageType } from '@shared'

interface MessageListProps {
  messages: Message[]
  currentUserId: string
}

const TYPE_LABELS: Record<string, string> = {
  [MessageType.IC]: 'IC',
  [MessageType.OOC]: 'OOC',
  [MessageType.WHISPER]: 'Whisper',
  [MessageType.SYSTEM]: 'System',
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  [MessageType.IC]: { bg: '#dbeafe', text: '#1d4ed8' },
  [MessageType.OOC]: { bg: '#d1fae5', text: '#065f46' },
  [MessageType.WHISPER]: { bg: '#ede9fe', text: '#6d28d9' },
  [MessageType.SYSTEM]: { bg: '#f3f4f6', text: '#374151' },
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function MessageList({ messages, currentUserId }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
          fontSize: '0.875rem',
        }}
      >
        No messages yet. Say something!
      </div>
    )
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: '0.75rem',
      }}
    >
      {messages.map((msg) => {
        const colors = TYPE_COLORS[msg.type] ?? TYPE_COLORS[MessageType.OOC]
        const isSelf = msg.authorId === currentUserId

        return (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: isSelf ? 'flex-end' : 'flex-start',
            }}
          >
            {/* Author + type badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                marginBottom: '0.125rem',
                fontSize: '0.75rem',
                color: '#6b7280',
              }}
            >
              {!isSelf && <span style={{ fontWeight: 600 }}>{msg.authorUsername}</span>}
              <span
                style={{
                  padding: '0.125rem 0.375rem',
                  borderRadius: '9999px',
                  backgroundColor: colors.bg,
                  color: colors.text,
                  fontWeight: 600,
                  fontSize: '0.6875rem',
                }}
              >
                {TYPE_LABELS[msg.type] ?? msg.type}
              </span>
              {msg.editedAt && <span style={{ fontStyle: 'italic' }}>edited</span>}
              <span>{formatTime(msg.createdAt)}</span>
            </div>

            {/* Message bubble */}
            <div
              style={{
                maxWidth: '80%',
                padding: '0.5rem 0.75rem',
                borderRadius: '0.5rem',
                backgroundColor: isSelf ? '#3b82f6' : '#f3f4f6',
                color: isSelf ? '#fff' : '#111827',
                fontSize: '0.875rem',
                lineHeight: '1.4',
                wordBreak: 'break-word',
              }}
            >
              {msg.content}
            </div>
          </div>
        )
      })}
    </div>
  )
}
