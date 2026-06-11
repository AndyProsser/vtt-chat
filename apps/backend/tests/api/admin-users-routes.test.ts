import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockVerifyAdminToken: vi.fn(),
  mockAdminUsersExist: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockUserCount: vi.fn(),
  mockAdminAuditCreate: vi.fn(),
}))

vi.mock('@/utils', () => ({
  verifyAdminToken: mocks.mockVerifyAdminToken,
}))

vi.mock('@/services/admin.service', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/services/admin.service')>()
  return {
    ...mod,
    AdminService: {
      adminUsersExist: mocks.mockAdminUsersExist,
      createAdmin: vi.fn(),
      authenticateAdmin: vi.fn(),
      getAdminUsers: vi.fn(),
      promoteUserAdminRole: vi.fn(),
      getAdminById: vi.fn(),
    },
    buildCampaignExport: vi.fn(),
    importCampaignBundle: vi.fn(),
    isValidTransferBundle: vi.fn().mockReturnValue(true),
    listRecordingMetadata: vi.fn(),
    createRecordingMetadata: vi.fn(),
    createOperationalExportArtifact: vi.fn(),
  }
})

vi.mock('@/infra/telemetry-store', () => ({
  loadTelemetryEvents: vi.fn().mockResolvedValue([]),
  findTelemetryEventById: vi.fn(),
  persistDiagnosticEvents: vi.fn(),
  loadDiagnosticEvents: vi.fn().mockResolvedValue([]),
  findDiagnosticEventById: vi.fn(),
  loadLogRetentionSettings: vi.fn().mockResolvedValue({
    telemetryRetentionDays: 30,
    telemetryMaxFileSizeMb: 10,
    telemetryMaxFiles: 7,
    diagnosticRetentionDays: 14,
    diagnosticMaxFileSizeMb: 10,
    diagnosticMaxFiles: 7,
  }),
  updateLogRetentionSettings: vi.fn().mockResolvedValue({
    telemetryRetentionDays: 30,
    telemetryMaxFileSizeMb: 10,
    telemetryMaxFiles: 7,
    diagnosticRetentionDays: 14,
    diagnosticMaxFileSizeMb: 10,
    diagnosticMaxFiles: 7,
  }),
}))

