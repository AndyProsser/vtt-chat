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
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-950 p-6 text-slate-100 shadow-[0_30px_80px_rgba(2,6,23,0.55)]">
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300">Campaign Planning</p>
          <h2 className="mt-2 text-lg font-semibold">Create Group</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
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
            className="mb-4 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-slate-100 placeholder:text-slate-500 disabled:opacity-50"
          />

          {error && <p className="mb-4 text-sm text-red-300">{error}</p>}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="rounded-xl border border-slate-700 px-4 py-2 text-slate-200 transition hover:bg-slate-900 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
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
