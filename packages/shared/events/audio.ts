/**
 * Audio Events
 * Reference: docs/subsystems/AUDIO-ENGINE.md
 *
 * Audio events manage DM-controlled effects, environments, voice modes, and mute state.
 * Most events are DM-originated; mute state changes are user-originated and broadcast to all.
 */

import type { UUID } from '../types'
import type { EventEnvelope } from './base'

export type AudioEventType =
  | 'AUDIO:EFFECT_APPLIED'
  | 'AUDIO:EFFECT_REMOVED'
  | 'AUDIO:PRESET_LOADED'
  | 'AUDIO:ENVIRONMENT_SET'
  | 'AUDIO:DM_OVERRIDE_APPLIED'
  | 'AUDIO:DM_OVERRIDE_REMOVED'
  | 'AUDIO:BROADCAST_STATE_CHANGED'
  | 'AUDIO:DM_VOICE_TARGET_CHANGED'
  | 'AUDIO:DM_VOICE_MODE_CHANGED'
  | 'AUDIO:MUTE_STATE_CHANGED'

/**
 * AUDIO:EFFECT_APPLIED
 * DM applies an audio effect to a user or room.
 * Visibility: Room members see effect applied (visual cue only).
 */
export interface AudioEffectApplied {
  effectId: UUID
  effectName: string
  targetUserId?: UUID
  targetRoomId?: UUID
  appliedBy: UUID
  appliedAt: number
  parameters?: Record<string, any>
}

export type AudioEffectAppliedEvent = EventEnvelope<AudioEffectApplied>

/**
 * AUDIO:EFFECT_REMOVED
 * DM removes an audio effect.
 */
export interface AudioEffectRemoved {
  effectId: UUID
  removedBy: UUID
  removedAt: number
}

export type AudioEffectRemovedEvent = EventEnvelope<AudioEffectRemoved>

/**
 * AUDIO:PRESET_LOADED
 * User or DM loads a preset audio configuration.
 * Visibility: DM-only if applied to others; user-only if personal.
 */
export interface AudioPresetLoaded {
  presetId: UUID
  presetName: string
  loadedBy: UUID
  targetUserId?: UUID
  loadedAt: number
}

export type AudioPresetLoadedEvent = EventEnvelope<AudioPresetLoaded>

/**
 * AUDIO:ENVIRONMENT_SET
 * DM sets the room environment (ambient sound, reverb, etc.).
 * Visibility: All room members hear the environment.
 */
export interface AudioEnvironmentSet {
  environmentId: UUID
  environmentName: string
  roomId: UUID
  setBy: UUID
  setAt: number
  parameters?: Record<string, any>
}

export type AudioEnvironmentSetEvent = EventEnvelope<AudioEnvironmentSet>

/**
 * AUDIO:DM_OVERRIDE_APPLIED
 * DM applies an override to a user's audio (mute, gain, gate, etc.).
 * Visibility: DM-only operation; user may see they are muted/adjusted.
 */
export interface AudioDMOverrideApplied {
  targetUserId: UUID
  dmId: UUID
  overrideType: 'MUTE' | 'UNMUTE' | 'GAIN' | 'GATE' | 'FILTER'
  parameters?: Record<string, any>
  appliedAt: number
}

export type AudioDMOverrideAppliedEvent = EventEnvelope<AudioDMOverrideApplied>

/**
 * AUDIO:DM_OVERRIDE_REMOVED
 * DM removes an override from a user.
 */
export interface AudioDMOverrideRemoved {
  targetUserId: UUID
  dmId: UUID
  overrideType: string
  removedAt: number
}

export type AudioDMOverrideRemovedEvent = EventEnvelope<AudioDMOverrideRemoved>

/**
 * AUDIO:BROADCAST_STATE_CHANGED
 * DM toggles session-wide broadcast voice mode (formerly also called VOICE_OF_GOD).
 * When enabled, DM voice is heard by all session members regardless of room.
 * Visibility: All session members.
 */
export interface AudioBroadcastStateChanged {
  dmId: UUID
  enabled: boolean
  broadcastRoomId: string
  changedAt: number
}

export type AudioBroadcastStateChangedEvent = EventEnvelope<AudioBroadcastStateChanged>

/**
 * AUDIO:DM_VOICE_TARGET_CHANGED
 * DM changes which room their voice targets (or clears to MAIN).
 * Replaces the TARGET_GROUP case of the old DM_VOICE_MODE_CHANGED.
 * Visibility: All session members.
 */
export interface AudioDmVoiceTargetChanged {
  dmId: UUID
  /** The room the DM is now targeting. null means cleared (back to MAIN / default). */
  targetGroupId: UUID | null
  backgroundVolume: number
  changedAt: number
}

export type AudioDmVoiceTargetChangedEvent = EventEnvelope<AudioDmVoiceTargetChanged>

/**
 * AUDIO:DM_VOICE_MODE_CHANGED
 * DM activates or clears a voice preset that transforms their microphone output.
 * Applies only to the DM's own mic chain; cleared on session end.
 * Visibility: All session members (so indicators can update).
 */
export interface AudioDmVoiceModeChanged {
  dmId: UUID
  /** Preset name (e.g. 'Demon', 'Voice of God'). null = preset cleared, normal voice restored. */
  presetName: string | null
  changedAt: number
}

export type AudioDmVoiceModeChangedEvent = EventEnvelope<AudioDmVoiceModeChanged>

/**
 * AUDIO:MUTE_STATE_CHANGED
 * A user's self-mute state changed. Broadcast to all session members so every
 * client always has an accurate mute indicator for every participant.
 *
 * This is the user's own mic-mute toggle, distinct from DM overrides
 * (AUDIO:DM_OVERRIDE_APPLIED). Speaking indicators must combine both:
 * NOT (muted OR dmMuted).
 *
 * Visibility: All session members.
 */
export interface AudioMuteStateChanged {
  userId: UUID
  muted: boolean
  mutedAt: number
}

export type AudioMuteStateChangedEvent = EventEnvelope<AudioMuteStateChanged>

/**
 * Union of all audio events.
 */
export type AudioEvent =
  | AudioEffectAppliedEvent
  | AudioEffectRemovedEvent
  | AudioPresetLoadedEvent
  | AudioEnvironmentSetEvent
  | AudioDMOverrideAppliedEvent
  | AudioDMOverrideRemovedEvent
  | AudioBroadcastStateChangedEvent
  | AudioDmVoiceTargetChangedEvent
  | AudioDmVoiceModeChangedEvent
  | AudioMuteStateChangedEvent
