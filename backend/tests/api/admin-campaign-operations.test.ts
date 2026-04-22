import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockVerifyAdminToken: vi.fn(),
  mockAdminUsersExist: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockCampaignFindUnique: vi.fn(),
  mockCampaignUpdate: vi.fn(),
  mockSessionUpdateMany: vi.fn(),
  mockSessionFindUnique: vi.fn(),
  mockRoomFindUnique: vi.fn(),
  mockSessionMemberFindUnique: vi.fn(),
  mockPresenceFindUnique: vi.fn(),
  mockPresenceUpsert: vi.fn(),
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
    promoteUserAdminRole: vi.fn(),
    getAdminById: vi.fn(),
  },
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    user: {
      findUnique: mocks.mockUserFindUnique,
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    campaign: {
      findUnique: mocks.mockCampaignFindUnique,
      update: mocks.mockCampaignUpdate,
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    session: {
      updateMany: mocks.mockSessionUpdateMany,
      findUnique: mocks.mockSessionFindUnique,
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    room: {
      findUnique: mocks.mockRoomFindUnique,
      findMany: vi.fn().mockResolvedValue([]),
    },
    sessionMember: {
      findUnique: mocks.mockSessionMemberFindUnique,
      findMany: vi.fn().mockResolvedValue([]),
    },
    presenceSnapshot: {
      findUnique: mocks.mockPresenceFindUnique,
      upsert: mocks.mockPresenceUpsert,
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    adminAuditLog: {
      create: mocks.mockAdminAuditCreate,
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
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

import adminRoutes from '../../src/api/admin.routes'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin', adminRoutes)
  return app
}

describe('admin campaign operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.mockAdminUsersExist.mockResolvedValue(true)
    mocks.mockUserFindUnique.mockResolvedValue({
      isActive: true,
      tokenInvalidBefore: null,
    })
    mocks.mockVerifyAdminToken.mockReturnValue({
      userId: '11111111-1111-4111-8111-111111111111',
      username: 'admin-operator',
      adminRole: 'ADMIN',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    })

    mocks.mockCampaignFindUnique.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Ashfall',
      description: 'Campaign description',
      currentDmId: '22222222-2222-4222-8222-222222222222',
    })
    mocks.mockCampaignUpdate.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Ashfall',
      description: '[ARCHIVED] Campaign description',
      currentDmId: '22222222-2222-4222-8222-222222222222',
      updatedAt: new Date(),
    })
    mocks.mockSessionUpdateMany.mockResolvedValue({ count: 2 })

    mocks.mockSessionFindUnique.mockResolvedValue({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      campaignId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Session One',
    })
    mocks.mockRoomFindUnique.mockResolvedValue({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      name: 'Main Room',
    })
    mocks.mockSessionMemberFindUnique.mockResolvedValue({
      userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      username: 'player-one',
      role: 'PLAYER',
    })
    mocks.mockPresenceFindUnique.mockResolvedValue({
      primaryRoomId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    })
    mocks.mockPresenceUpsert.mockResolvedValue({ id: 'presence-1' })
    mocks.mockAdminAuditCreate.mockResolvedValue({ id: 'audit-1' })
  })

  it('denies READ_ONLY role for campaign archive', async () => {
    const app = buildApp()
    mocks.mockVerifyAdminToken.mockReturnValue({
      userId: '11111111-1111-4111-8111-111111111111',
      username: 'readonly',
      adminRole: 'READ_ONLY',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    })

    const response = await request(app)
      .post('/api/admin/campaigns/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/archive')
      .set('Authorization', 'Bearer token')
      .send({ reason: 'archive' })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FORBIDDEN')
  })

  it('archives campaign and writes audit entry for ADMIN role', async () => {
    const app = buildApp()

    const response = await request(app)
      .post('/api/admin/campaigns/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/archive')
      .set('Authorization', 'Bearer token')
      .send({ reason: 'cleanup pass' })

    expect(response.status).toBe(200)
    expect(response.body.message).toBe('Campaign archived successfully')
    expect(mocks.mockCampaignUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.mockSessionUpdateMany).toHaveBeenCalledTimes(1)
    expect(mocks.mockAdminAuditCreate).toHaveBeenCalledTimes(1)
    expect(mocks.mockAdminAuditCreate.mock.calls[0][0].data.action).toBe('CAMPAIGN_ARCHIVE')
  })

  it('restores campaign and writes audit entry for ADMIN role', async () => {
    const app = buildApp()
    mocks.mockCampaignFindUnique.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Ashfall',
      description: '[ARCHIVED] Campaign description',
      currentDmId: '22222222-2222-4222-8222-222222222222',
    })
    mocks.mockCampaignUpdate.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Ashfall',
      description: 'Campaign description',
      currentDmId: '22222222-2222-4222-8222-222222222222',
      updatedAt: new Date(),
    })

    const response = await request(app)
      .post('/api/admin/campaigns/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/restore')
      .set('Authorization', 'Bearer token')
      .send({ reason: 'restore pass' })

    expect(response.status).toBe(200)
    expect(response.body.message).toBe('Campaign restored successfully')
    expect(mocks.mockCampaignUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.mockAdminAuditCreate).toHaveBeenCalledTimes(1)
    expect(mocks.mockAdminAuditCreate.mock.calls[0][0].data.action).toBe('CAMPAIGN_RESTORE')
  })

  it('moves player between rooms and writes audit entry', async () => {
    const app = buildApp()

    const response = await request(app)
      .post(
        '/api/admin/campaigns/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sessions/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/rooms/cccccccc-cccc-4ccc-8ccc-cccccccccccc/move-player'
      )
      .set('Authorization', 'Bearer token')
      .send({
        targetUserId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        reason: 'move for moderation',
      })

    expect(response.status).toBe(200)
    expect(response.body.message).toBe('Player moved successfully')
    expect(mocks.mockPresenceUpsert).toHaveBeenCalledTimes(1)
    expect(mocks.mockAdminAuditCreate).toHaveBeenCalledTimes(1)
    expect(mocks.mockAdminAuditCreate.mock.calls[0][0].data.action).toBe('ROOM_MOVE_PLAYER')
  })
})
