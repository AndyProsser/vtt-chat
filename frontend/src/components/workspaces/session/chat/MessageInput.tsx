/**
 * MessageInput
 * Message composition form with connected type toggles and whisper targeting.
 * Spectators are restricted to OOC only.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageType, RoomType, SessionState } from '@shared'
import type { Role, UUID } from '@shared'
import { TYPING_IDLE_TIMEOUT_MS } from '@/constants/chatPresence.constants'
import { Icon } from '@/components/ui/Icon'
import { useStore } from '@/hooks/useStore'
import type { WhisperRecipientOption } from '@/types/chat'
import { MessageTypeSelector } from './MessageTypeSelector'

interface MessageInputProps {
  onSend: (content: string, type: MessageType, recipientId?: string) => Promise<void>
  onTypingStarted?: () => void
  onTypingStopped?: () => void
  disabled?: boolean
  role: Role | string
  sessionId?: UUID
  currentUserId?: UUID
  currentRoomId?: UUID
  forceMessageType?: MessageType
  whisperRecipients?: WhisperRecipientOption[]
  roomType?: RoomType
}

const EMPTY_SESSION_PRESENCE: Record<
  UUID,
  {
    username: string
    avatarUrl?: string | null
    characterName?: string | null
    role?: Role | string
    primaryRoomId?: UUID
  }
> = {}

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

type ComposerMode = 'greenroom' | 'active' | 'active-whisper' | 'paused' | 'cooldown'

export function MessageInput({
  onSend,
  onTypingStarted,
  onTypingStopped,
  disabled,
  role,
  sessionId,
  currentUserId,
  currentRoomId,
  forceMessageType,
  whisperRecipients = [],
  roomType,
}: MessageInputProps) {
  const sessionPresence = useStore((state) => {
    if (!sessionId) {
      return EMPTY_SESSION_PRESENCE
    }

    return (
      ((state.sessionPresence as any)[sessionId] as typeof EMPTY_SESSION_PRESENCE) ??
      EMPTY_SESSION_PRESENCE
    )
  })
  const sessionDmId = useStore((state) => {
    if (!sessionId) {
      return undefined
    }

    return ((state.sessions as any)[sessionId] as { dmId?: UUID } | undefined)?.dmId
  })
  const sessionState = useStore((state) => {
    if (!sessionId) {
      return undefined
    }

    return ((state.sessions as any)[sessionId] as { state?: SessionState } | undefined)?.state
  })
  const isDmRole = String(role) === 'DM'
  const isWhisperGroupMode = roomType === RoomType.PRIVATE
  const composerMode = useMemo<ComposerMode>(() => {
    if (sessionState === SessionState.PAUSED) {
      return 'paused'
    }

    if (sessionState === SessionState.COOLDOWN) {
      return 'cooldown'
    }

    if (sessionState === SessionState.ACTIVE) {
      return isWhisperGroupMode ? 'active-whisper' : 'active'
    }

    return 'greenroom'
  }, [isWhisperGroupMode, sessionState])
  const roleAllowedTypes = useMemo(
    () => ROLE_ALLOWED_TYPES[role as string] ?? [MessageType.OOC],
    [role]
  )
  const canShowPlayerDmType = !isDmRole && composerMode === 'active'
  const selectableTypes = useMemo(
    () =>
      MESSAGE_TYPE_ORDER.filter((messageType) => {
        if (!roleAllowedTypes.includes(messageType)) {
          return false
        }

        if (messageType === MessageType.DM) {
          return canShowPlayerDmType
        }

        return true
      }),
    [canShowPlayerDmType, roleAllowedTypes]
  )
  const allowedTypes = useMemo(() => {
    switch (composerMode) {
      case 'greenroom':
      case 'paused':
      case 'cooldown':
        return [MessageType.OOC]
      case 'active-whisper':
        return roleAllowedTypes.filter((messageType) => messageType !== MessageType.DM)
      case 'active':
      default:
        return forceMessageType ? [forceMessageType] : roleAllowedTypes
    }
  }, [composerMode, forceMessageType, roleAllowedTypes])
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
  const previousComposerModeRef = useRef<ComposerMode | null>(null)
  const derivedWhisperRecipients = useMemo(() => {
    if (!sessionId || !currentUserId) {
      return whisperRecipients
    }

    const participants = Object.entries(sessionPresence) as Array<
      [
        UUID,
        {
          username: string
          characterName?: string | null
          avatarUrl?: string | null
          role?: Role | string
          primaryRoomId?: UUID
        },
      ]
    >

    return participants
      .filter(([participantUserId, participant]) => {
        if (participantUserId === currentUserId) {
          return false
        }

        if (isDmRole) {
          return true
        }

        if (participantUserId === sessionDmId) {
          return false
        }

        return participant.primaryRoomId === currentRoomId
      })
      .map(([participantUserId, participant]) => ({
        id: participantUserId,
        label:
          participant.characterName && participant.characterName.trim().length > 0
            ? participant.characterName
            : participant.username,
        avatarUrl: participant.avatarUrl,
      }))
      .sort((left, right) => left.label.localeCompare(right.label))
  }, [
    currentRoomId,
    currentUserId,
    isDmRole,
    sessionDmId,
    sessionId,
    sessionPresence,
    whisperRecipients,
  ])

  const effectiveWhisperRecipients =
    sessionId && currentUserId ? derivedWhisperRecipients : whisperRecipients
  const type =
    composerMode === 'active-whisper'
      ? MessageType.WHISPER
      : composerMode === 'greenroom' || composerMode === 'paused' || composerMode === 'cooldown'
        ? MessageType.OOC
        : forceMessageType
          ? forceMessageType
          : allowedTypes.includes(selectedType)
            ? selectedType
            : allowedTypes[0]

  const validRecipientId = useMemo(() => {
    if (type !== MessageType.WHISPER || !recipientId.trim()) return recipientId
    if (effectiveWhisperRecipients.some((o) => o.id === recipientId)) return recipientId
    return ''
  }, [effectiveWhisperRecipients, recipientId, type])

  const selectedRecipient = useMemo(
    () => effectiveWhisperRecipients.find((option) => option.id === validRecipientId) ?? null,
    [effectiveWhisperRecipients, validRecipientId]
  )

  const visibleTypes = useMemo(
    () => (composerMode === 'greenroom' ? [MessageType.OOC] : selectableTypes),
    [composerMode, selectableTypes]
  )
  const hiddenTypeModes = composerMode === 'greenroom'
  const disabledTypes = useMemo(() => {
    if (composerMode === 'paused' || composerMode === 'cooldown') {
      return new Set<MessageType>(
        MESSAGE_TYPE_ORDER.filter((messageType) => messageType !== MessageType.OOC)
      )
    }

    if (composerMode === 'active-whisper') {
      return new Set<MessageType>(
        MESSAGE_TYPE_ORDER.filter((messageType) => messageType !== MessageType.WHISPER)
      )
    }

    return new Set<MessageType>()
  }, [composerMode])
  const canShowWhisperPicker =
    type === MessageType.WHISPER && !hiddenTypeModes && !isWhisperGroupMode

  const inputToneClass = useMemo(() => {
    if (type === MessageType.IC) return 'session-message-input__textarea--ic'
    if (type === MessageType.OOC) return 'session-message-input__textarea--ooc'
    if (type === MessageType.WHISPER) {
      return isDmRole
        ? 'session-message-input__textarea--whisper-dm'
        : 'session-message-input__textarea--whisper'
    }
    if (type === MessageType.DM) return 'session-message-input__textarea--dm'
    return ''
  }, [isDmRole, type])

  const inputPlaceholder = useMemo(() => {
    if (type === MessageType.WHISPER) {
      if (isWhisperGroupMode) {
        return 'Whisper to this private group... (Enter to send)'
      }

      if (selectedRecipient?.label) {
        return `Whisper to ${selectedRecipient.label}... (Enter to send)`
      }

      return 'Whisper to a player... (Select target, then Enter to send)'
    }

    if (type === MessageType.IC) {
      return 'In character... (Enter to send, Shift+Enter for newline)'
    }

    if (type === MessageType.OOC) {
      return 'Out of character... (Enter to send, Shift+Enter for newline)'
    }

    if (type === MessageType.DM) {
      return 'Message the DM privately... (Enter to send)'
    }

    return 'Message... (Enter to send, Shift+Enter for newline)'
  }, [isWhisperGroupMode, selectedRecipient, type])

  const canSend =
    !!content.trim() &&
    !disabled &&
    !isSending &&
    (type !== MessageType.WHISPER || isWhisperGroupMode || !!validRecipientId.trim())

  useEffect(() => {
    const previousComposerMode = previousComposerModeRef.current
    const forcedType =
      composerMode === 'active-whisper'
        ? MessageType.WHISPER
        : composerMode === 'greenroom' || composerMode === 'paused' || composerMode === 'cooldown'
          ? MessageType.OOC
          : (forceMessageType ?? null)

    if (forcedType) {
      if (selectedType !== forcedType) {
        setSelectedType(forcedType)
      }
      if (isWhisperPickerOpen) {
        setIsWhisperPickerOpen(false)
      }
      previousComposerModeRef.current = composerMode
      return
    }

    if (previousComposerMode && previousComposerMode !== composerMode) {
      setSelectedType(MessageType.OOC)
      previousComposerModeRef.current = composerMode
      return
    }

    if (!allowedTypes.includes(selectedType)) {
      setSelectedType(MessageType.OOC)
    }
    previousComposerModeRef.current = composerMode
  }, [allowedTypes, composerMode, forceMessageType, isWhisperPickerOpen, selectedType])

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
    <div className="session-message-input">
      {!hiddenTypeModes ? (
        <div
          className="session-message-input__type-stack"
          onMouseEnter={() => {
            if (canShowWhisperPicker) {
              setIsWhisperPickerOpen(true)
            }
          }}
          onMouseLeave={() => {
            setIsWhisperPickerOpen(false)
          }}
        >
          <MessageTypeSelector
            visibleTypes={visibleTypes}
            activeType={type}
            disabled={disabled || isSending}
            disabledTypes={disabledTypes}
            isDmRole={isDmRole}
            isWhisperGroupMode={isWhisperGroupMode}
            selectedRecipientLabel={selectedRecipient?.label ?? null}
            onSelect={(messageType) => {
              setSelectedType(messageType)
              if (messageType !== MessageType.WHISPER) {
                setIsWhisperPickerOpen(false)
              }
              if (messageType === MessageType.WHISPER && !isWhisperGroupMode) {
                setIsWhisperPickerOpen(true)
              }
            }}
          />

          {canShowWhisperPicker && isWhisperPickerOpen ? (
            <div
              className={`session-message-input__whisper-picker ${isDmRole ? 'session-message-input__whisper-picker--dm' : ''}`.trim()}
              onMouseEnter={() => setIsWhisperPickerOpen(true)}
            >
              <div className="session-message-input__whisper-picker-header">
                <span className="session-message-input__whisper-picker-title">Whisper to</span>
                <span className="session-message-input__whisper-picker-current">
                  {selectedRecipient?.label ?? 'Select a player'}
                </span>
              </div>
              <div
                className="session-message-input__whisper-picker-list"
                role="listbox"
                aria-label="Whisper recipients"
              >
                {effectiveWhisperRecipients.length > 0 ? (
                  effectiveWhisperRecipients.map((option) => {
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
                        className={`session-message-input__whisper-recipient ${isSelected ? 'session-message-input__whisper-recipient--selected' : ''}`}
                      >
                        <span
                          className="session-message-input__whisper-recipient-avatar"
                          aria-hidden="true"
                        >
                          {option.avatarUrl ? (
                            <img src={option.avatarUrl} alt="" />
                          ) : (
                            (option.label.trim()[0] || '?').toUpperCase()
                          )}
                        </span>
                        <span className="session-message-input__whisper-recipient-name">
                          {option.label}
                        </span>
                      </button>
                    )
                  })
                ) : (
                  <div className="session-message-input__whisper-empty">
                    No visible players to whisper to.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Input row */}
      <div className="session-message-input__composer">
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
          placeholder={inputPlaceholder}
          rows={2}
          maxLength={4000}
          className={`session-message-input__textarea ${inputToneClass}`.trim()}
        />
        <button
          onClick={() => void handleSend()}
          disabled={!canSend}
          className="session-message-input__send"
          aria-label={isSending ? 'Sending message' : 'Send message'}
        >
          {isSending ? '…' : <Icon name="send" />}
        </button>
      </div>
    </div>
  )
}
