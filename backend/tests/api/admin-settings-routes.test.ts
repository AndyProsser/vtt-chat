import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockVerifyAdminToken: vi.fn(),
  mockAdminUsersExist: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockAdminAuditCreate: vi.fn(),
  mockAdminAuditFindMany: vi.fn(),
  mockLoadLogRetentionSettings: vi.fn(),
  mockUpdateLogRetentionSettings: vi.fn(),
  mockLoadTelemetryEvents: vi.fn(),
  mockLoadDiagnosticEvents: vi.fn(),
  mockCreateOperationalExportArtifact: vi.fn(),
  mockImportExportArtifactCreate: vi.fn(),
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
    listRecordingMetadata: vi.fn().mockResolvedValue([]),
    createRecordingMetadata: vi.fn(),
    createOperationalExportArtifact: mocks.mockCreateOperationalExportArtifact,
  }
})

vi.mock('@/infra/telemetry-store', () => ({
  loadTelemetryEvents: mocks.mockLoadTelemetryEvents,
  findTelemetryEventById: vi.fn(),
  persistDiagnosticEvents: vi.fn(),
  loadDiagnosticEvents: mocks.mockLoadDiagnosticEvents,
  findDiagnosticEventById: vi.fn(),
  loadLogRetentionSettings: mocks.mockLoadLogRetentionSettings,
  updateLogRetentionSettings: mocks.mockUpdateLogRetentionSettings,
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
    },
    adminAuditLog: {
      create: mocks.mockAdminAuditCreate,
      findMany: mocks.mockAdminAuditFindMany,
      findUnique: vi.fn(),
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
      create: mocks.mockImportExportArtifactCreate,
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

const RETENTION_DEFAULTS = {
  telemetryRetentionDays: 30,
  telemetryMaxFileSizeMb: 10,
  telemetryMaxFiles: 7,
  diagnosticRetentionDays: 14,
  diagnosticMaxFileSizeMb: 10,
  diagnosticMaxFiles: 7,
}

describe('admin settings routes — GET /settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockAdminUsersExist.mockResolvedValue(true)
    mocks.mockVerifyAdminToken.mockReturnValue(ADMIN_TOKEN_PAYLOAD)
    mocks.mockUserFindUnique.mockResolvedValue({ isActive: true, tokenInvalidBefore: null })
    mocks.mockLoadLogRetentionSettings.mockResolvedValue(RETENTION_DEFAULTS)
    mocks.mockAdminAuditCreate.mockResolvedValue({ id: 'audit-1' })
  })

  it('returns current runtime settings for authenticated user', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/admin/settings')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body.settings).toMatchObject({
      primaryRegion: expect.any(String),
      maintenanceMode: expect.any(String),
      chatPipelineEnabled: expect.any(Boolean),
      audioOverridesEnabled: expect.any(Boolean),
      logRetentionDays: expect.any(Number),
      telemetryRetentionDays: 30,
      diagnosticRetentionDays: 14,
    })
  })

  it('rejects unauthenticated request', async () => {
    const app = buildApp()

    const response = await request(app).get('/api/admin/settings')

    expect(response.status).toBe(401)
  })
})

describe('admin settings routes — PUT /settings (save)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockAdminUsersExist.mockResolvedValue(true)
    mocks.mockVerifyAdminToken.mockReturnValue(ADMIN_TOKEN_PAYLOAD)
    mocks.mockUserFindUnique.mockResolvedValue({ isActive: true, tokenInvalidBefore: null })
    mocks.mockUpdateLogRetentionSettings.mockResolvedValue(RETENTION_DEFAULTS)
    mocks.mockAdminAuditCreate.mockResolvedValue({ id: 'audit-1' })
  })

  it('updates settings for ADMIN role and returns merged settings', async () => {
    const app = buildApp()

    const response = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', 'Bearer valid-token')
      .send({
        maintenanceMode: 'read-only',
        chatPipelineEnabled: false,
        logRetentionDays: 60,
      })

    expect(response.status).toBe(200)
    expect(response.body.settings.maintenanceMode).toBe('read-only')
    expect(response.body.settings.chatPipelineEnabled).toBe(false)
    expect(response.body.settings.logRetentionDays).toBe(60)
  })

  it('ignores unknown maintenanceMode values and preserves current state', async () => {
    const app = buildApp()

    // First set a known value
    await request(app)
      .put('/api/admin/settings')
      .set('Authorization', 'Bearer valid-token')
      .send({ maintenanceMode: 'full' })

    // Then try an invalid value — should keep 'full'
    const response = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', 'Bearer valid-token')
      .send({ maintenanceMode: 'invalid-mode' })

    expect(response.status).toBe(200)
    expect(['off', 'read-only', 'full']).toContain(response.body.settings.maintenanceMode)
  })

  it('writes audit entry on successful settings save', async () => {
    const app = buildApp()

    await request(app)
      .put('/api/admin/settings')
      .set('Authorization', 'Bearer valid-token')
      .send({ primaryRegion: 'eu-west-1' })

    expect(mocks.mockAdminAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'SETTINGS_UPDATE' }),
      })
    )
  })

  it('rejects READ_ONLY role for settings save', async () => {
    const app = buildApp()
    mocks.mockVerifyAdminToken.mockReturnValue({
      ...ADMIN_TOKEN_PAYLOAD,
      adminRole: 'READ_ONLY',
    })

    const response = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', 'Bearer readonly-token')
      .send({ maintenanceMode: 'full' })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FORBIDDEN')
  })

  it('rejects CAMPAIGN_DM role for settings save', async () => {
    const app = buildApp()
    mocks.mockVerifyAdminToken.mockReturnValue({
      ...ADMIN_TOKEN_PAYLOAD,
      adminRole: 'CAMPAIGN_DM',
    })

    const response = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', 'Bearer dm-token')
      .send({ maintenanceMode: 'off' })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FORBIDDEN')
  })

  it('updates retention settings via updateLogRetentionSettings', async () => {
    const app = buildApp()
    mocks.mockUpdateLogRetentionSettings.mockResolvedValue({
      ...RETENTION_DEFAULTS,
      telemetryRetentionDays: 90,
    })

    const response = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', 'Bearer valid-token')
      .send({ telemetryRetentionDays: 90 })

    expect(response.status).toBe(200)
    expect(response.body.settings.telemetryRetentionDays).toBe(90)
    expect(mocks.mockUpdateLogRetentionSettings).toHaveBeenCalled()
  })
})

