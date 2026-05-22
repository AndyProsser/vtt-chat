/**
 * Campaign Groups Slice (Zustand)
 * Manages campaign-level group definitions (persistent structure).
 * Groups survive session boundaries and are edited in the editor view.
 */

import type { StateCreator } from 'zustand'
import type { UUID } from '@shared'

/**
 * Campaign-level group definition.
 * Persists across sessions; environment can be overridden per-session.
 */
export interface CampaignGroup {
  id: UUID
  campaignId: UUID
  name: string
  type: 'GROUP' // Only GROUP at campaign level; MAIN and PRIVATE are system-managed
  defaultEnvironmentName?: string // e.g., 'Tavern', 'Forest'
  createdAt: number
  createdBy: UUID
  updatedAt?: number
}

export interface CampaignGroupsSlice {
  // State
  campaignGroups: Record<UUID, CampaignGroup[]> // campaignId -> groups

  // Actions
  setCampaignGroups: (campaignId: UUID, groups: CampaignGroup[]) => void
  createCampaignGroup: (campaignId: UUID, name: string, defaultEnvironmentName?: string) => void
  deleteCampaignGroup: (campaignId: UUID, groupId: UUID) => void
  setCampaignGroupEnvironment: (campaignId: UUID, groupId: UUID, environmentName: string) => void
  clearCampaignGroupEnvironment: (campaignId: UUID, groupId: UUID) => void
  clearCampaignGroups: (campaignId?: UUID) => void
}

export const createCampaignGroupsSlice: StateCreator<CampaignGroupsSlice> = (set, get) => ({
  campaignGroups: {},

  setCampaignGroups: (campaignId, groups) => {
    set((state) => ({
      campaignGroups: {
        ...state.campaignGroups,
        [campaignId]: groups,
      },
    }))
  },

  createCampaignGroup: (campaignId, name, defaultEnvironmentName) => {
    set((state) => {
      const newGroupId = crypto.randomUUID() as UUID
      const newGroup: CampaignGroup = {
        id: newGroupId,
        campaignId,
        name,
        type: 'GROUP',
        defaultEnvironmentName,
        createdAt: Date.now(),
        createdBy: '', // Will be set by caller if needed
      }

      return {
        campaignGroups: {
          ...state.campaignGroups,
          [campaignId]: [...(state.campaignGroups[campaignId] || []), newGroup],
        },
      }
    })
  },

  deleteCampaignGroup: (campaignId, groupId) => {
    set((state) => ({
      campaignGroups: {
        ...state.campaignGroups,
        [campaignId]: (state.campaignGroups[campaignId] || []).filter((g) => g.id !== groupId),
      },
    }))
  },

  setCampaignGroupEnvironment: (campaignId, groupId, environmentName) => {
    set((state) => ({
      campaignGroups: {
        ...state.campaignGroups,
        [campaignId]: (state.campaignGroups[campaignId] || []).map((g) =>
          g.id === groupId ? { ...g, defaultEnvironmentName: environmentName } : g
        ),
      },
    }))
  },

  clearCampaignGroupEnvironment: (campaignId, groupId) => {
    set((state) => ({
      campaignGroups: {
        ...state.campaignGroups,
        [campaignId]: (state.campaignGroups[campaignId] || []).map((g) =>
          g.id === groupId ? { ...g, defaultEnvironmentName: undefined } : g
        ),
      },
    }))
  },

  clearCampaignGroups: (campaignId) => {
    if (!campaignId) {
      set(() => ({ campaignGroups: {} }))
      return
    }

    set((state) => {
      const nextGroups = { ...state.campaignGroups }
      delete nextGroups[campaignId]
      return { campaignGroups: nextGroups }
    })
  },
})
