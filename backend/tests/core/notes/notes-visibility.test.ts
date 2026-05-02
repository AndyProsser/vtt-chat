import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NoteVisibility } from '@shared'

type NoteRow = {
  id: string
  sessionId: string
  authorId: string
  authorUsername: string
  title: string
  content: string
  visibility: 'DM_ONLY' | 'PLAYERS_VISIBLE' | 'CUSTOM'
  tags: unknown
  allowedUsers: unknown
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const notes = new Map<string, NoteRow>()

vi.mock('../../../src/repositories/notes.repository', () => ({
  createNoteRecord: vi.fn(async (params: any) => {
    notes.set(params.id, {
      id: params.id,
      sessionId: params.sessionId,
      authorId: params.authorId,
      authorUsername: params.authorUsername,
      title: params.title,
      content: params.content,
      visibility: params.visibility,
      tags: params.tags,
      allowedUsers: params.allowedUsers,
      publishedAt: null,
      createdAt: params.createdAt,
      updatedAt: params.updatedAt,
    })
  }),
  listSessionNotes: vi.fn(async (sessionId: string) => {
    return Array.from(notes.values()).filter((n) => n.sessionId === sessionId)
  }),
  findNoteById: vi.fn(async (noteId: string) => {
    return notes.get(noteId) ?? null
  }),
  updateNoteRecord: vi.fn(async (params: any) => {
    const existing = notes.get(params.noteId)
    if (!existing) return
    notes.set(params.noteId, {
      ...existing,
      title: params.title,
      content: params.content,
      visibility: params.visibility,
      tags: params.tags,
      allowedUsers: params.allowedUsers,
      updatedAt: params.updatedAt,
      publishedAt: params.publishedAt ?? existing.publishedAt,
    })
  }),
  deleteNoteRecord: vi.fn(async (noteId: string) => {
    notes.delete(noteId)
  }),
}))

import { createNote, getVisibleNotes, updateNote } from '../../../src/services/notes.service'

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as any
const DM_ID = '22222222-2222-4222-8222-222222222222' as any
const PLAYER_A = '33333333-3333-4333-8333-333333333333' as any
const PLAYER_B = '44444444-4444-4444-8444-444444444444' as any
const PLAYER_C = '55555555-5555-4555-8555-555555555555' as any

describe('notes visibility transition rules', () => {
  beforeEach(() => {
    notes.clear()
  })

  it('blocks player from downgrading PLAYERS_VISIBLE note to CUSTOM', async () => {
    const note = await createNote({
      sessionId: SESSION_ID,
      authorId: PLAYER_A,
      authorUsername: 'alice',
      title: 'Shared clue',
      content: 'Found footprints',
      visibility: NoteVisibility.PLAYERS_VISIBLE,
    })

    await expect(
      updateNote(note.id, PLAYER_A, 'PLAYER', {
        visibility: NoteVisibility.CUSTOM,
        allowedUsers: [PLAYER_B],
      })
    ).rejects.toThrow(/reduce visibility/i)
  })

  it('blocks player from removing users from CUSTOM allowedUsers', async () => {
    const note = await createNote({
      sessionId: SESSION_ID,
      authorId: PLAYER_A,
      authorUsername: 'alice',
      title: 'Private clue',
      content: 'Trap location',
      visibility: NoteVisibility.CUSTOM,
      allowedUsers: [PLAYER_B, PLAYER_C],
    })

    await expect(
      updateNote(note.id, PLAYER_A, 'PLAYER', {
        visibility: NoteVisibility.CUSTOM,
        allowedUsers: [PLAYER_B],
      })
    ).rejects.toThrow(/cannot remove users/i)
  })

  it('allows player to add users to CUSTOM allowedUsers', async () => {
    const note = await createNote({
      sessionId: SESSION_ID,
      authorId: PLAYER_A,
      authorUsername: 'alice',
      title: 'Selective share',
      content: 'One ally knows',
      visibility: NoteVisibility.CUSTOM,
      allowedUsers: [PLAYER_B],
    })

    const updated = await updateNote(note.id, PLAYER_A, 'PLAYER', {
      visibility: NoteVisibility.CUSTOM,
      allowedUsers: [PLAYER_B, PLAYER_C],
    })

    expect(updated).not.toBeNull()
    expect(updated?.allowedUsers).toEqual([PLAYER_B, PLAYER_C])

    const visibleToC = await getVisibleNotes(SESSION_ID, PLAYER_C, 'PLAYER')
    expect(visibleToC.some((n) => n.id === note.id)).toBe(true)
  })

  it('allows DM to reduce visibility and allowed users', async () => {
    const note = await createNote({
      sessionId: SESSION_ID,
      authorId: PLAYER_A,
      authorUsername: 'alice',
      title: 'DM moderation',
      content: 'Needs narrowing',
      visibility: NoteVisibility.CUSTOM,
      allowedUsers: [PLAYER_B, PLAYER_C],
    })

    const updated = await updateNote(note.id, DM_ID, 'DM', {
      visibility: NoteVisibility.CUSTOM,
      allowedUsers: [PLAYER_B],
    })

    expect(updated).not.toBeNull()
    expect(updated?.allowedUsers).toEqual([PLAYER_B])
  })
})