vi.mock('@/services/integrations.service', () => ({
  listExternalSystems: vi.fn().mockReturnValue([]),
  updateExternalSystem: vi.fn(),
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    user: {
      findUnique: mocks.mockUserFindUnique,
      findMany: mocks.mockUserFindMany,
      count: mocks.mockUserCount,
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    adminAuditLog: {
      create: mocks.mockAdminAuditCreate,
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn(),
    },
    appEventLog: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    campaign: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    session: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    room: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    sessionMember: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
    },
    presenceSnapshot: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    adminInvite: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    userInviteToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    importExportArtifact: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    recordingMetadata: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    externalIdentity: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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

const ADMIN_TOKEN_PAYLOAD = {
  userId: '11111111-1111-4111-8111-111111111111',
  username: 'admin-operator',
  adminRole: 'ADMIN' as const,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
}

const SAMPLE_USERS = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    username: 'alice',
    email: 'alice@example.com',
    displayName: 'Alice',
    role: 'DM',
    adminRole: null,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-10'),
    tokenInvalidBefore: null,
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    username: 'bob',
    email: 'bob@example.com',
    displayName: 'Bob',
    role: 'PLAYER',
    adminRole: null,
    isActive: false,
    createdAt: new Date('2026-01-02'),
    updatedAt: new Date('2026-01-11'),
    tokenInvalidBefore: null,
  },
]

describe('admin users routes — list and filter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockAdminUsersExist.mockResolvedValue(true)
    mocks.mockVerifyAdminToken.mockReturnValue(ADMIN_TOKEN_PAYLOAD)
    mocks.mockUserFindUnique.mockResolvedValue({ isActive: true, tokenInvalidBefore: null })
    mocks.mockUserFindMany.mockResolvedValue(SAMPLE_USERS)
    mocks.mockUserCount.mockResolvedValue(2)
    mocks.mockAdminAuditCreate.mockResolvedValue({ id: 'audit-1' })
  })

  it('returns paginated user list for authenticated ADMIN', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/admin/users')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      total: 2,
      page: 1,
      pageSize: 25,
    })
    expect(Array.isArray(response.body.users)).toBe(true)
    expect(response.body.users).toHaveLength(2)
  })

  it('applies search filter to user query', async () => {
    const app = buildApp()
    mocks.mockUserFindMany.mockResolvedValue([SAMPLE_USERS[0]])
    mocks.mockUserCount.mockResolvedValue(1)

    const response = await request(app)
      .get('/api/admin/users?search=alice')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body.total).toBe(1)
    expect(response.body.users[0].username).toBe('alice')
  })

  it('applies status=active filter', async () => {
    const app = buildApp()
    mocks.mockUserFindMany.mockResolvedValue([SAMPLE_USERS[0]])
    mocks.mockUserCount.mockResolvedValue(1)

    const response = await request(app)
      .get('/api/admin/users?status=active')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body.total).toBe(1)
  })

  it('applies status=suspended filter', async () => {
    const app = buildApp()
    mocks.mockUserFindMany.mockResolvedValue([SAMPLE_USERS[1]])
    mocks.mockUserCount.mockResolvedValue(1)

    const response = await request(app)
      .get('/api/admin/users?status=suspended')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body.total).toBe(1)
    expect(response.body.users[0].isActive).toBe(false)
  })

  it('applies role=dm filter', async () => {
    const app = buildApp()
    mocks.mockUserFindMany.mockResolvedValue([SAMPLE_USERS[0]])
    mocks.mockUserCount.mockResolvedValue(1)

    const response = await request(app)
      .get('/api/admin/users?role=dm')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body.users[0].role).toBe('DM')
  })

  it('applies page and pageSize params', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/admin/users?page=2&pageSize=10')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body.page).toBe(2)
    expect(response.body.pageSize).toBe(10)
  })

  it('rejects unauthenticated request', async () => {
    const app = buildApp()

    const response = await request(app).get('/api/admin/users')

    expect(response.status).toBe(401)
    expect(response.body.code).toBe('AUTH_ERROR')
  })

  it('includes effectiveAdminRole derived from role for DM users', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/admin/users')
      .set('Authorization', 'Bearer valid-token')

    const dmUser = response.body.users.find((u: { role: string }) => u.role === 'DM')
    expect(dmUser?.effectiveAdminRole).toBe('CAMPAIGN_DM')
  })
})

describe('admin users routes — export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockAdminUsersExist.mockResolvedValue(true)
    mocks.mockVerifyAdminToken.mockReturnValue(ADMIN_TOKEN_PAYLOAD)
    mocks.mockUserFindUnique.mockResolvedValue({ isActive: true, tokenInvalidBefore: null })
    mocks.mockUserFindMany.mockResolvedValue(SAMPLE_USERS)
    mocks.mockUserCount.mockResolvedValue(2)
    mocks.mockAdminAuditCreate.mockResolvedValue({ id: 'audit-1' })
  })

  it('exports users as JSON by default', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/admin/users/export')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/application\/json/)
    expect(response.body).toMatchObject({ count: 2 })
    expect(Array.isArray(response.body.users)).toBe(true)
  })

  it('exports users as CSV when format=csv', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/admin/users/export?format=csv')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/text\/csv/)
    expect(response.headers['content-disposition']).toMatch(/users-export\.csv/)
    expect(response.text).toContain('id,username,email')
  })

  it('rejects READ_ONLY role for user export', async () => {
    const app = buildApp()
    mocks.mockVerifyAdminToken.mockReturnValue({
      ...ADMIN_TOKEN_PAYLOAD,
      adminRole: 'READ_ONLY',
    })

    const response = await request(app)
      .get('/api/admin/users/export')
      .set('Authorization', 'Bearer readonly-token')

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FORBIDDEN')
  })

  it('writes audit entry on successful export', async () => {
    const app = buildApp()

    await request(app).get('/api/admin/users/export').set('Authorization', 'Bearer valid-token')

    expect(mocks.mockAdminAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'EXPORT_USERS' }),
      })
    )
  })
})

