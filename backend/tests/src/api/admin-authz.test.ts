import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockVerifyAdminToken: vi.fn(),
  mockAdminUsersExist: vi.fn(),
  mockFindUnique: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockAdminAuditCreate: vi.fn(),
}))

vi.mock('@/utils', () => ({
  verifyAdminToken: mocks.mockVerifyAdminToken,
}))

vi.mock('@/services/admin.service', () => ({
  AdminService: {
    adminUsersExist: mocks.mockAdminUsersExist,
    createAdmin: vi.fn(),
    authenticateAdmin: vi.fn(),
    getAdminUsers: vi.fn(),
    promoteUserToAdmin: vi.fn(),
    promoteUserAdminRole: vi.fn(),
  },
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    user: {
      findUnique: mocks.mockFindUnique,
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: mocks.mockUserUpdate,
      count: vi.fn(),
    },
    adminAuditLog: {
      create: mocks.mockAdminAuditCreate,
      findMany: vi.fn(),
      count: vi.fn(),
    },
    appEventLog: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    userInviteToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    session: {
      count: vi.fn().mockResolvedValue(0),
    },
    campaign: {
      count: vi.fn().mockResolvedValue(0),
    },
  }),
}))

import adminRoutes from '@/api/admin.routes'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin', adminRoutes)
  return app
}

describe('admin authz guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockAdminUsersExist.mockResolvedValue(true)
    mocks.mockVerifyAdminToken.mockReturnValue({
      userId: '11111111-1111-4111-8111-111111111111',
      username: 'ops-admin',
      adminRole: 'READ_ONLY',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    mocks.mockFindUnique.mockResolvedValue({
      isActive: true,
      tokenInvalidBefore: null,
    })
    mocks.mockUserUpdate.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      username: 'target-user',
      isActive: false,
      tokenInvalidBefore: new Date(),
    })
    mocks.mockAdminAuditCreate.mockResolvedValue({ id: 'audit-1' })
  })

  it('keeps setup-status publicly accessible without auth token', async () => {
    const app = buildApp()

    const response = await request(app).get('/api/admin/setup-status')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      setupRequired: false,
      adminExists: true,
    })
  })

  it('rejects unauthenticated telemetry status access', async () => {
    const app = buildApp()

    const response = await request(app).get('/api/admin/telemetry/status')

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({
      code: 'AUTH_ERROR',
      error: 'Missing authorization token',
    })
  })

  it('rejects unauthenticated admin user list access', async () => {
    const app = buildApp()

    const response = await request(app).get('/api/admin/users')

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({
      code: 'AUTH_ERROR',
      error: 'Missing authorization token',
    })
  })

  it('rejects invalid admin token for protected routes', async () => {
    const app = buildApp()
    mocks.mockVerifyAdminToken.mockImplementation(() => {
      throw new Error('invalid token')
    })

    const response = await request(app)
      .get('/api/admin/me')
      .set('Authorization', 'Bearer malformed-token')

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({
      code: 'INVALID_TOKEN',
      error: 'Invalid admin token',
    })
  })

  it('rejects READ_ONLY role for suspend and restore actions', async () => {
    const app = buildApp()

    const suspendResponse = await request(app)
      .patch('/api/admin/users/22222222-2222-4222-8222-222222222222/suspend')
      .set('Authorization', 'Bearer readonly-token')
      .send({ reason: 'test' })

    const restoreResponse = await request(app)
      .patch('/api/admin/users/22222222-2222-4222-8222-222222222222/restore')
      .set('Authorization', 'Bearer readonly-token')
      .send({ reason: 'test' })

    expect(suspendResponse.status).toBe(403)
    expect(restoreResponse.status).toBe(403)
    expect(suspendResponse.body.code).toBe('FORBIDDEN')
    expect(restoreResponse.body.code).toBe('FORBIDDEN')
  })

  it('rejects non-SUPER_ADMIN roles for promote and invite creation', async () => {
    const app = buildApp()
    mocks.mockVerifyAdminToken.mockReturnValue({
      userId: '11111111-1111-4111-8111-111111111111',
      username: 'admin-user',
      adminRole: 'ADMIN',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    })

    const promoteResponse = await request(app)
      .post('/api/admin/users/22222222-2222-4222-8222-222222222222/promote')
      .set('Authorization', 'Bearer admin-token')
      .send({ adminRole: 'ADMIN' })

    const inviteResponse = await request(app)
      .post('/api/admin/invites')
      .set('Authorization', 'Bearer admin-token')
      .send({ adminRole: 'ADMIN', email: 'invite@example.com' })

    expect(promoteResponse.status).toBe(403)
    expect(inviteResponse.status).toBe(403)
    expect(promoteResponse.body.code).toBe('FORBIDDEN')
    expect(inviteResponse.body.code).toBe('FORBIDDEN')
  })

  it('allows ADMIN role to suspend users', async () => {
    const app = buildApp()
    mocks.mockVerifyAdminToken.mockReturnValue({
      userId: '11111111-1111-4111-8111-111111111111',
      username: 'admin-user',
      adminRole: 'ADMIN',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    })

    const response = await request(app)
      .patch('/api/admin/users/22222222-2222-4222-8222-222222222222/suspend')
      .set('Authorization', 'Bearer admin-token')
      .send({ reason: 'policy' })

    expect(response.status).toBe(200)
    expect(response.body.message).toBe('User suspended successfully')
    expect(mocks.mockUserUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.mockAdminAuditCreate).toHaveBeenCalledTimes(1)
  })
})
