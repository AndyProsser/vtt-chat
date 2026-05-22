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
import { useToast } from '@/hooks/useToast'
import { logger } from '@/utils/logger'
import {
  fetchCampaignGroups,
  createCampaignGroup,
  deleteCampaignGroup,
  updateCampaignGroupEnvironment,
} from '@/services/groupsPanel.service'
import type { CampaignGroup } from '@/state/campaignGroupsSlice'
import '@/styles/components/workspaces/session/workspaces/EditorGroupsPanel.css'
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
  const showToast = useToast()
  const [isCreating, setIsCreating] = useState(false)
  const [isDeleteConfirming, setIsDeleteConfirming] = useState<UUID | null>(null)
  const [environmentPickerTarget, setEnvironmentPickerTarget] = useState<UUID | null>(null)

  // Zustand selectors
  const campaignGroups = useStore(useShallow((state) => state.campaignGroups[campaignId] || []))
  const setCampaignGroups = useStore((state) => state.setCampaignGroups)
  const environmentPickerTargetGroup = campaignGroups.find(
    (group) => group.id === environmentPickerTarget
  )

  // Load campaign groups on mount
  useEffect(() => {
    const loadGroups = async () => {
      try {
        const groups = await fetchCampaignGroups(campaignId, token, apiUrl)
        setCampaignGroups(campaignId, groups)
      } catch (err) {
        logger.error('GroupsPanelEditor', 'Failed to load campaign groups', err)
        showToast({ message: 'Failed to load groups. Please try again.', variant: 'error' })
      }
    }

    loadGroups()
  }, [campaignId, token, apiUrl, setCampaignGroups, showToast])

  const handleCreateGroup = async (name: string) => {
    try {
      setIsCreating(true)
      const newGroup = await createCampaignGroup(campaignId, name, undefined, token, apiUrl)

      // Add to local state
      const updated = [...campaignGroups, newGroup]
      setCampaignGroups(campaignId, updated)

      showToast({ message: `Group "${name}" created`, variant: 'success' })
    } catch (err) {
      logger.error('GroupsPanelEditor', 'Failed to create group', err)
      const errorMsg = err instanceof Error ? err.message : 'Failed to create group'
      showToast({ message: errorMsg, variant: 'error' })
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

      showToast({ message: 'Group deleted', variant: 'success' })
    } catch (err) {
      logger.error('GroupsPanelEditor', 'Failed to delete group', err)
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete group'
      showToast({ message: errorMsg, variant: 'error' })
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

      showToast({ message: `Environment set to "${environmentName}"`, variant: 'success' })
    } catch (err) {
      logger.error('GroupsPanelEditor', 'Failed to set environment', err)
      const errorMsg = err instanceof Error ? err.message : 'Failed to set environment'
      showToast({ message: errorMsg, variant: 'error' })
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

      showToast({ message: 'Environment cleared', variant: 'success' })
    } catch (err) {
      logger.error('GroupsPanelEditor', 'Failed to clear environment', err)
      const errorMsg = err instanceof Error ? err.message : 'Failed to clear environment'
      showToast({ message: errorMsg, variant: 'error' })
    }
  }

  return (
    <section className="editor-groups-panel" aria-label="Campaign groups planner">
      <header className="editor-groups-panel__hero">
        <div className="editor-groups-panel__hero-header">
          <div>
            <div className="editor-groups-panel__eyebrow">
              <span className="material-symbols-outlined text-sm" aria-hidden="true">
                widgets
              </span>
              Campaign Group Planner
            </div>
            <h2 className="editor-groups-panel__title">Groups Outside Session</h2>
            <p className="editor-groups-panel__subtitle">
              Define persistent groups, validate naming, and set default environments before the
              table goes live. Player assignment only appears inside an active session.
            </p>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            disabled={isLoading}
            className="editor-groups-button editor-groups-button--primary"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              add
            </span>
            Create Group
          </button>
        </div>

        <div className="editor-groups-panel__summary">
          <div className="editor-groups-panel__summary-count">
            <span className="editor-groups-panel__summary-label">Persistent Groups</span>
            <strong className="editor-groups-panel__summary-value">{campaignGroups.length}</strong>
          </div>
          <div className="editor-groups-panel__summary-items">
            <p className="editor-groups-panel__summary-pill">
              Set environment defaults before session start.
            </p>
            <p className="editor-groups-panel__summary-pill">
              Players only appear here during an active session.
            </p>
          </div>
        </div>
      </header>

      <div className="editor-groups-panel__body">
        {campaignGroups.length === 0 ? (
          <div className="editor-groups-panel__empty">
            <div className="editor-groups-panel__empty-card">
              <div className="editor-groups-panel__empty-icon">
                <span className="material-symbols-outlined" aria-hidden="true">
                  groups
                </span>
              </div>
              <h3 className="editor-groups-panel__empty-title">No groups planned yet</h3>
              <p className="editor-groups-panel__empty-copy">
                Create a group to define table splits, prep atmosphere defaults, and keep the
                session workspace focused on live player movement.
              </p>
              <button
                onClick={() => setIsCreating(true)}
                disabled={isLoading}
                className="editor-groups-button editor-groups-button--primary"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  add
                </span>
                Create First Group
              </button>
            </div>
          </div>
        ) : (
          <div className="editor-groups-panel__grid">
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
          currentEnvironment={environmentPickerTargetGroup?.defaultEnvironmentName || 'Default'}
        />
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteConfirming && (
        <div className="session-modal-backdrop">
          <div className="session-modal session-modal--confirm-dialog">
            <h3 className="editor-groups-modal__title">Delete Group?</h3>
            <p className="editor-groups-panel__confirm-copy">
              This will permanently delete this group and all its settings.
            </p>
            <div className="editor-groups-modal__actions">
              <button
                onClick={() => setIsDeleteConfirming(null)}
                className="editor-groups-button editor-groups-button--ghost"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteGroup(isDeleteConfirming)}
                className="editor-groups-button editor-groups-button--danger"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default GroupsPanelEditor
