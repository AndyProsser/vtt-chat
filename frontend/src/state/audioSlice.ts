/**
 * Audio Slice (Zustand)
 * Manages audio engine state: presets, effects, DM overrides, and PTT.
 * Reference: docs/subsystems/AUDIO-ENGINE.md, docs/architecture/LIVEKIT-INTEGRATION.md
 */

import type { StateCreator } from 'zustand'
import type { UUID } from '@shared'
import type { EventEnvelope } from '@shared'
import type {
  AudioDeviceState,
  EnvironmentPreset,
  DistancePreset,
  ConditionPreset,
  VoicePreset,
  ICPreset,
  AudioDMOverride,
} from '@/types/audio'

export type {
  AudioDeviceState,
  EnvironmentPreset,
  DistancePreset,
  ConditionPreset,
  VoicePreset,
  ICPreset,
  AudioDMOverride,
} from '@/types/audio'

export interface AudioSlice {
  // ========== Device State ==========
  device: AudioDeviceState

  // ========== Presets ==========
  currentEnvironment?: EnvironmentPreset
  currentDistance?: DistancePreset
  currentCondition?: ConditionPreset
  currentVoicePreset?: VoicePreset // DM only
  currentICPreset?: ICPreset // Player IC only (DM hears it)

  // ========== Effect Overrides ==========
  pttActive: boolean // Push-to-talk: temporarily clean voice
  privateRoomCleanMode: boolean // All effects disabled in private rooms
  dmOverrides: Map<UUID, AudioDMOverride> // Per-user DM mutes/gains
  voiceOfGodEnabled: boolean
  voiceOfGodRoomId?: string
  voiceOfGodDmId?: UUID
  voiceOfGodChangedAt?: number

  // ========== Active Effects ==========
  activeEffects: Record<UUID, boolean> // effectId -> isActive

  // ========== LiveKit Tracks ==========
  localTrackId?: string
  remoteTrackIds: string[] // List of subscribed tracks

  // ========== Loading State ==========
  isLoading: boolean
  error?: string

  // ========== Actions ==========

  /** Initialize audio device */
  initializeAudio: (enabled: boolean) => void

  /** Update device settings */
  setDevice: (state: Partial<AudioDeviceState>) => void

  /** Set environment preset (room-level) */
  setEnvironment: (preset: EnvironmentPreset) => void
  clearEnvironment: () => void

  /** Set distance preset (per-participant) */
  setDistance: (preset: DistancePreset) => void
  clearDistance: () => void

  /** Set condition preset (overrides distance) */
  setCondition: (preset: ConditionPreset) => void
  clearCondition: () => void

  /** Set voice preset (DM only) */
  setVoicePreset: (preset: VoicePreset) => void
  clearVoicePreset: () => void

  /** Set IC preset (player → DM only) */
  setICPreset: (preset: ICPreset) => void
  clearICPreset: () => void

  /** Push-to-talk: toggle clean voice */
  togglePTT: (active: boolean) => void

  /** Private room clean mode: disable all effects */
  setPrivateRoomCleanMode: (enabled: boolean) => void

  /** DM override: mute/unmute user */
  setDMOverride: (userId: UUID, override: AudioDMOverride | null) => void
  setVoiceOfGodState: (params: {
    enabled: boolean
    broadcastRoomId?: string
    dmId?: UUID
    changedAt?: number
  }) => void

  /** Track active effects */
  setEffectActive: (effectId: UUID, active: boolean) => void
  clearEffects: () => void

  /** Update LiveKit track info */
  setLocalTrackId: (trackId: string) => void
  setRemoteTrackIds: (trackIds: string[]) => void

  /** Reset all audio state */
  reset: () => void

  // ========== Event Handlers ==========
  handleEffectApplied: (event: EventEnvelope) => void
  handleEffectRemoved: (event: EventEnvelope) => void
  handlePresetLoaded: (event: EventEnvelope) => void
  handleEnvironmentSet: (event: EventEnvelope) => void
  handleDMOverrideApplied: (event: EventEnvelope) => void
  handleDMOverrideRemoved: (event: EventEnvelope) => void
  handleVoiceOfGodChanged: (event: EventEnvelope) => void
}

// ============================================================================
// Initial State
// ============================================================================

