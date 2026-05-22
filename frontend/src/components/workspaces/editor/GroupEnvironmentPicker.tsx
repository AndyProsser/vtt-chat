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
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-950 p-6 text-slate-100 shadow-[0_30px_80px_rgba(2,6,23,0.55)]">
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300">
            Environment Default
          </p>
          <h2 className="mt-2 text-lg font-semibold">Select Environment</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Set the baseline atmosphere for this group before the session starts.
          </p>
        </div>

        <div className="space-y-2 mb-6">
          {ENVIRONMENT_OPTIONS.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/70 p-3 transition hover:border-slate-600 hover:bg-slate-900"
            >
              <input
                type="radio"
                name="environment"
                value={option}
                checked={selected === option}
                onChange={(e) => setSelected(e.target.value)}
                disabled={isLoading}
              />
              <span className="text-sm text-slate-100">{option}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="rounded-xl border border-slate-700 px-4 py-2 text-slate-200 transition hover:bg-slate-900 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || isLoading}
            className="rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
          >
            Set
          </button>
        </div>
      </div>
    </div>
  )
}

export default GroupEnvironmentPicker
