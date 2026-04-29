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
  mockPersistDiagnosticEvents: vi.fn(),
  mockLoadDiagnosticEvents: vi.fn(),
  mockFindDiagnosticEventById: vi.fn(),
  mockLoadLogRetentionSettings: vi.fn(),
  mockUpdateLogRetentionSettings: vi.fn(),
  mockCreateOperationalExportArtifact: vi.fn(),
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

vi.mock('@/infra/telemetry-store', () => ({
  loadTelemetryEvents: mocks.mockLoadTelemetryEvents,
  findTelemetryEventById: mocks.mockFindTelemetryEventById,
  persistDiagnosticEvents: mocks.mockPersistDiagnosticEvents,
  loadDiagnosticEvents: mocks.mockLoadDiagnosticEvents,
  findDiagnosticEventById: mocks.mockFindDiagnosticEventById,
  loadLogRetentionSettings: mocks.mockLoadLogRetentionSettings,
  updateLogRetentionSettings: mocks.mockUpdateLogRetentionSettings,
}))

vi.mock('@/core/portability/admin-portability', () => ({
  buildCampaignExport: vi.fn(),
  importCampaignBundle: vi.fn(),
  isValidTransferBundle: vi.fn().mockReturnValue(true),
  listRecordingMetadata: vi.fn(),
  createRecordingMetadata: vi.fn(),
  createOperationalExportArtifact: mocks.mockCreateOperationalExportArtifact,
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    user: {
      findUnique: mocks.mockUserFindUnique,
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    adminAuditLog: {
      findMany: mocks.mockAdminAuditFindMany,
      findUnique: mocks.mockAdminAuditFindUnique,
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
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
    appEventLogLegacy: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  }),
}))

import adminRoutes from '../../src/api/admin.routes'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin', adminRoutes)
  return app
}

