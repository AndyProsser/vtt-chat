/**
 * MessageInput
 * Message composition form with type selector (IC/OOC/Whisper).
 * Spectators are restricted to OOC only.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageType } from '@shared'
import type { Role } from '@shared'

interface WhisperRecipientOption {
  id: string
  label: string
}

interface MessageInputProps {
  onSend: (content: string, type: MessageType, recipientId?: string) => Promise<void>
  onTypingStarted?: () => void
  onTypingStopped?: () => void
  disabled?: boolean
  role: Role | string
  forceMessageType?: MessageType
  whisperRecipients?: WhisperRecipientOption[]
}

const TYPING_IDLE_TIMEOUT_MS = 1800

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

export function MessageInput({
  onSend,
  onTypingStarted,
  onTypingStopped,
  disabled,
  role,
  forceMessageType,
  whisperRecipients = [],
}: MessageInputProps) {
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
  // Derive effective recipient — clears to '' when the selected recipient is no
  // longer in whisperRecipients, without needing a setState-in-effect cycle.
  const validRecipientId = useMemo(() => {
    if (type !== MessageType.WHISPER || !recipientId.trim()) return recipientId
    if (whisperRecipients.some((o) => o.id === recipientId)) return recipientId
    return ''
  }, [recipientId, type, whisperRecipients])
  const [isSending, setIsSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef = useRef(false)
  const type = allowedTypes.includes(selectedType) ? selectedType : allowedTypes[0]

  const emitTypingStarted = () => {
    if (isTypingRef.current) {
      return
    }

    isTypingRef.current = true
    onTypingStarted?.()
  }

  const emitTypingStopped = () => {
    if (!isTypingRef.current) {
      return
    }

    isTypingRef.current = false
    onTypingStopped?.()
  }

  const scheduleTypingStop = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = setTimeout(() => {
      emitTypingStopped()
    }, TYPING_IDLE_TIMEOUT_MS)
  }

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
      emitTypingStopped()
    }
  }, [])

  const handleSend = async () => {
    const trimmed = content.trim()
    const trimmedRecipient = validRecipientId.trim()
    if (!trimmed || isSending) return
    if (type === MessageType.WHISPER && !trimmedRecipient) return

    setIsSending(true)
    try {
      await onSend(trimmed, type, type === MessageType.WHISPER ? trimmedRecipient : undefined)
      setContent('')
      emitTypingStopped()
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
          <>
            {whisperRecipients.length > 0 ? (
              <select
                value={validRecipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                disabled={disabled || isSending}
                className="chat-input__recipient"
              >
                <option value="">Select whisper recipient</option>
                {whisperRecipients.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={validRecipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                disabled={disabled || isSending}
                placeholder="Recipient user ID"
                className="chat-input__recipient"
              />
            )}
          </>
        )}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            const nextValue = e.target.value
            setContent(nextValue)

            if (!nextValue.trim()) {
              if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current)
              }
              emitTypingStopped()
              return
            }

            emitTypingStarted()
            scheduleTypingStop()
          }}
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
            (type === MessageType.WHISPER && !validRecipientId.trim())
          }
          className="chat-input__send"
        >
          {isSending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
