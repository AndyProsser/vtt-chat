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
    set((state) => {
      const currentSessionSpeaking = state.livekitSpeakingBySession[sessionId]

      if (userIds.length === 0) {
        if (!currentSessionSpeaking) {
          return state
        }

        const nextSpeakingBySession = { ...state.livekitSpeakingBySession }
        delete nextSpeakingBySession[sessionId]

        return {
          livekitSpeakingBySession: nextSpeakingBySession,
        }
      }

      const nextSessionSpeaking = userIds.reduce<Record<string, true>>((accumulator, userId) => {
        accumulator[userId] = true
        return accumulator
      }, {})

      if (currentSessionSpeaking) {
        const currentKeys = Object.keys(currentSessionSpeaking)
        const nextKeys = Object.keys(nextSessionSpeaking)

        if (
          currentKeys.length === nextKeys.length &&
          nextKeys.every((userId) => currentSessionSpeaking[userId])
        ) {
          return state
        }
      }

      return {
        livekitSpeakingBySession: {
          ...state.livekitSpeakingBySession,
          [sessionId]: nextSessionSpeaking,
        },
      }
    }),

  clearLiveKitConnection: (key) =>
    set((state) => {
      const removedConnection = state.livekitConnections[key]
      if (!removedConnection) {
        return state
      }

      const nextConnections = { ...state.livekitConnections }
      delete nextConnections[key]

      const nextInputTracks = { ...state.livekitLocalInputTracks }
      delete nextInputTracks[key]

      const hasRemainingConnectionsForSession = Object.values(nextConnections).some(
        (entry) => entry.sessionId === removedConnection.sessionId
      )

      const nextSpeakingBySession = { ...state.livekitSpeakingBySession }
      if (!hasRemainingConnectionsForSession) {
        delete nextSpeakingBySession[removedConnection.sessionId]
      }

      return {
        livekitConnections: nextConnections,
        livekitLocalInputTracks: nextInputTracks,
        livekitSpeakingBySession: nextSpeakingBySession,
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
