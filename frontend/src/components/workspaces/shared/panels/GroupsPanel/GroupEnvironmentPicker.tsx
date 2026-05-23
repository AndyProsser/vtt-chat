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
    <div className="session-modal-backdrop">
      <div className="session-modal session-modal--confirm-dialog">
        <div className="editor-groups-modal__header">
          <p className="editor-groups-modal__eyebrow">Environment Default</p>
          <h2 className="editor-groups-modal__title">Select Environment</h2>
          <p className="editor-groups-modal__copy">
            Set the baseline atmosphere for this group before the session starts.
          </p>
        </div>

        <div className="editor-groups-modal__options">
          {ENVIRONMENT_OPTIONS.map((option) => (
            <label key={option} className="editor-groups-modal__option">
              <input
                type="radio"
                name="environment"
                value={option}
                checked={selected === option}
                onChange={(e) => setSelected(e.target.value)}
                disabled={isLoading}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>

        <div className="editor-groups-modal__actions">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="editor-groups-button editor-groups-button--ghost"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || isLoading}
            className="editor-groups-button editor-groups-button--primary"
          >
            Set
          </button>
        </div>
      </div>
    </div>
  )
}

export default GroupEnvironmentPicker
