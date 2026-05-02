import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockExtractTokenFromHeader: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockGetSession: vi.fn(),
  mockIsUserInSession: vi.fn(),
  mockSetRoomEnvironmentState: vi.fn(),
  mockApplyDMOverrideState: vi.fn(),
  mockRemoveDMOverrideState: vi.fn(),
  mockGetSessionAudioState: vi.fn(),
  mockBroadcastToSession: vi.fn(),
  mockLoggerInfo: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: mocks.mockExtractTokenFromHeader,
  verifyToken: mocks.mockVerifyToken,
}))

vi.mock('@/services/session.service', () => ({
  getSession: mocks.mockGetSession,
  isUserInSession: mocks.mockIsUserInSession,
}))

vi.mock('@/services/audio-state.service', () => ({
  setRoomEnvironmentState: mocks.mockSetRoomEnvironmentState,
  applyDMOverrideState: mocks.mockApplyDMOverrideState,
  removeDMOverrideState: mocks.mockRemoveDMOverrideState,
  getSessionAudioState: mocks.mockGetSessionAudioState,
}))

vi.mock('@/services/event-broadcaster.service', () => ({
  default: {
    broadcastToSession: mocks.mockBroadcastToSession,
  },
}))

vi.mock('@/utils', () => ({
  logger: {
    info: mocks.mockLoggerInfo,
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import audioRoutes from '@/api/audio.routes'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const ROOM_ID = '22222222-2222-4222-8222-222222222222'
const DM_ID = '33333333-3333-4333-8333-333333333333'
const PLAYER_ID = '44444444-4444-4444-8444-444444444444'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/audio', audioRoutes)
  return app
}

describe('audio routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.mockExtractTokenFromHeader.mockReturnValue('token')
    mocks.mockVerifyToken.mockReturnValue({
      userId: DM_ID,
      username: 'dm-user',
      role: 'DM',
    })

    mocks.mockGetSession.mockResolvedValue({
      id: SESSION_ID,
      name: 'Session 1',
      dmId: DM_ID,
      state: 'ACTIVE',
      createdAt: Date.now(),
    })

    mocks.mockIsUserInSession.mockResolvedValue(true)
    mocks.mockSetRoomEnvironmentState.mockResolvedValue({
      roomId: ROOM_ID,
      environmentName: 'tavern',
      environmentId: 'env-tavern',
      parameters: { reverbSend: 0.35, lowpassFreq: 7200, roomGain: -2 },
      setBy: DM_ID,
      setAt: 1700000000000,
    })
    mocks.mockApplyDMOverrideState.mockResolvedValue({
      targetUserId: PLAYER_ID,
      overrideType: 'MUTE',
      parameters: {},
      appliedBy: DM_ID,
      appliedAt: 1700000000100,
    })
    mocks.mockRemoveDMOverrideState.mockResolvedValue(undefined)
    mocks.mockGetSessionAudioState.mockResolvedValue({
      sessionId: SESSION_ID,
      environments: [],
      dmOverrides: [],
    })
  })

  it('returns audio presets for authenticated users', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/audio/presets')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(Array.isArray(response.body.presets)).toBe(true)
    expect(response.body.presets.length).toBeGreaterThan(0)
  })

  it('applies environment preset as DM and emits AUDIO:ENVIRONMENT_SET', async () => {
    const app = buildApp()

    const response = await request(app)
      .post('/api/audio/environment')
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        environmentName: 'tavern',
        parameters: { reverbSend: 0.35, lowpassFreq: 7200, roomGain: -2 },
      })

    expect(response.status).toBe(200)
    expect(mocks.mockBroadcastToSession).toHaveBeenCalledTimes(1)

    const [sessionIdArg, event] = mocks.mockBroadcastToSession.mock.calls[0]
    expect(sessionIdArg).toBe(SESSION_ID)
    expect(event.type).toBe('AUDIO:ENVIRONMENT_SET')
    expect(event.payload.environmentName).toBe('tavern')
    expect(mocks.mockSetRoomEnvironmentState).toHaveBeenCalledTimes(1)
  })

  it('denies environment changes for non-DM users', async () => {
    const app = buildApp()

    mocks.mockVerifyToken.mockReturnValue({
      userId: PLAYER_ID,
      username: 'alice',
      role: 'PLAYER',
    })

    const response = await request(app)
      .post('/api/audio/environment')
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        environmentName: 'cave',
      })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FORBIDDEN')
    expect(mocks.mockBroadcastToSession).not.toHaveBeenCalled()
  })

  it('applies DM override and emits AUDIO:DM_OVERRIDE_APPLIED', async () => {
    const app = buildApp()

    const response = await request(app)
      .post('/api/audio/dm-override/apply')
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        targetUserId: PLAYER_ID,
        overrideType: 'MUTE',
      })

    expect(response.status).toBe(200)
    const [, event] = mocks.mockBroadcastToSession.mock.calls[0]
    expect(event.type).toBe('AUDIO:DM_OVERRIDE_APPLIED')
    expect(event.payload.targetUserId).toBe(PLAYER_ID)
    expect(event.payload.overrideType).toBe('MUTE')
    expect(mocks.mockApplyDMOverrideState).toHaveBeenCalledTimes(1)
  })

  it('removes DM override and emits AUDIO:DM_OVERRIDE_REMOVED', async () => {
    const app = buildApp()

    const response = await request(app)
      .post('/api/audio/dm-override/remove')
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        targetUserId: PLAYER_ID,
        overrideType: 'MUTE',
      })

    expect(response.status).toBe(200)
    const [, event] = mocks.mockBroadcastToSession.mock.calls[0]
    expect(event.type).toBe('AUDIO:DM_OVERRIDE_REMOVED')
    expect(event.payload.targetUserId).toBe(PLAYER_ID)
    expect(event.payload.overrideType).toBe('MUTE')
    expect(mocks.mockRemoveDMOverrideState).toHaveBeenCalledTimes(1)
  })
})
