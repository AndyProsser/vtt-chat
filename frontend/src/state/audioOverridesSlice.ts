import type { UUID } from '@shared'
import type { EventEnvelope } from '@shared'
import type { StateCreator } from 'zustand'
import type { AudioDMOverride } from '@/types/audio'
import {
  removeAudioDMOverride,
  replaceAudioDMOverrides,
  type AudioDMOverrideKey,
  type AudioDMOverridesByUser,
  upsertAudioDMOverride,
} from '@/utils/audioOverrides'

export interface AudioOverridesSlice {
  pttActive: boolean
  privateRoomCleanMode: boolean
  dmOverrides: AudioDMOverridesByUser
  broadcastModeEnabled: boolean
  broadcastRoomId?: string
  broadcastDmId?: UUID
  broadcastChangedAt?: number
  dmVoiceMode: 'TARGET_GROUP' | 'BROADCAST'
  dmBackgroundVolume: number
  dmVoiceTargetGroupId?: UUID

  togglePTT: (active: boolean) => void
  setPrivateRoomCleanMode: (enabled: boolean) => void
  setDMOverride: (userId: UUID, override: AudioDMOverride | null) => void
  removeDMOverride: (userId: UUID, overrideKey: AudioDMOverrideKey) => void
  /** Bulk-replace all DM overrides from an API recovery response. */
  replaceDMOverrides: (
    overrides: Array<AudioDMOverride | (AudioDMOverride & { targetUserId?: UUID })>
  ) => void
  setBroadcastState: (params: {
    enabled: boolean
    broadcastRoomId?: string
    dmId?: UUID
    changedAt?: number
  }) => void

  handleDMOverrideApplied: (event: EventEnvelope) => void
  handleDMOverrideRemoved: (event: EventEnvelope) => void
  handleBroadcastStateChanged: (event: EventEnvelope) => void
  handleDmVoiceModeChanged: (event: EventEnvelope) => void
}

export const initialAudioOverridesState = {
  pttActive: false,
  privateRoomCleanMode: false,
  dmOverrides: new Map<UUID, Map<AudioDMOverrideKey, AudioDMOverride>>(),
  broadcastModeEnabled: false,
  broadcastRoomId: undefined,
  broadcastDmId: undefined,
  broadcastChangedAt: undefined,
  dmVoiceMode: 'TARGET_GROUP' as const,
  dmBackgroundVolume: 0.3,
  dmVoiceTargetGroupId: undefined,
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
      if (!override) {
        const next = new Map(state.dmOverrides)
        next.delete(userId)
        return { dmOverrides: next }
      }

      if (override.userId !== userId) {
        return { dmOverrides: state.dmOverrides }
      }

      return { dmOverrides: upsertAudioDMOverride(state.dmOverrides, override) }
    }),

  removeDMOverride: (userId, overrideKey) =>
    set((state) => ({
      dmOverrides: removeAudioDMOverride(state.dmOverrides, userId, overrideKey),
    })),

  replaceDMOverrides: (overrides) =>
    set(() => {
      const normalizedOverrides = overrides.reduce<AudioDMOverride[]>((acc, override) => {
        const targetUserId = 'targetUserId' in override ? override.targetUserId : undefined
        const userId = override.userId || targetUserId

        if (!userId) {
          return acc
        }

        acc.push({
          userId,
          overrideType: override.overrideType,
          parameters: override.parameters,
          appliedAt: override.appliedAt,
        })

        return acc
      }, [])

      return { dmOverrides: replaceAudioDMOverrides(normalizedOverrides) }
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
      overrideType:
        | 'MUTE'
        | 'UNMUTE'
        | 'GAIN'
        | 'GATE'
        | 'FILTER'
        | 'DISTANCE'
        | 'CONDITION'
        | 'VOICE'
        | 'VOICE_OF_GOD'
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
      return { dmOverrides: upsertAudioDMOverride(state.dmOverrides, override) }
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
      return {
        dmOverrides: removeAudioDMOverride(
          state.dmOverrides,
          payload.targetUserId,
          payload.overrideType as AudioDMOverrideKey
        ),
      }
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

  handleDmVoiceModeChanged: (event) => {
    const payload = event.payload as {
      dmId: UUID
      voiceMode: 'TARGET_GROUP' | 'BROADCAST'
      targetGroupId?: UUID | null
      backgroundVolume: number
      changedAt: number
    }

    set(() => ({
      dmVoiceMode: payload.voiceMode,
      dmBackgroundVolume: payload.backgroundVolume,
      dmVoiceTargetGroupId: payload.targetGroupId ?? undefined,
      broadcastModeEnabled: payload.voiceMode === 'BROADCAST',
    }))
  },
})
