import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  extractTokenFromHeader: vi.fn(),
  verifyToken: vi.fn(),
  resolveEffectiveSessionRole: vi.fn(),
  getServerMuteEnforcementState: vi.fn(),
  generateToken: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: mocks.extractTokenFromHeader,
  verifyToken: mocks.verifyToken,
}))

vi.mock('@/services/session/authz.service', () => ({
  resolveEffectiveSessionRole: mocks.resolveEffectiveSessionRole,
}))

vi.mock('@/services/audio/audio-state', () => ({
  getServerMuteEnforcementState: mocks.getServerMuteEnforcementState,
}))

vi.mock('@/infra/livekit/token.service', () => ({
  LiveKitTokenService: vi.fn().mockImplementation(function LiveKitTokenServiceMock() {
    return {
      generateToken: mocks.generateToken,
    }
  }),
}))

vi.mock('@/utils', () => ({
  logger: {
    info: mocks.loggerInfo,
    error: mocks.loggerError,
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

import livekitRoutes from '@/api/livekit.routes'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const ROOM_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/livekit', livekitRoutes)
  return app
}

describe('livekit routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.extractTokenFromHeader.mockReturnValue('token')
    mocks.verifyToken.mockReturnValue({
      userId: USER_ID,
      username: 'player',
      role: 'PLAYER',
    })
    mocks.resolveEffectiveSessionRole.mockResolvedValue({
      ok: true,
      role: 'PLAYER',
      session: { id: SESSION_ID, dmId: 'dm-id' },
    })
    mocks.getServerMuteEnforcementState.mockResolvedValue({
      userMuted: false,
      dmMuted: false,
      enforcedMuted: false,
    })
    mocks.generateToken.mockResolvedValue('livekit-token')
  })

  it('returns 401 for missing auth token', async () => {
    const app = buildApp()
    mocks.extractTokenFromHeader.mockReturnValue(undefined)

    const response = await request(app).post('/api/livekit/token').send({})

    expect(response.status).toBe(401)
    expect(response.body.code).toBe('UNAUTHORIZED')
  })

  it('returns 400 for invalid sessionId', async () => {
    const app = buildApp()

    const response = await request(app)
      .post('/api/livekit/token')
      .set('Authorization', 'Bearer token')
      .send({ sessionId: 'bad', roomId: ROOM_ID })

    expect(response.status).toBe(400)
    expect(response.body.field).toBe('sessionId')
  })

  it('returns 400 for invalid roomId', async () => {
    const app = buildApp()

    const response = await request(app)
      .post('/api/livekit/token')
      .set('Authorization', 'Bearer token')
      .send({ sessionId: SESSION_ID, roomId: 'bad' })

    expect(response.status).toBe(400)
    expect(response.body.field).toBe('roomId')
  })

  it('returns 403 when user is not in session and is not admin', async () => {
    const app = buildApp()
    mocks.resolveEffectiveSessionRole.mockResolvedValue({
      ok: false,
      code: 'FORBIDDEN',
      message: 'You are not a member of this session',
    })

    const response = await request(app)
      .post('/api/livekit/token')
      .set('Authorization', 'Bearer token')
      .send({ sessionId: SESSION_ID, roomId: ROOM_ID })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FORBIDDEN')
  })

  it('issues token for authorized session user', async () => {
    const app = buildApp()

    const response = await request(app)
      .post('/api/livekit/token')
      .set('Authorization', 'Bearer token')
      .send({ sessionId: SESSION_ID, roomId: ROOM_ID })

    expect(response.status).toBe(200)
    expect(response.body.token).toBe('livekit-token')
    expect(response.body.roomName).toBe(ROOM_ID)
    expect(response.body.canPublish).toBe(true)
    expect(response.body.muteEnforced).toBe(false)
    expect(mocks.generateToken).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: ROOM_ID,
        userId: USER_ID,
        sessionId: SESSION_ID,
        canPublish: true,
        canSubscribe: true,
      })
    )
  })

  it('disables publish grant when backend mute enforcement is active', async () => {
    const app = buildApp()
    mocks.getServerMuteEnforcementState.mockResolvedValue({
      userMuted: true,
      dmMuted: false,
      enforcedMuted: true,
    })

    const response = await request(app)
      .post('/api/livekit/token')
      .set('Authorization', 'Bearer token')
      .send({ sessionId: SESSION_ID, roomId: ROOM_ID })

    expect(response.status).toBe(200)
    expect(response.body.canPublish).toBe(false)
    expect(response.body.muteEnforced).toBe(true)
    expect(mocks.generateToken).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: ROOM_ID,
        userId: USER_ID,
        sessionId: SESSION_ID,
        canPublish: false,
        canSubscribe: true,
      })
    )
  })

  it('returns health status for configured livekit url', async () => {
    const app = buildApp()

    const response = await request(app).get('/api/livekit/health')

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('healthy')
    expect(typeof response.body.url).toBe('string')
  })
})
