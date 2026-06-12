import type { UUID } from '@shared'
import type { StateCreator } from 'zustand'
import type { EventEnvelope } from '@shared'

/**
 * User Mute Slice
 * Tracks per-session per-user mute state for speaking indicators and audio routing.
 *
 * Mute state can come from:
 * 1. User's own action (user mutes/unmutes themselves via button)
 * 2. WS event broadcast (other clients mute/unmute, or reconnect recovery)
 *
 * This is separate from DM overrides; a user can be muted by themselves OR by the DM.
 * Speaking indicators must combine: NOT (userMuted OR dmMuted)
 */

export interface UserMuteSlice {
  /** Map: sessionId -> Map(userId -> isMuted) */
  userMuteState: Record<UUID, Record<UUID, boolean>>

  setUserMute: (sessionId: UUID, userId: UUID, muted: boolean) => void
  setUserMuteBySession: (sessionId: UUID, muteMap: Record<UUID, boolean>) => void
  clearUserMuteState: (sessionId?: UUID) => void

  handleMuteStateChanged: (event: EventEnvelope) => void
}

export const initialUserMuteState: UserMuteSlice['userMuteState'] = {}

export const createUserMuteSlice: StateCreator<UserMuteSlice, [], [], UserMuteSlice> = (set) => ({
  userMuteState: initialUserMuteState,

  setUserMute: (sessionId, userId, muted) =>
    set((state) => {
      const sessionMutes = state.userMuteState[sessionId] || {}
      return {
        userMuteState: {
          ...state.userMuteState,
          [sessionId]: {
            ...sessionMutes,
            [userId]: muted,
          },
        },
      }
    }),

  setUserMuteBySession: (sessionId, muteMap) =>
    set((state) => ({
      userMuteState: {
        ...state.userMuteState,
        [sessionId]: muteMap,
      },
    })),

  clearUserMuteState: (sessionId) =>
    set((state) => {
      if (!sessionId) {
        // Clear all sessions
        return { userMuteState: {} }
      }

      // Clear specific session
      const { [sessionId]: _, ...rest } = state.userMuteState
      return { userMuteState: rest }
    }),

  handleMuteStateChanged: (event) => {
    const payload = event.payload as { userId: UUID; muted: boolean; mutedAt: number }

    set((state) => {
      const sessionMutes = state.userMuteState[event.sessionId] || {}
      return {
        userMuteState: {
          ...state.userMuteState,
          [event.sessionId]: {
            ...sessionMutes,
            [payload.userId]: payload.muted,
          },
        },
      }
    })
  },
})
