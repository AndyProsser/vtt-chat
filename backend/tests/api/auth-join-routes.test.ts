/**
 * Tests for current Authentication Routes
 *
 * Validates that normalized current routes work correctly.
 * Reference: docs/operations/API-PATH-CUTOVER-MAP.md
 */

import express from 'express'
import request from 'supertest'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import authJoinRoutes from '@/api/auth-join.routes'

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
  mockSuggestAvailableUsername: vi.fn(),
  mockRegisterFullAccount: vi.fn(),
  mockRequestPasswordReset: vi.fn(),
  mockVerifyPasswordResetToken: vi.fn(),
  mockCompletePasswordReset: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  createToken: (...args: unknown[]) => mocks.mockCreateToken(...args),
  verifyToken: (...args: unknown[]) => mocks.mockVerifyToken(...args),
  extractTokenFromHeader: (...args: unknown[]) => mocks.mockExtractTokenFromHeader(...args),
  verifyPassword: (...args: unknown[]) => mocks.mockVerifyPassword(...args),
}))

vi.mock('@/services/auth/user-context.service', () => ({
  getUserAuthContext: (...args: unknown[]) => mocks.mockGetUserAuthContext(...args),
  getHandoffExchangeUser: (...args: unknown[]) => mocks.mockGetHandoffExchangeUser(...args),
}))

vi.mock('@/services/guest-auth', () => ({
  joinGuestPlayerViaInvite: (...args: unknown[]) => mocks.mockJoinGuestPlayerViaInvite(...args),
  joinGuestSpectatorViaInvite: (...args: unknown[]) =>
    mocks.mockJoinGuestSpectatorViaInvite(...args),
  precheckPlayerInviteEmail: (...args: unknown[]) => mocks.mockPrecheckPlayerInviteEmail(...args),
  upgradeGuestAccount: (...args: unknown[]) => mocks.mockUpgradeGuestAccount(...args),
}))

vi.mock('@/services/self-service-auth', () => ({
  suggestAvailableUsername: (...args: unknown[]) => mocks.mockSuggestAvailableUsername(...args),
  registerFullAccount: (...args: unknown[]) => mocks.mockRegisterFullAccount(...args),
  requestPasswordReset: (...args: unknown[]) => mocks.mockRequestPasswordReset(...args),
  verifyPasswordResetToken: (...args: unknown[]) => mocks.mockVerifyPasswordResetToken(...args),
  completePasswordReset: (...args: unknown[]) => mocks.mockCompletePasswordReset(...args),
}))

vi.mock('@/services/handoff.service', () => ({
  issueHandoffToken: (...args: unknown[]) => mocks.mockIssueHandoffToken(...args),
  consumeHandoffToken: (...args: unknown[]) => mocks.mockConsumeHandoffToken(...args),
}))

vi.mock('@/repositories/campaign.repository', () => ({
  joinCampaignForUser: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/services/session/authz.service', () => ({
  deriveCampaignJoinRole: vi.fn((role) => role),
  normalizePlayerFacingRole: vi.fn((role) => role),
}))

// Create a test Express app
const app = express()
app.use(express.json())
app.use('/auth', authJoinRoutes)

