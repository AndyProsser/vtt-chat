import type { UUID } from '@shared'
import type { EventEnvelope } from '@shared'
import type { StateCreator } from 'zustand'
import type { AudioDMOverride } from '@/types/audio'

export interface AudioOverridesSlice {
  pttActive: boolean
  privateRoomCleanMode: boolean
  dmOverrides: Map<UUID, AudioDMOverride>
  broadcastModeEnabled: boolean
  broadcastRoomId?: string
  broadcastDmId?: UUID
  broadcastChangedAt?: number

  togglePTT: (active: boolean) => void
  setPrivateRoomCleanMode: (enabled: boolean) => void
  setDMOverride: (userId: UUID, override: AudioDMOverride | null) => void
  /** Bulk-replace all DM overrides from an API recovery response. */
  replaceDMOverrides: (overrides: AudioDMOverride[]) => void
  setBroadcastState: (params: {
    enabled: boolean
    broadcastRoomId?: string
    dmId?: UUID
    changedAt?: number
  }) => void

  handleDMOverrideApplied: (event: EventEnvelope) => void
  handleDMOverrideRemoved: (event: EventEnvelope) => void
  handleBroadcastStateChanged: (event: EventEnvelope) => void
}

export const initialAudioOverridesState = {
  pttActive: false,
  privateRoomCleanMode: false,
  dmOverrides: new Map<UUID, AudioDMOverride>(),
  broadcastModeEnabled: false,
  broadcastRoomId: undefined,
  broadcastDmId: undefined,
  broadcastChangedAt: undefined,
} as const

export const createAudioOverridesSlice: StateCreator<
  AudioOverridesSlice,
  [],
  [],
  AudioOverridesSlice
> = (set) => ({
  ...initialAudioOverridesState,

  togglePTT: (active) =>
    set(() => ({
      pttActive: active,
    })),

  setPrivateRoomCleanMode: (enabled) =>
    set(() => ({
      privateRoomCleanMode: enabled,
    })),

  setDMOverride: (userId, override) =>
    set((state) => {
      const newOverrides = new Map(state.dmOverrides)
      if (override) {
        newOverrides.set(userId, override)
      } else {
        newOverrides.delete(userId)
      }
      return { dmOverrides: newOverrides }
    }),

  replaceDMOverrides: (overrides) =>
    set(() => {
      const next = new Map<UUID, AudioDMOverride>()
      for (const override of overrides) {
        next.set(override.userId, override)
      }
      return { dmOverrides: next }
    }),

  setBroadcastState: (params) =>
    set(() => ({
      broadcastModeEnabled: params.enabled,
      broadcastRoomId: params.broadcastRoomId,
      broadcastDmId: params.dmId,
      broadcastChangedAt: params.changedAt,
    })),

  handleDMOverrideApplied: (event) => {
    const payload = event.payload as {
      targetUserId: UUID
      dmId: UUID
      overrideType: 'MUTE' | 'UNMUTE' | 'GAIN' | 'GATE' | 'FILTER'
      parameters?: Record<string, any>
      appliedAt: number
    }

    const override: AudioDMOverride = {
      userId: payload.targetUserId,
      overrideType: payload.overrideType,
      parameters: payload.parameters,
      appliedAt: payload.appliedAt,
    }

    set((state) => {
      const newOverrides = new Map(state.dmOverrides)
      newOverrides.set(payload.targetUserId, override)
      return { dmOverrides: newOverrides }
    })
  },

  handleDMOverrideRemoved: (event) => {
    const payload = event.payload as {
      targetUserId: UUID
      dmId: UUID
      overrideType: string
      removedAt: number
    }

    set((state) => {
      const newOverrides = new Map(state.dmOverrides)
      newOverrides.delete(payload.targetUserId)
      return { dmOverrides: newOverrides }
    })
  },

  handleBroadcastStateChanged: (event) => {
    const payload = event.payload as {
      dmId?: UUID
      enabled: boolean
      broadcastRoomId?: string
      changedAt?: number
    }

    set(() => ({
      broadcastModeEnabled: Boolean(payload.enabled),
      broadcastRoomId: payload.broadcastRoomId,
      broadcastDmId: payload.dmId,
      broadcastChangedAt: payload.changedAt ?? event.timestamp,
    }))
  },
})
