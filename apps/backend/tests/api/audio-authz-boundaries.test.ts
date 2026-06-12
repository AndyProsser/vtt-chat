/**
 * W2: Non-functional authz boundary checks for high-risk paths
 *
 * Explicit guardrail assertions for authorization boundaries that protect
 * the in-session control surfaces. Tests focus on invariants that must hold
 * regardless of other route-level changes:
 *
 *  - All session-scoped endpoints reject missing or invalid tokens with 401
 *  - Spectator-role callers cannot invoke DM-only audio control endpoints
 *  - Non-members cannot access session audio state (cross-session access)
 *  - DM-only audio endpoints reject PLAYER and SPECTATOR roles consistently
 *  - Session not found returns 404 (not 403) to prevent information leakage
 *    about valid session IDs through role-based error codes
 *
 * These are non-functional tests: they exercise security invariants, not
 * happy-path business logic.
 */

import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockExtractTokenFromHeader: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockResolveEffectiveSessionRole: vi.fn(),
  mockSetRoomEnvironmentState: vi.fn(),
  mockApplyDMOverrideState: vi.fn(),
  mockRemoveDMOverrideState: vi.fn(),
  mockGetSessionAudioState: vi.fn(),
  mockBroadcastToSession: vi.fn(),
  mockSetBroadcastState: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: mocks.mockExtractTokenFromHeader,
  verifyToken: mocks.mockVerifyToken,
}))

vi.mock('@/services/session/authz.service', () => ({
  resolveEffectiveSessionRole: mocks.mockResolveEffectiveSessionRole,
}))

vi.mock('@/services/audio/audio-state', () => ({
  setRoomEnvironmentState: mocks.mockSetRoomEnvironmentState,
  applyDMOverrideState: mocks.mockApplyDMOverrideState,
  removeDMOverrideState: mocks.mockRemoveDMOverrideState,
  getSessionAudioState: mocks.mockGetSessionAudioState,
  setBroadcastState: mocks.mockSetBroadcastState,
}))

vi.mock('@/ws/event-broadcaster', () => ({
  default: { broadcastToSession: mocks.mockBroadcastToSession },
}))

