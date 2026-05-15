import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockVerifyAdminToken: vi.fn(),
  mockAdminUsersExist: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockCampaignFindUnique: vi.fn(),
  mockCampaignFindMany: vi.fn(),
  mockCampaignCount: vi.fn(),
  mockCampaignUpdate: vi.fn(),
  mockSessionUpdateMany: vi.fn(),
  mockSessionFindUnique: vi.fn(),
  mockSessionFindFirst: vi.fn(),
  mockSessionUpdate: vi.fn(),
  mockRoomFindMany: vi.fn(),
  mockRoomFindFirst: vi.fn(),
  mockSessionMemberFindMany: vi.fn(),
  mockPresenceFindMany: vi.fn(),
  mockPresenceGroupBy: vi.fn(),
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
    listRecordingMetadata: vi.fn().mockResolvedValue([]),
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
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn(),
      update: vi.fn(),
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
      findUnique: mocks.mockCampaignFindUnique,
      findMany: mocks.mockCampaignFindMany,
      count: mocks.mockCampaignCount,
      update: mocks.mockCampaignUpdate,
    },
    session: {
      updateMany: mocks.mockSessionUpdateMany,
      findUnique: mocks.mockSessionFindUnique,
      findFirst: mocks.mockSessionFindFirst,
      update: mocks.mockSessionUpdate,
      count: vi.fn().mockResolvedValue(0),
    },
    room: {
      findMany: mocks.mockRoomFindMany,
      findUnique: vi.fn(),
      findFirst: mocks.mockRoomFindFirst,
    },
    sessionMember: {
      findMany: mocks.mockSessionMemberFindMany,
      findUnique: vi.fn(),
    },
    presenceSnapshot: {
      findMany: mocks.mockPresenceFindMany,
      findUnique: vi.fn(),
      upsert: vi.fn(),
      groupBy: mocks.mockPresenceGroupBy,
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

const CAMPAIGN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SESSION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const SAMPLE_CAMPAIGN = {
  id: CAMPAIGN_ID,
  name: 'Ashfall',
  description: 'Epic campaign',
  inviteCode: 'ASHFALL',
  currentDmId: '22222222-2222-4222-8222-222222222222',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-10'),
  currentDm: { id: '22222222-2222-4222-8222-222222222222', username: 'dm-alice' },
  _count: { members: 4, sessions: 2 },
  sessions: [
    {
      id: SESSION_ID,
      name: 'Session One',
      state: 'ACTIVE',
      createdAt: new Date('2026-01-05'),
      startedAt: new Date('2026-01-05T18:00:00Z'),
      endedAt: null,
      updatedAt: new Date('2026-01-10'),
      _count: { rooms: 3, members: 4 },
    },
  ],
}

describe('admin campaigns routes — list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockAdminUsersExist.mockResolvedValue(true)
    mocks.mockVerifyAdminToken.mockReturnValue(ADMIN_TOKEN_PAYLOAD)
    mocks.mockUserFindUnique.mockResolvedValue({ isActive: true, tokenInvalidBefore: null })
    mocks.mockCampaignFindMany.mockResolvedValue([SAMPLE_CAMPAIGN])
    mocks.mockCampaignCount.mockResolvedValue(1)
    mocks.mockAdminAuditCreate.mockResolvedValue({ id: 'audit-1' })
  })

  it('returns paginated campaign list for authenticated ADMIN', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/admin/campaigns')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ total: 1, page: 1, pageSize: 20 })
    expect(Array.isArray(response.body.campaigns)).toBe(true)
    expect(response.body.campaigns[0].name).toBe('Ashfall')
  })

  it('includes isArchived flag derived from description', async () => {
    const app = buildApp()
    mocks.mockCampaignFindMany.mockResolvedValue([
      { ...SAMPLE_CAMPAIGN, description: '[ARCHIVED] Epic campaign' },
    ])

    const response = await request(app)
      .get('/api/admin/campaigns')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body.campaigns[0].isArchived).toBe(true)
  })

  it('applies search filter', async () => {
    const app = buildApp()
    mocks.mockCampaignFindMany.mockResolvedValue([SAMPLE_CAMPAIGN])
    mocks.mockCampaignCount.mockResolvedValue(1)

    const response = await request(app)
      .get('/api/admin/campaigns?search=Ashfall')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body.total).toBe(1)
  })

  it('applies page and pageSize params', async () => {
    const app = buildApp()

    const response = await request(app)
      .get('/api/admin/campaigns?page=2&pageSize=5')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body.page).toBe(2)
    expect(response.body.pageSize).toBe(5)
  })

  it('rejects unauthenticated request', async () => {
    const app = buildApp()

    const response = await request(app).get('/api/admin/campaigns')

    expect(response.status).toBe(401)
  })
})