const initialDeviceState: AudioDeviceState = {
  enabled: false,
  microphoneOn: false,
  micGain: 80,
  volumeLevel: 75,
  isSpeaking: false,
}

// ============================================================================
// Slice Creator
// ============================================================================

export const createAudioSlice: StateCreator<AudioSlice> = (set) => ({
  // ========== Initial State ==========
  device: initialDeviceState,
  currentEnvironment: undefined,
  currentDistance: undefined,
  currentCondition: undefined,
  currentVoicePreset: undefined,
  currentICPreset: undefined,
  pttActive: false,
  privateRoomCleanMode: false,
  dmOverrides: new Map(),
  voiceOfGodEnabled: false,
  voiceOfGodRoomId: undefined,
  voiceOfGodDmId: undefined,
  voiceOfGodChangedAt: undefined,
  activeEffects: {},
  localTrackId: undefined,
  remoteTrackIds: [],
  isLoading: false,
  error: undefined,

  // ========== Device Actions ==========
  initializeAudio: (enabled) =>
    set((state) => ({
      device: {
        ...state.device,
        enabled,
      },
    })),

  setDevice: (updates) =>
    set((state) => ({
      device: {
        ...state.device,
        ...updates,
      },
    })),

  // ========== Environment (Room-Level) ==========
  setEnvironment: (preset) =>
    set(() => ({
      currentEnvironment: preset,
    })),

  clearEnvironment: () =>
    set(() => ({
      currentEnvironment: undefined,
    })),

  // ========== Distance (Per-Participant) ==========
  setDistance: (preset) =>
    set(() => ({
      currentDistance: preset,
    })),

  clearDistance: () =>
    set(() => ({
      currentDistance: undefined,
    })),

  // ========== Condition (Per-Participant, overrides distance) ==========
  setCondition: (preset) =>
    set(() => ({
      currentCondition: preset,
    })),

  clearCondition: () =>
    set(() => ({
      currentCondition: undefined,
    })),

  // ========== Voice Preset (DM only) ==========
  setVoicePreset: (preset) =>
    set(() => ({
      currentVoicePreset: preset,
    })),

  clearVoicePreset: () =>
    set(() => ({
      currentVoicePreset: undefined,
    })),

  // ========== IC Preset (Player → DM only) ==========
  setICPreset: (preset) =>
    set(() => ({
      currentICPreset: preset,
    })),

  clearICPreset: () =>
    set(() => ({
      currentICPreset: undefined,
    })),

  // ========== PTT Override ==========
  togglePTT: (active) =>
    set(() => ({
      pttActive: active,
    })),

  // ========== Private Room Clean Mode ==========
  setPrivateRoomCleanMode: (enabled) =>
    set(() => ({
      privateRoomCleanMode: enabled,
    })),

  // ========== DM Overrides (Per-User) ==========
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

  setVoiceOfGodState: (params) =>
    set(() => ({
      voiceOfGodEnabled: params.enabled,
      voiceOfGodRoomId: params.broadcastRoomId,
      voiceOfGodDmId: params.dmId,
      voiceOfGodChangedAt: params.changedAt,
    })),

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
      device: initialDeviceState,
      currentEnvironment: undefined,
      currentDistance: undefined,
      currentCondition: undefined,
      currentVoicePreset: undefined,
      currentICPreset: undefined,
      pttActive: false,
      privateRoomCleanMode: false,
      dmOverrides: new Map(),
      voiceOfGodEnabled: false,
      voiceOfGodRoomId: undefined,
      voiceOfGodDmId: undefined,
      voiceOfGodChangedAt: undefined,
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

  handleEnvironmentSet: (event) => {
    const payload = event.payload as {
      environmentId: UUID
      environmentName: string
      roomId: UUID
      setBy: UUID
      setAt: number
      parameters?: Record<string, any>
    }

    // Extract environment preset from parameters
    if (payload.parameters) {
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
    }
  },

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

  handleVoiceOfGodChanged: (event) => {
    const payload = event.payload as {
      dmId?: UUID
      enabled: boolean
      broadcastRoomId?: string
      changedAt?: number
    }

    set(() => ({
      voiceOfGodEnabled: Boolean(payload.enabled),
      voiceOfGodRoomId: payload.broadcastRoomId,
      voiceOfGodDmId: payload.dmId,
      voiceOfGodChangedAt: payload.changedAt ?? event.timestamp,
    }))
  },
})
