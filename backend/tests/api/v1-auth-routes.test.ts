/**
 * Tests for v1 Authentication Routes
 *
 * Validates that new normalized v1 routes work correctly.
 * Reference: docs/operations/W6-REFACTOR-PLAN.md (Phase 1)
 */

import express from 'express'
import request from 'supertest'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import authV1Routes from '@/api/auth-v1.routes'

// Mock all auth service functions
const mocks = vi.hoisted(() => ({
  mockCreateToken: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockExtractTokenFromHeader: vi.fn(),
  mockVerifyPassword: vi.fn(),
  mockGetUserAuthContext: vi.fn(),
  mockGetHandoffExchangeUser: vi.fn(),
  mockJoinGuestPlayerViaInvite: vi.fn(),
  mockJoinGuestSpectatorViaInvite: vi.fn(),
  mockPrecheckPlayerInviteEmail: vi.fn(),
  mockUpgradeGuestAccount: vi.fn(),
  mockIssueHandoffToken: vi.fn(),
  mockConsumeHandoffToken: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  createToken: (...args: unknown[]) => mocks.mockCreateToken(...args),
  verifyToken: (...args: unknown[]) => mocks.mockVerifyToken(...args),
  extractTokenFromHeader: (...args: unknown[]) => mocks.mockExtractTokenFromHeader(...args),
  verifyPassword: (...args: unknown[]) => mocks.mockVerifyPassword(...args),
}))

vi.mock('@/services/auth-user-context.service', () => ({
  getUserAuthContext: (...args: unknown[]) => mocks.mockGetUserAuthContext(...args),
  getHandoffExchangeUser: (...args: unknown[]) => mocks.mockGetHandoffExchangeUser(...args),
}))

vi.mock('@/services/guest-auth.service', () => ({
  joinGuestPlayerViaInvite: (...args: unknown[]) => mocks.mockJoinGuestPlayerViaInvite(...args),
  joinGuestSpectatorViaInvite: (...args: unknown[]) =>
    mocks.mockJoinGuestSpectatorViaInvite(...args),
  precheckPlayerInviteEmail: (...args: unknown[]) => mocks.mockPrecheckPlayerInviteEmail(...args),
  upgradeGuestAccount: (...args: unknown[]) => mocks.mockUpgradeGuestAccount(...args),
}))

vi.mock('@/services/handoff.service', () => ({
  issueHandoffToken: (...args: unknown[]) => mocks.mockIssueHandoffToken(...args),
  consumeHandoffToken: (...args: unknown[]) => mocks.mockConsumeHandoffToken(...args),
}))

vi.mock('@/repositories/campaign.repository', () => ({
  joinCampaignForUser: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/services/session-authz.service', () => ({
  deriveCampaignJoinRole: vi.fn((role) => role),
  normalizePlayerFacingRole: vi.fn((role) => role),
}))

// Create a test Express app
const app = express()
app.use(express.json())
app.use('/auth', authV1Routes)

