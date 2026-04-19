import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockExtractTokenFromHeader: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockGetSession: vi.fn(),
  mockGetSessionUsers: vi.fn(),
  mockGetSessionPresence: vi.fn(),
  mockGetRooms: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: mocks.mockExtractTokenFromHeader,
  verifyToken: mocks.mockVerifyToken,
}))

vi.mock('@/services/session.service', () => ({
  getSession: mocks.mockGetSession,
  getSessionUsers: mocks.mockGetSessionUsers,
}))

vi.mock('@/core/rooms/room.service', () => ({
  ensurePresenceRecoveredFromSnapshots: vi.fn(),
  getSessionPresence: mocks.mockGetSessionPresence,
  getRoom: vi.fn(),
  joinRoom: vi.fn(),
  snapshotSessionPresence: vi.fn(),
  updatePresenceState: vi.fn(),
  createRoom: vi.fn(),
  getRoomMemberIds: vi.fn(),
  getRooms: mocks.mockGetRooms,
  leaveRoom: vi.fn(),
}))

import presenceRoutes from '../../src/api/presence.routes'
import roomsRoutes from '../../src/api/rooms.routes'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_ID = '33333333-3333-4333-8333-333333333333'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/presence', presenceRoutes)
  app.use('/api/rooms', roomsRoutes)
  return app
}

describe('presence/rooms authz', () => {
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
      name: 'Session',
      dmId: OTHER_ID,
      state: 'ACTIVE',
      createdAt: Date.now(),
    })

    mocks.mockGetSessionPresence.mockResolvedValue([])
    mocks.mockGetRooms.mockResolvedValue([])
  })

  it('denies non-members from reading session presence', async () => {
    const app = buildApp()
    mocks.mockGetSessionUsers.mockResolvedValue([{ id: OTHER_ID, username: 'bob', role: 'PLAYER' }])

    const response = await request(app)
      .get(`/api/presence/${SESSION_ID}`)
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FORBIDDEN')
  })

  it('allows members to read rooms and presence', async () => {
    const app = buildApp()
    mocks.mockGetSessionUsers.mockResolvedValue([
      { id: USER_ID, username: 'alice', role: 'PLAYER' },
    ])

    const presenceResponse = await request(app)
      .get(`/api/presence/${SESSION_ID}`)
      .set('Authorization', 'Bearer token')

    const roomsResponse = await request(app)
      .get(`/api/rooms/${SESSION_ID}`)
      .set('Authorization', 'Bearer token')

    expect(presenceResponse.status).toBe(200)
    expect(roomsResponse.status).toBe(200)
  })
})
