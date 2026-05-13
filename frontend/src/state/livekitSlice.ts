import type { StateCreator } from 'zustand'
import { ConnectionState } from 'livekit-client'

export interface LiveKitConnectionSnapshot {
  key: string
  sessionId: string
  roomId: string
  channel: 'room' | 'broadcast' | 'voice_of_god'
  connectionState: ConnectionState
  isConnected: boolean
  isConnecting: boolean
  hasLocalPublication: boolean
  updatedAt: number
  error?: string | null
}

export interface LiveKitSlice {
  livekitConnections: Record<string, LiveKitConnectionSnapshot>
  livekitLocalInputTracks: Record<string, MediaStreamTrack | null>
  livekitSpeakingBySession: Record<string, Record<string, true>>

  upsertLiveKitConnection: (
    key: string,
    snapshot: Omit<LiveKitConnectionSnapshot, 'key' | 'updatedAt'>
  ) => void
  setLiveKitLocalInputTrack: (key: string, track: MediaStreamTrack | null) => void
  setLiveKitSpeakingUsers: (sessionId: string, userIds: string[]) => void
  clearLiveKitConnection: (key: string) => void
  clearLiveKitConnectionsForSession: (sessionId?: string) => void
}

export const createLiveKitSlice: StateCreator<LiveKitSlice> = (set) => ({
  livekitConnections: {},
  livekitLocalInputTracks: {},
  livekitSpeakingBySession: {},

  upsertLiveKitConnection: (key, snapshot) =>
    set((state) => ({
      livekitConnections: {
        ...state.livekitConnections,
        [key]: {
          key,
          ...snapshot,
          updatedAt: Date.now(),
        },
      },
    })),

  setLiveKitLocalInputTrack: (key, track) =>
    set((state) => ({
      livekitLocalInputTracks: {
        ...state.livekitLocalInputTracks,
        [key]: track,
      },
    })),

  setLiveKitSpeakingUsers: (sessionId, userIds) =>
    set((state) => ({
      livekitSpeakingBySession: {
        ...state.livekitSpeakingBySession,
        [sessionId]: userIds.reduce<Record<string, true>>((accumulator, userId) => {
          accumulator[userId] = true
          return accumulator
        }, {}),
      },
    })),

  clearLiveKitConnection: (key) =>
    set((state) => {
      if (!state.livekitConnections[key]) {
        return state
      }

      const nextConnections = { ...state.livekitConnections }
      delete nextConnections[key]

      const nextInputTracks = { ...state.livekitLocalInputTracks }
      delete nextInputTracks[key]

      return {
        livekitConnections: nextConnections,
        livekitLocalInputTracks: nextInputTracks,
      }
    }),

  clearLiveKitConnectionsForSession: (sessionId) =>
    set((state) => {
      if (!sessionId) {
        return {
          livekitConnections: {},
          livekitLocalInputTracks: {},
          livekitSpeakingBySession: {},
        }
      }

      const next = Object.fromEntries(
        Object.entries(state.livekitConnections).filter(
          ([, entry]) => entry.sessionId !== sessionId
        )
      ) as Record<string, LiveKitConnectionSnapshot>

      const nextTracks = Object.fromEntries(
        Object.entries(state.livekitLocalInputTracks).filter(([key]) => {
          const connection = state.livekitConnections[key]
          return connection?.sessionId !== sessionId
        })
      ) as Record<string, MediaStreamTrack | null>

      const nextSpeakingBySession = { ...state.livekitSpeakingBySession }
      delete nextSpeakingBySession[sessionId]

      return {
        livekitConnections: next,
        livekitLocalInputTracks: nextTracks,
        livekitSpeakingBySession: nextSpeakingBySession,
      }
    }),
})
