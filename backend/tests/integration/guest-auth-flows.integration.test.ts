import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resetExternalSystemsRegistryForTests,
  updateExternalSystem,
} from '@/services/integrations.service'

const mocks = vi.hoisted(() => ({
  mockCreateToken: vi.fn(),
  mockHashPassword: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockExtractTokenFromHeader: vi.fn(),
  mockUserCount: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserFindFirst: vi.fn(),
  mockUserCreate: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockCampaignCount: vi.fn(),
  mockCampaignFindFirst: vi.fn(),
  mockCampaignUpdate: vi.fn(),
  mockSessionCount: vi.fn(),
  mockExternalIdentityFindUnique: vi.fn(),
  mockExternalIdentityUpsert: vi.fn(),
  mockCampaignMembershipUpsert: vi.fn(),
  mockCharacterFindFirst: vi.fn(),
  mockCharacterCreate: vi.fn(),
  mockCampaignExternalLinkCreate: vi.fn(),
  mockPresenceSnapshotFindMany: vi.fn(),
  mockSessionMemberUpsert: vi.fn(),
  mockSpectatorWaitlistFindUnique: vi.fn(),
  mockSpectatorWaitlistCreate: vi.fn(),
  mockSpectatorWaitlistFindFirst: vi.fn(),
  mockSpectatorWaitlistCount: vi.fn(),
  mockCampaignFindMany: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  createToken: (...args: unknown[]) => mocks.mockCreateToken(...args),
  hashPassword: (...args: unknown[]) => mocks.mockHashPassword(...args),
  verifyToken: (...args: unknown[]) => mocks.mockVerifyToken(...args),
  extractTokenFromHeader: (...args: unknown[]) => mocks.mockExtractTokenFromHeader(...args),
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    user: {
      count: mocks.mockUserCount,
      findUnique: mocks.mockUserFindUnique,
      findFirst: mocks.mockUserFindFirst,
      create: mocks.mockUserCreate,
      update: mocks.mockUserUpdate,
    },
    campaign: {
      count: mocks.mockCampaignCount,
      findFirst: mocks.mockCampaignFindFirst,
      findMany: mocks.mockCampaignFindMany,
      update: mocks.mockCampaignUpdate,
    },
    session: {
      count: mocks.mockSessionCount,
    },
    externalIdentity: {
      findUnique: mocks.mockExternalIdentityFindUnique,
      upsert: mocks.mockExternalIdentityUpsert,
    },
    campaignMembership: {
      upsert: mocks.mockCampaignMembershipUpsert,
    },
    character: {
      findFirst: mocks.mockCharacterFindFirst,
      create: mocks.mockCharacterCreate,
    },
    campaignExternalLink: {
      create: mocks.mockCampaignExternalLinkCreate,
    },
    presenceSnapshot: {
      findMany: mocks.mockPresenceSnapshotFindMany,
    },
    sessionMember: {
      upsert: mocks.mockSessionMemberUpsert,
    },
    spectatorWaitlist: {
      findUnique: mocks.mockSpectatorWaitlistFindUnique,
      create: mocks.mockSpectatorWaitlistCreate,
      findFirst: mocks.mockSpectatorWaitlistFindFirst,
      count: mocks.mockSpectatorWaitlistCount,
      update: vi.fn(),
    },
  }),
}))

vi.mock('@/infra/http/rate-limit', () => ({
  createRateLimit: () => (_req: any, _res: any, next: any) => next(),
}))

vi.mock('@/repositories/campaign.repository', () => ({
  upsertUserAccount: vi.fn(),
  listCampaignsForUser: vi.fn(),
  createCampaignForUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  isUserInCampaign: vi.fn(),
  joinCampaignForUser: vi.fn(),
  createCharacterForCampaign: vi.fn(),
  getUserProfileById: vi.fn(),
  listCharactersForUser: vi.fn(),
}))

vi.mock('@/services/session.service', () => ({
  createSession: vi.fn(),
}))

vi.mock('@/repositories/session.repository', () => ({
  listSessionsByCampaign: vi.fn(),
}))

