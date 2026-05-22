/**
 * Group Environment Picker Modal
 * Shared modal for selecting/changing a group's environment.
 * Used by both editor and session modes.
 */

import React, { useState } from 'react'
import { ENVIRONMENT_OPTIONS } from '@/types/groupPanel'

interface GroupEnvironmentPickerProps {
  onConfirm: (environmentName: string) => void
  onCancel: () => void
  currentEnvironment?: string
  isLoading?: boolean
}

/**
 * Modal for environment selection.
 * User picks from predefined environment list.
 */
const GroupEnvironmentPicker: React.FC<GroupEnvironmentPickerProps> = ({
  onConfirm,
  onCancel,
  currentEnvironment,
  isLoading = false,
}) => {
  const [selected, setSelected] = useState<string | null>(currentEnvironment || null)

  const handleConfirm = () => {
    if (!selected) {
      return
    }
    onConfirm(selected)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md shadow-lg">
        <h2 className="text-lg font-semibold mb-4">Select Environment</h2>

        <div className="space-y-2 mb-6">
          {ENVIRONMENT_OPTIONS.map((option) => (
            <label
              key={option}
              className="flex items-center gap-3 p-3 rounded border border-gray-200 hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="radio"
                name="environment"
                value={option}
                checked={selected === option}
                onChange={(e) => setSelected(e.target.value)}
                disabled={isLoading}
              />
              <span className="text-sm">{option}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || isLoading}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Set
          </button>
        </div>
      </div>
    </div>
  )
}

export default GroupEnvironmentPicker
