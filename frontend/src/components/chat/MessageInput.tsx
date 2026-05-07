/**
 * MessageInput
 * Message composition form with type selector (IC/OOC/Whisper).
 * Spectators are restricted to OOC only.
 */

import { useMemo, useRef, useState } from 'react'
import { MessageType } from '@shared'
import type { Role } from '@shared'

interface MessageInputProps {
  onSend: (content: string, type: MessageType, recipientId?: string) => Promise<void>
  disabled?: boolean
  role: Role | string
  forceMessageType?: MessageType
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

export function MessageInput({ onSend, disabled, role, forceMessageType }: MessageInputProps) {
  const roleAllowedTypes = useMemo(
    () => ROLE_ALLOWED_TYPES[role as string] ?? [MessageType.OOC],
    [role]
  )
  const allowedTypes = useMemo(
    () => (forceMessageType ? [forceMessageType] : roleAllowedTypes),
    [forceMessageType, roleAllowedTypes]
  )
  const [selectedType, setSelectedType] = useState<MessageType>(MessageType.OOC)
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
    <div className="chat-input">
      {!forceMessageType ? (
        <div className="chat-input__types">
          <span className="chat-input__types-label">Type:</span>
          {allowedTypes.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedType(t)}
              className={`chat-input__type-pill ${
                type === t
                  ? 'chat-input__type-pill--active border-ui-brand bg-ui-brand text-white font-semibold'
                  : 'border-ui-border-soft bg-ui-surface text-ui-primary'
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      ) : null}

      {/* Input row */}
      <div className="chat-input__composer">
        {type === MessageType.WHISPER && (
          <input
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            disabled={disabled || isSending}
            placeholder="Recipient user ID"
            className="chat-input__recipient"
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
          className="chat-input__textarea"
        />
        <button
          onClick={() => void handleSend()}
          disabled={
            !content.trim() ||
            disabled ||
            isSending ||
            (type === MessageType.WHISPER && !recipientId.trim())
          }
          className="chat-input__send"
        >
          {isSending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