import authRoutes from '@/api/auth.routes'
import campaignRoutes from '@/api/campaign.routes'
import platformRoutes from '@/api/platform.routes'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/auth', authRoutes)
  app.use('/api/campaigns', campaignRoutes)
  app.use('/api/platform', platformRoutes)
  return app
}

describe('guest and spectator multi-step flows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetExternalSystemsRegistryForTests()
    updateExternalSystem('dndbeyond', { authorizationState: 'AUTHORIZED' })

    mocks.mockCreateToken.mockReturnValue('jwt-token')
    mocks.mockHashPassword.mockResolvedValue('hashed-password')
    mocks.mockExtractTokenFromHeader.mockReturnValue('token')
    mocks.mockVerifyToken.mockReturnValue({
      userId: 'guest-user',
      username: 'guest-user',
      role: 'PLAYER',
      authType: 'GUEST',
    })

    mocks.mockUserCount.mockResolvedValue(24)
    mocks.mockCampaignCount.mockResolvedValue(5)
    mocks.mockSessionCount.mockResolvedValue(2)
    mocks.mockExternalIdentityFindUnique.mockResolvedValue(null)
    mocks.mockUserFindFirst.mockResolvedValue(null)
    mocks.mockSpectatorWaitlistFindUnique.mockResolvedValue(null)
    mocks.mockSpectatorWaitlistFindFirst.mockResolvedValue(null)
    mocks.mockSpectatorWaitlistCount.mockResolvedValue(1)
    mocks.mockPresenceSnapshotFindMany.mockResolvedValue([])
    mocks.mockCampaignFindMany.mockResolvedValue([])
    mocks.mockUserFindUnique.mockResolvedValue({
      id: 'guest-user',
      username: 'guest-user',
      role: 'PLAYER',
      adminRole: null,
      isActive: true,
      password: null,
      displayName: 'Guest User',
      avatarUrl: null,
      email: 'guest@example.com',
      tokenInvalidBefore: null,
      authType: 'GUEST',
    })
  })

  it('completes platform status, invite validate, preflight, and guest-login journey', async () => {
    const app = buildApp()

    mocks.mockCampaignFindFirst
      .mockResolvedValueOnce({
        id: 'campaign-1',
        name: 'The Lost Mines',
        currentDm: {
          displayName: 'Gandalf',
          username: 'gandalf',
        },
      })
      .mockResolvedValueOnce({
        id: 'campaign-1',
        name: 'The Lost Mines',
        currentDm: {
          displayName: 'Gandalf',
          username: 'gandalf',
        },
      })
      .mockResolvedValueOnce({
        id: 'campaign-1',
        currentDmId: 'old-dm',
        externalLinks: [],
      })

    mocks.mockUserFindFirst.mockResolvedValueOnce(null)
    mocks.mockUserFindUnique.mockResolvedValueOnce(null)
    mocks.mockUserCreate.mockResolvedValueOnce({
      id: 'guest-user',
      username: 'aragorn-a1b2',
      displayName: 'Aragorn Player',
      avatarUrl: 'https://ddb/player.png',
    })
    mocks.mockCampaignExternalLinkCreate.mockResolvedValueOnce({ id: 'link-1' })
    mocks.mockCampaignMembershipUpsert.mockResolvedValueOnce({ id: 'membership-1' })
    mocks.mockExternalIdentityUpsert.mockResolvedValueOnce({ id: 'identity-1' })

    const statusResponse = await request(app).get('/api/platform/status')
    expect(statusResponse.status).toBe(200)
    expect(statusResponse.body.online).toBe(true)

    const inviteResponse = await request(app).get('/api/campaigns/invite/abc123/validate')
    expect(inviteResponse.status).toBe(200)
    expect(inviteResponse.body.valid).toBe(true)

    const preflightResponse = await request(app).post('/api/auth/extension/preflight').send({
      externalSystem: 'dndbeyond',
      externalUserId: 'ddb-user-1',
      email: 'guest@example.com',
      inviteCode: 'ABC123',
    })

    expect(preflightResponse.status).toBe(200)
    expect(preflightResponse.body).toEqual({
      accountStatus: 'none',
      suggestedFlow: 'guest',
    })

    const loginResponse = await request(app)
      .post('/api/auth/extension/guest-login')
      .send({
        inviteCode: 'ABC123',
        externalSystem: 'dndbeyond',
        externalUserId: 'ddb-user-1',
        email: 'aragorn@example.com',
        displayName: 'Aragorn Player',
        campaignPacket: {
          externalCampaignId: 'ddb-campaign-1',
          dmExternalUserId: 'ddb-user-dm',
        },
      })

    expect(loginResponse.status).toBe(200)
    expect(loginResponse.body.user).toMatchObject({
      id: 'guest-user',
      role: 'PLAYER',
      authType: 'GUEST',
      campaignId: 'campaign-1',
    })
    expect(loginResponse.body.campaignBootstrapped).toBe(true)
  })

  it('completes spectator waitlist and promotion polling flow', async () => {
    const app = buildApp()

    mocks.mockCampaignFindFirst
      .mockResolvedValueOnce({
        id: 'campaign-2',
        name: 'Deep Vault',
        spectatorPolicy: 'GUESTS',
        spectatorMax: 1,
        spectatorWaitlistEnabled: true,
        currentDm: {
          displayName: 'Kara',
          username: 'kara',
        },
        sessions: [
          {
            id: 'session-1',
            members: [{ id: 'existing-spectator' }],
          },
        ],
        characters: [],
      })
      .mockResolvedValueOnce({
        id: 'campaign-2',
        spectatorPolicy: 'GUESTS',
        spectatorMax: 1,
        spectatorWaitlistEnabled: true,
        sessions: [
          {
            id: 'session-1',
            members: [{ id: 'existing-spectator' }],
          },
        ],
      })

    mocks.mockUserFindFirst.mockResolvedValueOnce(null)
    mocks.mockUserFindUnique.mockResolvedValueOnce(null)
    mocks.mockUserCreate.mockResolvedValueOnce({
      id: 'spectator-1',
      username: 'spectator-a1',
      displayName: 'Spectator User',
    })
    mocks.mockSpectatorWaitlistCreate.mockResolvedValueOnce({
      waitlistToken: 'waitlist-token-1',
      joinedAt: new Date('2026-04-29T00:00:00Z'),
    })
    mocks.mockSpectatorWaitlistCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1)
    mocks.mockSpectatorWaitlistFindFirst
      .mockResolvedValueOnce({
        joinedAt: new Date('2026-04-29T00:00:00Z'),
        promoted: false,
        user: {
          id: 'spectator-1',
          username: 'spectator-a1',
          displayName: 'Spectator User',
        },
      })
      .mockResolvedValueOnce({
        joinedAt: new Date('2026-04-29T00:00:00Z'),
        promoted: true,
        user: {
          id: 'spectator-1',
          username: 'spectator-a1',
          displayName: 'Spectator User',
        },
      })

    const watchValidate = await request(app).get('/api/campaigns/watch/spec123/validate')
    expect(watchValidate.status).toBe(200)
    expect(watchValidate.body.valid).toBe(true)

    const spectatorJoin = await request(app).post('/api/auth/spectator/guest-join').send({
      spectatorInviteCode: 'SPEC123',
      email: 'spectator@example.com',
      displayName: 'Spectator User',
    })
    expect(spectatorJoin.status).toBe(200)
    expect(spectatorJoin.body.joined).toBe(false)
    expect(spectatorJoin.body.waitlist.waitlistToken).toBe('waitlist-token-1')

    const waitlisted = await request(app).get(
      '/api/campaigns/11111111-1111-4111-8111-111111111111/spectator/waitlist-status?waitlistToken=waitlist-token-1'
    )
    expect(waitlisted.status).toBe(200)
    expect(waitlisted.body.status).toBe('WAITLISTED')

    const promoted = await request(app).get(
      '/api/campaigns/11111111-1111-4111-8111-111111111111/spectator/waitlist-status?waitlistToken=waitlist-token-1'
    )
    expect(promoted.status).toBe(200)
    expect(promoted.body.status).toBe('PROMOTED')
    expect(promoted.body.token).toBe('jwt-token')
  })
})
