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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md shadow-lg">
        <h2 className="text-lg font-semibold mb-4">Create Group</h2>

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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 disabled:opacity-50"
          />

          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
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
