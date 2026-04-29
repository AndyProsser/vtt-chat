/**
 * MessageInput
 * Message composition form with type selector (IC/OOC/Whisper).
 * Spectators are restricted to OOC only.
 */

import { useState, useRef } from 'react'
import { MessageType } from '@shared'
import type { Role } from '@shared'

interface MessageInputProps {
  onSend: (content: string, type: MessageType, recipientId?: string) => Promise<void>
  disabled?: boolean
  role: Role | string
}

const ROLE_ALLOWED_TYPES: Record<string, MessageType[]> = {
  DM: [MessageType.IC, MessageType.OOC, MessageType.WHISPER],
  PLAYER: [MessageType.IC, MessageType.OOC, MessageType.WHISPER],
  SPECTATOR: [MessageType.OOC],
}

const TYPE_LABELS: Record<MessageType, string> = {
  [MessageType.IC]: 'In-Character',
  [MessageType.OOC]: 'Out of Character',
  [MessageType.WHISPER]: 'Whisper',
  [MessageType.SYSTEM]: 'System',
}

export function MessageInput({ onSend, disabled, role }: MessageInputProps) {
  const allowedTypes = ROLE_ALLOWED_TYPES[role as string] ?? [MessageType.OOC]
  const [selectedType, setSelectedType] = useState<MessageType>(allowedTypes[0])
  const [content, setContent] = useState('')
  const [recipientId, setRecipientId] = useState('')
  const [isSending, setIsSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const type = allowedTypes.includes(selectedType) ? selectedType : allowedTypes[0]

  const handleSend = async () => {
    const trimmed = content.trim()
    const trimmedRecipient = recipientId.trim()
    if (!trimmed || isSending) return
    if (type === MessageType.WHISPER && !trimmedRecipient) return

    setIsSending(true)
    try {
      await onSend(trimmed, type, type === MessageType.WHISPER ? trimmedRecipient : undefined)
      setContent('')
      if (type !== MessageType.WHISPER) {
        setRecipientId('')
      }
      textareaRef.current?.focus()
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-ui-border bg-ui-surface p-3">
      {/* Type selector */}
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs text-ui-secondary">Type:</span>
        {allowedTypes.map((t) => (
          <button
            key={t}
            onClick={() => setSelectedType(t)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              type === t
                ? 'border-ui-brand bg-ui-brand text-white font-semibold'
                : 'border-ui-border-soft bg-ui-surface text-ui-primary'
            }`}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div className="flex items-end gap-2">
        {type === MessageType.WHISPER && (
          <input
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            disabled={disabled || isSending}
            placeholder="Recipient user ID"
            className="w-55 rounded-ui-sm border border-ui-border-soft bg-ui-surface px-2 py-2 text-sm text-ui-primary disabled:bg-ui-surface-subtle"
          />
        )}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isSending}
          placeholder={
            type === MessageType.WHISPER
              ? 'Whisper... (Enter to send)'
              : 'Message... (Enter to send, Shift+Enter for newline)'
          }
          rows={2}
          maxLength={4000}
          className="flex-1 resize-none rounded-ui-sm border border-ui-border-soft bg-ui-surface px-2 py-2 text-sm text-ui-primary disabled:bg-ui-surface-subtle"
        />
        <button
          onClick={() => void handleSend()}
          disabled={
            !content.trim() ||
            disabled ||
            isSending ||
            (type === MessageType.WHISPER && !recipientId.trim())
          }
          className="whitespace-nowrap rounded-ui-sm bg-ui-brand px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isSending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
