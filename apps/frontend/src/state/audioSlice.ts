/**
 * Audio Slice (Zustand)
 * Manages audio engine state: presets, effects, DM overrides, and PTT.
 * Reference: docs/subsystems/AUDIO-ENGINE.md, docs/architecture/LIVEKIT-INTEGRATION.md
 */

import type { StateCreator } from 'zustand'
import type { UUID } from '@shared'
import type { EventEnvelope } from '@shared'
import {
  createAudioDeviceSlice,
  hydratedAudioDeviceState,
  type AudioDeviceSlice,
} from './audioDeviceSlice'
import {
  createAudioPresetsSlice,
  initialAudioPresetsState,
  type AudioPresetsSlice,
} from './audioPresetsSlice'
import {
  createAudioOverridesSlice,
  initialAudioOverridesState,
  type AudioOverridesSlice,
} from './audioOverridesSlice'

export type {
  AudioDeviceState,
  EnvironmentPreset,
  DistancePreset,
  ConditionPreset,
  VoicePreset,
  ICPreset,
  AudioDMOverride,
} from '@/types/audio'

export interface AudioSlice extends AudioDeviceSlice, AudioPresetsSlice, AudioOverridesSlice {
  // ========== Active Effects ==========
  activeEffects: Record<UUID, boolean> // effectId -> isActive

  // ========== LiveKit Tracks ==========
  localTrackId?: string
  remoteTrackIds: string[] // List of subscribed tracks

  // ========== Loading State ==========
  isLoading: boolean
  error?: string

  // ========== Actions ==========

  /** Track active effects */
  setEffectActive: (effectId: UUID, active: boolean) => void
  clearEffects: () => void
  clearActiveEffects: () => void

  /** Update LiveKit track info */
  setLocalTrackId: (trackId: string) => void
  setRemoteTrackIds: (trackIds: string[]) => void

  /** Reset all audio state */
  reset: () => void

  // ========== Event Handlers ==========
  handleEffectApplied: (event: EventEnvelope) => void
  handleEffectRemoved: (event: EventEnvelope) => void
  handlePresetLoaded: (event: EventEnvelope) => void
}

// ============================================================================
// Slice Creator
// ============================================================================

const createAudioDeviceSliceForAudio: StateCreator<AudioSlice, [], [], AudioDeviceSlice> =
  createAudioDeviceSlice
const createAudioPresetsSliceForAudio: StateCreator<AudioSlice, [], [], AudioPresetsSlice> =
  createAudioPresetsSlice
const createAudioOverridesSliceForAudio: StateCreator<AudioSlice, [], [], AudioOverridesSlice> =
  createAudioOverridesSlice

export const createAudioSlice: StateCreator<AudioSlice> = (set, get, api) => ({
  // ========== Initial State ==========
  ...createAudioDeviceSliceForAudio(set, get, api),
  ...createAudioPresetsSliceForAudio(set, get, api),
  ...createAudioOverridesSliceForAudio(set, get, api),
  activeEffects: {},
  localTrackId: undefined,
  remoteTrackIds: [],
  isLoading: false,
  error: undefined,

  // ========== Active Effects ==========
  setEffectActive: (effectId, active) =>
    set((state) => ({
      activeEffects: {
        ...state.activeEffects,
        [effectId]: active,
      },
    })),

  clearEffects: () =>
    set(() => ({
      activeEffects: {},
    })),

  clearActiveEffects: () =>
    set(() => ({
      activeEffects: {},
    })),

  // ========== LiveKit Tracks ==========
  setLocalTrackId: (trackId) =>
    set(() => ({
      localTrackId: trackId,
    })),

  setRemoteTrackIds: (trackIds) =>
    set(() => ({
      remoteTrackIds: trackIds,
    })),

  // ========== Reset ==========
  reset: () =>
    set(() => ({
      // Preserve the user's remembered device-local prefs across resets.
      device: hydratedAudioDeviceState(),
      ...initialAudioPresetsState,
      ...initialAudioOverridesState,
      activeEffects: {},
      localTrackId: undefined,
      remoteTrackIds: [],
      isLoading: false,
      error: undefined,
    })),

  // ========== Event Handlers ==========

  handleEffectApplied: (event) => {
    const payload = event.payload as {
      effectId: UUID
      effectName: string
      targetUserId?: UUID
      targetRoomId?: UUID
      appliedBy: UUID
      appliedAt: number
      parameters?: Record<string, any>
    }

    set((state) => ({
      activeEffects: {
        ...state.activeEffects,
        [payload.effectId]: true,
      },
    }))
  },

  handleEffectRemoved: (event) => {
    const payload = event.payload as {
      effectId: UUID
      removedBy: UUID
      removedAt: number
    }

    set((state) => ({
      activeEffects: {
        ...state.activeEffects,
        [payload.effectId]: false,
      },
    }))
  },

  handlePresetLoaded: (event) => {
    const payload = event.payload as {
      presetId: UUID
      presetName: string
      loadedBy: UUID
      targetUserId?: UUID
      loadedAt: number
    }

    // Preset loaded event indicates a preset was applied
    // Full preset details would come from a separate API call
    // For now, just track that a preset was applied
    set((state) => ({
      activeEffects: {
        ...state.activeEffects,
        [payload.presetId]: true,
      },
    }))
  },
})
