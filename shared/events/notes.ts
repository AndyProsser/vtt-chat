/**
 * Notes Events
 * Reference: docs/subsystems/NOTES-SYSTEM.md
 *
 * Notes events manage persistent note storage with role-filtered visibility.
 * Notes survive session boundaries and are campaign-scoped.
 */

import type { UUID, NoteVisibility } from '../types'
import type { EventEnvelope } from './base'

export type NotesEventType =
  | 'NOTES:CREATED'
  | 'NOTES:UPDATED'
  | 'NOTES:DELETED'
  | 'NOTES:SHARED'
  | 'NOTES:TAG_ADDED'
  | 'NOTES:HANDOUT_SURFACED'

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
 * NOTES:HANDOUT_SURFACED
 * DM surfaces a note as a one-time recipients-only handout in chat.
 * Broadcast only to the resolved recipient user IDs.
 */
export interface NotesHandoutSurfaced {
  noteId: UUID
  campaignId?: UUID
  authorId: UUID
  title: string
  excerpt: string
  excerptSource: 'AUTO' | 'MANUAL'
  scope: 'PARTY' | 'SELECTED'
  recipientIds: UUID[]
  surfacedAt: number
}

export type NotesHandoutSurfacedEvent = EventEnvelope<NotesHandoutSurfaced>

/**
 * Union of all notes events.
 */
export type NotesEvent =
  | NotesCreatedEvent
  | NotesUpdatedEvent
  | NotesDeletedEvent
  | NotesSharedEvent
  | NotesTagAddedEvent
  | NotesHandoutSurfacedEvent
