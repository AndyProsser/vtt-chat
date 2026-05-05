import type { UUID } from '@shared'
import type { EventEnvelope } from '@shared'
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

  setEnvironment: (preset: EnvironmentPreset) => void
  clearEnvironment: () => void
  setDistance: (preset: DistancePreset) => void
  clearDistance: () => void
  setCondition: (preset: ConditionPreset) => void
  clearCondition: () => void
  setVoicePreset: (preset: VoicePreset) => void
  clearVoicePreset: () => void
  setICPreset: (preset: ICPreset) => void
  clearICPreset: () => void

  handleEnvironmentSet: (event: EventEnvelope) => void
}

export const initialAudioPresetsState = {
  currentEnvironment: undefined,
  currentDistance: undefined,
  currentCondition: undefined,
  currentVoicePreset: undefined,
  currentICPreset: undefined,
} as const

export const createAudioPresetsSlice: StateCreator<AudioPresetsSlice, [], [], AudioPresetsSlice> = (
  set
) => ({
  ...initialAudioPresetsState,

  setEnvironment: (preset) =>
    set(() => ({
      currentEnvironment: preset,
    })),

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

  handleEnvironmentSet: (event) => {
    const payload = event.payload as {
      environmentId: UUID
      environmentName: string
      roomId: UUID
      setBy: UUID
      setAt: number
      parameters?: Record<string, any>
    }

    if (!payload.parameters) {
      return
    }

    const environmentPreset: EnvironmentPreset = {
      id: payload.environmentId,
      name: payload.environmentName,
      reverbSend: payload.parameters.reverbSend || 0.3,
      lowpassFreq: payload.parameters.lowpassFreq || 8000,
      roomGain: payload.parameters.roomGain || 0,
    }

    set(() => ({
      currentEnvironment: environmentPreset,
    }))
  },
})
