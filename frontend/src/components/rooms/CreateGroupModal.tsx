import { useState } from 'react'
import { RoomType } from '@shared'
import { Icon } from '../ui/Icon'

interface CreateGroupModalProps {
  onClose: () => void
  onCreateGroup: (name: string, type: RoomType) => Promise<void>
}

export function CreateGroupModal({ onClose, onCreateGroup }: CreateGroupModalProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<RoomType>(RoomType.GROUP)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submitDisabled = isSubmitting || name.trim().length < 2

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
      await onCreateGroup(nextName, type)
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create group')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="group-popover" role="dialog" aria-label="Create group">
      <header className="group-popover__header">
        <h5>
          <Icon name="rooms" /> Create Group
        </h5>
        <button type="button" className="group-popover__close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>

      <form className="group-popover__form" onSubmit={handleSubmit}>
        <label className="group-popover__field">
          <span>Group name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Scouts"
            maxLength={48}
            autoFocus
          />
        </label>

        <div className="group-popover__field">
          <span>Group type</span>
          <div className="group-popover__segment" role="group" aria-label="Group type">
            <button
              type="button"
              className={`group-popover__segment-btn ${type === RoomType.GROUP ? 'is-active' : ''}`}
              aria-pressed={type === RoomType.GROUP}
              onClick={() => setType(RoomType.GROUP)}
              disabled={isSubmitting}
            >
              Group
            </button>
            <button
              type="button"
              className={`group-popover__segment-btn ${type === RoomType.PRIVATE ? 'is-active' : ''}`}
              aria-pressed={type === RoomType.PRIVATE}
              onClick={() => setType(RoomType.PRIVATE)}
              disabled={isSubmitting}
            >
              Private
            </button>
          </div>
        </div>

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
