/**
 * Group Card (Editor Mode)
 * Displays a single campaign group with options to delete and set environment.
 * Simple read-only card in editor mode; no drag/drop.
 */

import React from 'react'
import type { UUID } from '@shared'
import type { CampaignGroup } from '@/state/campaignGroupsSlice'
import { ENVIRONMENT_OPTIONS } from '@/types/groupPanel'

interface GroupCardEditorProps {
  group: CampaignGroup
  onDelete: () => void
  onSetEnvironment: () => void
  onClearEnvironment: () => void
  isDeleting?: boolean
}

/**
 * Editor-mode group card.
 * Shows group name, default environment, and action buttons.
 */
const GroupCardEditor: React.FC<GroupCardEditorProps> = ({
  group,
  onDelete,
  onSetEnvironment,
  onClearEnvironment,
  isDeleting = false,
}) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      {/* Header: Group Name & Type */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-base">{group.name}</h3>
          <p className="text-xs text-gray-500">Group</p>
        </div>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
        >
          Delete
        </button>
      </div>

      {/* Environment Section */}
      <div className="flex items-center justify-between bg-gray-50 p-3 rounded">
        <div>
          <p className="text-xs text-gray-600">Default Environment</p>
          <p className="font-medium">{group.defaultEnvironmentName || '(None)'}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onSetEnvironment}
            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            Set
          </button>
          {group.defaultEnvironmentName && (
            <button
              onClick={onClearEnvironment}
              className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Metadata (optional) */}
      <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
        <p>Created: {new Date(group.createdAt).toLocaleDateString()}</p>
      </div>
    </div>
  )
}

export default GroupCardEditor
