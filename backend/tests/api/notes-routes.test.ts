import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorCode, MessageType, NoteVisibility } from '@shared'
import { NOTE_PUBLISH_SNIPPET_MAX_LENGTH } from '@/constants/notes.constants'

const mocks = vi.hoisted(() => ({
  mockExtractTokenFromHeader: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockGetSession: vi.fn(),
  mockGetSessionUsers: vi.fn(),
  mockResolveEffectiveSessionRole: vi.fn(),
  mockGetCampaignForUser: vi.fn(),
  mockListSessionsByCampaign: vi.fn(),
  mockCreateNote: vi.fn(),
  mockDeleteNote: vi.fn(),
  mockGetNoteById: vi.fn(),
  mockGetVisibleNotes: vi.fn(),
  mockMarkNotePublished: vi.fn(),
  mockUpdateNote: vi.fn(),
  mockSendMessage: vi.fn(),
  mockAppendSessionAuditEvent: vi.fn(),
  mockCreateSessionLog: vi.fn(),
  mockLoggerInfo: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: (...args: unknown[]) => mocks.mockExtractTokenFromHeader(...args),
  verifyToken: (...args: unknown[]) => mocks.mockVerifyToken(...args),
}))

vi.mock('@/services/session/core.service', () => ({
  getSession: (...args: unknown[]) => mocks.mockGetSession(...args),
  getSessionUsers: (...args: unknown[]) => mocks.mockGetSessionUsers(...args),
}))

vi.mock('@/services/session/authz.service', () => ({
  resolveEffectiveSessionRole: (...args: unknown[]) =>
    mocks.mockResolveEffectiveSessionRole(...args),
}))

vi.mock('@/repositories/campaign.repository', () => ({
  getCampaignForUser: (...args: unknown[]) => mocks.mockGetCampaignForUser(...args),
}))

vi.mock('@/repositories/session.repository', () => ({
  listSessionsByCampaign: (...args: unknown[]) => mocks.mockListSessionsByCampaign(...args),
}))

vi.mock('@/services/notes.service', () => ({
  createNote: (...args: unknown[]) => mocks.mockCreateNote(...args),
  deleteNote: (...args: unknown[]) => mocks.mockDeleteNote(...args),
  getNoteById: (...args: unknown[]) => mocks.mockGetNoteById(...args),
  getVisibleNotes: (...args: unknown[]) => mocks.mockGetVisibleNotes(...args),
  markNotePublished: (...args: unknown[]) => mocks.mockMarkNotePublished(...args),
  updateNote: (...args: unknown[]) => mocks.mockUpdateNote(...args),
}))

vi.mock('@/services/chat.service', () => ({
  sendMessage: (...args: unknown[]) => mocks.mockSendMessage(...args),
}))

vi.mock('@/services/runtime/runtime-streams.service', () => ({
  appendSessionAuditEvent: (...args: unknown[]) => mocks.mockAppendSessionAuditEvent(...args),
}))

vi.mock('@/repositories/session-logs.repository', () => ({
  createSessionLog: (...args: unknown[]) => mocks.mockCreateSessionLog(...args),
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: (...args: unknown[]) => mocks.mockLoggerInfo(...args),
  },
}))

import notesRoutes from '@/api/notes.routes'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const CAMPAIGN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NOTE_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const DM_ID = '44444444-4444-4444-8444-444444444444'
const OTHER_USER_ID = '55555555-5555-4555-8555-555555555555'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.locals.wsManager = {
    broadcastEventToSession: vi.fn(),
  }
  app.use('/api/notes', notesRoutes)
  return app
}

