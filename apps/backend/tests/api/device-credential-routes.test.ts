import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockCreateToken: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockExtractTokenFromHeader: vi.fn(),
  mockGetUserAuthContext: vi.fn(),
  mockDeviceCredentialFindFirst: vi.fn(),
  mockDeviceCredentialUpsert: vi.fn(),
  mockDeviceCredentialFindMany: vi.fn(),
  mockDeviceCredentialFindUnique: vi.fn(),
  mockDeviceCredentialUpdate: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  createToken: (...args: unknown[]) => mocks.mockCreateToken(...args),
  verifyToken: (...args: unknown[]) => mocks.mockVerifyToken(...args),
  extractTokenFromHeader: (...args: unknown[]) => mocks.mockExtractTokenFromHeader(...args),
}))

vi.mock('@/services/auth/user-context.service', () => ({
  validateUserAuthState: vi.fn(async () => ({ ok: true })),
  getUserAuthContext: (...args: unknown[]) => mocks.mockGetUserAuthContext(...args),
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    deviceCredential: {
      findFirst: mocks.mockDeviceCredentialFindFirst,
      upsert: mocks.mockDeviceCredentialUpsert,
      findMany: mocks.mockDeviceCredentialFindMany,
      findUnique: mocks.mockDeviceCredentialFindUnique,
      update: mocks.mockDeviceCredentialUpdate,
    },
  }),
}))

// Intentionally NOT mocking '@/infra/http/rate-limit' here — the rate-limit
// test below needs the real in-memory limiter to verify the 10/min cap.

import authExtensionRoutes from '@/api/auth-extension.routes'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/auth', authExtensionRoutes)
  return app
}