describe('admin campaigns routes — rooms endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockAdminUsersExist.mockResolvedValue(true)
    mocks.mockVerifyAdminToken.mockReturnValue(ADMIN_TOKEN_PAYLOAD)
    mocks.mockUserFindUnique.mockResolvedValue({ isActive: true, tokenInvalidBefore: null })
    mocks.mockCampaignFindUnique.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: 'Ashfall',
      currentDmId: '22222222-2222-4222-8222-222222222222',
    })
    mocks.mockSessionFindFirst.mockResolvedValue({
      id: SESSION_ID,
      name: 'Session One',
      state: 'ACTIVE',
      updatedAt: new Date(),
    })
    mocks.mockRoomFindMany.mockResolvedValue([
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        name: 'Main Room',
        type: 'MAIN',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    mocks.mockPresenceGroupBy.mockResolvedValue([])
    mocks.mockSessionMemberFindMany.mockResolvedValue([
      { userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', username: 'player-one', role: 'PLAYER' },
    ])
    mocks.mockPresenceFindMany.mockResolvedValue([])
    mocks.mockAdminAuditCreate.mockResolvedValue({ id: 'audit-1' })
  })

  it('returns campaign rooms with member presence data', async () => {
    const app = buildApp()

    const response = await request(app)
      .get(`/api/admin/campaigns/${CAMPAIGN_ID}/rooms`)
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body.campaign.id).toBe(CAMPAIGN_ID)
    expect(Array.isArray(response.body.rooms)).toBe(true)
    expect(Array.isArray(response.body.members)).toBe(true)
  })

  it('returns empty rooms array when campaign has no sessions', async () => {
    const app = buildApp()
    mocks.mockSessionFindFirst.mockResolvedValue(null)

    const response = await request(app)
      .get(`/api/admin/campaigns/${CAMPAIGN_ID}/rooms`)
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(200)
    expect(response.body.session).toBeNull()
    expect(response.body.rooms).toHaveLength(0)
  })

  it('returns 404 for unknown campaign', async () => {
    const app = buildApp()
    mocks.mockCampaignFindUnique.mockResolvedValue(null)

    const response = await request(app)
      .get('/api/admin/campaigns/nonexistent-campaign/rooms')
      .set('Authorization', 'Bearer valid-token')

    expect(response.status).toBe(404)
    expect(response.body.code).toBe('NOT_FOUND')
  })
})

describe('admin campaigns routes — session end', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockAdminUsersExist.mockResolvedValue(true)
    mocks.mockVerifyAdminToken.mockReturnValue(ADMIN_TOKEN_PAYLOAD)
    mocks.mockUserFindUnique.mockResolvedValue({ isActive: true, tokenInvalidBefore: null })
    mocks.mockCampaignFindUnique.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: 'Ashfall',
      currentDmId: '22222222-2222-4222-8222-222222222222',
    })
    mocks.mockSessionFindUnique.mockResolvedValue({
      id: SESSION_ID,
      campaignId: CAMPAIGN_ID,
      name: 'Session One',
      state: 'ACTIVE',
      endedAt: null,
    })
    mocks.mockSessionUpdate.mockResolvedValue({
      id: SESSION_ID,
      name: 'Session One',
      state: 'ENDED',
      endedAt: new Date(),
      updatedAt: new Date(),
      campaignId: CAMPAIGN_ID,
    })
    mocks.mockAdminAuditCreate.mockResolvedValue({ id: 'audit-1' })
  })

  it('ends an active session and writes audit log', async () => {
    const app = buildApp()

    const response = await request(app)
      .post(`/api/admin/campaigns/${CAMPAIGN_ID}/sessions/${SESSION_ID}/end`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Admin forced end' })

    expect(response.status).toBe(200)
    expect(response.body.session.state).toBe('ENDED')
    expect(mocks.mockAdminAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'SESSION_FORCE_END' }),
      })
    )
  })

  it('returns 200 with idempotent message when session is already ended', async () => {
    const app = buildApp()
    mocks.mockSessionFindUnique.mockResolvedValue({
      id: SESSION_ID,
      campaignId: CAMPAIGN_ID,
      name: 'Session One',
      state: 'ENDED',
      endedAt: new Date(),
    })

    const response = await request(app)
      .post(`/api/admin/campaigns/${CAMPAIGN_ID}/sessions/${SESSION_ID}/end`)
      .set('Authorization', 'Bearer valid-token')
      .send({})

    expect(response.status).toBe(200)
    expect(response.body.message).toMatch(/already ended/i)
  })

  it('returns 404 when campaign not found', async () => {
    const app = buildApp()
    mocks.mockCampaignFindUnique.mockResolvedValue(null)

    const response = await request(app)
      .post(`/api/admin/campaigns/nonexistent/sessions/${SESSION_ID}/end`)
      .set('Authorization', 'Bearer valid-token')
      .send({})

    expect(response.status).toBe(404)
    expect(response.body.code).toBe('NOT_FOUND')
  })

  it('returns 404 when session not found in campaign', async () => {
    const app = buildApp()
    mocks.mockSessionFindUnique.mockResolvedValue({
      id: SESSION_ID,
      campaignId: 'other-campaign-id',
      name: 'Session One',
      state: 'ACTIVE',
      endedAt: null,
    })

    const response = await request(app)
      .post(`/api/admin/campaigns/${CAMPAIGN_ID}/sessions/${SESSION_ID}/end`)
      .set('Authorization', 'Bearer valid-token')
      .send({})

    expect(response.status).toBe(404)
    expect(response.body.code).toBe('NOT_FOUND')
  })

  it('rejects READ_ONLY role', async () => {
    const app = buildApp()
    mocks.mockVerifyAdminToken.mockReturnValue({
      ...ADMIN_TOKEN_PAYLOAD,
      adminRole: 'READ_ONLY',
    })

    const response = await request(app)
      .post(`/api/admin/campaigns/${CAMPAIGN_ID}/sessions/${SESSION_ID}/end`)
      .set('Authorization', 'Bearer readonly-token')
      .send({ reason: 'test' })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FORBIDDEN')
  })
})

