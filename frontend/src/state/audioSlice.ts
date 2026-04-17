/**
 * Audio Slice (Zustand)
 * Manages audio state (engine settings, DM overrides, effects).
 * Reference: docs/architecture/ARCHITECTURE.md
 */

import type { StateCreator } from 'zustand'
import type { UUID } from '@shared'
import type { EventEnvelope } from '@shared'

export interface AudioState {
  enabled: boolean
  microphoneOn: boolean
  volumeLevel: number // 0-100
  isSpeaking: boolean
}

export interface AudioEffect {
  id: UUID
  name: string
  isActive: boolean
}

export interface AudioSlice {
  // State
  audioState: AudioState
  effects: AudioEffect[]
  isLoading: boolean

  // Actions
  setAudioState: (state: Partial<AudioState>) => void
  updateEffect: (effectId: UUID, updates: Partial<AudioEffect>) => void
  clearAudioState: () => void

  // Event handlers
  handleEffectApplied: (event: EventEnvelope) => void
  handleEnvironmentSet: (event: EventEnvelope) => void
  handleDmOverrideApplied: (event: EventEnvelope) => void
}

export const createAudioSlice: StateCreator<AudioSlice> = (set) => ({
  // State
  audioState: {
    enabled: false,
    microphoneOn: false,
    volumeLevel: 50,
    isSpeaking: false,
  },
  effects: [],
  isLoading: false,

  // Actions
  setAudioState: (updates) =>
    set((state) => ({
      audioState: {
        ...state.audioState,
        ...updates,
      },
    })),

  updateEffect: (effectId, updates) =>
    set((state) => ({
      effects: state.effects.map((effect) =>
        effect.id === effectId ? { ...effect, ...updates } : effect
      ),
    })),

  clearAudioState: () =>
    set({
      audioState: {
        enabled: false,
        microphoneOn: false,
        volumeLevel: 50,
        isSpeaking: false,
      },
      effects: [],
    }),

  // Event handlers
  handleEffectApplied: (event) => {
    const payload = event.payload as {
      effectId: UUID
      effectName: string
    }

    set((state) => {
      const existingEffect = state.effects.find((e) => e.id === payload.effectId)

      if (existingEffect) {
        return {
          effects: state.effects.map((e) =>
            e.id === payload.effectId ? { ...e, isActive: true } : e
          ),
        }
      }

      return {
        effects: [
          ...state.effects,
          {
            id: payload.effectId,
            name: payload.effectName,
            isActive: true,
          },
        ],
      }
    })
  },

  handleEnvironmentSet: (event) => {
    const payload = event.payload as {
      environment: string
      settings: Record<string, any>
    }

    set((state) => ({
      audioState: {
        ...state.audioState,
        // Environment settings would be applied here
      },
    }))
  },

  handleDmOverrideApplied: (event) => {
    const payload = event.payload as {
      affectedUserId: UUID
      overrideType: string
      value: any
    }

    set((state) => ({
      // DM override would be applied here
      audioState: {
        ...state.audioState,
      },
    }))
  },
})
