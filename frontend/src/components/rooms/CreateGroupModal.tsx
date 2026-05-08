import { useState } from 'react'
import { RoomType } from '@shared'
import { Icon } from '../ui/Icon'

interface CreateGroupModalProps {
  onClose: () => void
  onCreateGroup: (name: string, type: RoomType) => Promise<void>
}

export function CreateGroupModal({ onClose, onCreateGroup }: CreateGroupModalProps) {
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submitDisabled = isSubmitting || name.trim().length < 2

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 0.45rem)',
    bottom: 'auto',
    right: 0,
    left: 'auto',
    width: 'min(19rem, calc(100vw - 2rem))',
    zIndex: 1300,
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextName = name.trim()
    if (nextName.length < 2) {
      setError('Group name must be at least 2 characters.')
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      await onCreateGroup(nextName, RoomType.GROUP)
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create group')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="group-popover audio-settings-panel"
      role="dialog"
      aria-label="Create group"
      data-popover="create-group"
      style={panelStyle}
    >
      <header className="group-popover__header audio-settings-panel__header">
        <span className="audio-settings-panel__title">
          <Icon name="rooms" /> Create Group
        </span>
        <button
          type="button"
          className="group-popover__close audio-settings-panel__close"
          onClick={onClose}
          aria-label="Close"
        >
          <Icon name="close" />
        </button>
      </header>

      <form className="group-popover__form audio-settings-panel__body" onSubmit={handleSubmit}>
        <section className="audio-settings-panel__section">
          <label className="group-popover__field audio-settings-panel__label">
            <span className="audio-settings-panel__label-text">Group name</span>
            <input
              className="group-popover__input audio-settings-panel__select"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Scouts"
              maxLength={48}
              autoFocus
            />
          </label>
        </section>

        {error ? <p className="group-popover__error">{error}</p> : null}

        <footer className="group-popover__actions">
          <button type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" disabled={submitDisabled}>
            {isSubmitting ? 'Creating...' : 'Create Group'}
          </button>
        </footer>
      </form>
    </div>
  )
}