describe('admin campaigns routes — archive and restore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockAdminUsersExist.mockResolvedValue(true)
    mocks.mockVerifyAdminToken.mockReturnValue(ADMIN_TOKEN_PAYLOAD)
    mocks.mockUserFindUnique.mockResolvedValue({ isActive: true, tokenInvalidBefore: null })
    mocks.mockCampaignFindUnique.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: 'Ashfall',
      description: 'Epic campaign',
      currentDmId: '22222222-2222-4222-8222-222222222222',
    })
    mocks.mockCampaignUpdate.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: 'Ashfall',
      description: '[ARCHIVED] Epic campaign',
      currentDmId: '22222222-2222-4222-8222-222222222222',
      updatedAt: new Date(),
    })
    mocks.mockSessionUpdateMany.mockResolvedValue({ count: 1 })
    mocks.mockAdminAuditCreate.mockResolvedValue({ id: 'audit-1' })
  })

  it('archives an active campaign and ends all sessions', async () => {
    const app = buildApp()

    const response = await request(app)
      .post(`/api/admin/campaigns/${CAMPAIGN_ID}/archive`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'End of season' })

    expect(response.status).toBe(200)
    expect(response.body.campaign.isArchived).toBe(true)
    expect(response.body.endedSessionsCount).toBe(1)
    expect(mocks.mockAdminAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CAMPAIGN_ARCHIVE' }),
      })
    )
  })

  it('returns 200 idempotently when campaign is already archived', async () => {
    const app = buildApp()
    mocks.mockCampaignFindUnique.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: 'Ashfall',
      description: '[ARCHIVED] Epic campaign',
      currentDmId: '22222222-2222-4222-8222-222222222222',
    })

    const response = await request(app)
      .post(`/api/admin/campaigns/${CAMPAIGN_ID}/archive`)
      .set('Authorization', 'Bearer valid-token')
      .send({})

    expect(response.status).toBe(200)
    expect(response.body.message).toMatch(/already archived/i)
  })

  it('restores an archived campaign', async () => {
    const app = buildApp()
    mocks.mockCampaignFindUnique.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: 'Ashfall',
      description: '[ARCHIVED] Epic campaign',
      currentDmId: '22222222-2222-4222-8222-222222222222',
    })
    mocks.mockCampaignUpdate.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: 'Ashfall',
      description: 'Epic campaign',
      currentDmId: '22222222-2222-4222-8222-222222222222',
      updatedAt: new Date(),
    })

    const response = await request(app)
      .post(`/api/admin/campaigns/${CAMPAIGN_ID}/restore`)
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Campaign resumed' })

    expect(response.status).toBe(200)
    expect(response.body.campaign.isArchived).toBe(false)
    expect(mocks.mockAdminAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CAMPAIGN_RESTORE' }),
      })
    )
  })

  it('returns 200 idempotently when restoring non-archived campaign', async () => {
    const app = buildApp()

    const response = await request(app)
      .post(`/api/admin/campaigns/${CAMPAIGN_ID}/restore`)
      .set('Authorization', 'Bearer valid-token')
      .send({})

    expect(response.status).toBe(200)
    expect(response.body.message).toMatch(/not archived/i)
  })

  it('returns 404 for archive of unknown campaign', async () => {
    const app = buildApp()
    mocks.mockCampaignFindUnique.mockResolvedValue(null)

    const response = await request(app)
      .post('/api/admin/campaigns/nonexistent/archive')
      .set('Authorization', 'Bearer valid-token')
      .send({})

    expect(response.status).toBe(404)
    expect(response.body.code).toBe('NOT_FOUND')
  })

  it('rejects READ_ONLY role for archive', async () => {
    const app = buildApp()
    mocks.mockVerifyAdminToken.mockReturnValue({
      ...ADMIN_TOKEN_PAYLOAD,
      adminRole: 'READ_ONLY',
    })

    const response = await request(app)
      .post(`/api/admin/campaigns/${CAMPAIGN_ID}/archive`)
      .set('Authorization', 'Bearer readonly-token')
      .send({})

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FORBIDDEN')
  })
})
