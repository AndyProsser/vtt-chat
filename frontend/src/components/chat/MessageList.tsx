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
}

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

export function MessageList({ messages, currentUserId }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-ui-muted">
        No messages yet. Say something!
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
      {messages.map((msg) => {
        const colors = TYPE_COLORS[msg.type] ?? TYPE_COLORS[MessageType.OOC]
        const isSelf = msg.authorId === currentUserId

        return (
          <div key={msg.id} className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
            {/* Author + type badge */}
            <div className="mb-0.5 flex items-center gap-1.5 text-xs text-ui-secondary">
              {!isSelf && <span className="font-semibold">{msg.authorUsername}</span>}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${colors.bg} ${colors.text}`}
              >
                {TYPE_LABELS[msg.type] ?? msg.type}
              </span>
              {msg.editedAt && <span className="italic">edited</span>}
              <span>{formatTime(msg.createdAt)}</span>
            </div>

            {/* Message bubble */}
            <div
              className={`max-w-[80%] wrap-break-word rounded-ui-md px-3 py-2 text-sm leading-[1.4] ${
                isSelf ? 'bg-ui-brand text-white' : 'bg-ui-surface-subtle text-ui-primary'
              }`}
            >
              {msg.content}
            </div>
          </div>
        )
      })}
    </div>
  )
}
