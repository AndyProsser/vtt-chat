import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetExternalSystemsRegistryForTests } from '@/services/integrations.service'

const mocks = vi.hoisted(() => ({
  mockVerifyAdminToken: vi.fn(),
  mockAdminUsersExist: vi.fn(),
  mockFindUnique: vi.fn(),
  mockAdminAuditCreate: vi.fn(),
}))

vi.mock('@/utils', () => ({
  verifyAdminToken: mocks.mockVerifyAdminToken,
}))

vi.mock('@/services/admin.service', () => ({
  AdminService: {
    adminUsersExist: mocks.mockAdminUsersExist,
    createInitialAdmin: vi.fn(),
    authenticateAdmin: vi.fn(),
    getAdminUsers: vi.fn(),
    promoteUserAdminRole: vi.fn(),
    getAdminById: vi.fn(),
  },
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    user: {
      findUnique: mocks.mockFindUnique,
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    campaign: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    session: {
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
    room: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    sessionMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    presenceSnapshot: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    adminAuditLog: {
      create: mocks.mockAdminAuditCreate,
      findMany: vi.fn(),
      count: vi.fn(),
    },
    adminInvite: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    appEventLog: {
      findMany: vi.fn().mockResolvedValue([]),
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

describe('admin integrations systems endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetExternalSystemsRegistryForTests()

    mocks.mockAdminUsersExist.mockResolvedValue(true)
    mocks.mockVerifyAdminToken.mockReturnValue({
      userId: '11111111-1111-4111-8111-111111111111',
      username: 'ops-admin',
      adminRole: 'ADMIN',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    mocks.mockFindUnique.mockResolvedValue({
      isActive: true,
      tokenInvalidBefore: null,
    })
    mocks.mockAdminAuditCreate.mockResolvedValue({ id: 'audit-1' })
  })

  it('lists external systems with default blocked state', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/admin/integrations/systems')
      .set('Authorization', 'Bearer admin-token')

    expect(response.status).toBe(200)
    expect(Array.isArray(response.body.systems)).toBe(true)
    expect(
      response.body.systems.some((system: { system: string }) => system.system === 'dndbeyond')
    ).toBe(true)
  })

  it('rejects READ_ONLY role for mutation routes', async () => {
    const app = buildApp()
    mocks.mockVerifyAdminToken.mockReturnValue({
      userId: '11111111-1111-4111-8111-111111111111',
      username: 'readonly-admin',
      adminRole: 'READ_ONLY',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    })

    const response = await request(app)
      .post('/api/admin/integrations/systems/dndbeyond/authorize')
      .set('Authorization', 'Bearer readonly-token')

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FORBIDDEN')
  })

  it('authorizes and blocks systems with audit entries', async () => {
    const app = buildApp()

    const authorizeResponse = await request(app)
      .post('/api/admin/integrations/systems/dndbeyond/authorize')
      .set('Authorization', 'Bearer admin-token')

    expect(authorizeResponse.status).toBe(200)
    expect(authorizeResponse.body.system.authorizationState).toBe('AUTHORIZED')

    const blockResponse = await request(app)
      .post('/api/admin/integrations/systems/dndbeyond/block')
      .set('Authorization', 'Bearer admin-token')

    expect(blockResponse.status).toBe(200)
    expect(blockResponse.body.system.authorizationState).toBe('BLOCKED')
    expect(mocks.mockAdminAuditCreate).toHaveBeenCalledTimes(2)
  })

  it('updates system to log-only with notes', async () => {
    const app = buildApp()

    const response = await request(app)
      .patch('/api/admin/integrations/systems/roll20')
      .set('Authorization', 'Bearer admin-token')
      .send({
        authorizationState: 'LOG_ONLY',
        notes: 'Enable import telemetry only',
      })

    expect(response.status).toBe(200)
    expect(response.body.system.authorizationState).toBe('LOG_ONLY')
    expect(response.body.system.allowedScopes).toContain('log_ingestion')
  })
})
