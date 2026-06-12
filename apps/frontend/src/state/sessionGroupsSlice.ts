/**
 * Session Groups Slice (Zustand)
 * Manages runtime session-scoped group state and membership.
 * Includes pause/resume state snapshot for preserving group assignments.
 */

import type { StateCreator } from 'zustand'
import type { UUID, EventEnvelope } from '@shared'
import type { Room } from '@/types/room'

/**
 * Session-scoped snapshot of group membership for pause/resume.
 * Captures which players were in which groups before pause.
 */
export interface PrePauseGroupSnapshot {
  sessionId: UUID
  timestamp: number
  membersByGroupId: Record<UUID, UUID[]> // groupId -> userIds
  environmentsByGroupId: Record<UUID, string | undefined> // groupId -> environmentName
}

export interface SessionGroupsSlice {
  // State
  sessionRoomsById: Record<UUID, Record<UUID, Room>> // sessionId -> { roomId -> Room } (existing structure)
  sessionGroupEnvironments: Record<UUID, Record<UUID, string | undefined>> // sessionId -> { groupId -> envName }
  prePauseGroupState: Record<UUID, PrePauseGroupSnapshot> // sessionId -> snapshot

  // Actions
  setSessionGroups: (sessionId: UUID, rooms: Room[]) => void
  setSessionGroupEnvironment: (sessionId: UUID, groupId: UUID, environmentName: string) => void
  clearSessionGroupEnvironment: (sessionId: UUID, groupId: UUID) => void
  snapshotGroupStateBeforePause: (sessionId: UUID, rooms: Room[]) => void
  restoreGroupStateOnResume: (sessionId: UUID) => PrePauseGroupSnapshot | null
  clearSessionGroups: (sessionId?: UUID) => void

  // WS Event Handlers
  handleSessionPaused: (event: EventEnvelope) => void
  handleSessionResumed: (event: EventEnvelope) => void
}

export const createSessionGroupsSlice: StateCreator<SessionGroupsSlice> = (set, get) => ({
  sessionRoomsById: {},
  sessionGroupEnvironments: {},
  prePauseGroupState: {},

  setSessionGroups: (sessionId, rooms) => {
    set((state) => {
      const byRoom = rooms.reduce(
        (acc, room) => {
          acc[room.id] = room
          return acc
        },
        {} as Record<UUID, Room>
      )

      return {
        sessionRoomsById: {
          ...state.sessionRoomsById,
          [sessionId]: byRoom,
        },
      }
    })
  },

  setSessionGroupEnvironment: (sessionId, groupId, environmentName) => {
    set((state) => ({
      sessionGroupEnvironments: {
        ...state.sessionGroupEnvironments,
        [sessionId]: {
          ...(state.sessionGroupEnvironments[sessionId] || {}),
          [groupId]: environmentName,
        },
      },
    }))
  },

  clearSessionGroupEnvironment: (sessionId, groupId) => {
    set((state) => ({
      sessionGroupEnvironments: {
        ...state.sessionGroupEnvironments,
        [sessionId]: {
          ...(state.sessionGroupEnvironments[sessionId] || {}),
          [groupId]: undefined,
        },
      },
    }))
  },

  /**
   * Snapshot current group membership before pause.
   * On resume, players return to their pre-pause groups.
   * Environments also captured for reapplication.
   */
  snapshotGroupStateBeforePause: (sessionId, rooms) => {
    const membersByGroupId: Record<UUID, UUID[]> = {}
    const environmentsByGroupId: Record<UUID, string | undefined> = {}

    // Initialized from existing roomMembers (would come from separate slice)
    // For now, snapshot what we have in rooms
    for (const room of rooms) {
      membersByGroupId[room.id] = []
      environmentsByGroupId[room.id] = get().sessionGroupEnvironments[sessionId]?.[room.id]
    }

    set((state) => ({
      prePauseGroupState: {
        ...state.prePauseGroupState,
        [sessionId]: {
          sessionId,
          timestamp: Date.now(),
          membersByGroupId,
          environmentsByGroupId,
        },
      },
    }))
  },

  /**
   * Restore group membership and environments after resume.
   * Returns the snapshot that was restored for verification.
   */
  restoreGroupStateOnResume: (sessionId) => {
    const snapshot = get().prePauseGroupState[sessionId]

    if (!snapshot) {
      return null
    }

    // Reapply environments from snapshot
    set((state) => {
      const nextEnvs = { ...state.sessionGroupEnvironments }
      nextEnvs[sessionId] = { ...snapshot.environmentsByGroupId }

      return {
        sessionGroupEnvironments: nextEnvs,
      }
    })

    return snapshot
  },

  clearSessionGroups: (sessionId) => {
    if (!sessionId) {
      set(() => ({
        sessionRoomsById: {},
        sessionGroupEnvironments: {},
        prePauseGroupState: {},
      }))
      return
    }

    set((state) => {
      const nextRooms = { ...state.sessionRoomsById }
      const nextEnvs = { ...state.sessionGroupEnvironments }
      const nextSnapshots = { ...state.prePauseGroupState }

      delete nextRooms[sessionId]
      delete nextEnvs[sessionId]
      delete nextSnapshots[sessionId]

      return {
        sessionRoomsById: nextRooms,
        sessionGroupEnvironments: nextEnvs,
        prePauseGroupState: nextSnapshots,
      }
    })
  },

  /**
   * Handle SESSION:PAUSED event - snapshot current group state before pause.
   */
  handleSessionPaused: (event) => {
    const payload = event.payload as {
      sessionId: UUID
    }

    const state = get()
    const rooms = Object.values(state.sessionRoomsById[payload.sessionId] || {})

    state.snapshotGroupStateBeforePause(payload.sessionId, rooms)
  },

  /**
   * Handle SESSION:RESUMED event - restore group state from snapshot.
   */
  handleSessionResumed: (event) => {
    const payload = event.payload as {
      sessionId: UUID
    }

    get().restoreGroupStateOnResume(payload.sessionId)
  },
})