describe('admin telemetry durability and drill-down', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const now = Date.now()
    const auditCreatedAt = new Date(now - 10 * 60 * 1000)
    const telemetryTimestamp = new Date(now - 5 * 60 * 1000).toISOString()
    const diagnosticTimestamp = new Date(now - 2 * 60 * 1000).toISOString()

    mocks.mockAdminUsersExist.mockResolvedValue(true)
    mocks.mockVerifyAdminToken.mockReturnValue({
      userId: '11111111-1111-4111-8111-111111111111',
      username: 'admin-operator',
      adminRole: 'ADMIN',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    })

    mocks.mockUserFindUnique.mockResolvedValue({
      isActive: true,
      tokenInvalidBefore: null,
    })

    mocks.mockAdminAuditFindMany.mockResolvedValue([
      {
        id: 'audit-1',
        actorUserId: '11111111-1111-4111-8111-111111111111',
        actorName: 'admin-operator',
        actorRole: 'ADMIN',
        action: 'USER_SUSPEND',
        targetType: 'USER',
        targetId: '22222222-2222-4222-8222-222222222222',
        outcome: 'SUCCESS',
        reason: 'policy',
        metadata: { reasonCode: 'abuse' },
        createdAt: auditCreatedAt,
      },
    ])

    mocks.mockLoadTelemetryEvents.mockResolvedValue([
      {
        id: 'telemetry-1',
        timestamp: telemetryTimestamp,
        severity: 'INFO',
        source: 'telemetry',
        message: 'ROOM_SWITCH',
        details: {
          userId: '33333333-3333-4333-8333-333333333333',
          role: 'PLAYER',
          properties: { from: 'main', to: 'group-1' },
        },
      },
    ])

    mocks.mockAdminAuditFindUnique.mockResolvedValue({
      id: 'audit-1',
      actorUserId: '11111111-1111-4111-8111-111111111111',
      actorName: 'admin-operator',
      actorRole: 'ADMIN',
      action: 'USER_SUSPEND',
      targetType: 'USER',
      targetId: '22222222-2222-4222-8222-222222222222',
      outcome: 'SUCCESS',
      reason: 'policy',
      metadata: { reasonCode: 'abuse' },
      createdAt: auditCreatedAt,
    })

    mocks.mockFindTelemetryEventById.mockResolvedValue({
      id: 'telemetry-1',
      timestamp: telemetryTimestamp,
      severity: 'INFO',
      source: 'telemetry',
      message: 'ROOM_SWITCH',
      details: {
        userId: '33333333-3333-4333-8333-333333333333',
        role: 'PLAYER',
        properties: { from: 'main', to: 'group-1' },
      },
    })

    mocks.mockLoadDiagnosticEvents.mockResolvedValue([
      {
        id: 'diag-1',
        timestamp: diagnosticTimestamp,
        severity: 'INFO',
        source: 'api',
        message: 'Request completed',
        details: { requestId: 'r-1', path: '/api/rooms' },
      },
    ])
    mocks.mockPersistDiagnosticEvents.mockResolvedValue([])
    mocks.mockFindDiagnosticEventById.mockResolvedValue({
      id: 'diag-1',
      timestamp: diagnosticTimestamp,
      severity: 'INFO',
      source: 'api',
      message: 'Request completed',
      details: { requestId: 'r-1', path: '/api/rooms' },
    })
    mocks.mockLoadLogRetentionSettings.mockResolvedValue({
      telemetryRetentionDays: 30,
      telemetryMaxFileSizeMb: 10,
      telemetryMaxFiles: 7,
      diagnosticRetentionDays: 14,
      diagnosticMaxFileSizeMb: 10,
      diagnosticMaxFiles: 7,
    })
    mocks.mockUpdateLogRetentionSettings.mockResolvedValue({
      telemetryRetentionDays: 45,
      telemetryMaxFileSizeMb: 20,
      telemetryMaxFiles: 9,
      diagnosticRetentionDays: 21,
      diagnosticMaxFileSizeMb: 15,
      diagnosticMaxFiles: 8,
    })
    mocks.mockCreateOperationalExportArtifact.mockResolvedValue({
      artifactId: 'ops-artifact-1',
      bundle: {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: { primaryRegion: 'us-east-1' },
        telemetry: [],
        diagnostics: [],
        auditLog: [],
      },
    })
  })

  it('returns merged telemetry and audit logs with durable ids', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/admin/telemetry/logs?source=all&page=1&pageSize=25')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(
      response.body.logs.some((log: { id: string }) => log.id === 'telemetry-telemetry-1')
    ).toBe(true)
    expect(response.body.logs.some((log: { id: string }) => log.id === 'audit-audit-1')).toBe(true)
    expect(response.body.logs.some((log: { id: string }) => log.id === 'diagnostic-diag-1')).toBe(
      true
    )
  })

  it('returns diagnostic drill-down details by durable id', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/admin/telemetry/logs/diagnostic-diag-1')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body.log.id).toBe('diagnostic-diag-1')
    expect(response.body.log.source).toBe('api')
  })

  it('returns telemetry drill-down details by durable id', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/admin/telemetry/logs/telemetry-telemetry-1')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body.log.id).toBe('telemetry-telemetry-1')
    expect(response.body.log.message).toBe('ROOM_SWITCH')
  })

  it('returns audit drill-down details by durable id', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/admin/telemetry/logs/audit-audit-1')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body.log.id).toBe('audit-audit-1')
    expect(response.body.log.source).toBe('admin-audit')
  })

  it('returns settings with retention policy fields', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/admin/settings')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body.settings.telemetryRetentionDays).toBe(30)
    expect(response.body.settings.diagnosticMaxFiles).toBe(7)
  })

  it('updates retention policy values through settings endpoint', async () => {
    const app = buildApp()

    const response = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', 'Bearer token')
      .send({
        telemetryRetentionDays: 45,
        telemetryMaxFileSizeMb: 20,
        telemetryMaxFiles: 9,
        diagnosticRetentionDays: 21,
        diagnosticMaxFileSizeMb: 15,
        diagnosticMaxFiles: 8,
      })

    expect(response.status).toBe(200)
    expect(mocks.mockUpdateLogRetentionSettings).toHaveBeenCalledWith({
      telemetryRetentionDays: 45,
      telemetryMaxFileSizeMb: 20,
      telemetryMaxFiles: 9,
      diagnosticRetentionDays: 21,
      diagnosticMaxFileSizeMb: 15,
      diagnosticMaxFiles: 8,
    })
    expect(response.body.settings.telemetryMaxFiles).toBe(9)
    expect(response.body.settings.diagnosticRetentionDays).toBe(21)
  })

  it('exports an operations bundle for archival workflows', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/admin/settings/backup/export')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body.artifactId).toBe('ops-artifact-1')
    expect(mocks.mockCreateOperationalExportArtifact).toHaveBeenCalledTimes(1)
  })
})
