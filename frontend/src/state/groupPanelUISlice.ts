/**
 * Group Panel UI Slice (Zustand)
 * Manages UI state for the Groups panel: expanded/collapsed state,
 * environment picker, drag context, selected group.
 */

import type { StateCreator } from 'zustand'
import type { UUID } from '@shared'

export interface GroupPanelUISlice {
  // State
  expandedGroupIds: Record<UUID, Set<UUID>> // sessionId -> groupIds that are expanded
  environmentPickerTargetGroupId: UUID | null
  selectedGroupId: UUID | null
  dragContext: { sourceUserId: UUID; sourceGroupId: UUID } | null
  closingGroupId: UUID | null // Group being closed (in-flight)
  deletingGroupId: UUID | null // Group being deleted (in-flight)

  // Actions
  toggleGroupExpanded: (sessionId: UUID, groupId: UUID) => void
  setGroupExpanded: (sessionId: UUID, groupId: UUID, expanded: boolean) => void
  setEnvironmentPickerTarget: (groupId: UUID | null) => void
  setSelectedGroup: (groupId: UUID | null) => void
  startDrag: (userId: UUID, sourceGroupId: UUID) => void
  clearDrag: () => void
  setClosingGroup: (groupId: UUID | null) => void
  setDeletingGroup: (groupId: UUID | null) => void
  clearSessionUI: (sessionId?: UUID) => void
}

export const createGroupPanelUISlice: StateCreator<GroupPanelUISlice> = (set) => ({
  expandedGroupIds: {},
  environmentPickerTargetGroupId: null,
  selectedGroupId: null,
  dragContext: null,
  closingGroupId: null,
  deletingGroupId: null,

  toggleGroupExpanded: (sessionId, groupId) => {
    set((state) => {
      const sessionExpanded = state.expandedGroupIds[sessionId] || new Set<UUID>()
      const nextExpanded = new Set(sessionExpanded)

      if (nextExpanded.has(groupId)) {
        nextExpanded.delete(groupId)
      } else {
        nextExpanded.add(groupId)
      }

      return {
        expandedGroupIds: {
          ...state.expandedGroupIds,
          [sessionId]: nextExpanded,
        },
      }
    })
  },

  setGroupExpanded: (sessionId, groupId, expanded) => {
    set((state) => {
      const sessionExpanded = state.expandedGroupIds[sessionId] || new Set<UUID>()
      const nextExpanded = new Set(sessionExpanded)

      if (expanded) {
        nextExpanded.add(groupId)
      } else {
        nextExpanded.delete(groupId)
      }

      return {
        expandedGroupIds: {
          ...state.expandedGroupIds,
          [sessionId]: nextExpanded,
        },
      }
    })
  },

  setEnvironmentPickerTarget: (groupId) => {
    set(() => ({
      environmentPickerTargetGroupId: groupId,
    }))
  },

  setSelectedGroup: (groupId) => {
    set(() => ({
      selectedGroupId: groupId,
    }))
  },

  startDrag: (userId, sourceGroupId) => {
    set(() => ({
      dragContext: { sourceUserId: userId, sourceGroupId },
    }))
  },

  clearDrag: () => {
    set(() => ({
      dragContext: null,
    }))
  },

  setClosingGroup: (groupId) => {
    set(() => ({
      closingGroupId: groupId,
    }))
  },

  setDeletingGroup: (groupId) => {
    set(() => ({
      deletingGroupId: groupId,
    }))
  },

  clearSessionUI: (sessionId) => {
    if (!sessionId) {
      set(() => ({
        expandedGroupIds: {},
        environmentPickerTargetGroupId: null,
        selectedGroupId: null,
        dragContext: null,
        closingGroupId: null,
        deletingGroupId: null,
      }))
      return
    }

    set((state) => {
      const nextExpanded = { ...state.expandedGroupIds }
      delete nextExpanded[sessionId]

      return {
        expandedGroupIds: nextExpanded,
        environmentPickerTargetGroupId:
          state.environmentPickerTargetGroupId === sessionId
            ? null
            : state.environmentPickerTargetGroupId,
        dragContext: null,
        closingGroupId: null,
        deletingGroupId: null,
      }
    })
  },
})
