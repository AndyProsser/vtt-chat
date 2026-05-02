import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NoteVisibility, MessageType } from '@shared'

const mocks = vi.hoisted(() => ({
  mockExtractTokenFromHeader: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockGetSession: vi.fn(),
  mockCreateNote: vi.fn(),
  mockDeleteNote: vi.fn(),
  mockGetNoteById: vi.fn(),
  mockGetVisibleNotes: vi.fn(),
  mockMarkNotePublished: vi.fn(),
  mockUpdateNote: vi.fn(),
  mockSendMessage: vi.fn(),
  mockLoggerInfo: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: mocks.mockExtractTokenFromHeader,
  verifyToken: mocks.mockVerifyToken,
}))

vi.mock('@/services/session.service', () => ({
  getSession: mocks.mockGetSession,
}))

vi.mock('@/services/notes.service', () => ({
  createNote: mocks.mockCreateNote,
  deleteNote: mocks.mockDeleteNote,
  getNoteById: mocks.mockGetNoteById,
  getVisibleNotes: mocks.mockGetVisibleNotes,
  markNotePublished: mocks.mockMarkNotePublished,
  updateNote: mocks.mockUpdateNote,
}))

vi.mock('@/services/chat.service', () => ({
  sendMessage: mocks.mockSendMessage,
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: mocks.mockLoggerInfo,
  },
}))

import notesRoutes from '../../src/api/notes.routes'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const NOTE_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const DM_ID = '44444444-4444-4444-8444-444444444444'
const ALLOWED_USER = '55555555-5555-4555-8555-555555555555'

function buildAppWithWs() {
  const app = express()
  app.use(express.json())
  app.locals.wsManager = {
    broadcastEventToSession: vi.fn(),
  }
  app.use('/api/notes', notesRoutes)
  return app
}

describe('notes routes websocket propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.mockExtractTokenFromHeader.mockReturnValue('token')
    mocks.mockVerifyToken.mockReturnValue({
      userId: USER_ID,
      username: 'alice',
      role: 'PLAYER',
    })

    mocks.mockGetSession.mockResolvedValue({
      id: SESSION_ID,
      name: 'Session 1',
      dmId: DM_ID,
      campaignId: '66666666-6666-4666-8666-666666666666',
      state: 'ACTIVE',
      createdAt: Date.now(),
    })
  })

  it('broadcasts NOTES:CREATED with visibility filtering for CUSTOM notes', async () => {
    const app = buildAppWithWs()
    mocks.mockCreateNote.mockResolvedValue({
      id: NOTE_ID,
      sessionId: SESSION_ID,
      authorId: USER_ID,
      authorUsername: 'alice',
      title: 'Secret',
      content: 'Hidden lore',
      visibility: NoteVisibility.CUSTOM,
      tags: ['lore'],
      allowedUsers: [ALLOWED_USER],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const response = await request(app)
      .post('/api/notes')
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        title: 'Secret',
        content: 'Hidden lore',
        visibility: NoteVisibility.CUSTOM,
        allowedUsers: [ALLOWED_USER],
      })

    expect(response.status).toBe(201)

    const wsCall = (app.locals.wsManager.broadcastEventToSession as any).mock.calls[0]
    expect(wsCall[0]).toBe(SESSION_ID)
    expect(wsCall[1].type).toBe('NOTES:CREATED')
    expect(wsCall[2]).toEqual(expect.arrayContaining([USER_ID, DM_ID, ALLOWED_USER]))
  })

  it('publishing note emits notes update, chat message, and audit log entry', async () => {
    const app = buildAppWithWs()

    const note = {
      id: NOTE_ID,
      sessionId: SESSION_ID,
      authorId: USER_ID,
      authorUsername: 'alice',
      title: 'Recap',
      content: 'Important clues',
      visibility: NoteVisibility.CUSTOM,
      tags: [],
      allowedUsers: [ALLOWED_USER],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    mocks.mockGetNoteById.mockResolvedValue(note)
    mocks.mockGetVisibleNotes.mockResolvedValue([note])
    mocks.mockMarkNotePublished.mockResolvedValue({
      ...note,
      publishedAt: Date.now(),
      updatedAt: Date.now(),
    })

    mocks.mockSendMessage.mockResolvedValue({
      id: '77777777-7777-4777-8777-777777777777',
      sessionId: SESSION_ID,
      authorId: USER_ID,
      authorUsername: 'alice',
      content: '[Note] Recap: Important clues',
      type: MessageType.SYSTEM,
      isDmOnly: false,
      createdAt: Date.now(),
    })

    const response = await request(app)
      .post(`/api/notes/${NOTE_ID}/publish`)
      .set('Authorization', 'Bearer token')
      .send({})

    expect(response.status).toBe(200)

    const calls = (app.locals.wsManager.broadcastEventToSession as any).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0][1].type).toBe('NOTES:UPDATED')
    expect(calls[1][1].type).toBe('CHAT:MESSAGE_SENT')
    expect(calls[0][2]).toEqual(expect.arrayContaining([USER_ID, DM_ID, ALLOWED_USER]))
    expect(calls[1][2]).toEqual(expect.arrayContaining([USER_ID, DM_ID, ALLOWED_USER]))

    expect(mocks.mockLoggerInfo).toHaveBeenCalledWith(
      'ADMIN:NOTE_PUBLISHED',
      'Note published to chat',
      expect.objectContaining({
        action: 'NOTE_PUBLISHED',
        noteId: NOTE_ID,
        sessionId: SESSION_ID,
        actorUserId: USER_ID,
      })
    )
  })
})
