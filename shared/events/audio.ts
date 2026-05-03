/**
 * Notes and Audio Events
 * Reference: docs/subsystems/NOTES-SYSTEM.md, docs/subsystems/AUDIO-ENGINE.md
 *
 * Notes events manage persistent note storage with role-filtered visibility.
 * Audio events manage effects, presets, and DM-controlled audio state.
 */

import type { UUID, NoteVisibility } from '../types'
import type { EventEnvelope } from './base'

export type NotesEventType =
  | 'NOTES:CREATED'
  | 'NOTES:UPDATED'
  | 'NOTES:DELETED'
  | 'NOTES:SHARED'
  | 'NOTES:TAG_ADDED'

export type AudioEventType =
  | 'AUDIO:EFFECT_APPLIED'
  | 'AUDIO:EFFECT_REMOVED'
  | 'AUDIO:PRESET_LOADED'
  | 'AUDIO:ENVIRONMENT_SET'
  | 'AUDIO:DM_OVERRIDE_APPLIED'
  | 'AUDIO:DM_OVERRIDE_REMOVED'
  | 'AUDIO:VOICE_OF_GOD_CHANGED'

/**
 * NOTES:CREATED
 * User creates a note (private, shared, or DM-only).
 * Visibility: Role-filtered by visibility field.
 */
export interface NotesCreated {
  noteId: UUID
  authorId: UUID
  title: string
  content: string
  visibility: NoteVisibility
  /** If CUSTOM: array of user IDs who can see this */
  allowedUsers?: UUID[]
  tags: string[]
  createdAt: number
}

export type NotesCreatedEvent = EventEnvelope<NotesCreated>

/**
 * NOTES:UPDATED
 * User updates a note.
 * Visibility: Same as the note's visibility setting.
 */
export interface NotesUpdated {
  noteId: UUID
  authorId: UUID
  previousContent: string
  newContent: string
  updatedAt: number
}

export type NotesUpdatedEvent = EventEnvelope<NotesUpdated>

/**
 * NOTES:DELETED
 * User deletes a note.
 * Visibility: Role-filtered by the note's original visibility.
 */
export interface NotesDeleted {
  noteId: UUID
  authorId: UUID
  deletedAt: number
}

export type NotesDeletedEvent = EventEnvelope<NotesDeleted>

/**
 * NOTES:SHARED
 * User shares a note with specific players (or removes sharing).
 * Visibility: DM-visible operation.
 */
export interface NotesShared {
  noteId: UUID
  authorId: UUID
  sharedWith: UUID[]
  sharedAt: number
}

export type NotesSharedEvent = EventEnvelope<NotesShared>

/**
 * NOTES:TAG_ADDED
 * User adds a tag to a note.
 * Visibility: Same as note visibility.
 */
export interface NotesTagAdded {
  noteId: UUID
  authorId: UUID
  tag: string
  addedAt: number
}

export type NotesTagAddedEvent = EventEnvelope<NotesTagAdded>

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
 * AUDIO:VOICE_OF_GOD_CHANGED
 * DM toggles global broadcast mode for session-wide narration.
 */
export interface AudioVoiceOfGodChanged {
  dmId: UUID
  enabled: boolean
  broadcastRoomId: string
  changedAt: number
}

export type AudioVoiceOfGodChangedEvent = EventEnvelope<AudioVoiceOfGodChanged>

/**
 * Union types.
 */
export type NotesEvent =
  | NotesCreatedEvent
  | NotesUpdatedEvent
  | NotesDeletedEvent
  | NotesSharedEvent
  | NotesTagAddedEvent

export type AudioEvent =
  | AudioEffectAppliedEvent
  | AudioEffectRemovedEvent
  | AudioPresetLoadedEvent
  | AudioEnvironmentSetEvent
  | AudioDMOverrideAppliedEvent
  | AudioDMOverrideRemovedEvent
  | AudioVoiceOfGodChangedEvent