describe('admin users routes — import preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockAdminUsersExist.mockResolvedValue(true)
    mocks.mockVerifyAdminToken.mockReturnValue({
      ...ADMIN_TOKEN_PAYLOAD,
      adminRole: 'SUPER_ADMIN' as const,
    })
    mocks.mockUserFindUnique.mockResolvedValue({ isActive: true, tokenInvalidBefore: null })
    mocks.mockUserFindMany.mockResolvedValue([])
    mocks.mockAdminAuditCreate.mockResolvedValue({ id: 'audit-1' })
  })

  it('returns preview for valid user import batch', async () => {
    const app = buildApp()

    const response = await request(app)
      .post('/api/admin/users/import/preview')
      .set('Authorization', 'Bearer superadmin-token')
      .send({
        users: [
          { username: 'new-user', email: 'new@example.com', role: 'PLAYER' },
          { username: 'dm-user', email: 'dm@example.com', role: 'DM' },
        ],
      })

    expect(response.status).toBe(200)
    expect(response.body.total).toBe(2)
    expect(response.body.importable).toBe(2)
    expect(Array.isArray(response.body.preview)).toBe(true)
  })

  it('flags conflicts for existing usernames', async () => {
    const app = buildApp()
    mocks.mockUserFindMany.mockResolvedValue([{ username: 'existing-user' }])

    const response = await request(app)
      .post('/api/admin/users/import/preview')
      .set('Authorization', 'Bearer superadmin-token')
      .send({
        users: [
          { username: 'existing-user', email: 'existing@example.com', role: 'PLAYER' },
          { username: 'brand-new', email: 'new@example.com', role: 'PLAYER' },
        ],
      })

    expect(response.status).toBe(200)
    const existingPreview = response.body.preview.find(
      (r: { username: string }) => r.username === 'existing-user'
    )
    const newPreview = response.body.preview.find(
      (r: { username: string }) => r.username === 'brand-new'
    )
    expect(existingPreview.conflict).toBe(true)
    expect(newPreview.conflict).toBe(false)
    expect(response.body.importable).toBe(1)
  })

  it('rejects empty users array', async () => {
    const app = buildApp()

    const response = await request(app)
      .post('/api/admin/users/import/preview')
      .set('Authorization', 'Bearer superadmin-token')
      .send({ users: [] })

    expect(response.status).toBe(400)
    expect(response.body.code).toBe('INVALID_BODY')
  })

  it('rejects batch exceeding 500 rows', async () => {
    const app = buildApp()
    const oversized = Array.from({ length: 501 }, (_, i) => ({
      username: `user-${i}`,
      email: `user${i}@example.com`,
      role: 'PLAYER',
    }))

    const response = await request(app)
      .post('/api/admin/users/import/preview')
      .set('Authorization', 'Bearer superadmin-token')
      .send({ users: oversized })

    expect(response.status).toBe(400)
    expect(response.body.code).toBe('TOO_MANY_ROWS')
  })

  it('rejects non-SUPER_ADMIN role for import preview', async () => {
    const app = buildApp()
    mocks.mockVerifyAdminToken.mockReturnValue(ADMIN_TOKEN_PAYLOAD) // ADMIN, not SUPER_ADMIN

    const response = await request(app)
      .post('/api/admin/users/import/preview')
      .set('Authorization', 'Bearer admin-token')
      .send({ users: [{ username: 'new-user', email: 'new@example.com', role: 'PLAYER' }] })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FORBIDDEN')
  })

  it('marks invalid rows with short usernames', async () => {
    const app = buildApp()

    const response = await request(app)
      .post('/api/admin/users/import/preview')
      .set('Authorization', 'Bearer superadmin-token')
      .send({
        users: [
          { username: 'x', email: 'x@example.com', role: 'PLAYER' }, // too short
          { username: 'valid-user', email: 'valid@example.com', role: 'PLAYER' },
        ],
      })

    expect(response.status).toBe(200)
    const invalid = response.body.preview.find((r: { username: string }) => r.username === 'x')
    const valid = response.body.preview.find(
      (r: { username: string }) => r.username === 'valid-user'
    )
    expect(invalid.valid).toBe(false)
    expect(valid.valid).toBe(true)
  })
})