describe('current Auth Routes (Normalized API)', () => {
  const testUserId = 'u-test-current-auth'
  const testUsername = 'test-current-user'
  const testToken = 'test-jwt-token-xyz'

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockSuggestAvailableUsername.mockResolvedValue('suggested-user')
    mocks.mockVerifyPasswordResetToken.mockResolvedValue({ valid: true, email: 'user@example.com' })
    mocks.mockRequestPasswordReset.mockResolvedValue({
      accountFound: true,
      delivery: 'email',
      resetToken: undefined,
      email: 'user@example.com',
    })
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

  describe('self-service auth routes', () => {
    it('suggests available usernames', async () => {
      const res = await request(app).post('/auth/register/username-suggestion').send({
        name: 'Test User',
        username: 'taken-name',
      })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ username: 'suggested-user' })
      expect(mocks.mockSuggestAvailableUsername).toHaveBeenCalledWith({
        displayName: 'Test User',
        requestedUsername: 'taken-name',
      })
    })

    it('maps register validation and conflict failures', async () => {
      mocks.mockRegisterFullAccount.mockRejectedValueOnce(new Error('DISPLAY_NAME_REQUIRED'))
      let res = await request(app).post('/auth/register').send({
        email: 'user@example.com',
        username: 'user-one',
        password: 'Password123!',
      })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('DISPLAY_NAME_REQUIRED')

      mocks.mockRegisterFullAccount.mockRejectedValueOnce(new Error('INVALID_EMAIL'))
      res = await request(app).post('/auth/register').send({
        name: 'User One',
        email: 'bad-email',
        username: 'user-one',
        password: 'Password123!',
      })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_EMAIL')

      mocks.mockRegisterFullAccount.mockRejectedValueOnce(new Error('INVALID_PASSWORD'))
      res = await request(app).post('/auth/register').send({
        name: 'User One',
        email: 'user@example.com',
        username: 'user-one',
        password: 'weak',
      })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_PASSWORD')

      mocks.mockRegisterFullAccount.mockRejectedValueOnce(new Error('EMAIL_IN_USE'))
      res = await request(app).post('/auth/register').send({
        name: 'User One',
        email: 'user@example.com',
        username: 'user-one',
        password: 'Password123!',
      })
      expect(res.status).toBe(409)
      expect(res.body.code).toBe('EMAIL_IN_USE')
    })

    it('returns registration success and generic failures', async () => {
      mocks.mockRegisterFullAccount.mockResolvedValueOnce({
        token: 'registered-token',
        user: { id: 'user-1', username: 'user-one', authType: 'FULL' },
      })

      let res = await request(app).post('/auth/register').send({
        name: 'User One',
        email: 'user@example.com',
        username: 'user-one',
        password: 'Password123!',
      })
      expect(res.status).toBe(201)
      expect(res.body.token).toBe('registered-token')

      mocks.mockRegisterFullAccount.mockRejectedValueOnce(new Error('boom'))
      res = await request(app).post('/auth/register').send({
        name: 'User One',
        email: 'user@example.com',
        username: 'user-one',
        password: 'Password123!',
      })
      expect(res.status).toBe(500)
      expect(res.body.code).toBe('REGISTRATION_FAILED')
    })

    it('maps password reset request outcomes', async () => {
      mocks.mockRequestPasswordReset.mockRejectedValueOnce(new Error('IDENTIFIER_REQUIRED'))
      let res = await request(app).post('/auth/password-reset/request').send({})
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('IDENTIFIER_REQUIRED')

      mocks.mockRequestPasswordReset.mockResolvedValueOnce({
        accountFound: false,
        delivery: 'email',
        resetToken: undefined,
        email: null,
      })
      res = await request(app).post('/auth/password-reset/request').send({
        identifier: 'missing@example.com',
      })
      expect(res.status).toBe(404)
      expect(res.body.code).toBe('ACCOUNT_NOT_FOUND')

      mocks.mockRequestPasswordReset.mockRejectedValueOnce(
        new Error('PASSWORD_RESET_EMAIL_NOT_CONFIGURED')
      )
      res = await request(app).post('/auth/password-reset/request').send({
        identifier: 'user@example.com',
      })
      expect(res.status).toBe(500)
      expect(res.body.code).toBe('PASSWORD_RESET_EMAIL_NOT_CONFIGURED')

      mocks.mockRequestPasswordReset.mockRejectedValueOnce(new Error('boom'))
      res = await request(app).post('/auth/password-reset/request').send({
        identifier: 'user@example.com',
      })
      expect(res.status).toBe(500)
      expect(res.body.code).toBe('PASSWORD_RESET_REQUEST_FAILED')
    })

    it('returns password reset request success payloads', async () => {
      mocks.mockRequestPasswordReset.mockResolvedValueOnce({
        accountFound: true,
        delivery: 'passwordless',
        resetToken: 'reset-token',
        email: 'user@example.com',
      })

      const res = await request(app).post('/auth/password-reset/request').send({
        identifier: 'user@example.com',
      })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({
        accountFound: true,
        delivery: 'passwordless',
        resetToken: 'reset-token',
      })
    })

    it('maps password reset verify and complete outcomes', async () => {
      let res = await request(app).post('/auth/password-reset/verify').send({})
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('RESET_TOKEN_REQUIRED')

      mocks.mockVerifyPasswordResetToken.mockResolvedValueOnce({ valid: false })
      res = await request(app).post('/auth/password-reset/verify').send({ token: 'bad-token' })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_RESET_TOKEN')

      mocks.mockVerifyPasswordResetToken.mockResolvedValueOnce({
        valid: true,
        email: 'user@example.com',
      })
      res = await request(app).post('/auth/password-reset/verify').send({ token: 'good-token' })
      expect(res.status).toBe(200)
      expect(res.body.valid).toBe(true)

      res = await request(app).post('/auth/password-reset/complete').send({ token: 'good-token' })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_PASSWORD_RESET_REQUEST')

      mocks.mockCompletePasswordReset.mockRejectedValueOnce(new Error('INVALID_PASSWORD'))
      res = await request(app).post('/auth/password-reset/complete').send({
        token: 'good-token',
        password: 'weak',
      })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_PASSWORD')

      mocks.mockCompletePasswordReset.mockRejectedValueOnce(new Error('INVALID_RESET_TOKEN'))
      res = await request(app).post('/auth/password-reset/complete').send({
        token: 'expired-token',
        password: 'Password123!',
      })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_RESET_TOKEN')

      mocks.mockCompletePasswordReset.mockRejectedValueOnce(new Error('boom'))
      res = await request(app).post('/auth/password-reset/complete').send({
        token: 'good-token',
        password: 'Password123!',
      })
      expect(res.status).toBe(500)
      expect(res.body.code).toBe('PASSWORD_RESET_FAILED')

      mocks.mockCompletePasswordReset.mockResolvedValueOnce(undefined)
      res = await request(app).post('/auth/password-reset/complete').send({
        token: 'good-token',
        password: 'Password123!',
      })
      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Password reset complete')
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

    it('maps missing/deactivated/non-full-account users to specific errors', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(testToken)
      mocks.mockVerifyToken.mockReturnValue({
        userId: testUserId,
        username: testUsername,
        role: 'DM',
        authType: 'FULL',
      })

      mocks.mockGetUserAuthContext.mockResolvedValueOnce(null)
      let res = await request(app)
        .post('/auth/handoff/admin')
        .set('Authorization', `Bearer ${testToken}`)
      expect(res.status).toBe(404)
      expect(res.body.code).toBe('USER_NOT_FOUND')

      mocks.mockGetUserAuthContext.mockResolvedValueOnce({
        id: testUserId,
        username: testUsername,
        email: 'test@example.com',
        adminRole: null,
        hasAdminAccess: true,
        requiresUpgradeForAdmin: false,
        isActive: false,
        isFullAccount: true,
      })
      res = await request(app)
        .post('/auth/handoff/admin')
        .set('Authorization', `Bearer ${testToken}`)
      expect(res.status).toBe(403)
      expect(res.body.code).toBe('ACCOUNT_DEACTIVATED')

      mocks.mockGetUserAuthContext.mockResolvedValueOnce({
        id: testUserId,
        username: testUsername,
        email: 'test@example.com',
        adminRole: null,
        hasAdminAccess: true,
        requiresUpgradeForAdmin: true,
        isActive: true,
        isFullAccount: false,
      })
      res = await request(app)
        .post('/auth/handoff/admin')
        .set('Authorization', `Bearer ${testToken}`)
      expect(res.status).toBe(403)
      expect(res.body.code).toBe('GUEST_UPGRADE_REQUIRED')
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

    it('rejects invalid handoff tokens and unavailable handoff users', async () => {
      mocks.mockConsumeHandoffToken.mockReturnValueOnce(null)
      let res = await request(app).post('/auth/handoff/exchange').send({
        handoffToken: 'invalid-token',
      })
      expect(res.status).toBe(401)
      expect(res.body.code).toBe('INVALID_HANDOFF_TOKEN')

      mocks.mockConsumeHandoffToken.mockReturnValueOnce({
        userId: testUserId,
        username: testUsername,
      })
      mocks.mockGetHandoffExchangeUser.mockResolvedValueOnce(null)
      res = await request(app).post('/auth/handoff/exchange').send({
        handoffToken: 'valid-token',
      })
      expect(res.status).toBe(403)
      expect(res.body.code).toBe('ACCOUNT_NOT_ALLOWED')

      mocks.mockConsumeHandoffToken.mockReturnValueOnce({
        userId: testUserId,
        username: testUsername,
      })
      mocks.mockGetHandoffExchangeUser.mockResolvedValueOnce({
        id: testUserId,
        username: testUsername,
        displayName: 'Bad Role',
        avatarUrl: null,
        role: 'SYSTEM',
        authType: 'FULL',
        isActive: true,
      })
      res = await request(app).post('/auth/handoff/exchange').send({
        handoffToken: 'valid-token-2',
      })
      expect(res.status).toBe(403)
      expect(res.body.code).toBe('INVALID_ROLE')
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

    it('maps guest player join errors by code', async () => {
      mocks.mockJoinGuestPlayerViaInvite.mockRejectedValueOnce(new Error('INVITE_EXPIRED'))
      let res = await request(app).post('/auth/join/guest/player').send({
        inviteCode: 'INVITE123',
        email: 'guest@example.com',
        displayName: 'Guest Player',
      })
      expect(res.status).toBe(404)
      expect(res.body.code).toBe('INVITE_EXPIRED')

      mocks.mockJoinGuestPlayerViaInvite.mockRejectedValueOnce(new Error('FULL_ACCOUNT_EXISTS'))
      res = await request(app).post('/auth/join/guest/player').send({
        inviteCode: 'INVITE123',
        email: 'guest@example.com',
        displayName: 'Guest Player',
      })
      expect(res.status).toBe(409)
      expect(res.body.code).toBe('FULL_ACCOUNT_EXISTS')

      mocks.mockJoinGuestPlayerViaInvite.mockRejectedValueOnce(new Error('boom'))
      res = await request(app).post('/auth/join/guest/player').send({
        inviteCode: 'INVITE123',
        email: 'guest@example.com',
        displayName: 'Guest Player',
      })
      expect(res.status).toBe(500)
      expect(res.body.code).toBe('PLAYER_JOIN_FAILED')
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

    it('maps spectator join errors by category', async () => {
      mocks.mockJoinGuestSpectatorViaInvite.mockRejectedValueOnce(new Error('INVITE_EXPIRED'))
      let res = await request(app).post('/auth/join/guest/spectator').send({
        spectatorInviteCode: 'SPEC123',
        email: 'spectator@example.com',
        displayName: 'Guest Spectator',
      })
      expect(res.status).toBe(404)
      expect(res.body.code).toBe('INVITE_EXPIRED')

      mocks.mockJoinGuestSpectatorViaInvite.mockRejectedValueOnce(new Error('SPECTATORS_DISABLED'))
      res = await request(app).post('/auth/join/guest/spectator').send({
        spectatorInviteCode: 'SPEC123',
        email: 'spectator@example.com',
        displayName: 'Guest Spectator',
      })
      expect(res.status).toBe(403)
      expect(res.body.code).toBe('SPECTATORS_DISABLED')

      mocks.mockJoinGuestSpectatorViaInvite.mockRejectedValueOnce(
        new Error('FULL_ACCOUNT_REQUIRED')
      )
      res = await request(app).post('/auth/join/guest/spectator').send({
        spectatorInviteCode: 'SPEC123',
        email: 'spectator@example.com',
        displayName: 'Guest Spectator',
      })
      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FULL_ACCOUNT_REQUIRED')

      mocks.mockJoinGuestSpectatorViaInvite.mockRejectedValueOnce(
        new Error('SPECTATOR_CAPACITY_REACHED')
      )
      res = await request(app).post('/auth/join/guest/spectator').send({
        spectatorInviteCode: 'SPEC123',
        email: 'spectator@example.com',
        displayName: 'Guest Spectator',
      })
      expect(res.status).toBe(409)
      expect(res.body.code).toBe('SPECTATOR_CAPACITY_REACHED')

      mocks.mockJoinGuestSpectatorViaInvite.mockRejectedValueOnce(new Error('boom'))
      res = await request(app).post('/auth/join/guest/spectator').send({
        spectatorInviteCode: 'SPEC123',
        email: 'spectator@example.com',
        displayName: 'Guest Spectator',
      })
      expect(res.status).toBe(500)
      expect(res.body.code).toBe('SPECTATOR_JOIN_FAILED')
    })
  })

  describe('POST /auth/validate/player - Player Invite Precheck', () => {
    it('rejects missing required fields', async () => {
      const res = await request(app).post('/auth/validate/player').send({ inviteCode: 'ABC123' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_PLAYER_VALIDATE_REQUEST')
    })

    it('maps INVITE_EXPIRED and unexpected errors', async () => {
      mocks.mockPrecheckPlayerInviteEmail.mockRejectedValueOnce(new Error('INVITE_EXPIRED'))
      let res = await request(app).post('/auth/validate/player').send({
        inviteCode: 'ABC123',
        email: 'player@example.com',
      })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('INVITE_EXPIRED')

      mocks.mockPrecheckPlayerInviteEmail.mockRejectedValueOnce(new Error('boom'))
      res = await request(app).post('/auth/validate/player').send({
        inviteCode: 'ABC123',
        email: 'player@example.com',
      })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('PLAYER_VALIDATE_FAILED')
    })

    it('returns precheck payload on success', async () => {
      mocks.mockPrecheckPlayerInviteEmail.mockResolvedValueOnce({
        inviteValid: true,
        accountType: 'GUEST',
      })

      const res = await request(app).post('/auth/validate/player').send({
        inviteCode: 'ABC123',
        email: 'player@example.com',
      })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ inviteValid: true, accountType: 'GUEST' })
    })
  })

  describe('POST /auth/upgrade - Guest Account Upgrade', () => {
    it('requires password and maps guest upgrade conflicts', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(testToken)
      mocks.mockVerifyToken.mockReturnValue({
        userId: testUserId,
        username: testUsername,
        role: 'PLAYER',
        authType: 'GUEST',
      })

      let res = await request(app)
        .post('/auth/upgrade')
        .set('Authorization', `Bearer ${testToken}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('MISSING_PASSWORD')

      mocks.mockUpgradeGuestAccount.mockRejectedValueOnce(new Error('NOT_GUEST_ACCOUNT'))
      res = await request(app)
        .post('/auth/upgrade')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ password: 'ValidPassword!23' })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('NOT_GUEST_ACCOUNT')
    })

    it('maps already-upgraded and generic upgrade failures', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(testToken)
      mocks.mockVerifyToken.mockReturnValue({
        userId: testUserId,
        username: testUsername,
        role: 'PLAYER',
        authType: 'GUEST',
      })

      mocks.mockUpgradeGuestAccount.mockRejectedValueOnce(new Error('ACCOUNT_ALREADY_UPGRADED'))
      let res = await request(app)
        .post('/auth/upgrade')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ password: 'ValidPassword!23' })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('ACCOUNT_ALREADY_UPGRADED')

      mocks.mockUpgradeGuestAccount.mockRejectedValueOnce(new Error('boom'))
      res = await request(app)
        .post('/auth/upgrade')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ password: 'ValidPassword!23' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('UPGRADE_FAILED')
    })
  })

  describe('auth middleware guard paths', () => {
    it('rejects refresh without authorization header', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(null)

      const res = await request(app).post('/auth/refresh')

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('UNAUTHORIZED')
    })

    it('rejects validate when token verification fails', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(testToken)
      mocks.mockVerifyToken.mockReturnValue(null)

      const res = await request(app)
        .get('/auth/validate')
        .set('Authorization', `Bearer ${testToken}`)

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('UNAUTHORIZED')
    })
  })

  describe('GET /auth/me - Current User Error Path', () => {
    it('returns 500 when user context lookup fails', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(testToken)
      mocks.mockVerifyToken.mockReturnValue({
        userId: testUserId,
        username: testUsername,
        role: 'PLAYER',
        authType: 'FULL',
      })
      mocks.mockGetUserAuthContext.mockRejectedValueOnce(new Error('lookup failed'))

      const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${testToken}`)

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('FAILED_TO_GET_USER')
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
