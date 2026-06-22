/**
 * MessageInput
 * Message composition form with connected type toggles, whisper targeting,
 * and slash command support (/roll, /me, /OOC, /dm, /whisper).
 * Spectators are restricted to OOC only; commands are unavailable to spectators.
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { MessageType, RoomType, SessionState } from '@shared'
import type { Role, UUID, ChatCommandDefinition } from '@shared'
import { Icon } from '@/components/ui/Icon'
import { useStore } from '@/hooks/useStore'
import type { WhisperRecipientOption } from '@/types/chat'
import { MessageTypeSelector } from './MessageTypeSelector'
import { MessageInputWhisperPicker } from './MessageInputWhisperPicker'
import { CommandPalette } from './CommandPalette'
import { CommandHelpPopover } from './CommandHelpPopover'
import { WhisperMentionPicker } from './WhisperMentionPicker'
import { useWhisperRecipients } from '@/hooks/session/useWhisperRecipients'
import { useTypingEmitter } from '@/hooks/session/useTypingEmitter'
import { MESSAGE_TYPE_ORDER, ROLE_ALLOWED_TYPES } from '@/constants/chatComposer.constants'
import { parseChatInput, filterCommandsForAutocomplete, getArgSuggestions } from '@/utils/chatCommandParser'
import type { ArgSuggestionResult } from '@/utils/chatCommandParser'
import type { ComposerMode } from '@/types/chat'

interface MessageInputProps {
  onSend: (content: string, type: MessageType, recipientId?: string) => Promise<void>
  onRollCommand?: (args: string) => Promise<void>
  onLootRandomCommand?: (args: string) => Promise<void>
  onVoiceCommand?: (preset: string | null) => Promise<void>
  onConditionCommand?: (targetUserId: string, conditionName: string) => Promise<void>
  onEnvCommand?: (environmentName: string) => Promise<void>
  /** Catch-all for server-side commands not handled locally (loot, loot-split, spend, earn, take, give, drop, etc.) */
  onServerCommand?: (command: string, args: string) => Promise<void>
  onCommandError?: (message: string) => void
  onTypingStarted?: () => void
  onTypingStopped?: () => void
  disabled?: boolean
  role: Role | string
  username?: string
  sessionId?: UUID
  currentUserId?: UUID
  currentRoomId?: UUID
  forceMessageType?: MessageType
  whisperRecipients?: WhisperRecipientOption[]
  roomType?: RoomType
}

