/**
 * MessageInput
 * Message composition form with type selector (IC/OOC/Whisper).
 * Spectators are restricted to OOC only.
 */

import { useState, useRef, useEffect } from 'react'
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
  const [type, setType] = useState<MessageType>(allowedTypes[0])
  const [content, setContent] = useState('')
  const [recipientId, setRecipientId] = useState('')
  const [isSending, setIsSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Keep selected type in sync when role changes
  useEffect(() => {
    if (!allowedTypes.includes(type)) {
      setType(allowedTypes[0])
    }
  }, [role])

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
    <div
      style={{
        borderTop: '1px solid #e5e7eb',
        padding: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        backgroundColor: '#fff',
      }}
    >
      {/* Type selector */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', color: '#6b7280', flexShrink: 0 }}>Type:</span>
        {allowedTypes.map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            style={{
              padding: '0.2rem 0.6rem',
              borderRadius: '9999px',
              border: '1px solid',
              borderColor: type === t ? '#3b82f6' : '#d1d5db',
              backgroundColor: type === t ? '#3b82f6' : '#fff',
              color: type === t ? '#fff' : '#374151',
              fontSize: '0.75rem',
              cursor: 'pointer',
              fontWeight: type === t ? 600 : 400,
            }}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
        {type === MessageType.WHISPER && (
          <input
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            disabled={disabled || isSending}
            placeholder="Recipient user ID"
            style={{
              width: '220px',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontFamily: 'inherit',
              backgroundColor: disabled ? '#f9fafb' : '#fff',
            }}
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
          style={{
            flex: 1,
            padding: '0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '0.875rem',
            resize: 'none',
            fontFamily: 'inherit',
            backgroundColor: disabled ? '#f9fafb' : '#fff',
          }}
        />
        <button
          onClick={() => void handleSend()}
          disabled={
            !content.trim() ||
            disabled ||
            isSending ||
            (type === MessageType.WHISPER && !recipientId.trim())
          }
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: content.trim() && !disabled ? '#3b82f6' : '#9ca3af',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: content.trim() && !disabled ? 'pointer' : 'not-allowed',
            fontSize: '0.875rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {isSending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
