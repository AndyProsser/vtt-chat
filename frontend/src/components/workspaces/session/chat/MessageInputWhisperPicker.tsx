import type { WhisperRecipientOption } from '@/types/chat'

interface MessageInputWhisperPickerProps {
  isDmRole: boolean
  selectedRecipient: WhisperRecipientOption | null
  recipients: WhisperRecipientOption[]
  validRecipientId: string
  disabled?: boolean
  isSending: boolean
  onSelect: (id: string) => void
  onMouseEnter: () => void
}

/** Floating recipient picker shown when composing a whisper message. */
export function MessageInputWhisperPicker({
  isDmRole,
  selectedRecipient,
  recipients,
  validRecipientId,
  disabled,
  isSending,
  onSelect,
  onMouseEnter,
}: MessageInputWhisperPickerProps) {
  return (
    <div
      className={`session-message-input__whisper-picker ${isDmRole ? 'session-message-input__whisper-picker--dm' : ''}`.trim()}
      onMouseEnter={onMouseEnter}
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
        {recipients.length > 0 ? (
          recipients.map((option) => {
            const isSelected = option.id === validRecipientId
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={disabled || isSending}
                onClick={() => onSelect(option.id)}
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
  )
}