describe('v1 Auth Routes (Normalized API)', () => {
  const testUserId = 'u-test-v1-auth'
  const testUsername = 'test-v1-user'
  const testToken = 'test-jwt-token-xyz'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /auth/validate - Validate Token', () => {
    it('should validate a valid JWT token', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(testToken)
      mocks.mockVerifyToken.mockReturnValue({
        userId: testUserId,
        username: testUsername,
        role: 'PLAYER',
        authType: 'FULL',
      })

      const res = await request(app)
        .get('/auth/validate')
        .set('Authorization', `Bearer ${testToken}`)

      expect(res.status).toBe(200)
      expect(res.body.valid).toBe(true)
      expect(res.body.user).toMatchObject({
        id: testUserId,
        username: testUsername,
        role: 'PLAYER',
        authType: 'FULL',
      })
    })

    it('should reject missing authorization header', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(null)

      const res = await request(app).get('/auth/validate')

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('UNAUTHORIZED')
    })
  })

  describe('GET /auth/me - Get Current User', () => {
    it('should return current user profile', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(testToken)
      mocks.mockVerifyToken.mockReturnValue({
        userId: testUserId,
        username: testUsername,
        role: 'PLAYER',
        authType: 'FULL',
      })
      mocks.mockGetUserAuthContext.mockResolvedValue({
        id: testUserId,
        username: testUsername,
        email: 'test@example.com',
        adminRole: null,
        hasAdminAccess: false,
        requiresUpgradeForAdmin: false,
        isActive: true,
        isFullAccount: true,
      })

      const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${testToken}`)

      expect(res.status).toBe(200)
      expect(res.body.id).toBe(testUserId)
      expect(res.body.username).toBe(testUsername)
      expect(res.body.authType).toBe('FULL')
    })

    it('should return 404 for deleted user', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(testToken)
      mocks.mockVerifyToken.mockReturnValue({
        userId: testUserId,
        username: testUsername,
        role: 'PLAYER',
        authType: 'FULL',
      })
      mocks.mockGetUserAuthContext.mockResolvedValue(null)

      const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${testToken}`)

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('USER_NOT_FOUND')
    })
  })

  describe('POST /auth/refresh - Refresh JWT Token', () => {
    it('should issue new token', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(testToken)
      mocks.mockVerifyToken.mockReturnValue({
        userId: testUserId,
        username: testUsername,
        role: 'PLAYER',
        authType: 'FULL',
      })
      mocks.mockCreateToken.mockReturnValue('new-token-xyz')

      const res = await request(app)
        .post('/auth/refresh')
        .set('Authorization', `Bearer ${testToken}`)

      expect(res.status).toBe(200)
      expect(res.body.token).toBe('new-token-xyz')
    })
  })

  describe('POST /auth/login - Full Account Login', () => {
    it('should reject missing username', async () => {
      const res = await request(app).post('/auth/login').send({
        password: 'test123',
      })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_LOGIN_REQUEST')
    })

    it('should reject invalid username format', async () => {
      const res = await request(app).post('/auth/login').send({
        username: 'a',
        password: 'test123',
      })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_USERNAME')
    })
  })

  describe('POST /auth/handoff/admin - Admin Token Handoff', () => {
    it('should issue handoff token for admin user', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(testToken)
      mocks.mockVerifyToken.mockReturnValue({
        userId: testUserId,
        username: testUsername,
        role: 'DM',
        authType: 'FULL',
      })
      mocks.mockGetUserAuthContext.mockResolvedValue({
        id: testUserId,
        username: testUsername,
        email: 'admin@example.com',
        adminRole: null,
        hasAdminAccess: true,
        requiresUpgradeForAdmin: false,
        isActive: true,
        isFullAccount: true,
      })
      mocks.mockIssueHandoffToken.mockReturnValue({
        handoffToken: 'handoff-token-123',
        expiresInSec: 120,
      })

      const res = await request(app)
        .post('/auth/handoff/admin')
        .set('Authorization', `Bearer ${testToken}`)

      expect(res.status).toBe(200)
      expect(res.body.handoffToken).toBe('handoff-token-123')
      expect(res.body.redirectUrl).toContain('/admin/launch')
    })

    it('should reject non-admin user', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(testToken)
      mocks.mockVerifyToken.mockReturnValue({
        userId: testUserId,
        username: testUsername,
        role: 'PLAYER',
        authType: 'FULL',
      })
      mocks.mockGetUserAuthContext.mockResolvedValue({
        id: testUserId,
        username: testUsername,
        email: 'player@example.com',
        adminRole: null,
        hasAdminAccess: false,
        requiresUpgradeForAdmin: false,
        isActive: true,
        isFullAccount: true,
      })

      const res = await request(app)
        .post('/auth/handoff/admin')
        .set('Authorization', `Bearer ${testToken}`)

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('ADMIN_ACCESS_REQUIRED')
    })
  })

  describe('POST /auth/handoff/exchange - Accept Handoff', () => {
    it('should reject missing handoff token', async () => {
      const res = await request(app).post('/auth/handoff/exchange').send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('MISSING_HANDOFF_TOKEN')
    })

    it('should exchange valid handoff token', async () => {
      mocks.mockConsumeHandoffToken.mockReturnValue({
        userId: testUserId,
        username: testUsername,
      })
      mocks.mockGetHandoffExchangeUser.mockResolvedValue({
        id: testUserId,
        username: testUsername,
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
        role: 'PLAYER',
        authType: 'FULL',
        isActive: true,
      })
      mocks.mockCreateToken.mockReturnValue('new-session-token')

      const res = await request(app).post('/auth/handoff/exchange').send({
        handoffToken: 'valid-handoff-token',
      })

      expect(res.status).toBe(200)
      expect(res.body.token).toBe('new-session-token')
      expect(res.body.user).toMatchObject({
        id: testUserId,
        username: testUsername,
        role: 'PLAYER',
      })
    })
  })

  describe('POST /auth/join/guest/player - Guest Player Join', () => {
    it('should reject missing required fields', async () => {
      const res = await request(app).post('/auth/join/guest/player').send({
        inviteCode: 'code123',
      })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_GUEST_PLAYER_JOIN_REQUEST')
    })

    it('should accept valid guest player join', async () => {
      mocks.mockJoinGuestPlayerViaInvite.mockResolvedValue({
        token: 'guest-token',
        user: {
          id: 'u-guest-player',
          username: 'guest-player-123',
          role: 'PLAYER',
          authType: 'GUEST',
        },
        sessionId: 'session-123',
      })

      const res = await request(app).post('/auth/join/guest/player').send({
        inviteCode: 'INVITE123',
        email: 'guest@example.com',
        displayName: 'Guest Player',
      })

      expect(res.status).toBe(200)
      expect(res.body.token).toBe('guest-token')
      expect(res.body.user.authType).toBe('GUEST')
    })
  })

  describe('POST /auth/join/guest/spectator - Guest Spectator Join', () => {
    it('should reject missing required fields', async () => {
      const res = await request(app).post('/auth/join/guest/spectator').send({
        spectatorInviteCode: 'spec123',
      })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_GUEST_SPECTATOR_JOIN_REQUEST')
    })

    it('should accept valid guest spectator join', async () => {
      mocks.mockJoinGuestSpectatorViaInvite.mockResolvedValue({
        token: 'spectator-token',
        user: {
          id: 'u-guest-spectator',
          username: 'guest-spectator-123',
          role: 'SPECTATOR',
          authType: 'GUEST',
        },
        sessionId: 'session-123',
      })

      const res = await request(app).post('/auth/join/guest/spectator').send({
        spectatorInviteCode: 'SPEC123',
        email: 'spectator@example.com',
        displayName: 'Guest Spectator',
      })

      expect(res.status).toBe(200)
      expect(res.body.user.role).toBe('SPECTATOR')
    })
  })

  describe('Response Structure Consistency', () => {
    it('should return consistent error structure', async () => {
      const res = await request(app).post('/auth/login').send({})

      expect(res.body).toHaveProperty('code')
      expect(res.body).toHaveProperty('message')
      expect(typeof res.body.code).toBe('string')
      expect(typeof res.body.message).toBe('string')
    })
  })
})