describe('notes routes', () => {
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
      dmId: DM_ID,
      campaignId: CAMPAIGN_ID,
    })
    mocks.mockResolveEffectiveSessionRole.mockResolvedValue({
      ok: true,
      role: 'PLAYER',
      session: { id: SESSION_ID, dmId: DM_ID },
    })
    mocks.mockGetCampaignForUser.mockResolvedValue({
      id: CAMPAIGN_ID,
      currentDmId: DM_ID,
      memberRole: 'PLAYER',
    })
    mocks.mockListSessionsByCampaign.mockResolvedValue([{ id: SESSION_ID }])
    mocks.mockGetSessionUsers.mockResolvedValue([
      { id: USER_ID, username: 'alice' },
      { id: DM_ID, username: 'dm-user' },
      { id: OTHER_USER_ID, username: 'other-user' },
    ])
    mocks.mockGetVisibleNotes.mockResolvedValue([])
  })

  it('rejects unauthenticated access and invalid list session ids', async () => {
    const app = buildApp()

    mocks.mockExtractTokenFromHeader.mockReturnValueOnce(null)
    let response = await request(app).get(`/api/notes/${SESSION_ID}`)
    expect(response.status).toBe(401)
    expect(response.body.code).toBe(ErrorCode.UNAUTHORIZED)

    response = await request(app).get('/api/notes/not-a-uuid').set('Authorization', 'Bearer token')
    expect(response.status).toBe(400)
    expect(response.body.code).toBe(ErrorCode.INVALID_SESSION)
  })

  it('maps list session missing and authz failures', async () => {
    const app = buildApp()

    mocks.mockGetSession.mockResolvedValueOnce(null)
    let response = await request(app)
      .get(`/api/notes/${SESSION_ID}`)
      .set('Authorization', 'Bearer token')
    expect(response.status).toBe(404)
    expect(response.body.code).toBe(ErrorCode.SESSION_NOT_FOUND)

    mocks.mockResolveEffectiveSessionRole.mockResolvedValueOnce({
      ok: false,
      code: 'FORBIDDEN',
      message: 'No access',
    })
    response = await request(app)
      .get(`/api/notes/${SESSION_ID}`)
      .set('Authorization', 'Bearer token')
    expect(response.status).toBe(403)
    expect(response.body.code).toBe(ErrorCode.FORBIDDEN)
  })

  it('lists visible notes on success', async () => {
    const app = buildApp()
    mocks.mockGetVisibleNotes.mockResolvedValueOnce([{ id: NOTE_ID, title: 'Lore' }])

    const response = await request(app)
      .get(`/api/notes/${SESSION_ID}`)
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body.notes).toEqual([{ id: NOTE_ID, title: 'Lore' }])
  })

  it('validates create payload and DM-only restrictions', async () => {
    const app = buildApp()

    let response = await request(app).post('/api/notes').set('Authorization', 'Bearer token').send({
      campaignId: CAMPAIGN_ID,
      sessionId: 'bad',
      title: 'Valid title',
      content: 'Valid content',
      visibility: NoteVisibility.PLAYERS_VISIBLE,
    })
    expect(response.status).toBe(400)
    expect(response.body.code).toBe(ErrorCode.INVALID_SESSION)

    response = await request(app).post('/api/notes').set('Authorization', 'Bearer token').send({
      campaignId: CAMPAIGN_ID,
      sessionId: SESSION_ID,
      title: '',
      content: 'Valid content',
      visibility: NoteVisibility.PLAYERS_VISIBLE,
    })
    expect(response.status).toBe(400)
    expect(response.body.message).toBe('Invalid note title')

    response = await request(app).post('/api/notes').set('Authorization', 'Bearer token').send({
      campaignId: CAMPAIGN_ID,
      sessionId: SESSION_ID,
      title: 'Valid title',
      content: '',
      visibility: NoteVisibility.PLAYERS_VISIBLE,
    })
    expect(response.status).toBe(400)
    expect(response.body.message).toBe('Invalid note content')

    response = await request(app).post('/api/notes').set('Authorization', 'Bearer token').send({
      campaignId: CAMPAIGN_ID,
      sessionId: SESSION_ID,
      title: 'Valid title',
      content: 'Valid content',
      visibility: 'BAD_VISIBILITY',
    })
    expect(response.status).toBe(400)
    expect(response.body.message).toBe('Invalid note visibility')

    response = await request(app).post('/api/notes').set('Authorization', 'Bearer token').send({
      campaignId: CAMPAIGN_ID,
      sessionId: SESSION_ID,
      title: 'DM Note',
      content: 'Secret',
      visibility: NoteVisibility.DM_ONLY,
    })
    expect(response.status).toBe(403)
    expect(response.body.message).toBe('Only DM may create DM-only notes')
  })

  it('creates notes and sanitizes custom allowed users', async () => {
    const app = buildApp()
    const createdAt = Date.now()
    mocks.mockCreateNote.mockResolvedValueOnce({
      id: NOTE_ID,
      sessionId: SESSION_ID,
      authorId: USER_ID,
      authorUsername: 'alice',
      title: 'Custom Note',
      content: 'For selected users',
      visibility: NoteVisibility.CUSTOM,
      tags: ['lore'],
      allowedUsers: [OTHER_USER_ID],
      createdAt,
      updatedAt: createdAt,
    })

    const response = await request(app)
      .post('/api/notes')
      .set('Authorization', 'Bearer token')
      .send({
        campaignId: CAMPAIGN_ID,
        sessionId: SESSION_ID,
        title: 'Custom Note',
        content: 'For selected users',
        visibility: NoteVisibility.CUSTOM,
        tags: ['lore', 'bad tag!'],
        allowedUsers: [OTHER_USER_ID, 'not-a-uuid'],
      })

    expect(response.status).toBe(201)
    expect(mocks.mockCreateNote).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        allowedUsers: [OTHER_USER_ID],
        tags: ['lore'],
      })
    )
    expect(mocks.mockAppendSessionAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        actionType: 'NOTES.CREATED',
        targetType: 'NOTE',
        targetId: NOTE_ID,
      })
    )
    expect((app.locals.wsManager.broadcastEventToSession as any).mock.calls[0][1].type).toBe(
      'NOTES:CREATED'
    )
  })

  it('maps update validation and missing-resource branches', async () => {
    const app = buildApp()

    let response = await request(app)
      .put('/api/notes/not-a-uuid')
      .set('Authorization', 'Bearer token')
      .send({
        title: 'Updated',
      })
    expect(response.status).toBe(400)
    expect(response.body.code).toBe(ErrorCode.INVALID_NOTE_ID)

    response = await request(app)
      .put(`/api/notes/${NOTE_ID}`)
      .set('Authorization', 'Bearer token')
      .send({
        title: '',
      })
    expect(response.status).toBe(400)
    expect(response.body.message).toBe('Invalid note title')

    mocks.mockGetNoteById.mockResolvedValueOnce(null)
    response = await request(app)
      .put(`/api/notes/${NOTE_ID}`)
      .set('Authorization', 'Bearer token')
      .send({
        title: 'Updated',
      })
    expect(response.status).toBe(404)
    expect(response.body.code).toBe(ErrorCode.NOTE_NOT_FOUND)

    mocks.mockGetNoteById.mockResolvedValueOnce({ id: NOTE_ID, sessionId: SESSION_ID })
    mocks.mockGetSession.mockResolvedValueOnce(null)
    response = await request(app)
      .put(`/api/notes/${NOTE_ID}`)
      .set('Authorization', 'Bearer token')
      .send({
        title: 'Updated',
      })
    expect(response.status).toBe(404)
    expect(response.body.code).toBe(ErrorCode.SESSION_NOT_FOUND)
  })

  it('maps update authz and service error branches', async () => {
    const app = buildApp()
    mocks.mockGetNoteById.mockResolvedValue({
      id: NOTE_ID,
      sessionId: SESSION_ID,
      authorId: USER_ID,
      allowedUsers: [],
    })

    mocks.mockResolveEffectiveSessionRole.mockResolvedValueOnce({
      ok: false,
      code: 'FORBIDDEN',
      message: 'No access',
    })
    let response = await request(app)
      .put(`/api/notes/${NOTE_ID}`)
      .set('Authorization', 'Bearer token')
      .send({
        title: 'Updated',
      })
    expect(response.status).toBe(403)
    expect(response.body.code).toBe(ErrorCode.FORBIDDEN)

    mocks.mockResolveEffectiveSessionRole.mockResolvedValueOnce({
      ok: true,
      role: 'PLAYER',
      session: { id: SESSION_ID, dmId: DM_ID },
    })
    response = await request(app)
      .put(`/api/notes/${NOTE_ID}`)
      .set('Authorization', 'Bearer token')
      .send({
        visibility: NoteVisibility.DM_ONLY,
      })
    expect(response.status).toBe(403)
    expect(response.body.message).toBe('Only DM may set DM-only visibility')

    mocks.mockUpdateNote.mockRejectedValueOnce({
      code: 'VISIBILITY_CONSTRAINT',
      message: 'Cannot narrow visibility',
    })
    response = await request(app)
      .put(`/api/notes/${NOTE_ID}`)
      .set('Authorization', 'Bearer token')
      .send({
        title: 'Updated',
      })
    expect(response.status).toBe(409)
    expect(response.body.code).toBe(ErrorCode.CONFLICT)

    mocks.mockUpdateNote.mockRejectedValueOnce(new Error('boom'))
    response = await request(app)
      .put(`/api/notes/${NOTE_ID}`)
      .set('Authorization', 'Bearer token')
      .send({
        title: 'Updated',
      })
    expect(response.status).toBe(500)
    expect(response.body.code).toBe(ErrorCode.INTERNAL_ERROR)

    mocks.mockUpdateNote.mockResolvedValueOnce(null)
    response = await request(app)
      .put(`/api/notes/${NOTE_ID}`)
      .set('Authorization', 'Bearer token')
      .send({
        title: 'Updated',
      })
    expect(response.status).toBe(403)
    expect(response.body.code).toBe(ErrorCode.FORBIDDEN)
  })

  it('updates notes and handles post-update missing session', async () => {
    const app = buildApp()
    const updatedAt = Date.now()
    const updatedNote = {
      id: NOTE_ID,
      sessionId: SESSION_ID,
      authorId: USER_ID,
      title: 'Updated',
      content: 'Updated content',
      visibility: NoteVisibility.CUSTOM,
      tags: ['lore'],
      allowedUsers: [OTHER_USER_ID],
      updatedAt,
    }

    mocks.mockGetNoteById.mockResolvedValue({
      id: NOTE_ID,
      sessionId: SESSION_ID,
      authorId: USER_ID,
    })
    mocks.mockUpdateNote.mockResolvedValueOnce(updatedNote)
    mocks.mockGetSession.mockResolvedValueOnce({ id: SESSION_ID, dmId: DM_ID })
    mocks.mockGetSession.mockResolvedValueOnce(null)

    let response = await request(app)
      .put(`/api/notes/${NOTE_ID}`)
      .set('Authorization', 'Bearer token')
      .send({
        title: 'Updated',
        allowedUsers: [OTHER_USER_ID],
        visibility: NoteVisibility.CUSTOM,
      })
    expect(response.status).toBe(404)
    expect(response.body.code).toBe(ErrorCode.SESSION_NOT_FOUND)

    mocks.mockUpdateNote.mockResolvedValueOnce(updatedNote)
    mocks.mockGetSession.mockResolvedValueOnce({ id: SESSION_ID, dmId: DM_ID })
    mocks.mockGetSession.mockResolvedValueOnce({ id: SESSION_ID, dmId: DM_ID })
    response = await request(app)
      .put(`/api/notes/${NOTE_ID}`)
      .set('Authorization', 'Bearer token')
      .send({
        title: 'Updated',
        allowedUsers: [OTHER_USER_ID],
        visibility: NoteVisibility.CUSTOM,
      })
    expect(response.status).toBe(200)
    expect(mocks.mockAppendSessionAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        actionType: 'NOTES.UPDATED',
        targetType: 'NOTE',
        targetId: NOTE_ID,
      })
    )
    expect((app.locals.wsManager.broadcastEventToSession as any).mock.calls.at(-1)[1].type).toBe(
      'NOTES:UPDATED'
    )
  })

  it('maps publish validation, visibility, and persistence branches', async () => {
    const app = buildApp()

    let response = await request(app)
      .post('/api/notes/not-a-uuid/publish')
      .set('Authorization', 'Bearer token')
    expect(response.status).toBe(400)
    expect(response.body.code).toBe(ErrorCode.INVALID_NOTE_ID)

    mocks.mockGetNoteById.mockResolvedValueOnce(null)
    response = await request(app)
      .post(`/api/notes/${NOTE_ID}/publish`)
      .set('Authorization', 'Bearer token')
    expect(response.status).toBe(404)
    expect(response.body.code).toBe(ErrorCode.NOTE_NOT_FOUND)

    const note = {
      id: NOTE_ID,
      sessionId: SESSION_ID,
      authorId: USER_ID,
      authorUsername: 'alice',
      title: 'Recap',
      content: 'Visible note',
      visibility: NoteVisibility.CUSTOM,
      tags: [],
      allowedUsers: [OTHER_USER_ID],
    }

    mocks.mockGetNoteById.mockResolvedValueOnce(note)
    mocks.mockGetSession.mockResolvedValueOnce(null)
    response = await request(app)
      .post(`/api/notes/${NOTE_ID}/publish`)
      .set('Authorization', 'Bearer token')
    expect(response.status).toBe(404)
    expect(response.body.code).toBe(ErrorCode.SESSION_NOT_FOUND)

    mocks.mockGetNoteById.mockResolvedValueOnce(note)
    mocks.mockGetSession.mockResolvedValueOnce({
      id: SESSION_ID,
      dmId: DM_ID,
      campaignId: 'campaign-1',
    })
    mocks.mockResolveEffectiveSessionRole.mockResolvedValueOnce({
      ok: false,
      code: 'FORBIDDEN',
      message: 'No access',
    })
    response = await request(app)
      .post(`/api/notes/${NOTE_ID}/publish`)
      .set('Authorization', 'Bearer token')
    expect(response.status).toBe(403)
    expect(response.body.code).toBe(ErrorCode.FORBIDDEN)

    mocks.mockGetNoteById.mockResolvedValueOnce(note)
    mocks.mockGetSession.mockResolvedValueOnce({
      id: SESSION_ID,
      dmId: DM_ID,
      campaignId: 'campaign-1',
    })
    mocks.mockGetVisibleNotes.mockResolvedValueOnce([])
    response = await request(app)
      .post(`/api/notes/${NOTE_ID}/publish`)
      .set('Authorization', 'Bearer token')
    expect(response.status).toBe(404)
    expect(response.body.code).toBe(ErrorCode.NOTE_NOT_FOUND)

    mocks.mockGetNoteById.mockResolvedValueOnce(note)
    mocks.mockGetSession.mockResolvedValueOnce({
      id: SESSION_ID,
      dmId: DM_ID,
      campaignId: 'campaign-1',
    })
    mocks.mockGetVisibleNotes.mockResolvedValueOnce([note])
    mocks.mockMarkNotePublished.mockResolvedValueOnce(null)
    response = await request(app)
      .post(`/api/notes/${NOTE_ID}/publish`)
      .set('Authorization', 'Bearer token')
    expect(response.status).toBe(404)
    expect(response.body.code).toBe(ErrorCode.NOTE_NOT_FOUND)
  })

  it('publishes notes with truncated snippets and chat broadcast', async () => {
    const app = buildApp()
    const longContent = 'x'.repeat(NOTE_PUBLISH_SNIPPET_MAX_LENGTH + 20)
    const publishedAt = Date.now()
    const note = {
      id: NOTE_ID,
      sessionId: SESSION_ID,
      authorId: USER_ID,
      authorUsername: 'alice',
      title: 'Recap',
      content: longContent,
      visibility: NoteVisibility.CUSTOM,
      tags: [],
      allowedUsers: [OTHER_USER_ID],
      updatedAt: publishedAt,
    }
    const message = {
      id: '66666666-6666-4666-8666-666666666666',
      sessionId: SESSION_ID,
      authorId: USER_ID,
      authorUsername: 'alice',
      content: 'placeholder',
      type: MessageType.SYSTEM,
      isDmOnly: false,
      createdAt: publishedAt,
    }

    mocks.mockGetNoteById.mockResolvedValueOnce(note)
    mocks.mockGetSession.mockResolvedValueOnce({
      id: SESSION_ID,
      dmId: DM_ID,
      campaignId: 'campaign-1',
    })
    mocks.mockGetVisibleNotes.mockResolvedValueOnce([note])
    mocks.mockMarkNotePublished.mockResolvedValueOnce({ ...note, publishedAt })
    mocks.mockSendMessage.mockResolvedValueOnce(message)

    const response = await request(app)
      .post(`/api/notes/${NOTE_ID}/publish`)
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(mocks.mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining(`[Note Shared] Recap`),
      })
    )
    expect(mocks.mockAppendSessionAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        actionType: 'NOTES.PUBLISHED',
        targetType: 'NOTE',
        targetId: NOTE_ID,
      })
    )
    expect((app.locals.wsManager.broadcastEventToSession as any).mock.calls.at(-1)[1].type).toBe(
      'CHAT:MESSAGE_SENT'
    )
  })

  it('maps delete validation and permission branches and deletes successfully', async () => {
    const app = buildApp()

    let response = await request(app)
      .delete('/api/notes/not-a-uuid')
      .set('Authorization', 'Bearer token')
    expect(response.status).toBe(400)
    expect(response.body.code).toBe(ErrorCode.INVALID_NOTE_ID)

    mocks.mockGetNoteById.mockResolvedValueOnce(null)
    response = await request(app)
      .delete(`/api/notes/${NOTE_ID}`)
      .set('Authorization', 'Bearer token')
    expect(response.status).toBe(404)
    expect(response.body.code).toBe(ErrorCode.NOTE_NOT_FOUND)

    mocks.mockGetNoteById.mockResolvedValueOnce({ id: NOTE_ID, sessionId: SESSION_ID })
    mocks.mockResolveEffectiveSessionRole.mockResolvedValueOnce({
      ok: false,
      code: 'FORBIDDEN',
      message: 'No access',
    })
    response = await request(app)
      .delete(`/api/notes/${NOTE_ID}`)
      .set('Authorization', 'Bearer token')
    expect(response.status).toBe(403)
    expect(response.body.code).toBe(ErrorCode.FORBIDDEN)

    mocks.mockGetNoteById.mockResolvedValueOnce({ id: NOTE_ID, sessionId: SESSION_ID })
    mocks.mockDeleteNote.mockResolvedValueOnce(null)
    response = await request(app)
      .delete(`/api/notes/${NOTE_ID}`)
      .set('Authorization', 'Bearer token')
    expect(response.status).toBe(403)
    expect(response.body.code).toBe(ErrorCode.FORBIDDEN)

    mocks.mockGetNoteById.mockResolvedValueOnce({ id: NOTE_ID, sessionId: SESSION_ID })
    mocks.mockDeleteNote.mockResolvedValueOnce({ id: NOTE_ID, sessionId: SESSION_ID })
    response = await request(app)
      .delete(`/api/notes/${NOTE_ID}`)
      .set('Authorization', 'Bearer token')
    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(mocks.mockAppendSessionAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        actionType: 'NOTES.DELETED',
        targetType: 'NOTE',
        targetId: NOTE_ID,
      })
    )
    expect((app.locals.wsManager.broadcastEventToSession as any).mock.calls.at(-1)[1].type).toBe(
      'NOTES:DELETED'
    )
  })
})
