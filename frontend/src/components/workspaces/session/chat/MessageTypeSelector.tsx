import { MessageType } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'

const TYPE_META: Record<MessageType, { label: string; icon: string; tone: string }> = {
  [MessageType.IC]: { label: 'IC', icon: 'swords', tone: 'ic' },
  [MessageType.OOC]: { label: 'OOC', icon: 'chat_bubble', tone: 'ooc' },
  [MessageType.WHISPER]: { label: 'WHISPER', icon: 'visibility_off', tone: 'whisper' },
  [MessageType.DM]: { label: 'DM', icon: 'mail', tone: 'dm' },
  [MessageType.SYSTEM]: { label: 'System', icon: 'info', tone: 'system' },
}

type MessageTypeSelectorProps = {
  visibleTypes: MessageType[]
  activeType: MessageType
  disabled?: boolean
  disabledTypes?: ReadonlySet<MessageType>
  isDmRole: boolean
  isWhisperGroupMode: boolean
  selectedRecipientLabel?: string | null
  onSelect: (messageType: MessageType) => void
}

export function MessageTypeSelector({
  visibleTypes,
  activeType,
  disabled = false,
  disabledTypes,
  isDmRole,
  isWhisperGroupMode,
  selectedRecipientLabel,
  onSelect,
}: MessageTypeSelectorProps) {
  return (
    <TooltipProvider delayDuration={140} disableHoverableContent>
      <div
        className="session-message-input__types"
        data-count={visibleTypes.length}
        role="radiogroup"
        aria-label="Message type"
      >
        {visibleTypes.map((messageType) => {
          const meta = TYPE_META[messageType]
          const tone = messageType === MessageType.WHISPER && isDmRole ? 'whisper-dm' : meta.tone
          const isActive = activeType === messageType
          const isDisabled = Boolean(disabled || disabledTypes?.has(messageType))
          const showMutedWhisperIcon =
            messageType === MessageType.WHISPER &&
            !isWhisperGroupMode &&
            !(selectedRecipientLabel && selectedRecipientLabel.trim())

          return (
            <Tooltip key={messageType}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  disabled={isDisabled}
                  onClick={() => {
                    if (!isDisabled) {
                      onSelect(messageType)
                    }
                  }}
                  className={`session-message-input__type-toggle session-message-input__type-toggle--${tone} ${isActive ? 'session-message-input__type-toggle--active' : ''}`}
                >
                  <span
                    className={`session-message-input__type-toggle-icon material-symbols-outlined ${showMutedWhisperIcon ? 'session-message-input__type-toggle-icon--muted' : ''}`}
                    aria-hidden="true"
                  >
                    {meta.icon}
                  </span>
                  <span className="session-message-input__type-toggle-label">{meta.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{meta.label}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
