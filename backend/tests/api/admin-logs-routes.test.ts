import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockVerifyAdminToken: vi.fn(),
  mockAdminUsersExist: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockAdminAuditFindMany: vi.fn(),
  mockAdminAuditFindUnique: vi.fn(),
  mockLoadTelemetryEvents: vi.fn(),
  mockFindTelemetryEventById: vi.fn(),
  mockLoadDiagnosticEvents: vi.fn(),
  mockFindDiagnosticEventById: vi.fn(),
  mockPersistDiagnosticEvents: vi.fn(),
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
    promoteUserAdminRole: vi.fn(),
    getAdminById: vi.fn(),
  },
}))

vi.mock('@/services/admin-portability.service', () => ({
  buildCampaignExport: vi.fn(),
  importCampaignBundle: vi.fn(),
  isValidTransferBundle: vi.fn().mockReturnValue(true),
  listRecordingMetadata: vi.fn(),
  createRecordingMetadata: vi.fn(),
  createOperationalExportArtifact: vi.fn(),
}))

vi.mock('@/infra/telemetry-store', () => ({
  loadTelemetryEvents: mocks.mockLoadTelemetryEvents,
  findTelemetryEventById: mocks.mockFindTelemetryEventById,
  persistDiagnosticEvents: mocks.mockPersistDiagnosticEvents,
  loadDiagnosticEvents: mocks.mockLoadDiagnosticEvents,
  findDiagnosticEventById: mocks.mockFindDiagnosticEventById,
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
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    adminAuditLog: {
      create: vi.fn(),
      findMany: mocks.mockAdminAuditFindMany,
      findUnique: mocks.mockAdminAuditFindUnique,
      count: vi.fn().mockResolvedValue(0),
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

const recentTs = () => new Date(Date.now() - 5 * 60 * 1000).toISOString() // 5 minutes ago

const SAMPLE_TELEMETRY_EVENT = {
  id: 'tel-001',
  timestamp: recentTs(),
  severity: 'INFO',
  source: 'chat',
  message: 'Message sent',
  details: { userId: 'user-1', roomId: 'room-1' },
}

const SAMPLE_DIAGNOSTIC_EVENT = {
  id: 'diag-001',
  timestamp: recentTs(),
  severity: 'WARN',
  source: 'ws-dispatcher',
  message: 'Slow handler detected',
  details: { handlerName: 'CHAT:MESSAGE' },
}

const SAMPLE_AUDIT_ROW = {
  id: 'audit-row-001',
  actorUserId: '11111111-1111-4111-8111-111111111111',
  actorName: 'admin-operator',
  actorRole: 'ADMIN',
  action: 'USER_SUSPEND',
  targetType: 'USER',
  targetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  outcome: 'SUCCESS',
  reason: 'Terms violation',
  metadata: {},
  createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
}

describe('admin telemetry/logs route — list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockAdminUsersExist.mockResolvedValue(true)
    mocks.mockVerifyAdminToken.mockReturnValue(ADMIN_TOKEN_PAYLOAD)
    mocks.mockUserFindUnique.mockResolvedValue({ isActive: true, tokenInvalidBefore: null })
    mocks.mockLoadTelemetryEvents.mockResolvedValue([SAMPLE_TELEMETRY_EVENT])
    mocks.mockLoadDiagnosticEvents.mockResolvedValue([SAMPLE_DIAGNOSTIC_EVENT])
    mocks.mockPersistDiagnosticEvents.mockResolvedValue(undefined)
    mocks.mockAdminAuditFindMany.mockResolvedValue([SAMPLE_AUDIT_ROW])
    mocks.mockAdminAuditFindUnique.mockResolvedValue(null)
  })

  it('returns merged telemetry, diagnostic, and audit log entries', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/admin/telemetry/logs')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      page: 1,
      pageSize: 25,
    })
    expect(Array.isArray(response.body.logs)).toBe(true)
    // should include telemetry, diagnostic, and audit entries
    const ids = response.body.logs.map((e: { id: string }) => e.id)
    expect(ids.some((id: string) => id.startsWith('telemetry-'))).toBe(true)
    expect(ids.some((id: string) => id.startsWith('diagnostic-'))).toBe(true)
    expect(ids.some((id: string) => id.startsWith('audit-'))).toBe(true)
  })

  it('filters by severity=WARN', async () => {
    const app = buildApp()
    // telemetry event is INFO, should be filtered out; diagnostic WARN stays; audit INFO stays
    mocks.mockAdminAuditFindMany.mockResolvedValue([]) // audit logs filtered separately

    const response = await request(app)
      .get('/api/admin/telemetry/logs?severity=WARN')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    const nonWarnLogs = response.body.logs.filter(
      (e: { severity: string }) => e.severity !== 'WARN'
    )
    expect(nonWarnLogs).toHaveLength(0)
  })

  it('filters by source', async () => {
    const app = buildApp()
    mocks.mockAdminAuditFindMany.mockResolvedValue([])

    const response = await request(app)
      .get('/api/admin/telemetry/logs?source=chat')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    const chatLogs = response.body.logs.filter((e: { source: string }) =>
      e.source.toLowerCase().includes('chat')
    )
    expect(chatLogs.length).toBeGreaterThan(0)
  })

  it('returns sorted logs with sortBy=timestamp sortDir=asc', async () => {
    const app = buildApp()
    mocks.mockAdminAuditFindMany.mockResolvedValue([])

    const response = await request(app)
      .get('/api/admin/telemetry/logs?sortBy=timestamp&sortDir=asc')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body.sortBy).toBe('timestamp')
    expect(response.body.sortDir).toBe('asc')
  })

  it('respects page and pageSize parameters', async () => {
    const app = buildApp()
    mocks.mockAdminAuditFindMany.mockResolvedValue([])

    const response = await request(app)
      .get('/api/admin/telemetry/logs?page=1&pageSize=1')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body.pageSize).toBe(1)
    expect(response.body.logs.length).toBeLessThanOrEqual(1)
  })

  it('rejects unauthenticated request', async () => {
    const app = buildApp()

    const response = await request(app).get('/api/admin/telemetry/logs')

    expect(response.status).toBe(401)
  })
})

