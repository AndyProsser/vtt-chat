/**
 * MessageInput
 * Message composition form with connected type toggles and whisper targeting.
 * Spectators are restricted to OOC only.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageType, RoomType } from '@shared'
import type { Role } from '@shared'

interface WhisperRecipientOption {
  id: string
  label: string
  avatarUrl?: string | null
}

interface MessageInputProps {
  onSend: (content: string, type: MessageType, recipientId?: string) => Promise<void>
  onTypingStarted?: () => void
  onTypingStopped?: () => void
  disabled?: boolean
  role: Role | string
  forceMessageType?: MessageType
  whisperRecipients?: WhisperRecipientOption[]
  roomType?: RoomType
}

const TYPING_IDLE_TIMEOUT_MS = 1800

const MESSAGE_TYPE_ORDER: MessageType[] = [
  MessageType.IC,
  MessageType.OOC,
  MessageType.WHISPER,
  MessageType.DM,
]

const ROLE_ALLOWED_TYPES: Record<string, MessageType[]> = {
  DM: [MessageType.IC, MessageType.OOC, MessageType.WHISPER],
  PLAYER: [MessageType.IC, MessageType.OOC, MessageType.WHISPER, MessageType.DM],
  SPECTATOR: [MessageType.OOC],
}

const TYPE_META: Record<MessageType, { label: string; icon: string; tone: string }> = {
  [MessageType.IC]: { label: 'IC', icon: 'swords', tone: 'ic' },
  [MessageType.OOC]: { label: 'OOC', icon: 'chat_bubble', tone: 'ooc' },
  [MessageType.WHISPER]: { label: 'WHISPER', icon: 'visibility_off', tone: 'whisper' },
  [MessageType.DM]: { label: 'DM', icon: 'mail', tone: 'dm' },
  [MessageType.SYSTEM]: { label: 'System', icon: 'info', tone: 'system' },
}

export function MessageInput({
  onSend,
  onTypingStarted,
  onTypingStopped,
  disabled,
  role,
  forceMessageType,
  whisperRecipients = [],
  roomType,
}: MessageInputProps) {
  const isWhisperGroupMode = roomType === RoomType.PRIVATE
  const roleAllowedTypes = useMemo(
    () => ROLE_ALLOWED_TYPES[role as string] ?? [MessageType.OOC],
    [role]
  )
  const allowedTypes = useMemo(
    () => (forceMessageType ? [forceMessageType] : roleAllowedTypes),
    [forceMessageType, roleAllowedTypes]
  )
  const [selectedType, setSelectedType] = useState<MessageType>(
    forceMessageType ?? (isWhisperGroupMode ? MessageType.WHISPER : MessageType.OOC)
  )
  const [content, setContent] = useState('')
  const [recipientId, setRecipientId] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isWhisperPickerOpen, setIsWhisperPickerOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef = useRef(false)
  const type = forceMessageType
    ? forceMessageType
    : isWhisperGroupMode
      ? MessageType.WHISPER
      : allowedTypes.includes(selectedType)
        ? selectedType
        : allowedTypes[0]

  const validRecipientId = useMemo(() => {
    if (type !== MessageType.WHISPER || !recipientId.trim()) return recipientId
    if (whisperRecipients.some((o) => o.id === recipientId)) return recipientId
    return ''
  }, [recipientId, type, whisperRecipients])

  const selectedRecipient = useMemo(
    () => whisperRecipients.find((option) => option.id === validRecipientId) ?? null,
    [validRecipientId, whisperRecipients]
  )

  const visibleTypes = useMemo(
    () =>
      MESSAGE_TYPE_ORDER.filter(
        (messageType) =>
          allowedTypes.includes(messageType) && !(messageType === MessageType.DM && role === 'DM')
      ),
    [allowedTypes, role]
  )

  const canShowWhisperPicker =
    type === MessageType.WHISPER && !isWhisperGroupMode && !forceMessageType

  const emitTypingStarted = useCallback(() => {
    if (isTypingRef.current) {
      return
    }

    isTypingRef.current = true
    onTypingStarted?.()
  }, [onTypingStarted])

  const emitTypingStopped = useCallback(() => {
    if (!isTypingRef.current) {
      return
    }

    isTypingRef.current = false
    onTypingStopped?.()
  }, [onTypingStopped])

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
  }, [emitTypingStopped])

  const handleSend = async () => {
    const trimmed = content.trim()
    const trimmedRecipient = validRecipientId.trim()
    if (!trimmed || isSending) return
    if (type === MessageType.WHISPER && !isWhisperGroupMode && !trimmedRecipient) return

    setIsSending(true)
    try {
      await onSend(
        trimmed,
        type,
        type === MessageType.WHISPER && !isWhisperGroupMode ? trimmedRecipient : undefined
      )
      setContent('')
      emitTypingStopped()
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
        <div
          className="chat-input__types"
          role="radiogroup"
          aria-label="Message type"
          onMouseEnter={() => {
            if (canShowWhisperPicker) {
              setIsWhisperPickerOpen(true)
            }
          }}
        >
          {visibleTypes.map((messageType) => {
            const meta = TYPE_META[messageType]
            const isActive = type === messageType
            const isDisabled = isWhisperGroupMode && messageType !== MessageType.WHISPER

            return (
              <button
                key={messageType}
                type="button"
                role="radio"
                aria-checked={isActive}
                disabled={disabled || isSending || isDisabled}
                onClick={() => {
                  if (isDisabled) return
                  setSelectedType(messageType)
                  if (messageType !== MessageType.WHISPER) {
                    setIsWhisperPickerOpen(false)
                  }
                  if (messageType === MessageType.WHISPER && !isWhisperGroupMode) {
                    setIsWhisperPickerOpen(true)
                  }
                }}
                className={`chat-input__type-toggle chat-input__type-toggle--${meta.tone} ${isActive ? 'chat-input__type-toggle--active' : ''}`}
                title={meta.label}
              >
                <span
                  className="chat-input__type-toggle-icon material-symbols-outlined"
                  aria-hidden="true"
                >
                  {meta.icon}
                </span>
                <span className="chat-input__type-toggle-label">{meta.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      {canShowWhisperPicker && isWhisperPickerOpen ? (
        <div
          className="chat-input__whisper-picker chat-input__whisper-picker--open"
          onMouseEnter={() => setIsWhisperPickerOpen(true)}
        >
          <div className="chat-input__whisper-picker-header">
            <span className="chat-input__whisper-picker-title">Whisper to</span>
            <span className="chat-input__whisper-picker-current">
              {selectedRecipient?.label ?? 'Select a player'}
            </span>
          </div>
          <div
            className="chat-input__whisper-picker-list"
            role="listbox"
            aria-label="Whisper recipients"
          >
            {whisperRecipients.length > 0 ? (
              whisperRecipients.map((option) => {
                const isSelected = option.id === validRecipientId
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={disabled || isSending}
                    onClick={() => {
                      setRecipientId(option.id)
                      setIsWhisperPickerOpen(false)
                    }}
                    className={`chat-input__whisper-recipient ${isSelected ? 'chat-input__whisper-recipient--selected' : ''}`}
                  >
                    <span className="chat-input__whisper-recipient-avatar" aria-hidden="true">
                      {option.avatarUrl ? (
                        <img src={option.avatarUrl} alt="" />
                      ) : (
                        (option.label.trim()[0] || '?').toUpperCase()
                      )}
                    </span>
                    <span className="chat-input__whisper-recipient-name">{option.label}</span>
                  </button>
                )
              })
            ) : (
              <div className="chat-input__whisper-empty">No visible players to whisper to.</div>
            )}
          </div>
        </div>
      ) : null}

      {/* Input row */}
      <div className="chat-input__composer">
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
            (type === MessageType.WHISPER && !isWhisperGroupMode && !validRecipientId.trim())
          }
          className="chat-input__send"
        >
          {isSending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