describe('device credential routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockCreateToken.mockReturnValue('fresh-jwt-token')
    mocks.mockDeviceCredentialUpsert.mockResolvedValue({ id: 'device-credential-1' })
  })

  describe('POST /extension/credential/exchange', () => {
    it('rotates the credential and returns a fresh token', async () => {
      const app = buildApp()
      mocks.mockDeviceCredentialFindFirst.mockResolvedValueOnce({
        id: 'cred-1',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        user: { id: 'user-1', username: 'aragorn', role: 'PLAYER', authType: 'GUEST' },
      })

      const response = await request(app).post('/api/auth/extension/credential/exchange').send({
        credential: 'original-raw-credential',
        deviceId: 'device-rotate-1',
      })

      expect(response.status).toBe(200)
      expect(response.body.token).toBe('fresh-jwt-token')
      expect(typeof response.body.credential).toBe('string')
      expect(response.body.credential).not.toBe('original-raw-credential')
      expect(mocks.mockDeviceCredentialUpsert).toHaveBeenCalledTimes(1)
    })

    it('rejects an already-rotated credential as invalid', async () => {
      const app = buildApp()
      mocks.mockDeviceCredentialFindFirst.mockResolvedValueOnce(null)

      const response = await request(app).post('/api/auth/extension/credential/exchange').send({
        credential: 'stale-raw-credential',
        deviceId: 'device-stale-1',
      })

      expect(response.status).toBe(401)
      expect(response.body.code).toBe('CREDENTIAL_INVALID')
    })

    it('rejects an unknown credential as invalid', async () => {
      const app = buildApp()
      mocks.mockDeviceCredentialFindFirst.mockResolvedValueOnce(null)

      const response = await request(app).post('/api/auth/extension/credential/exchange').send({
        credential: 'never-issued',
        deviceId: 'device-unknown-1',
      })

      expect(response.status).toBe(401)
      expect(response.body.code).toBe('CREDENTIAL_INVALID')
    })

    it('reports CREDENTIAL_EXPIRED_GUEST for an expired guest account credential', async () => {
      const app = buildApp()
      mocks.mockDeviceCredentialFindFirst.mockResolvedValueOnce({
        id: 'cred-2',
        expiresAt: new Date(Date.now() - 1000),
        user: { id: 'user-2', username: 'guest-user', role: 'PLAYER', authType: 'GUEST' },
      })

      const response = await request(app).post('/api/auth/extension/credential/exchange').send({
        credential: 'expired-guest-credential',
        deviceId: 'device-expired-guest-1',
      })

      expect(response.status).toBe(401)
      expect(response.body.code).toBe('CREDENTIAL_EXPIRED_GUEST')
    })

    it('reports CREDENTIAL_EXPIRED_FULL for an expired full account credential', async () => {
      const app = buildApp()
      mocks.mockDeviceCredentialFindFirst.mockResolvedValueOnce({
        id: 'cred-3',
        expiresAt: new Date(Date.now() - 1000),
        user: { id: 'user-3', username: 'full-user', role: 'PLAYER', authType: 'FULL' },
      })

      const response = await request(app).post('/api/auth/extension/credential/exchange').send({
        credential: 'expired-full-credential',
        deviceId: 'device-expired-full-1',
      })

      expect(response.status).toBe(401)
      expect(response.body.code).toBe('CREDENTIAL_EXPIRED_FULL')
    })

    it('requires both credential and deviceId', async () => {
      const app = buildApp()

      const response = await request(app)
        .post('/api/auth/extension/credential/exchange')
        .send({ credential: 'only-credential' })

      expect(response.status).toBe(400)
      expect(response.body.code).toBe('MISSING_CREDENTIAL_FIELDS')
    })

    it('rate-limits to 10 exchanges per deviceId per minute', async () => {
      const app = buildApp()
      mocks.mockDeviceCredentialFindFirst.mockResolvedValue(null)

      const deviceId = 'device-rate-limit-1'
      let lastStatus = 0
      for (let attempt = 0; attempt < 11; attempt += 1) {
        const response = await request(app)
          .post('/api/auth/extension/credential/exchange')
          .send({ credential: `attempt-${attempt}`, deviceId })
        lastStatus = response.status
      }

      expect(lastStatus).toBe(429)
    })
  })

  describe('GET /extension/credentials', () => {
    it('returns only the authenticated user\'s active credentials', async () => {
      const app = buildApp()
      mocks.mockExtractTokenFromHeader.mockReturnValue('valid-token')
      mocks.mockVerifyToken.mockReturnValue({ userId: 'user-1', username: 'aragorn', role: 'PLAYER' })
      mocks.mockDeviceCredentialFindMany.mockResolvedValueOnce([
        {
          id: 'cred-1',
          deviceId: 'device-1',
          createdAt: new Date(),
          lastUsedAt: new Date(),
          expiresAt: new Date(),
        },
      ])

      const response = await request(app)
        .get('/api/auth/extension/credentials')
        .set('Authorization', 'Bearer valid-token')

      expect(response.status).toBe(200)
      expect(response.body.credentials).toHaveLength(1)
      expect(response.body.credentials[0]).not.toHaveProperty('credentialHash')
      expect(mocks.mockDeviceCredentialFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', revokedAt: null } })
      )
    })

    it('rejects requests without a valid token', async () => {
      const app = buildApp()
      mocks.mockExtractTokenFromHeader.mockReturnValue(null)

      const response = await request(app).get('/api/auth/extension/credentials')

      expect(response.status).toBe(401)
    })
  })

  describe('DELETE /extension/credentials/:credentialId', () => {
    beforeEach(() => {
      mocks.mockExtractTokenFromHeader.mockReturnValue('valid-token')
      mocks.mockVerifyToken.mockReturnValue({ userId: 'user-1', username: 'aragorn', role: 'PLAYER' })
    })

    it('lets a user revoke their own credential', async () => {
      const app = buildApp()
      mocks.mockDeviceCredentialFindUnique.mockResolvedValueOnce({ id: 'cred-1', userId: 'user-1' })
      mocks.mockGetUserAuthContext.mockResolvedValueOnce({ hasAdminAccess: false })

      const response = await request(app)
        .delete('/api/auth/extension/credentials/cred-1')
        .set('Authorization', 'Bearer valid-token')

      expect(response.status).toBe(204)
      expect(mocks.mockDeviceCredentialUpdate).toHaveBeenCalledWith({
        where: { id: 'cred-1' },
        data: { revokedAt: expect.any(Date) },
      })
    })

    it('rejects revoking another user\'s credential without admin access', async () => {
      const app = buildApp()
      mocks.mockDeviceCredentialFindUnique.mockResolvedValueOnce({ id: 'cred-2', userId: 'someone-else' })
      mocks.mockGetUserAuthContext.mockResolvedValueOnce({ hasAdminAccess: false })

      const response = await request(app)
        .delete('/api/auth/extension/credentials/cred-2')
        .set('Authorization', 'Bearer valid-token')

      expect(response.status).toBe(403)
      expect(response.body.code).toBe('NOT_CREDENTIAL_OWNER')
      expect(mocks.mockDeviceCredentialUpdate).not.toHaveBeenCalled()
    })

    it('lets an admin revoke another user\'s credential', async () => {
      const app = buildApp()
      mocks.mockDeviceCredentialFindUnique.mockResolvedValueOnce({ id: 'cred-3', userId: 'someone-else' })
      mocks.mockGetUserAuthContext.mockResolvedValueOnce({ hasAdminAccess: true })

      const response = await request(app)
        .delete('/api/auth/extension/credentials/cred-3')
        .set('Authorization', 'Bearer valid-token')

      expect(response.status).toBe(204)
      expect(mocks.mockDeviceCredentialUpdate).toHaveBeenCalledTimes(1)
    })

    it('returns 404 for an unknown credential', async () => {
      const app = buildApp()
      mocks.mockDeviceCredentialFindUnique.mockResolvedValueOnce(null)
      mocks.mockGetUserAuthContext.mockResolvedValueOnce({ hasAdminAccess: false })

      const response = await request(app)
        .delete('/api/auth/extension/credentials/missing')
        .set('Authorization', 'Bearer valid-token')

      expect(response.status).toBe(404)
      expect(response.body.code).toBe('CREDENTIAL_NOT_FOUND')
    })
  })
})
