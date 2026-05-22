/**
 * Create Group Modal
 * Shared modal for creating a new group (name input + confirm/cancel).
 * Used by both editor and session modes.
 */

import React, { useState } from 'react'

interface CreateGroupModalProps {
  onConfirm: (name: string) => void
  onCancel: () => void
  isLoading?: boolean
}

/**
 * Modal for group creation.
 * User enters group name and confirms.
 */
const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Group name is required')
      return
    }

    if (trimmed.length < 1 || trimmed.length > 50) {
      setError('Group name must be between 1 and 50 characters')
      return
    }

    // Check for reserved names
    const reserved = ['MAIN', 'WHISPER', 'GREENROOM', 'PRIVATE']
    if (reserved.includes(trimmed.toUpperCase())) {
      setError(`"${trimmed}" is a reserved group name`)
      return
    }

    onConfirm(trimmed)
  }

  return (
    <div className="session-modal-backdrop">
      <div className="session-modal session-modal--confirm-dialog">
        <div className="editor-groups-modal__header">
          <p className="editor-groups-modal__eyebrow">Campaign Planning</p>
          <h2 className="editor-groups-modal__title">Create Group</h2>
          <p className="editor-groups-modal__copy">
            Create a persistent group name now. Player membership is assigned later, during the
            session.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Group name (e.g., 'Forest Party')"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            disabled={isLoading}
            autoFocus
            className="editor-groups-modal__input"
          />

          {error && <p className="editor-groups-modal__error">{error}</p>}

          <div className="editor-groups-modal__actions">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="editor-groups-button editor-groups-button--ghost"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="editor-groups-button editor-groups-button--primary"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateGroupModal
