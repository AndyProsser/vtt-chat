import { beforeEach, describe, expect, it } from 'vitest'
import type { EventEnvelope } from '@shared'
import type { UUID } from '@shared'
import { useStore } from '../../src/state/store'
import type { Note } from '@/types/notes'

const SESSION_A = '11111111-1111-4111-8111-111111111111' as UUID
const SESSION_B = '22222222-2222-4222-8222-222222222222' as UUID
const NOTE_ID_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID
const NOTE_ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as UUID
const OWNER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as UUID
const NOW = 1700000000000

function makeEvent(
  type: string,
  sessionId: UUID,
  payload: Record<string, unknown> = {}
): EventEnvelope {
  return {
    id: '00000000-0000-4000-8000-000000000000' as any,
    type,
    version: 1,
    userId: OWNER_ID as any,
    userRole: 'PLAYER' as any,
    sessionId: sessionId as any,
    roomId: null,
    timestamp: NOW,
    payload,
  }
}

const SAMPLE_NOTE: Note = {
  id: NOTE_ID_1,
  ownerId: OWNER_ID,
  ownerUsername: 'alice',
  title: 'Session notes',
  content: 'Some content',
  visibility: 'PRIVATE' as any,
  tags: ['lore'],
  createdAt: NOW,
  updatedAt: NOW,
}

describe('notesSlice', () => {
  beforeEach(() => {
    useStore.getState().reset()
  })

  // ── Direct actions ─────────────────────────────────────────────────────────

  describe('addNote', () => {
    it('adds a note to the correct session', () => {
      useStore.getState().addNote(SESSION_A, SAMPLE_NOTE)
      const notes = useStore.getState().notes[SESSION_A]
      expect(notes).toBeDefined()
      expect(notes![NOTE_ID_1]).toEqual(SAMPLE_NOTE)
    })

    it('does not affect other sessions', () => {
      useStore.getState().addNote(SESSION_A, SAMPLE_NOTE)
      useStore.getState().addNote(SESSION_B, { ...SAMPLE_NOTE, id: NOTE_ID_2 })
      expect(Object.keys(useStore.getState().notes[SESSION_A]!)).toHaveLength(1)
      expect(Object.keys(useStore.getState().notes[SESSION_B]!)).toHaveLength(1)
    })
  })

  describe('updateNote', () => {
    it('updates an existing note', () => {
      useStore.getState().addNote(SESSION_A, SAMPLE_NOTE)
      useStore.getState().updateNote(SESSION_A, NOTE_ID_1, { title: 'Revised title' })
      expect(useStore.getState().notes[SESSION_A]![NOTE_ID_1]!.title).toBe('Revised title')
    })

    it('is a no-op when note does not exist', () => {
      useStore.getState().addNote(SESSION_A, SAMPLE_NOTE)
      const before = useStore.getState().notes[SESSION_A]
      useStore.getState().updateNote(SESSION_A, NOTE_ID_2, { title: 'Ghost' })
      expect(useStore.getState().notes[SESSION_A]).toEqual(before)
    })
  })

  describe('deleteNote', () => {
    it('removes a note from its session', () => {
      useStore.getState().addNote(SESSION_A, SAMPLE_NOTE)
      useStore.getState().deleteNote(SESSION_A, NOTE_ID_1)
      expect(useStore.getState().notes[SESSION_A]![NOTE_ID_1]).toBeUndefined()
    })
  })

  describe('clearNotes', () => {
    it('clears a specific session', () => {
      useStore.getState().addNote(SESSION_A, SAMPLE_NOTE)
      useStore.getState().addNote(SESSION_B, { ...SAMPLE_NOTE, id: NOTE_ID_2 })
      useStore.getState().clearNotes(SESSION_A)
      expect(useStore.getState().notes[SESSION_A]).toBeUndefined()
      expect(useStore.getState().notes[SESSION_B]).toBeDefined()
    })

    it('clears all sessions when called without argument', () => {
      useStore.getState().addNote(SESSION_A, SAMPLE_NOTE)
      useStore.getState().addNote(SESSION_B, { ...SAMPLE_NOTE, id: NOTE_ID_2 })
      useStore.getState().clearNotes()
      expect(useStore.getState().notes).toEqual({})
    })
  })

  // ── Event handlers ─────────────────────────────────────────────────────────

  describe('handleNoteCreated', () => {
    it('adds note from event payload', () => {
      const event = makeEvent('NOTES:NOTE_CREATED', SESSION_A, {
        noteId: NOTE_ID_1,
        ownerId: OWNER_ID,
        ownerUsername: 'alice',
        title: 'From event',
        content: 'Event content',
        visibility: 'PRIVATE',
        tags: ['event-tag'],
      })
      useStore.getState().handleNoteCreated(event)
      const note = useStore.getState().notes[SESSION_A]![NOTE_ID_1]
      expect(note).toBeDefined()
      expect(note!.title).toBe('From event')
      expect(note!.createdAt).toBe(NOW)
    })
  })

  describe('handleNoteUpdated', () => {
    it('updates note fields from event payload', () => {
      useStore.getState().addNote(SESSION_A, SAMPLE_NOTE)
      const event = makeEvent('NOTES:NOTE_UPDATED', SESSION_A, {
        noteId: NOTE_ID_1,
        title: 'Updated via event',
        content: 'New body',
      })
      useStore.getState().handleNoteUpdated(event)
      const note = useStore.getState().notes[SESSION_A]![NOTE_ID_1]
      expect(note!.title).toBe('Updated via event')
      expect(note!.content).toBe('New body')
    })

    it('is a no-op when the note is not in store', () => {
      const event = makeEvent('NOTES:NOTE_UPDATED', SESSION_A, {
        noteId: NOTE_ID_2,
        title: 'Ghost',
      })
      useStore.getState().handleNoteUpdated(event)
      // The unknown note should not appear; session key may exist but not contain NOTE_ID_2
      expect(useStore.getState().notes[SESSION_A]?.[NOTE_ID_2]).toBeUndefined()
    })
  })

  describe('handleNoteDeleted', () => {
    it('removes note from store', () => {
      useStore.getState().addNote(SESSION_A, SAMPLE_NOTE)
      const event = makeEvent('NOTES:NOTE_DELETED', SESSION_A, { noteId: NOTE_ID_1 })
      useStore.getState().handleNoteDeleted(event)
      expect(useStore.getState().notes[SESSION_A]![NOTE_ID_1]).toBeUndefined()
    })
  })
})