vi.mock('@/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import audioRoutes from '@/api/audio.routes'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const ROOM_ID = '22222222-2222-4222-8222-222222222222'
const DM_ID = '33333333-3333-4333-8333-333333333333'
const PLAYER_ID = '44444444-4444-4444-8444-444444444444'
const SPECTATOR_ID = '55555555-5555-4555-8555-555555555555'
const OUTSIDER_ID = '66666666-6666-4666-8666-666666666666'

const SESSION_ACTIVE = {
  id: SESSION_ID,
  name: 'Session 1',
  dmId: DM_ID,
  state: 'ACTIVE',
  createdAt: Date.now(),
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/audio', audioRoutes)
  return app
}

/** Shared authz result builders */
function dmRole() {
  return { ok: true as const, role: 'DM' as any, session: SESSION_ACTIVE }
}
function playerRole() {
  return { ok: true as const, role: 'PLAYER' as any, session: SESSION_ACTIVE }
}
function spectatorRole() {
  return { ok: true as const, role: 'SPECTATOR' as any, session: SESSION_ACTIVE }
}
function sessionNotFound() {
  return { ok: false as const, code: 'SESSION_NOT_FOUND', message: 'Session not found' }
}
function notMember() {
  return { ok: false as const, code: 'NOT_A_MEMBER', message: 'Not a session member' }
}

/** The DM-only mutation endpoints (POST routes that require DM role) */
const DM_ONLY_ENDPOINTS = [
  {
    method: 'POST',
    path: '/api/audio/environment',
    body: { sessionId: SESSION_ID, roomId: ROOM_ID, environmentName: 'cave' },
    label: 'POST /audio/environment',
  },
  {
    method: 'POST',
    path: '/api/audio/dm-override/apply',
    body: { sessionId: SESSION_ID, targetUserId: PLAYER_ID, overrideType: 'MUTE' },
    label: 'POST /audio/dm-override/apply',
  },
  {
    method: 'POST',
    path: '/api/audio/dm-override/remove',
    body: { sessionId: SESSION_ID, targetUserId: PLAYER_ID, overrideType: 'MUTE' },
    label: 'POST /audio/dm-override/remove',
  },
  {
    method: 'POST',
    path: '/api/audio/broadcast',
    body: { sessionId: SESSION_ID, enabled: true },
    label: 'POST /audio/broadcast',
  },
]

/** All session-scoped audio endpoints (require authentication) */
const ALL_ENDPOINTS = [
  ...DM_ONLY_ENDPOINTS,
  {
    method: 'GET',
    path: `/api/audio/state/${SESSION_ID}`,
    body: undefined,
    label: `GET /audio/state/:sessionId`,
  },
]

describe('audio routes — authz boundary guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockExtractTokenFromHeader.mockReturnValue('token')
    mocks.mockVerifyToken.mockReturnValue({
      userId: DM_ID,
      username: 'gm',
      role: 'DM',
    })
    mocks.mockResolveEffectiveSessionRole.mockResolvedValue(dmRole())
    mocks.mockSetRoomEnvironmentState.mockResolvedValue({
      roomId: ROOM_ID,
      environmentName: 'cave',
      environmentId: 'env-cave',
      parameters: {},
      setBy: DM_ID,
      setAt: Date.now(),
    })
    mocks.mockApplyDMOverrideState.mockResolvedValue({
      targetUserId: PLAYER_ID,
      overrideType: 'MUTE',
      parameters: {},
      appliedBy: DM_ID,
      appliedAt: Date.now(),
    })
    mocks.mockRemoveDMOverrideState.mockResolvedValue(undefined)
    mocks.mockGetSessionAudioState.mockResolvedValue({
      sessionId: SESSION_ID,
      environments: [],
      dmOverrides: [],
      broadcast: { enabled: false },
      voiceOfGod: { enabled: false },
    })
    mocks.mockSetBroadcastState.mockResolvedValue({ enabled: true, dmId: DM_ID })
  })

  // ── 401: Missing / invalid token on all session-scoped endpoints ─────────────

  describe('401: unauthenticated access rejected on all session-scoped endpoints', () => {
    for (const ep of ALL_ENDPOINTS) {
      it(`${ep.label} returns 401 when no Authorization header`, async () => {
        mocks.mockExtractTokenFromHeader.mockReturnValue(null)
        const app = buildApp()
        const req = request(app)[ep.method.toLowerCase() as 'get' | 'post'](ep.path)
        if (ep.body) req.send(ep.body)
        const res = await req
        expect(res.status).toBe(401)
        expect(res.body.code).toBe('UNAUTHORIZED')
      })

      it(`${ep.label} returns 401 when token is invalid/expired`, async () => {
        mocks.mockExtractTokenFromHeader.mockReturnValue('invalid.token.here')
        mocks.mockVerifyToken.mockReturnValue(null)
        const app = buildApp()
        const req = request(app)[ep.method.toLowerCase() as 'get' | 'post'](ep.path)
        if (ep.body) req.send(ep.body)
        const res = await req
        expect(res.status).toBe(401)
        expect(res.body.code).toBe('UNAUTHORIZED')
      })
    }
  })

  // ── 403: PLAYER role cannot invoke DM-only endpoints ────────────────────────

  describe('403: PLAYER role rejected on all DM-only audio endpoints', () => {
    beforeEach(() => {
      mocks.mockVerifyToken.mockReturnValue({
        userId: PLAYER_ID,
        username: 'alice',
        role: 'PLAYER',
      })
      mocks.mockResolveEffectiveSessionRole.mockResolvedValue(playerRole())
    })

    for (const ep of DM_ONLY_ENDPOINTS) {
      it(`${ep.label} returns 403 for PLAYER role`, async () => {
        const app = buildApp()
        const res = await request(app)
          .post(ep.path)
          .set('Authorization', 'Bearer token')
          .send(ep.body)
        expect(res.status).toBe(403)
        expect(res.body.code).toBe('FORBIDDEN')
        expect(mocks.mockBroadcastToSession).not.toHaveBeenCalled()
      })
    }
  })

  // ── 403: SPECTATOR role cannot invoke DM-only endpoints ─────────────────────

  describe('403: SPECTATOR role rejected on all DM-only audio endpoints', () => {
    beforeEach(() => {
      mocks.mockVerifyToken.mockReturnValue({
        userId: SPECTATOR_ID,
        username: 'watcher',
        role: 'SPECTATOR',
      })
      mocks.mockResolveEffectiveSessionRole.mockResolvedValue(spectatorRole())
    })

    for (const ep of DM_ONLY_ENDPOINTS) {
      it(`${ep.label} returns 403 for SPECTATOR role`, async () => {
        const app = buildApp()
        const res = await request(app)
          .post(ep.path)
          .set('Authorization', 'Bearer token')
          .send(ep.body)
        expect(res.status).toBe(403)
        expect(res.body.code).toBe('FORBIDDEN')
        expect(mocks.mockBroadcastToSession).not.toHaveBeenCalled()
      })
    }
  })

  // ── 403: Non-member cannot read audio state (cross-session access) ───────────

  describe('403/404: cross-session access denied for GET /audio/state/:sessionId', () => {
    it('returns 403 when user is not a member of the requested session', async () => {
      mocks.mockVerifyToken.mockReturnValue({
        userId: OUTSIDER_ID,
        username: 'eve',
        role: 'PLAYER',
      })
      mocks.mockResolveEffectiveSessionRole.mockResolvedValue(notMember())
      const app = buildApp()
      const res = await request(app)
        .get(`/api/audio/state/${SESSION_ID}`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(403)
      expect(mocks.mockGetSessionAudioState).not.toHaveBeenCalled()
    })

    it('returns 404 (not 403) when session does not exist, preventing session ID enumeration', async () => {
      mocks.mockResolveEffectiveSessionRole.mockResolvedValue(sessionNotFound())
      const app = buildApp()
      const res = await request(app)
        .get(`/api/audio/state/${SESSION_ID}`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
      expect(mocks.mockGetSessionAudioState).not.toHaveBeenCalled()
    })
  })

  // ── 400: Invalid UUID for session-scoped endpoints ───────────────────────────

  describe('400: invalid UUID rejected before auth check on DM-only endpoints', () => {
    it('POST /audio/environment returns 400 for non-UUID sessionId', async () => {
      const app = buildApp()
      const res = await request(app)
        .post('/api/audio/environment')
        .set('Authorization', 'Bearer token')
        .send({ sessionId: 'not-a-uuid', roomId: ROOM_ID, environmentName: 'cave' })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_INPUT')
      expect(mocks.mockResolveEffectiveSessionRole).not.toHaveBeenCalled()
    })

    it('POST /audio/dm-override/apply returns 400 for non-UUID targetUserId', async () => {
      const app = buildApp()
      const res = await request(app)
        .post('/api/audio/dm-override/apply')
        .set('Authorization', 'Bearer token')
        .send({ sessionId: SESSION_ID, targetUserId: 'not-a-uuid', overrideType: 'MUTE' })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_INPUT')
    })

    it('GET /audio/state returns 400 for non-UUID sessionId in path', async () => {
      const app = buildApp()
      const res = await request(app)
        .get('/api/audio/state/not-a-valid-uuid')
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_INPUT')
    })
  })

  // ── No broadcast on rejected requests ────────────────────────────────────────

  describe('event broadcaster is never called on rejected requests', () => {
    it('broadcaster not called when PLAYER attempts environment change', async () => {
      mocks.mockVerifyToken.mockReturnValue({
        userId: PLAYER_ID,
        username: 'alice',
        role: 'PLAYER',
      })
      mocks.mockResolveEffectiveSessionRole.mockResolvedValue(playerRole())
      const app = buildApp()
      await request(app)
        .post('/api/audio/environment')
        .set('Authorization', 'Bearer token')
        .send({ sessionId: SESSION_ID, roomId: ROOM_ID, environmentName: 'cave' })
      expect(mocks.mockBroadcastToSession).not.toHaveBeenCalled()
    })

    it('broadcaster not called when unauthenticated request reaches any endpoint', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(null)
      const app = buildApp()
      await request(app).post('/api/audio/environment').send({
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        environmentName: 'cave',
      })
      expect(mocks.mockBroadcastToSession).not.toHaveBeenCalled()
    })
  })
})
