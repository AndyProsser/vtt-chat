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

  upsertLiveKitConnection: (
    key: string,
    snapshot: Omit<LiveKitConnectionSnapshot, 'key' | 'updatedAt'>
  ) => void
  setLiveKitLocalInputTrack: (key: string, track: MediaStreamTrack | null) => void
  clearLiveKitConnection: (key: string) => void
  clearLiveKitConnectionsForSession: (sessionId?: string) => void
}

export const createLiveKitSlice: StateCreator<LiveKitSlice> = (set) => ({
  livekitConnections: {},
  livekitLocalInputTracks: {},

  upsertLiveKitConnection: (key, snapshot) =>
    set((state) => {
      const existing = state.livekitConnections[key]
      if (
        existing &&
        existing.sessionId === snapshot.sessionId &&
        existing.roomId === snapshot.roomId &&
        existing.channel === snapshot.channel &&
        existing.connectionState === snapshot.connectionState &&
        existing.isConnected === snapshot.isConnected &&
        existing.isConnecting === snapshot.isConnecting &&
        existing.hasLocalPublication === snapshot.hasLocalPublication &&
        existing.error === snapshot.error
      ) {
        return state
      }

      return {
        livekitConnections: {
          ...state.livekitConnections,
          [key]: {
            key,
            ...snapshot,
            updatedAt: Date.now(),
          },
        },
      }
    }),

  setLiveKitLocalInputTrack: (key, track) =>
    set((state) => {
      if (state.livekitLocalInputTracks[key] === track) {
        return state
      }

      return {
        livekitLocalInputTracks: {
          ...state.livekitLocalInputTracks,
          [key]: track,
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

      return {
        livekitConnections: nextConnections,
        livekitLocalInputTracks: nextInputTracks,
      }
    }),

  clearLiveKitConnectionsForSession: (sessionId) =>
    set((state) => {
      if (!sessionId) {
        if (
          Object.keys(state.livekitConnections).length === 0 &&
          Object.keys(state.livekitLocalInputTracks).length === 0
        ) {
          return state
        }

        return {
          livekitConnections: {},
          livekitLocalInputTracks: {},
        }
      }

      let removedAnyConnection = false
      const nextConnections: Record<string, LiveKitConnectionSnapshot> = {}
      for (const [key, entry] of Object.entries(state.livekitConnections)) {
        if (entry.sessionId === sessionId) {
          removedAnyConnection = true
          continue
        }
        nextConnections[key] = entry
      }

      let removedAnyTrack = false
      const nextTracks: Record<string, MediaStreamTrack | null> = {}
      for (const [key, track] of Object.entries(state.livekitLocalInputTracks)) {
        const connection = state.livekitConnections[key]
        if (connection?.sessionId === sessionId) {
          removedAnyTrack = true
          continue
        }
        nextTracks[key] = track
      }

      if (!removedAnyConnection && !removedAnyTrack) {
        return state
      }

      return {
        livekitConnections: nextConnections,
        livekitLocalInputTracks: nextTracks,
      }
    }),
})