function MessageInputComponent({
  onSend,
  onRollCommand,
  onLootRandomCommand,
  onVoiceCommand,
  onConditionCommand,
  onEnvCommand,
  onServerCommand,
  onCommandError,
  onTypingStarted,
  onTypingStopped,
  disabled,
  role,
  username,
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
  const [paletteCommands, setPaletteCommands] = useState<ChatCommandDefinition[]>([])
  const [argSuggestions, setArgSuggestions] = useState<ArgSuggestionResult | null>(null)
  const [mentionSuggestions, setMentionSuggestions] = useState<{ id: string; label: string }[]>([])
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

  const isPaletteVisible = paletteCommands.length > 0
  const isArgSuggestionsVisible = (argSuggestions?.suggestions.length ?? 0) > 0
  const isMentionPickerVisible = mentionSuggestions.length > 0

  const canSend =
    !!content.trim() &&
    !disabled &&
    !isSending &&
    !isPaletteVisible &&
    !isArgSuggestionsVisible &&
    !isMentionPickerVisible &&
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

  const handleMentionSelect = (label: string) => {
    setContent(`/whisper @${label} `)
    setMentionSuggestions([])
    textareaRef.current?.focus()
  }

  const handleCommandSelect = (cmd: ChatCommandDefinition) => {
    setContent(cmd.slash + ' ')
    setPaletteCommands([])
    textareaRef.current?.focus()
  }

  const handleArgSuggestionSelect = (label: string) => {
    if (!argSuggestions) return
    // Set the completed command with a trailing space so arg autocomplete doesn't re-trigger
    setContent(`/${argSuggestions.commandName} ${label} `)
    setArgSuggestions(null)
    textareaRef.current?.focus()
  }

  const handleCommandInsert = (slash: string) => {
    setContent(slash)
    setPaletteCommands(filterCommandsForAutocomplete(slash, role, sessionState, isWhisperGroupMode))
    textareaRef.current?.focus()
  }

  const handleSend = async () => {
    const trimmed = content.trim()
    if (!trimmed || isSending) return

    // --- Slash command dispatch ---
    if (trimmed.startsWith('/')) {
      const parseResult = parseChatInput(trimmed, role, sessionState)

      if (parseResult.ok === null) {
        // Starts with / but parseChatInput returned null — shouldn't happen
        return
      }

      if (!parseResult.ok) {
        onCommandError?.(parseResult.error.message)
        return
      }

      const { command } = parseResult
      setIsSending(true)
      try {
        if (command.name === 'roll') {
          if (!command.args) {
            onCommandError?.('Usage: /roll [dice] — e.g. /roll 1d20+5')
            return
          }
          await onRollCommand?.(command.args)
          // No selector change — ROLL is not a persistent compose mode
        } else if (command.name === 'voice') {
          const preset = command.args.trim().toLowerCase()
          const isOff = !preset || preset === 'off' || preset === 'default'
          await onVoiceCommand?.(isOff ? null : command.args.trim())
        } else if (command.name === 'condition') {
          if (!command.args) {
            onCommandError?.('Usage: /condition {player} [condition]')
            return
          }
          const parts = command.args.trim().split(/\s+/)
          if (parts.length < 2) {
            onCommandError?.('Usage: /condition {player} [condition] — e.g. /condition Brom Poisoned')
            return
          }
          const conditionName = parts[parts.length - 1]
          const playerRef = parts.slice(0, -1).join(' ')
          const recipient = effectiveWhisperRecipients.find(
            (r) => r.label.toLowerCase() === playerRef.toLowerCase()
          )
          if (!recipient) {
            onCommandError?.(`Player "${playerRef}" not found in this session.`)
            return
          }
          await onConditionCommand?.(recipient.id, conditionName)
        } else if (command.name === 'env') {
          if (!command.args.trim()) {
            onCommandError?.('Usage: /env [environment] — e.g. /env Tavern')
            return
          }
          await onEnvCommand?.(command.args.trim())
        } else if (command.name === 'loot-random') {
          await onLootRandomCommand?.(command.args)
        } else if (command.name === 'me') {
          if (!command.args) {
            onCommandError?.('Usage: /me [action]')
            return
          }
          const author = username ?? 'Someone'
          await onSend(`* ${author} ${command.args} *`, MessageType.IC)
          setSelectedType(MessageType.IC)
        } else if (command.name === 'ic') {
          if (!command.args) {
            onCommandError?.('Usage: /ic [message]')
            return
          }
          await onSend(command.args, MessageType.IC)
          setSelectedType(MessageType.IC)
        } else if (command.name === 'ooc') {
          if (!command.args) {
            onCommandError?.('Usage: /OOC [message]')
            return
          }
          await onSend(command.args, MessageType.OOC)
          setSelectedType(MessageType.OOC)
        } else if (command.name === 'dm') {
          if (!command.args) {
            onCommandError?.('Usage: /dm [message]')
            return
          }
          await onSend(command.args, MessageType.DM)
          setSelectedType(MessageType.DM)
        } else if (command.name === 'whisper') {
          // Parse /whisper @username message
          const atMatch = command.args.match(/^@(\S+)\s+(.+)$/)
          if (!atMatch) {
            onCommandError?.('Usage: /whisper @{player} [message]')
            return
          }
          const targetName = atMatch[1].toLowerCase()
          const messageText = atMatch[2]
          const recipient = effectiveWhisperRecipients.find(
            (r) => r.label.toLowerCase() === targetName
          )
          if (!recipient) {
            onCommandError?.(`No player named "@${atMatch[1]}" found in this room.`)
            return
          }
          await onSend(messageText, MessageType.WHISPER, recipient.id)
          setSelectedType(MessageType.WHISPER)
          setRecipientId(recipient.id)
        } else if (onServerCommand) {
          // Generic catch-all: forward to backend (/loot, /loot-split, /spend, /earn, /take, /give, /drop, etc.)
          await onServerCommand(command.name, command.args ?? '')
        }

        setContent('')
        setPaletteCommands([])
        setArgSuggestions(null)
        emitTypingStopped()
        textareaRef.current?.focus()
      } finally {
        setIsSending(false)
      }
      return
    }

    // --- Normal message send ---
    const trimmedRecipient = validRecipientId.trim()
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
    if (isMentionPickerVisible && (e.key === 'Tab' || e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      return // WhisperMentionPicker handles these via capture listener
    }
    if (isMentionPickerVisible && e.key === 'Escape') {
      e.preventDefault()
      setMentionSuggestions([])
      return
    }
    if (isArgSuggestionsVisible && (e.key === 'Tab' || e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      return // WhisperMentionPicker (used for arg suggestions) handles these
    }
    if (isArgSuggestionsVisible && e.key === 'Escape') {
      e.preventDefault()
      setArgSuggestions(null)
      return
    }
    // Let the CommandPalette handle Tab/Enter/ArrowUp/ArrowDown when visible
    if (isPaletteVisible && (e.key === 'Tab' || e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      return
    }
    if (isPaletteVisible && e.key === 'Escape') {
      e.preventDefault()
      setPaletteCommands([])
      return
    }
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
          {composerMode === 'active' || composerMode === 'active-whisper' ? (
            <CommandHelpPopover role={role} onInsert={handleCommandInsert} />
          ) : null}

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
        <div className="session-message-input__textarea-wrap">
          {isPaletteVisible ? (
            <CommandPalette
              commands={paletteCommands}
              onSelect={handleCommandSelect}
              onDismiss={() => setPaletteCommands([])}
              compact={content.trimStart() === '/'}
            />
          ) : null}
          {!isPaletteVisible && isArgSuggestionsVisible && argSuggestions ? (
            <WhisperMentionPicker
              options={argSuggestions.suggestions}
              onSelect={handleArgSuggestionSelect}
              onDismiss={() => setArgSuggestions(null)}
              prefix=""
            />
          ) : null}
          {isMentionPickerVisible ? (
            <WhisperMentionPicker
              options={mentionSuggestions}
              onSelect={handleMentionSelect}
              onDismiss={() => setMentionSuggestions([])}
            />
          ) : null}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              const nextValue = e.target.value
              setContent(nextValue)
              setPaletteCommands(filterCommandsForAutocomplete(nextValue, role, sessionState, isWhisperGroupMode))

              // Arg-level autocomplete for /voice and /env
              const newArgSuggestions = getArgSuggestions(nextValue)
              setArgSuggestions(newArgSuggestions)

              // Show @name autocomplete after "/whisper @<partial>" (no space after @partial yet)
              const mentionMatch = nextValue.match(/^\/whisper\s+@(\S*)$/i)
              if (mentionMatch) {
                const partial = mentionMatch[1].toLowerCase()
                setMentionSuggestions(
                  effectiveWhisperRecipients
                    .filter((r) => r.label.toLowerCase().startsWith(partial))
                    .map((r) => ({ id: r.id, label: r.label }))
                )
              } else {
                setMentionSuggestions([])
              }
              if (!nextValue.trim()) {
                emitTypingStopped()
                return
              }
              if (!nextValue.startsWith('/')) {
                emitTypingStarted()
                scheduleTypingStop()
              }
            }}
            onKeyDown={handleKeyDown}
            disabled={disabled || isSending}
            placeholder={inputPlaceholder}
            rows={2}
            maxLength={4000}
            className={`session-message-input__textarea ${inputToneClass}`.trim()}
          />
        </div>

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
