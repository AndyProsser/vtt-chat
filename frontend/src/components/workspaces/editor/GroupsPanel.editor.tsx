/**
 * Groups Panel (Editor Mode)
 * Displays and manages campaign-level groups during pre-session planning.
 * This view allows the DM to create, delete, and configure groups before starting a session.
 * No players visible here; players appear only in session mode.
 */

import React, { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { UUID } from '@shared'
import { useStore } from '@/state/store'
import { useToast } from '@/core-ui/Toast'
import { logger } from '@/utils/logger'
import {
  fetchCampaignGroups,
  createCampaignGroup,
  deleteCampaignGroup,
  updateCampaignGroupEnvironment,
} from '@/services/groupsPanel.service'
import type { CampaignGroup } from '@/state/campaignGroupsSlice'
import GroupCard from './GroupCard.editor'
import CreateGroupModal from './CreateGroupModal'
import GroupEnvironmentPicker from './GroupEnvironmentPicker'

interface GroupsPanelEditorProps {
  campaignId: UUID
  apiUrl: string
  token: string
  isLoading?: boolean
}

/**
 * Editor-mode Groups Panel.
 * Shows campaign groups in a simple list (no drag/drop).
 * DM can create, rename, delete groups, and set default environments.
 */
export const GroupsPanelEditor: React.FC<GroupsPanelEditorProps> = ({
  campaignId,
  apiUrl,
  token,
  isLoading = false,
}) => {
  const toast = useToast()
  const [isCreating, setIsCreating] = useState(false)
  const [isDeleteConfirming, setIsDeleteConfirming] = useState<UUID | null>(null)
  const [environmentPickerTarget, setEnvironmentPickerTarget] = useState<UUID | null>(null)

  // Zustand selectors
  const campaignGroups = useStore(useShallow((state) => state.campaignGroups[campaignId] || []))
  const setCampaignGroups = useStore((state) => state.setCampaignGroups)

  // Load campaign groups on mount
  useEffect(() => {
    const loadGroups = async () => {
      try {
        const groups = await fetchCampaignGroups(campaignId, token, apiUrl)
        setCampaignGroups(campaignId, groups)
      } catch (err) {
        logger.error('GroupsPanelEditor', 'Failed to load campaign groups', err)
        toast.error('Failed to load groups. Please try again.')
      }
    }

    loadGroups()
  }, [campaignId, token, apiUrl, setCampaignGroups, toast])

  const handleCreateGroup = async (name: string) => {
    try {
      setIsCreating(true)
      const newGroup = await createCampaignGroup(campaignId, name, undefined, token, apiUrl)

      // Add to local state
      const updated = [...campaignGroups, newGroup]
      setCampaignGroups(campaignId, updated)

      toast.success(`Group "${name}" created`)
    } catch (err) {
      logger.error('GroupsPanelEditor', 'Failed to create group', err)
      const errorMsg = err instanceof Error ? err.message : 'Failed to create group'
      toast.error(errorMsg)
    } finally {
      setIsCreating(false)
    }
  }

  const handleDeleteGroup = async (groupId: UUID) => {
    try {
      setIsDeleteConfirming(null)
      await deleteCampaignGroup(campaignId, groupId, token, apiUrl)

      // Remove from local state
      const updated = campaignGroups.filter((g) => g.id !== groupId)
      setCampaignGroups(campaignId, updated)

      toast.success('Group deleted')
    } catch (err) {
      logger.error('GroupsPanelEditor', 'Failed to delete group', err)
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete group'
      toast.error(errorMsg)
    }
  }

  const handleSetEnvironment = async (groupId: UUID, environmentName: string) => {
    try {
      setEnvironmentPickerTarget(null)
      await updateCampaignGroupEnvironment(campaignId, groupId, environmentName, token, apiUrl)

      // Update local state
      const updated = campaignGroups.map((g) =>
        g.id === groupId ? { ...g, defaultEnvironmentName: environmentName } : g
      )
      setCampaignGroups(campaignId, updated)

      toast.success(`Environment set to "${environmentName}"`)
    } catch (err) {
      logger.error('GroupsPanelEditor', 'Failed to set environment', err)
      const errorMsg = err instanceof Error ? err.message : 'Failed to set environment'
      toast.error(errorMsg)
    }
  }

  const handleClearEnvironment = async (groupId: UUID) => {
    try {
      await updateCampaignGroupEnvironment(campaignId, groupId, undefined, token, apiUrl)

      // Update local state
      const updated = campaignGroups.map((g) =>
        g.id === groupId ? { ...g, defaultEnvironmentName: undefined } : g
      )
      setCampaignGroups(campaignId, updated)

      toast.success('Environment cleared')
    } catch (err) {
      logger.error('GroupsPanelEditor', 'Failed to clear environment', err)
      const errorMsg = err instanceof Error ? err.message : 'Failed to clear environment'
      toast.error(errorMsg)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Campaign Groups</h2>
        <button
          onClick={() => setIsCreating(true)}
          disabled={isLoading}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          Create Group
        </button>
      </div>

      {/* Groups List */}
      <div className="flex-1 overflow-y-auto">
        {campaignGroups.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No groups yet. Create one to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {campaignGroups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                onDelete={() => setIsDeleteConfirming(group.id)}
                onSetEnvironment={() => setEnvironmentPickerTarget(group.id)}
                onClearEnvironment={() => handleClearEnvironment(group.id)}
                isDeleting={isDeleteConfirming === group.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {isCreating && (
        <CreateGroupModal
          onConfirm={handleCreateGroup}
          onCancel={() => setIsCreating(false)}
          isLoading={isLoading}
        />
      )}

      {/* Environment Picker Modal */}
      {environmentPickerTarget && (
        <GroupEnvironmentPicker
          onConfirm={(env) => handleSetEnvironment(environmentPickerTarget, env)}
          onCancel={() => setEnvironmentPickerTarget(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteConfirming && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm shadow-lg">
            <h3 className="text-lg font-semibold mb-4">Delete Group?</h3>
            <p className="text-gray-600 mb-6">
              This will permanently delete this group and all its settings.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setIsDeleteConfirming(null)}
                className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteGroup(isDeleteConfirming)}
                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GroupsPanelEditor
