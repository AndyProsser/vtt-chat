import type { UUID } from '@shared'
import type { EventEnvelope } from '@shared'
import { findEnvironmentPreset } from '@shared'
import type { StateCreator } from 'zustand'
import type {
  ConditionPreset,
  DistancePreset,
  EnvironmentPreset,
  ICPreset,
  VoicePreset,
} from '@/types/audio'

export interface AudioPresetsSlice {
  currentEnvironment?: EnvironmentPreset
  currentDistance?: DistancePreset
  currentCondition?: ConditionPreset
  currentVoicePreset?: VoicePreset
  currentICPreset?: ICPreset
  roomEnvironmentNames: Record<UUID, string>

  setEnvironment: (preset: EnvironmentPreset) => void
  setRoomEnvironmentName: (roomId: UUID, environmentName: string) => void
  replaceRoomEnvironmentNames: (next: Record<UUID, string>) => void
  clearRoomEnvironmentName: (roomId: UUID) => void
  clearEnvironment: () => void
  setDistance: (preset: DistancePreset) => void
  clearDistance: () => void
  setCondition: (preset: ConditionPreset) => void
  clearCondition: () => void
  setVoicePreset: (preset: VoicePreset) => void
  clearVoicePreset: () => void
  setICPreset: (preset: ICPreset) => void
  clearICPreset: () => void
  /** Clears all per-session audio presets (env, condition, distance, voice, IC). Preserves roomEnvironmentNames. */
  resetSessionAudioState: () => void

  handleEnvironmentSet: (event: EventEnvelope) => void
}

export const initialAudioPresetsState = {
  currentEnvironment: undefined,
  currentDistance: undefined,
  currentCondition: undefined,
  currentVoicePreset: undefined,
  currentICPreset: undefined,
  roomEnvironmentNames: {},
} as const

export const createAudioPresetsSlice: StateCreator<AudioPresetsSlice, [], [], AudioPresetsSlice> = (
  set,
  get
) => ({
  ...initialAudioPresetsState,

  setEnvironment: (preset) =>
    set(() => ({
      currentEnvironment: preset,
    })),

  setRoomEnvironmentName: (roomId, environmentName) =>
    set((state) => ({
      roomEnvironmentNames: {
        ...state.roomEnvironmentNames,
        [roomId]: environmentName,
      },
    })),

  replaceRoomEnvironmentNames: (next) =>
    set(() => ({
      roomEnvironmentNames: { ...next },
    })),

  clearRoomEnvironmentName: (roomId) =>
    set((state) => {
      const next = { ...state.roomEnvironmentNames }
      delete next[roomId]
      return { roomEnvironmentNames: next }
    }),

  clearEnvironment: () =>
    set(() => ({
      currentEnvironment: undefined,
    })),

  setDistance: (preset) =>
    set(() => ({
      currentDistance: preset,
    })),

  clearDistance: () =>
    set(() => ({
      currentDistance: undefined,
    })),

  setCondition: (preset) =>
    set(() => ({
      currentCondition: preset,
    })),

  clearCondition: () =>
    set(() => ({
      currentCondition: undefined,
    })),

  setVoicePreset: (preset) =>
    set(() => ({
      currentVoicePreset: preset,
    })),

  clearVoicePreset: () =>
    set(() => ({
      currentVoicePreset: undefined,
    })),

  setICPreset: (preset) =>
    set(() => ({
      currentICPreset: preset,
    })),

  clearICPreset: () =>
    set(() => ({
      currentICPreset: undefined,
    })),

  resetSessionAudioState: () =>
    set(() => ({
      currentEnvironment: undefined,
      currentDistance: undefined,
      currentCondition: undefined,
      currentVoicePreset: undefined,
      currentICPreset: undefined,
    })),

  handleEnvironmentSet: (event) => {
    const payload = event.payload as {
      environmentId: UUID
      environmentName: string
      roomId: UUID
      setBy: UUID
      setAt: number
      parameters?: Record<string, any>
    }

    // Always update the room→name map (drives Groups Panel icons and SessionInit restore).
    set((state) => ({
      roomEnvironmentNames: {
        ...state.roomEnvironmentNames,
        [payload.roomId]: payload.environmentName,
      },
    }))

    // Only update currentEnvironment if the affected room is the current user's primary room.
    const state = get()
    const currentUserId = (state as any).currentUser?.id as UUID | undefined
    if (!currentUserId || !event.sessionId) return

    const userPresence = (state as any).sessionPresence?.[event.sessionId]?.[currentUserId]
    if (userPresence?.primaryRoomId !== payload.roomId) return

    // Resolve DSP from the shared catalog — the WS payload may not carry parameters.
    const catalogPreset = findEnvironmentPreset(payload.environmentName)
    if (!catalogPreset) return

    const environmentPreset: EnvironmentPreset = {
      id: payload.environmentId || (`env-${payload.environmentName}` as UUID),
      name: payload.environmentName,
      reverbSend: catalogPreset.dsp.reverbSend,
      lowpassFreq: catalogPreset.dsp.lowpassFreq,
      roomGain: catalogPreset.dsp.roomGainDb,
    }

    set(() => ({ currentEnvironment: environmentPreset }))
  },
})
