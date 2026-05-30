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
  notes: Record<UUID, Record<UUID, Note>> // keyed by sessionId, then noteId
  isLoading: boolean

  // Actions
  addNote: (sessionId: UUID, note: Note) => void
  updateNote: (sessionId: UUID, noteId: UUID, updates: Partial<Note>) => void
  deleteNote: (sessionId: UUID, noteId: UUID) => void
  clearNotes: (sessionId?: UUID) => void

  // Event handlers
  handleNoteCreated: (event: EventEnvelope) => void
  handleNoteUpdated: (event: EventEnvelope) => void
  handleNoteDeleted: (event: EventEnvelope) => void
}

export const createNotesSlice: StateCreator<NotesSlice> = (set) => ({
  // State
  notes: {},
  isLoading: false,

  // Actions
  addNote: (sessionId, note) =>
    set((state) => ({
      notes: {
        ...state.notes,
        [sessionId]: {
          ...(state.notes[sessionId] || {}),
          [note.id]: note,
        },
      },
    })),

  updateNote: (sessionId, noteId, updates) =>
    set((state) => {
      const note = state.notes[sessionId]?.[noteId]
      if (!note) return state

      const sessionNotes = state.notes[sessionId] || {}
      return {
        notes: {
          ...state.notes,
          [sessionId]: {
            ...sessionNotes,
            [noteId]: { ...note, ...updates },
          },
        },
      }
    }),

  deleteNote: (sessionId, noteId) =>
    set((state) => {
      const sessionNotes = { ...state.notes[sessionId] }
      if (sessionNotes) {
        delete sessionNotes[noteId]
      }
      return {
        notes: {
          ...state.notes,
          [sessionId]: sessionNotes,
        },
      }
    }),

  clearNotes: (sessionId) =>
    set((state) => {
      if (!sessionId) {
        return { notes: {} }
      }

      const newNotes = { ...state.notes }
      delete newNotes[sessionId]

      return {
        notes: newNotes,
      }
    }),

  // Event handlers
  handleNoteCreated: (event) => {
    const payload = event.payload as {
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

    set((state) => ({
      notes: {
        ...state.notes,
        [event.sessionId]: {
          ...(state.notes[event.sessionId] || {}),
          [note.id]: note,
        },
      },
    }))
  },

  handleNoteUpdated: (event) => {
    const payload = event.payload as {
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
      const sessionNotes = state.notes[event.sessionId]
      const note = sessionNotes?.[payload.noteId]
      if (!note) return state

      return {
        notes: {
          ...state.notes,
          [event.sessionId]: {
            ...sessionNotes,
            [payload.noteId]: {
              ...note,
              title: payload.title !== undefined ? payload.title : note.title,
              content: payload.content !== undefined ? payload.content : note.content,
              visibility: payload.visibility !== undefined ? payload.visibility : note.visibility,
              tags: payload.tags !== undefined ? payload.tags : note.tags,
              allowedUsers:
                payload.allowedUsers !== undefined ? payload.allowedUsers : note.allowedUsers,
              attachments:
                payload.attachments !== undefined ? payload.attachments : note.attachments,
              publishedAt:
                payload.publishedAt !== undefined ? payload.publishedAt : note.publishedAt,
              updatedAt: event.timestamp,
            },
          },
        },
      }
    })
  },

  handleNoteDeleted: (event) => {
    const payload = event.payload as { noteId: UUID }

    set((state) => {
      const sessionNotes = { ...state.notes[event.sessionId] }
      delete sessionNotes[payload.noteId]
      return {
        notes: {
          ...state.notes,
          [event.sessionId]: sessionNotes,
        },
      }
    })
  },
})
