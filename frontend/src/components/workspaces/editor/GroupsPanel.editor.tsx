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
    <div className="flex h-full flex-col gap-4 overflow-hidden p-4 text-slate-100">
      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 px-4 py-4 shadow-[0_16px_60px_rgba(2,6,23,0.28)]">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
              <span className="material-symbols-outlined text-sm" aria-hidden="true">
                widgets
              </span>
              Campaign Group Planner
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-50">Groups Outside Session</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-300">
                Define persistent groups, validate naming, and set default environments before the
                table goes live. Player assignment only appears inside an active session.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-400/15 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              add
            </span>
            Create Group
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-700 bg-slate-950/55 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Persistent Groups
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-50">{campaignGroups.length}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/55 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Environment Defaults
            </p>
            <p className="mt-2 text-sm text-slate-200">
              Attach ambience now so each session starts with the right room mood.
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/55 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Session Rule</p>
            <p className="mt-2 text-sm text-slate-200">
              No players appear here. Membership and movement stay runtime-only.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/55 p-3 shadow-inner shadow-slate-950/50">
        {campaignGroups.length === 0 ? (
          <div className="flex h-full min-h-64 items-center justify-center">
            <div className="max-w-md rounded-2xl border border-dashed border-slate-700 bg-slate-900/55 px-6 py-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/12 text-cyan-200">
                <span className="material-symbols-outlined text-3xl" aria-hidden="true">
                  groups
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-100">No groups planned yet</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Create a group to define table splits, prep atmosphere defaults, and keep the
                session workspace focused on live player movement.
              </p>
              <button
                onClick={() => setIsCreating(true)}
                disabled={isLoading}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  add
                </span>
                Create First Group
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="max-w-sm rounded-2xl border border-slate-700 bg-slate-950 p-6 shadow-[0_30px_80px_rgba(2,6,23,0.55)]">
            <h3 className="mb-4 text-lg font-semibold text-slate-100">Delete Group?</h3>
            <p className="mb-6 text-sm leading-6 text-slate-400">
              This will permanently delete this group and all its settings.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setIsDeleteConfirming(null)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-slate-200 transition hover:bg-slate-900"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteGroup(isDeleteConfirming)}
                className="rounded-xl bg-red-500 px-4 py-2 font-semibold text-white transition hover:bg-red-400"
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
