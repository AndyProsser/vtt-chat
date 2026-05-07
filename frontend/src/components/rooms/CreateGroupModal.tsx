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
    <div className="group-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="group-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Create group"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="group-modal__header">
          <h5>
            <Icon name="rooms" /> Create Group
          </h5>
          <button type="button" className="group-modal__close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>

        <form className="group-modal__form" onSubmit={handleSubmit}>
          <label className="group-modal__field">
            <span>Group name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Scouts"
              maxLength={48}
              autoFocus
            />
          </label>

          <label className="group-modal__field">
            <span>Group type</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as RoomType)}
              disabled={isSubmitting}
            >
              <option value={RoomType.GROUP}>Group</option>
              <option value={RoomType.PRIVATE}>Private</option>
            </select>
          </label>

          {error ? <p className="group-modal__error">{error}</p> : null}

          <footer className="group-modal__actions">
            <button type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" disabled={submitDisabled}>
              {isSubmitting ? 'Creating...' : 'Create Group'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
