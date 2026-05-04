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
  updatedAt: number
  error?: string | null
}

export interface LiveKitSlice {
  livekitConnections: Record<string, LiveKitConnectionSnapshot>

  upsertLiveKitConnection: (
    key: string,
    snapshot: Omit<LiveKitConnectionSnapshot, 'key' | 'updatedAt'>
  ) => void
  clearLiveKitConnection: (key: string) => void
  clearLiveKitConnectionsForSession: (sessionId?: string) => void
}

export const createLiveKitSlice: StateCreator<LiveKitSlice> = (set) => ({
  livekitConnections: {},

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

  clearLiveKitConnection: (key) =>
    set((state) => {
      if (!state.livekitConnections[key]) {
        return state
      }

      const next = { ...state.livekitConnections }
      delete next[key]
      return { livekitConnections: next }
    }),

  clearLiveKitConnectionsForSession: (sessionId) =>
    set((state) => {
      if (!sessionId) {
        return { livekitConnections: {} }
      }

      const next = Object.fromEntries(
        Object.entries(state.livekitConnections).filter(
          ([, entry]) => entry.sessionId !== sessionId
        )
      ) as Record<string, LiveKitConnectionSnapshot>

      return { livekitConnections: next }
    }),
})