describe('admin telemetry/logs/:logId — drill-down', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockAdminUsersExist.mockResolvedValue(true)
    mocks.mockVerifyAdminToken.mockReturnValue(ADMIN_TOKEN_PAYLOAD)
    mocks.mockUserFindUnique.mockResolvedValue({ isActive: true, tokenInvalidBefore: null })
    mocks.mockFindTelemetryEventById.mockResolvedValue(null)
    mocks.mockFindDiagnosticEventById.mockResolvedValue(null)
    mocks.mockAdminAuditFindUnique.mockResolvedValue(null)
  })

  it('returns telemetry log entry by telemetry-prefixed id', async () => {
    const app = buildApp()
    mocks.mockFindTelemetryEventById.mockResolvedValue(SAMPLE_TELEMETRY_EVENT)

    const response = await request(app)
      .get('/api/admin/telemetry/logs/telemetry-tel-001')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body.log).toMatchObject({
      id: 'telemetry-tel-001',
      severity: 'INFO',
      source: 'chat',
    })
  })

  it('returns diagnostic log entry by diagnostic-prefixed id', async () => {
    const app = buildApp()
    mocks.mockFindDiagnosticEventById.mockResolvedValue(SAMPLE_DIAGNOSTIC_EVENT)

    const response = await request(app)
      .get('/api/admin/telemetry/logs/diagnostic-diag-001')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body.log).toMatchObject({
      id: 'diagnostic-diag-001',
      severity: 'WARN',
      source: 'ws-dispatcher',
    })
  })

  it('returns audit log entry by audit-prefixed id', async () => {
    const app = buildApp()
    mocks.mockAdminAuditFindUnique.mockResolvedValue(SAMPLE_AUDIT_ROW)

    const response = await request(app)
      .get('/api/admin/telemetry/logs/audit-audit-row-001')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body.log).toMatchObject({
      id: 'audit-audit-row-001',
      source: 'admin-audit',
    })
  })

  it('returns 404 for unknown telemetry id', async () => {
    const app = buildApp()
    mocks.mockFindTelemetryEventById.mockResolvedValue(null)

    const response = await request(app)
      .get('/api/admin/telemetry/logs/telemetry-missing')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(404)
    expect(response.body.code).toBe('NOT_FOUND')
  })

  it('returns 404 for unknown audit id', async () => {
    const app = buildApp()
    mocks.mockAdminAuditFindUnique.mockResolvedValue(null)

    const response = await request(app)
      .get('/api/admin/telemetry/logs/audit-nonexistent')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(404)
    expect(response.body.code).toBe('NOT_FOUND')
  })

  it('returns 400 for unsupported log source prefix', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/admin/telemetry/logs/unknown-log-type-123')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(400)
    expect(response.body.code).toBe('DRILLDOWN_NOT_SUPPORTED')
  })
})
