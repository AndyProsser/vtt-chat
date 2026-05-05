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
  mockCharacterUpdate: vi.fn(),
  mockCampaignExternalLinkCreate: vi.fn(),
  mockPresenceSnapshotFindMany: vi.fn(),
  mockSessionMemberUpsert: vi.fn(),
  mockSpectatorWaitlistFindUnique: vi.fn(),
  mockSpectatorWaitlistCreate: vi.fn(),
  mockSpectatorWaitlistFindFirst: vi.fn(),
  mockSpectatorWaitlistCount: vi.fn(),
  mockSpectatorWaitlistUpdate: vi.fn(),
  mockCampaignFindMany: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  createToken: (...args: unknown[]) => mocks.mockCreateToken(...args),
  hashPassword: (...args: unknown[]) => mocks.mockHashPassword(...args),
  verifyToken: (...args: unknown[]) => mocks.mockVerifyToken(...args),
  extractTokenFromHeader: (...args: unknown[]) => mocks.mockExtractTokenFromHeader(...args),
}))

vi.mock('@/services/auth-user-context.service', () => ({
  validateUserAuthState: vi.fn(async () => ({ ok: true })),
  getUserAuthContext: vi.fn(async () => ({
    userId: 'guest-user',
    isActive: true,
    tokenInvalidBefore: null,
  })),
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
      update: mocks.mockCharacterUpdate,
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
      update: mocks.mockSpectatorWaitlistUpdate,
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

describe('guest auth routes', () => {
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

  it('returns public platform status snapshot', async () => {
    const app = buildApp()

    const response = await request(app).get('/api/platform/status')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      online: true,
      activeUsers: 24,
      activeCampaigns: 5,
      activeSessions: 2,
      maintenanceMode: false,
    })
  })

  it('validates player invite codes publicly', async () => {
    const app = buildApp()
    mocks.mockCampaignFindFirst.mockResolvedValueOnce({
      id: 'campaign-1',
      name: 'The Lost Mines',
      currentDm: {
        displayName: 'Gandalf',
        username: 'gandalf',
      },
    })

    const response = await request(app).get('/api/campaigns/invite/abc123/validate')

    expect(response.status).toBe(200)
    expect(response.body.valid).toBe(true)
    expect(response.body.campaign).toMatchObject({
      id: 'campaign-1',
      name: 'The Lost Mines',
      dmDisplayName: 'Gandalf',
    })
  })

  it('returns guest preflight state for known guest identities', async () => {
    const app = buildApp()
    mocks.mockCampaignFindFirst.mockResolvedValueOnce({
      id: 'campaign-1',
      name: 'The Lost Mines',
      currentDm: {
        displayName: 'Gandalf',
        username: 'gandalf',
      },
    })
    mocks.mockExternalIdentityFindUnique.mockResolvedValueOnce({
      user: {
        id: 'guest-user',
        authType: 'GUEST',
      },
    })

    const response = await request(app).post('/api/auth/extension/preflight').send({
      externalSystem: 'dndbeyond',
      externalUserId: 'ddb-user-1',
      email: 'guest@example.com',
      inviteCode: 'ABC123',
    })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      accountStatus: 'guest',
      suggestedFlow: 'auto-login',
    })
  })

  it('rejects extension preflight for blocked integrations', async () => {
    const app = buildApp()
    updateExternalSystem('dndbeyond', { authorizationState: 'BLOCKED' })

    const response = await request(app).post('/api/auth/extension/preflight').send({
      externalSystem: 'dndbeyond',
      externalUserId: 'ddb-user-1',
      email: 'guest@example.com',
      inviteCode: 'ABC123',
    })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('INTEGRATION_NOT_AUTHORIZED')
  })

  it('creates guest accounts from authorized extension login', async () => {
    const app = buildApp()
    mocks.mockCampaignFindFirst.mockResolvedValueOnce({
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
    mocks.mockCharacterFindFirst.mockResolvedValueOnce(null)
    mocks.mockCharacterCreate.mockResolvedValueOnce({
      id: 'character-1',
      name: 'Aragorn',
      avatarUrl: 'https://ddb/character.png',
    })

    const response = await request(app)
      .post('/api/auth/extension/guest-login')
      .send({
        inviteCode: 'ABC123',
        externalSystem: 'dndbeyond',
        externalUserId: 'ddb-user-1',
        email: 'aragorn@example.com',
        displayName: 'Aragorn Player',
        avatarUrl: 'https://ddb/player.png',
        campaignPacket: {
          externalCampaignId: 'ddb-campaign-1',
          dmExternalUserId: 'ddb-user-dm',
        },
        character: {
          name: 'Aragorn',
          class: 'Ranger',
          level: 5,
          externalCharacterId: 'ddb-char-1',
          avatarUrl: 'https://ddb/character.png',
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.user).toMatchObject({
      id: 'guest-user',
      authType: 'GUEST',
      campaignId: 'campaign-1',
      role: 'PLAYER',
    })
    expect(response.body.character).toMatchObject({
      id: 'character-1',
      name: 'Aragorn',
    })
    expect(response.body.campaignBootstrapped).toBe(true)
    expect(mocks.mockExternalIdentityUpsert).toHaveBeenCalledTimes(1)
  })

  it('rejects extension guest-login for blocked integrations', async () => {
    const app = buildApp()
    updateExternalSystem('dndbeyond', { authorizationState: 'BLOCKED' })

    const response = await request(app).post('/api/auth/extension/guest-login').send({
      inviteCode: 'ABC123',
      externalSystem: 'dndbeyond',
      externalUserId: 'ddb-user-1',
      email: 'guest@example.com',
    })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('INTEGRATION_NOT_AUTHORIZED')
  })

  it('rejects guest-login when full account already exists for email', async () => {
    const app = buildApp()
    mocks.mockCampaignFindFirst.mockResolvedValueOnce({
      id: 'campaign-1',
      currentDmId: 'old-dm',
      externalLinks: [{ id: 'link-1', externalId: 'ddb-campaign-1' }],
    })
    mocks.mockUserFindFirst.mockResolvedValueOnce({
      id: 'full-user',
      username: 'aragorn',
      displayName: 'Aragorn',
      avatarUrl: null,
      authType: 'FULL',
      adminRole: null,
    })

    const response = await request(app).post('/api/auth/extension/guest-login').send({
      inviteCode: 'ABC123',
      externalSystem: 'dndbeyond',
      externalUserId: 'ddb-user-1',
      email: 'aragorn@example.com',
    })

    expect(response.status).toBe(409)
    expect(response.body.code).toBe('FULL_ACCOUNT_EXISTS')
  })

  it('requires campaignPacket for first-time campaign bootstrap', async () => {
    const app = buildApp()
    mocks.mockCampaignFindFirst.mockResolvedValueOnce({
      id: 'campaign-1',
      currentDmId: 'old-dm',
      externalLinks: [],
    })

    const response = await request(app).post('/api/auth/extension/guest-login').send({
      inviteCode: 'ABC123',
      externalSystem: 'dndbeyond',
      externalUserId: 'ddb-user-1',
      email: 'new-guest@example.com',
    })

    expect(response.status).toBe(400)
    expect(response.body.code).toBe('CAMPAIGN_PACKET_REQUIRED')
  })

  it('rejects guest-login when campaign packet conflicts with linked campaign', async () => {
    const app = buildApp()
    mocks.mockCampaignFindFirst.mockResolvedValueOnce({
      id: 'campaign-1',
      currentDmId: 'old-dm',
      externalLinks: [{ id: 'link-1', externalId: 'ddb-campaign-1' }],
    })

    const response = await request(app)
      .post('/api/auth/extension/guest-login')
      .send({
        inviteCode: 'ABC123',
        externalSystem: 'dndbeyond',
        externalUserId: 'ddb-user-1',
        email: 'guest@example.com',
        campaignPacket: {
          externalCampaignId: 'different-campaign',
          dmExternalUserId: 'ddb-user-dm',
        },
      })

    expect(response.status).toBe(409)
    expect(response.body.code).toBe('CAMPAIGN_LINK_MISMATCH')
  })

  it('updates an existing guest account during extension guest-login', async () => {
    const app = buildApp()
    mocks.mockCampaignFindFirst.mockResolvedValueOnce({
      id: 'campaign-1',
      currentDmId: 'old-dm',
      externalLinks: [{ id: 'link-1', externalId: 'ddb-campaign-1' }],
    })
    mocks.mockUserFindFirst.mockResolvedValueOnce({
      id: 'guest-existing',
      username: 'guest-existing',
      displayName: 'Old Name',
      avatarUrl: null,
      authType: 'GUEST',
      adminRole: null,
    })
    mocks.mockUserUpdate.mockResolvedValueOnce({
      id: 'guest-existing',
      username: 'guest-existing',
      displayName: 'Updated Guest',
      avatarUrl: 'https://ddb/new-avatar.png',
    })
    mocks.mockCampaignMembershipUpsert.mockResolvedValueOnce({ id: 'membership-guest-existing' })
    mocks.mockExternalIdentityUpsert.mockResolvedValueOnce({ id: 'identity-guest-existing' })

    const response = await request(app)
      .post('/api/auth/extension/guest-login')
      .send({
        inviteCode: 'ABC123',
        externalSystem: 'dndbeyond',
        externalUserId: 'ddb-user-42',
        email: 'existing-guest@example.com',
        displayName: 'Updated Guest',
        avatarUrl: 'https://ddb/new-avatar.png',
        campaignPacket: {
          externalCampaignId: 'ddb-campaign-1',
          dmExternalUserId: 'ddb-user-dm',
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.user).toMatchObject({
      id: 'guest-existing',
      authType: 'GUEST',
      campaignId: 'campaign-1',
      role: 'PLAYER',
    })
    expect(mocks.mockUserCreate).not.toHaveBeenCalled()
    expect(mocks.mockCampaignExternalLinkCreate).not.toHaveBeenCalled()
  })

  it('promotes extension login user to DM when packet matches dmExternalUserId', async () => {
    const app = buildApp()
    mocks.mockCampaignFindFirst.mockResolvedValueOnce({
      id: 'campaign-1',
      currentDmId: 'old-dm',
      externalLinks: [],
    })
    mocks.mockUserFindFirst.mockResolvedValueOnce(null)
    mocks.mockUserFindUnique.mockResolvedValueOnce(null)
    mocks.mockUserCreate.mockResolvedValueOnce({
      id: 'new-dm-user',
      username: 'new-dm-user',
      displayName: 'New DM',
      avatarUrl: null,
    })
    mocks.mockCampaignExternalLinkCreate.mockResolvedValueOnce({ id: 'link-new' })
    mocks.mockCampaignUpdate.mockResolvedValueOnce({ id: 'campaign-1', currentDmId: 'new-dm-user' })
    mocks.mockCampaignMembershipUpsert.mockResolvedValueOnce({ id: 'membership-new-dm' })
    mocks.mockExternalIdentityUpsert.mockResolvedValueOnce({ id: 'identity-new-dm' })

    const response = await request(app)
      .post('/api/auth/extension/guest-login')
      .send({
        inviteCode: 'ABC123',
        externalSystem: 'dndbeyond',
        externalUserId: 'ddb-dm-user',
        email: 'dm@example.com',
        displayName: 'New DM',
        campaignPacket: {
          externalCampaignId: 'ddb-campaign-new',
          dmExternalUserId: 'ddb-dm-user',
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.user).toMatchObject({
      id: 'new-dm-user',
      role: 'DM',
      campaignId: 'campaign-1',
      authType: 'GUEST',
    })
    expect(response.body.campaignBootstrapped).toBe(true)
    expect(mocks.mockCampaignUpdate).toHaveBeenCalledTimes(1)
  })

  it('upgrades guest accounts to full accounts', async () => {
    const app = buildApp()
    mocks.mockUserFindUnique
      .mockResolvedValueOnce({
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
      .mockResolvedValueOnce({
        id: 'guest-user',
        username: 'guest-user',
        role: 'PLAYER',
        authType: 'GUEST',
      })
    mocks.mockUserUpdate.mockResolvedValueOnce({
      id: 'guest-user',
      username: 'guest-user',
      role: 'PLAYER',
    })

    const response = await request(app)
      .post('/api/auth/upgrade')
      .set('Authorization', 'Bearer token')
      .send({ password: 'ValidPassword!23' })

    expect(response.status).toBe(200)
    expect(response.body.user).toEqual({
      id: 'guest-user',
      username: 'guest-user',
      role: 'PLAYER',
      authType: 'FULL',
    })
    expect(mocks.mockHashPassword).toHaveBeenCalledWith('ValidPassword!23')
  })

  it('validates spectator invite codes publicly', async () => {
    const app = buildApp()
    mocks.mockCampaignFindFirst.mockResolvedValueOnce({
      id: 'campaign-1',
      name: 'The Lost Mines',
      spectatorPolicy: 'GUESTS',
      spectatorMax: 3,
      spectatorWaitlistEnabled: true,
      currentDm: {
        displayName: 'Gandalf',
        username: 'gandalf',
      },
      sessions: [
        {
          id: 'session-1',
          members: [{ id: 'm1' }],
        },
      ],
      characters: [
        {
          name: 'Aragorn',
          class: 'Ranger',
          avatarUrl: null,
          metadata: { level: 5 },
          userId: 'user-1',
        },
      ],
    })
    mocks.mockPresenceSnapshotFindMany.mockResolvedValueOnce([{ userId: 'user-1' }])

    const response = await request(app).get('/api/campaigns/watch/spec123/validate')

    expect(response.status).toBe(200)
    expect(response.body.valid).toBe(true)
    expect(response.body.campaign.spectatorPolicy).toBe('GUESTS')
    expect(response.body.characters[0]).toMatchObject({
      name: 'Aragorn',
      level: 5,
      online: true,
    })
  })

  it('adds spectators to waitlist when full and waitlist enabled', async () => {
    const app = buildApp()
    mocks.mockCampaignFindFirst.mockResolvedValueOnce({
      id: 'campaign-1',
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
    mocks.mockSpectatorWaitlistCount.mockResolvedValueOnce(1)

    const response = await request(app).post('/api/auth/spectator/guest-join').send({
      spectatorInviteCode: 'SPEC123',
      email: 'spectator@example.com',
      displayName: 'Spectator User',
    })

    expect(response.status).toBe(200)
    expect(response.body.joined).toBe(false)
    expect(response.body.waitlist).toMatchObject({
      enabled: true,
      waitlistToken: 'waitlist-token-1',
      position: 1,
    })
  })

  it('reuses existing waitlist token for spectators already queued', async () => {
    const app = buildApp()
    mocks.mockCampaignFindFirst.mockResolvedValueOnce({
      id: 'campaign-1',
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
      id: 'spectator-queued',
      username: 'spectator-queued',
      displayName: 'Spectator Queued',
    })
    mocks.mockSpectatorWaitlistFindUnique
      .mockResolvedValueOnce({
        waitlistToken: 'waitlist-existing',
        promoted: false,
      })
      .mockResolvedValueOnce({
        waitlistToken: 'waitlist-existing',
        joinedAt: new Date('2026-04-29T00:00:00Z'),
      })
    mocks.mockSpectatorWaitlistCount.mockResolvedValueOnce(2)

    const response = await request(app).post('/api/auth/spectator/guest-join').send({
      spectatorInviteCode: 'SPEC123',
      email: 'spectator-queued@example.com',
      displayName: 'Spectator Queued',
    })

    expect(response.status).toBe(200)
    expect(response.body.joined).toBe(false)
    expect(response.body.waitlist).toMatchObject({
      enabled: true,
      waitlistToken: 'waitlist-existing',
      position: 2,
    })
    expect(mocks.mockSpectatorWaitlistCreate).not.toHaveBeenCalled()
  })

  it('joins spectator immediately when there is active capacity', async () => {
    const app = buildApp()
    mocks.mockCampaignFindFirst.mockResolvedValueOnce({
      id: 'campaign-1',
      spectatorPolicy: 'GUESTS',
      spectatorMax: 3,
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
      id: 'spectator-2',
      username: 'spectator-b2',
      displayName: 'Spectator Two',
      authType: 'GUEST',
    })

    const response = await request(app).post('/api/auth/spectator/guest-join').send({
      spectatorInviteCode: 'SPEC123',
      email: 'spectator2@example.com',
      displayName: 'Spectator Two',
    })

    expect(response.status).toBe(200)
    expect(response.body.joined).toBe(true)
    expect(response.body.token).toBe('jwt-token')
    expect(response.body.user).toMatchObject({
      id: 'spectator-2',
      role: 'SPECTATOR',
      authType: 'GUEST',
    })
  })

  it('rejects spectator join when waitlist is disabled and session is full', async () => {
    const app = buildApp()
    mocks.mockCampaignFindFirst.mockResolvedValueOnce({
      id: 'campaign-1',
      spectatorPolicy: 'GUESTS',
      spectatorMax: 1,
      spectatorWaitlistEnabled: false,
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
      id: 'spectator-full',
      username: 'spectator-full',
      displayName: 'Spectator Full',
    })

    const response = await request(app).post('/api/auth/spectator/guest-join').send({
      spectatorInviteCode: 'SPEC123',
      email: 'spectator-full@example.com',
      displayName: 'Spectator Full',
    })

    expect(response.status).toBe(409)
    expect(response.body.code).toBe('SPECTATOR_CAPACITY_REACHED')
  })

  it('enforces spectator policy when guests are disabled', async () => {
    const app = buildApp()

    mocks.mockCampaignFindFirst.mockResolvedValueOnce({
      id: 'campaign-1',
      spectatorPolicy: 'NONE',
      spectatorMax: 3,
      spectatorWaitlistEnabled: true,
      sessions: [],
    })

    const nonePolicy = await request(app).post('/api/auth/spectator/guest-join').send({
      spectatorInviteCode: 'SPEC123',
      email: 'spectator-none@example.com',
      displayName: 'Spectator None',
    })

    expect(nonePolicy.status).toBe(403)
    expect(nonePolicy.body.code).toBe('SPECTATORS_DISABLED')

    mocks.mockCampaignFindFirst.mockResolvedValueOnce({
      id: 'campaign-1',
      spectatorPolicy: 'USERS',
      spectatorMax: 3,
      spectatorWaitlistEnabled: true,
      sessions: [],
    })

    const usersPolicy = await request(app).post('/api/auth/spectator/guest-join').send({
      spectatorInviteCode: 'SPEC123',
      email: 'spectator-users@example.com',
      displayName: 'Spectator Users',
    })

    expect(usersPolicy.status).toBe(403)
    expect(usersPolicy.body.code).toBe('FULL_ACCOUNT_REQUIRED')
  })

  it('returns waitlist status and promotion token', async () => {
    const app = buildApp()
    mocks.mockSpectatorWaitlistFindFirst.mockResolvedValueOnce({
      joinedAt: new Date('2026-04-29T00:00:00Z'),
      promoted: true,
      user: {
        id: 'spectator-1',
        username: 'spectator-a1',
        displayName: 'Spectator User',
        authType: 'GUEST',
      },
    })

    const response = await request(app).get(
      '/api/campaigns/11111111-1111-4111-8111-111111111111/spectator/waitlist-status?waitlistToken=wait-123'
    )

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('PROMOTED')
    expect(response.body.user).toMatchObject({
      id: 'spectator-1',
      authType: 'GUEST',
    })
    expect(response.body.token).toBe('jwt-token')
  })

  it('returns 404 for unknown waitlist tokens', async () => {
    const app = buildApp()
    mocks.mockSpectatorWaitlistFindFirst.mockResolvedValueOnce(null)

    const response = await request(app).get(
      '/api/campaigns/11111111-1111-4111-8111-111111111111/spectator/waitlist-status?waitlistToken=unknown-token'
    )

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({
      campaignId: '11111111-1111-4111-8111-111111111111',
      status: 'NOT_FOUND',
    })
  })

  it('returns waitlisted status with queue position before promotion', async () => {
    const app = buildApp()
    mocks.mockSpectatorWaitlistFindFirst.mockResolvedValueOnce({
      joinedAt: new Date('2026-04-29T00:00:00Z'),
      promoted: false,
      user: {
        id: 'spectator-queued',
        username: 'spectator-queued',
        displayName: 'Spectator Queued',
      },
    })
    mocks.mockSpectatorWaitlistCount.mockResolvedValueOnce(3)

    const response = await request(app).get(
      '/api/campaigns/11111111-1111-4111-8111-111111111111/spectator/waitlist-status?waitlistToken=wait-queued'
    )

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      campaignId: '11111111-1111-4111-8111-111111111111',
      status: 'WAITLISTED',
      position: 3,
    })
    expect(response.body.token).toBeUndefined()
  })

  it('restricts campaign browse to full accounts', async () => {
    const app = buildApp()
    mocks.mockVerifyToken.mockReturnValueOnce({
      userId: 'guest-user',
      username: 'guest-user',
      role: 'PLAYER',
      authType: 'GUEST',
    })
    mocks.mockUserFindUnique.mockResolvedValueOnce({
      authType: 'GUEST',
    })

    const response = await request(app)
      .get('/api/campaigns/browse')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FULL_ACCOUNT_REQUIRED')
  })
})
