import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockExtractTokenFromHeader: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockSessionFindUnique: vi.fn(),
  mockSessionLogFindMany: vi.fn(),
  mockSessionLogCount: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: mocks.mockExtractTokenFromHeader,
  verifyToken: mocks.mockVerifyToken,
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    session: {
      findUnique: mocks.mockSessionFindUnique,
    },
    sessionLog: {
      findMany: mocks.mockSessionLogFindMany,
      count: mocks.mockSessionLogCount,
    },
  }),
}))

import metadataRoutes from '../../src/api/metadata.routes'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/metadata', metadataRoutes)
  return app
}

describe('metadata routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockExtractTokenFromHeader.mockReturnValue('token')
    mocks.mockVerifyToken.mockReturnValue({
      userId: USER_ID,
      username: 'player-one',
      role: 'PLAYER',
    })
  })

  it('requires authentication', async () => {
    const app = buildApp()
    mocks.mockExtractTokenFromHeader.mockReturnValueOnce(null)

    const response = await request(app).get(`/api/metadata/${SESSION_ID}`)

    expect(response.status).toBe(401)
    expect(response.body.code).toBe('UNAUTHORIZED')
  })

  it('returns metadata snapshot for session members', async () => {
    const app = buildApp()

    mocks.mockSessionFindUnique.mockResolvedValueOnce({
      id: SESSION_ID,
      name: 'Into the Mists',
      description: 'Fog-heavy exploration',
      state: 'ACTIVE',
      dmId: '33333333-3333-4333-8333-333333333333',
      createdAt: new Date('2026-05-01T10:00:00.000Z'),
      updatedAt: new Date('2026-05-01T12:00:00.000Z'),
      campaign: {
        id: '44444444-4444-4444-8444-444444444444',
        name: 'Misty Vale',
      },
      members: [{ id: 'member-1' }],
      _count: {
        messages: 9,
        notes: 4,
        members: 3,
        rooms: 2,
        presence: 3,
        logs: 7,
      },
    })

    const response = await request(app)
      .get(`/api/metadata/${SESSION_ID}`)
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body.snapshot.sessionId).toBe(SESSION_ID)
    expect(response.body.snapshot.title).toBe('Into the Mists')
    expect(response.body.snapshot.stats).toMatchObject({
      messageCount: 9,
      noteCount: 4,
      eventCount: 7,
    })
  })

  it('returns forbidden for non-members', async () => {
    const app = buildApp()

    mocks.mockSessionFindUnique.mockResolvedValueOnce({
      id: SESSION_ID,
      name: 'Into the Mists',
      description: null,
      state: 'ACTIVE',
      dmId: '55555555-5555-4555-8555-555555555555',
      createdAt: new Date('2026-05-01T10:00:00.000Z'),
      updatedAt: new Date('2026-05-01T12:00:00.000Z'),
      campaign: null,
      members: [],
      _count: {
        messages: 0,
        notes: 0,
        members: 0,
        rooms: 0,
        presence: 0,
        logs: 0,
      },
    })

    const response = await request(app)
      .get(`/api/metadata/${SESSION_ID}`)
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FORBIDDEN')
  })

  it('returns timeline entries with pagination metadata', async () => {
    const app = buildApp()

    mocks.mockSessionFindUnique.mockResolvedValueOnce({
      id: SESSION_ID,
      name: 'Into the Mists',
      description: null,
      state: 'ACTIVE',
      dmId: '55555555-5555-4555-8555-555555555555',
      createdAt: new Date('2026-05-01T10:00:00.000Z'),
      updatedAt: new Date('2026-05-01T12:00:00.000Z'),
      campaign: null,
      members: [{ id: 'member-1' }],
      _count: {
        messages: 0,
        notes: 0,
        members: 1,
        rooms: 0,
        presence: 1,
        logs: 7,
      },
    })

    mocks.mockSessionLogFindMany.mockResolvedValueOnce([
      {
        id: 'log-1',
        sessionId: SESSION_ID,
        userId: USER_ID,
        username: 'player-one',
        eventType: 'JOINED',
        detail: 'player-one joined the session',
        createdAt: new Date('2026-05-01T12:30:00.000Z'),
      },
    ])
    mocks.mockSessionLogCount.mockResolvedValueOnce(7)

    const response = await request(app)
      .get(`/api/metadata/${SESSION_ID}/timeline?limit=10&offset=2`)
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body.total).toBe(7)
    expect(response.body.limit).toBe(10)
    expect(response.body.offset).toBe(2)
    expect(response.body.timeline).toHaveLength(1)
    expect(response.body.timeline[0]).toMatchObject({
      id: 'log-1',
      eventType: 'JOINED',
      action: 'participant_joined',
    })
  })
})
