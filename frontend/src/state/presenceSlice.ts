import type { UUID } from '@shared'
import type { SessionPresence } from '@/types/room'
import type { StateCreator } from 'zustand'

export interface PresenceSlice {
  sessionPresence: Record<UUID, Record<UUID, SessionPresence>>
}

export const createPresenceSlice: StateCreator<PresenceSlice> = () => ({
  sessionPresence: {},
})
