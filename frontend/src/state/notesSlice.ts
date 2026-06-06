/**
 * Notes Slice (Zustand)
 * Manages notes state (private, shared, DM-only).
 * Reference: docs/architecture/ARCHITECTURE.md
 */

import type { StateCreator } from 'zustand'
import type { UUID, NoteVisibility } from '@shared'
import type { EventEnvelope } from '@shared'
import type { Note } from '@/types/notes'

export type { Note } from '@/types/notes'

export interface NotesSlice {
  // State
  notes: Record<UUID, Record<UUID, Note>> // keyed by campaignId (or legacy scope id), then noteId
  isLoading: boolean

  // Actions
  addNote: (scopeId: UUID, note: Note) => void
  updateNote: (scopeId: UUID, noteId: UUID, updates: Partial<Note>) => void
  deleteNote: (scopeId: UUID, noteId: UUID) => void
  clearNotes: (scopeId?: UUID) => void

  // Event handlers
  handleNoteCreated: (event: EventEnvelope) => void
  handleNoteUpdated: (event: EventEnvelope) => void
  handleNoteDeleted: (event: EventEnvelope) => void
  handleNoteHandoutSurfaced: (event: EventEnvelope) => void
}

export const createNotesSlice: StateCreator<NotesSlice> = (set) => ({
  // State
  notes: {},
  isLoading: false,

  // Actions
  addNote: (scopeId, note) =>
    set((state) => ({
      notes: {
        ...state.notes,
        [scopeId]: {
          ...(state.notes[scopeId] || {}),
          [note.id]: note,
        },
      },
    })),

  updateNote: (scopeId, noteId, updates) =>
    set((state) => {
      const note = state.notes[scopeId]?.[noteId]
      if (!note) return state

      const scopedNotes = state.notes[scopeId] || {}
      return {
        notes: {
          ...state.notes,
          [scopeId]: {
            ...scopedNotes,
            [noteId]: { ...note, ...updates },
          },
        },
      }
    }),

  deleteNote: (scopeId, noteId) =>
    set((state) => {
      const scopedNotes = { ...state.notes[scopeId] }
      if (scopedNotes) {
        delete scopedNotes[noteId]
      }
      return {
        notes: {
          ...state.notes,
          [scopeId]: scopedNotes,
        },
      }
    }),

  clearNotes: (scopeId) =>
    set((state) => {
      if (!scopeId) {
        return { notes: {} }
      }

      const newNotes = { ...state.notes }
      delete newNotes[scopeId]

      return {
        notes: newNotes,
      }
    }),

  // Event handlers
  handleNoteCreated: (event) => {
    const payload = event.payload as {
      campaignId?: UUID
      noteId: UUID
      ownerId: UUID
      ownerUsername: string
      title: string
      content: string
      visibility: NoteVisibility
      tags: string[]
      allowedUsers?: UUID[]
      attachments?: Note['attachments']
      publishedAt?: number
    }

    const note: Note = {
      id: payload.noteId,
      ownerId: payload.ownerId,
      ownerUsername: payload.ownerUsername,
      title: payload.title,
      content: payload.content,
      visibility: payload.visibility,
      tags: payload.tags,
      allowedUsers: payload.allowedUsers,
      attachments: payload.attachments || [],
      publishedAt: payload.publishedAt,
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
    }

    const scopeId = payload.campaignId ?? event.sessionId

    set((state) => ({
      notes: {
        ...state.notes,
        [scopeId]: {
          ...(state.notes[scopeId] || {}),
          [note.id]: note,
        },
      },
    }))
  },

  handleNoteUpdated: (event) => {
    const payload = event.payload as {
      campaignId?: UUID
      noteId: UUID
      title?: string
      content?: string
      visibility?: NoteVisibility
      tags?: string[]
      allowedUsers?: UUID[]
      attachments?: Note['attachments']
      publishedAt?: number
    }

    set((state) => {
      const explicitScopeId = payload.campaignId
      const nextNotes = { ...state.notes }
      let changed = false

      const updateBucket = (bucketId: UUID) => {
        const bucketNotes = nextNotes[bucketId]
        const note = bucketNotes?.[payload.noteId]
        if (!note) {
          return
        }

        nextNotes[bucketId] = {
          ...bucketNotes,
          [payload.noteId]: {
            ...note,
            title: payload.title !== undefined ? payload.title : note.title,
            content: payload.content !== undefined ? payload.content : note.content,
            visibility: payload.visibility !== undefined ? payload.visibility : note.visibility,
            tags: payload.tags !== undefined ? payload.tags : note.tags,
            allowedUsers:
              payload.allowedUsers !== undefined ? payload.allowedUsers : note.allowedUsers,
            attachments: payload.attachments !== undefined ? payload.attachments : note.attachments,
            publishedAt: payload.publishedAt !== undefined ? payload.publishedAt : note.publishedAt,
            updatedAt: event.timestamp,
          },
        }
        changed = true
      }

      if (explicitScopeId) {
        updateBucket(explicitScopeId)
      }

      if (!changed) {
        const fallbackScopeId = event.sessionId
        updateBucket(fallbackScopeId)
      }

      if (!changed) {
        for (const bucketId of Object.keys(nextNotes) as UUID[]) {
          updateBucket(bucketId)
        }
      }

      if (!changed) {
        return state
      }

      return {
        notes: nextNotes,
      }
    })
  },

  handleNoteHandoutSurfaced: (event) => {
    const payload = event.payload as {
      noteId: UUID
      campaignId?: UUID
      surfacedAt: number
    }

    // Mark the note as published in local state so the UI reflects the surfaced status.
    set((state) => {
      const nextNotes = { ...state.notes }
      let changed = false

      const markPublished = (bucketId: UUID) => {
        const bucket = nextNotes[bucketId]
        const note = bucket?.[payload.noteId]
        if (!note) return

        nextNotes[bucketId] = {
          ...bucket,
          [payload.noteId]: { ...note, publishedAt: payload.surfacedAt },
        }
        changed = true
      }

      if (payload.campaignId) {
        markPublished(payload.campaignId)
      }

      if (!changed) {
        for (const bucketId of Object.keys(nextNotes) as UUID[]) {
          markPublished(bucketId)
        }
      }

      return changed ? { notes: nextNotes } : state
    })
  },

  handleNoteDeleted: (event) => {
    const payload = event.payload as { campaignId?: UUID; noteId: UUID }

    set((state) => {
      const nextNotes = { ...state.notes }
      let changed = false

      const deleteFromBucket = (bucketId: UUID) => {
        const bucket = nextNotes[bucketId]
        if (!bucket || !bucket[payload.noteId]) {
          return
        }

        const bucketNotes = { ...bucket }
        delete bucketNotes[payload.noteId]
        nextNotes[bucketId] = bucketNotes
        changed = true
      }

      if (payload.campaignId) {
        deleteFromBucket(payload.campaignId)
      }

      if (!changed) {
        deleteFromBucket(event.sessionId)
      }

      if (!changed) {
        for (const bucketId of Object.keys(nextNotes) as UUID[]) {
          deleteFromBucket(bucketId)
        }
      }

      return changed ? { notes: nextNotes } : state
    })
  },
})