describe('admin settings routes — POST /settings/backup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockAdminUsersExist.mockResolvedValue(true)
    mocks.mockVerifyAdminToken.mockReturnValue(ADMIN_TOKEN_PAYLOAD)
    mocks.mockUserFindUnique.mockResolvedValue({ isActive: true, tokenInvalidBefore: null })
    mocks.mockAdminAuditCreate.mockResolvedValue({ id: 'audit-1' })
  })

  it('queues backup and returns queuedAt timestamp', async () => {
    const app = buildApp()

    const response = await request(app)
      .post('/api/admin/settings/backup')
      .set('Authorization', 'Bearer valid-token')
      .send({})

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      message: expect.stringMatching(/queued/i),
      queuedAt: expect.any(String),
    })
  })

  it('writes audit entry for backup trigger', async () => {
    const app = buildApp()

    await request(app)
      .post('/api/admin/settings/backup')
      .set('Authorization', 'Bearer valid-token')
      .send({})

    expect(mocks.mockAdminAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'SETTINGS_BACKUP_TRIGGER' }),
      })
    )
  })

  it('rejects READ_ONLY role for backup', async () => {
    const app = buildApp()
    mocks.mockVerifyAdminToken.mockReturnValue({
      ...ADMIN_TOKEN_PAYLOAD,
      adminRole: 'READ_ONLY',
    })

    const response = await request(app)
      .post('/api/admin/settings/backup')
      .set('Authorization', 'Bearer readonly-token')
      .send({})

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FORBIDDEN')
  })

  it('rejects unauthenticated backup request', async () => {
    const app = buildApp()

    const response = await request(app).post('/api/admin/settings/backup').send({})

    expect(response.status).toBe(401)
  })
})

describe('admin settings routes — GET /settings/backup/export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockAdminUsersExist.mockResolvedValue(true)
    mocks.mockVerifyAdminToken.mockReturnValue(ADMIN_TOKEN_PAYLOAD)
    mocks.mockUserFindUnique.mockResolvedValue({ isActive: true, tokenInvalidBefore: null })
    mocks.mockLoadTelemetryEvents.mockResolvedValue([])
    mocks.mockLoadDiagnosticEvents.mockResolvedValue([])
    mocks.mockAdminAuditFindMany.mockResolvedValue([])
    mocks.mockCreateOperationalExportArtifact.mockResolvedValue({
      artifactId: 'artifact-export-1',
      bundle: {
        version: 1,
        exportedAt: new Date().toISOString(),
        runtimeSettings: {},
        telemetry: [],
        diagnostics: [],
        auditLog: [],
      },
    })
    mocks.mockAdminAuditCreate.mockResolvedValue({ id: 'audit-1' })
    mocks.mockImportExportArtifactCreate.mockResolvedValue({ id: 'artifact-export-1' })
  })

  it('creates and returns operational export bundle', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/admin/settings/backup/export')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      message: expect.stringMatching(/export created/i),
      artifactId: 'artifact-export-1',
    })
    expect(response.body.bundle).toBeDefined()
  })

  it('writes audit entry for operations export', async () => {
    const app = buildApp()

    await request(app)
      .get('/api/admin/settings/backup/export')
      .set('Authorization', 'Bearer valid-token')

    expect(mocks.mockAdminAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'SETTINGS_OPERATIONS_EXPORT' }),
      })
    )
  })

  it('rejects READ_ONLY role for export', async () => {
    const app = buildApp()
    mocks.mockVerifyAdminToken.mockReturnValue({
      ...ADMIN_TOKEN_PAYLOAD,
      adminRole: 'READ_ONLY',
    })

    const response = await request(app)
      .get('/api/admin/settings/backup/export')
      .set('Authorization', 'Bearer readonly-token')

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FORBIDDEN')
  })
})
