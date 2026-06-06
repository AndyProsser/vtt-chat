/**
 * MessageInput
 * Message composition form with connected type toggles and whisper targeting.
 * Spectators are restricted to OOC only.
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { MessageType, RoomType, SessionState } from '@shared'
import type { Role, UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import { useStore } from '@/hooks/useStore'
import type { WhisperRecipientOption } from '@/types/chat'
import { MessageTypeSelector } from './MessageTypeSelector'
import { MessageInputWhisperPicker } from './MessageInputWhisperPicker'
import { useWhisperRecipients } from './useWhisperRecipients'
import { useTypingEmitter } from './useTypingEmitter'
import { MESSAGE_TYPE_ORDER, ROLE_ALLOWED_TYPES, type ComposerMode } from './MessageInput.constants'

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

function MessageInputComponent({
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
  const sessionDmId = useStore((state) => {
    if (!sessionId) return undefined
    return ((state.sessions as any)[sessionId] as { dmId?: UUID } | undefined)?.dmId
  })
  const sessionState = useStore((state) => {
    if (!sessionId) return undefined
    return ((state.sessions as any)[sessionId] as { state?: SessionState } | undefined)?.state
  })
  const isDmRole = String(role) === 'DM'
  const currentUserPrimaryRoomId = useStore((state) => {
    if (!sessionId || !currentUserId) return ''
    return state.sessionPresence[sessionId]?.[currentUserId]?.primaryRoomId ?? ''
  })
  const currentUserPrimaryRoomType = useStore((state) => {
    if (!sessionId || !currentUserPrimaryRoomId) return null
    return state.rooms[sessionId]?.[currentUserPrimaryRoomId]?.type ?? null
  })
  const isWhisperGroupMode =
    currentUserPrimaryRoomType === RoomType.PRIVATE ||
    (!currentUserPrimaryRoomType && roomType === RoomType.PRIVATE)

  const composerMode = useMemo<ComposerMode>(() => {
    if (sessionState === SessionState.PAUSED) return 'paused'
    if (sessionState === SessionState.COOLDOWN) return 'cooldown'
    if (sessionState === SessionState.ACTIVE)
      return isWhisperGroupMode ? 'active-whisper' : 'active'
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
        if (!roleAllowedTypes.includes(messageType)) return false
        if (messageType === MessageType.DM) return canShowPlayerDmType
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
  const previousComposerModeRef = useRef<ComposerMode | null>(null)

  const effectiveWhisperRecipients = useWhisperRecipients({
    sessionId,
    currentUserId,
    currentRoomId,
    isDmRole,
    sessionDmId,
    whisperRecipients,
  })

  const { emitTypingStarted, emitTypingStopped, scheduleTypingStop } = useTypingEmitter({
    onTypingStarted,
    onTypingStopped,
  })

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
      if (isWhisperGroupMode) return 'Whisper to this private group... (Enter to send)'
      if (selectedRecipient?.label)
        return `Whisper to ${selectedRecipient.label}... (Enter to send)`
      return 'Whisper to a player... (Select target, then Enter to send)'
    }
    if (type === MessageType.IC) return 'In character... (Enter to send, Shift+Enter for newline)'
    if (type === MessageType.OOC)
      return 'Out of character... (Enter to send, Shift+Enter for newline)'
    if (type === MessageType.DM) return 'Message the DM privately... (Enter to send)'
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
      if (selectedType !== forcedType) setSelectedType(forcedType)
      if (isWhisperPickerOpen) setIsWhisperPickerOpen(false)
      previousComposerModeRef.current = composerMode
      return
    }

    if (previousComposerMode && previousComposerMode !== composerMode) {
      setSelectedType(MessageType.OOC)
      previousComposerModeRef.current = composerMode
      return
    }

    if (!allowedTypes.includes(selectedType)) setSelectedType(MessageType.OOC)
    previousComposerModeRef.current = composerMode
  }, [allowedTypes, composerMode, forceMessageType, isWhisperPickerOpen, selectedType])

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
            if (canShowWhisperPicker) setIsWhisperPickerOpen(true)
          }}
          onMouseLeave={() => setIsWhisperPickerOpen(false)}
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
              if (messageType !== MessageType.WHISPER) setIsWhisperPickerOpen(false)
              if (messageType === MessageType.WHISPER && !isWhisperGroupMode)
                setIsWhisperPickerOpen(true)
            }}
          />

          {canShowWhisperPicker && isWhisperPickerOpen ? (
            <MessageInputWhisperPicker
              isDmRole={isDmRole}
              selectedRecipient={selectedRecipient}
              recipients={effectiveWhisperRecipients}
              validRecipientId={validRecipientId}
              disabled={disabled}
              isSending={isSending}
              onSelect={(id) => {
                setRecipientId(id)
                setIsWhisperPickerOpen(false)
              }}
              onMouseEnter={() => setIsWhisperPickerOpen(true)}
            />
          ) : null}
        </div>
      ) : null}

      <div className="session-message-input__composer">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            const nextValue = e.target.value
            setContent(nextValue)
            if (!nextValue.trim()) {
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

export const MessageInput = memo(MessageInputComponent)
