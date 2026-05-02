import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockExtractTokenFromHeader: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockListCampaignsForUser: vi.fn(),
  mockCreateCampaignForUser: vi.fn(),
  mockGetCampaignForUser: vi.fn(),
  mockJoinCampaignForUser: vi.fn(),
  mockIsUserInCampaign: vi.fn(),
  mockCreateCharacterForCampaign: vi.fn(),
  mockGetUserProfileById: vi.fn(),
  mockListCharactersForUser: vi.fn(),
  mockCreateSession: vi.fn(),
  mockListSessionsByCampaign: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: mocks.mockExtractTokenFromHeader,
  verifyToken: mocks.mockVerifyToken,
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    user: {
      findUnique: mocks.mockUserFindUnique,
    },
  }),
}))

vi.mock('@/repositories/campaign.repository', () => ({
  listCampaignsForUser: mocks.mockListCampaignsForUser,
  createCampaignForUser: mocks.mockCreateCampaignForUser,
  getCampaignForUser: mocks.mockGetCampaignForUser,
  joinCampaignForUser: mocks.mockJoinCampaignForUser,
  isUserInCampaign: mocks.mockIsUserInCampaign,
  createCharacterForCampaign: mocks.mockCreateCharacterForCampaign,
  getUserProfileById: mocks.mockGetUserProfileById,
  listCharactersForUser: mocks.mockListCharactersForUser,
}))

vi.mock('@/services/session.service', () => ({
  createSession: mocks.mockCreateSession,
}))

vi.mock('@/repositories/session.repository', () => ({
  listSessionsByCampaign: mocks.mockListSessionsByCampaign,
}))

import campaignRoutes from '@/api/campaign.routes'
import usersRoutes from '@/api/users.routes'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CAMPAIGN_ID = '22222222-2222-4222-8222-222222222222'

function buildAppForCampaigns() {
  const app = express()
  app.use(express.json())
  app.use('/api/campaigns', campaignRoutes)
  return app
}

function buildAppForUsers() {
  const app = express()
  app.use(express.json())
  app.use('/api/users', usersRoutes)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()

  mocks.mockExtractTokenFromHeader.mockReturnValue('token')
  mocks.mockVerifyToken.mockReturnValue({
    userId: USER_ID,
    username: 'tester',
    role: 'DM',
  })
  mocks.mockUserFindUnique.mockResolvedValue({
    isActive: true,
    tokenInvalidBefore: null,
  })
})

describe('campaign routes', () => {
  it('lists campaigns for authenticated user', async () => {
    const app = buildAppForCampaigns()
    mocks.mockListCampaignsForUser.mockResolvedValue([
      {
        id: CAMPAIGN_ID,
        name: 'The Shrouded Keep',
        description: 'Act I',
        inviteCode: 'ABCD12',
        currentDmId: USER_ID,
        memberRole: 'DM',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const response = await request(app).get('/api/campaigns').set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body.campaigns).toHaveLength(1)
    expect(mocks.mockListCampaignsForUser).toHaveBeenCalledWith(USER_ID)
  })

  it('creates a campaign', async () => {
    const app = buildAppForCampaigns()
    mocks.mockCreateCampaignForUser.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: 'Moonfall',
      description: 'Season one',
      inviteCode: 'MOON42',
      currentDmId: USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const response = await request(app)
      .post('/api/campaigns')
      .set('Authorization', 'Bearer token')
      .send({ name: 'Moonfall', description: 'Season one' })

    expect(response.status).toBe(201)
    expect(response.body.campaign.name).toBe('Moonfall')
    expect(mocks.mockCreateCampaignForUser).toHaveBeenCalledWith({
      name: 'Moonfall',
      description: 'Season one',
      currentDmId: USER_ID,
    })
  })

  it('rejects campaign creation without a name', async () => {
    const app = buildAppForCampaigns()

    const response = await request(app)
      .post('/api/campaigns')
      .set('Authorization', 'Bearer token')
      .send({ description: 'Missing name' })

    expect(response.status).toBe(400)
    expect(response.body.field).toBe('name')
  })

  it('starts a campaign session using campaign-scoped endpoint', async () => {
    const app = buildAppForCampaigns()
    mocks.mockGetCampaignForUser.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: 'Moonfall',
      description: null,
      inviteCode: 'MOON42',
      currentDmId: USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    mocks.mockCreateSession.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Chapter 1',
      dmId: USER_ID,
      state: 'IDLE',
      createdAt: Date.now(),
    })

    const response = await request(app)
      .post(`/api/campaigns/${CAMPAIGN_ID}/sessions/start`)
      .set('Authorization', 'Bearer token')
      .send({ name: 'Chapter 1', description: 'Arrival' })

    expect(response.status).toBe(201)
    expect(mocks.mockCreateSession).toHaveBeenCalledWith(
      'Chapter 1',
      USER_ID,
      'Arrival',
      CAMPAIGN_ID
    )
  })

  it('lists sessions for campaign members', async () => {
    const app = buildAppForCampaigns()
    mocks.mockGetCampaignForUser.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: 'Moonfall',
      description: null,
      inviteCode: 'MOON42',
      currentDmId: USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    mocks.mockListSessionsByCampaign.mockResolvedValue([
      {
        id: '33333333-3333-4333-8333-333333333333',
        campaignId: CAMPAIGN_ID,
        name: 'Chapter 1',
        description: null,
        dmId: USER_ID,
        state: 'IDLE',
        createdAt: new Date(),
        startedAt: null,
        endedAt: null,
      },
    ])

    const response = await request(app)
      .get(`/api/campaigns/${CAMPAIGN_ID}/sessions`)
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body.sessions).toHaveLength(1)
    expect(mocks.mockListSessionsByCampaign).toHaveBeenCalledWith(CAMPAIGN_ID)
  })

  it('joins campaign using invite code', async () => {
    const app = buildAppForCampaigns()
    mocks.mockJoinCampaignForUser.mockResolvedValue(true)

    const response = await request(app)
      .post(`/api/campaigns/${CAMPAIGN_ID}/join`)
      .set('Authorization', 'Bearer token')
      .send({ inviteCode: 'moon42' })

    expect(response.status).toBe(200)
    expect(mocks.mockJoinCampaignForUser).toHaveBeenCalledWith({
      campaignId: CAMPAIGN_ID,
      userId: USER_ID,
      inviteCode: 'MOON42',
      role: 'PLAYER',
    })
  })

  it('creates a character with persisted status', async () => {
    const app = buildAppForCampaigns()
    mocks.mockIsUserInCampaign.mockResolvedValue(true)
    mocks.mockCreateCharacterForCampaign.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      campaignId: CAMPAIGN_ID,
      userId: USER_ID,
      name: 'Thorn',
      status: 'DEAD',
      race: 'Human',
      class: 'Fighter',
      subclass: 'Champion',
      avatarUrl: null,
      metadata: null,
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const response = await request(app)
      .post(`/api/campaigns/${CAMPAIGN_ID}/characters`)
      .set('Authorization', 'Bearer token')
      .send({ name: 'Thorn', status: 'dead' })

    expect(response.status).toBe(201)
    expect(mocks.mockCreateCharacterForCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DEAD' })
    )
  })

  it('rejects invalid character status', async () => {
    const app = buildAppForCampaigns()
    mocks.mockIsUserInCampaign.mockResolvedValue(true)

    const response = await request(app)
      .post(`/api/campaigns/${CAMPAIGN_ID}/characters`)
      .set('Authorization', 'Bearer token')
      .send({ name: 'Thorn', status: 'UNKNOWNISH' })

    expect(response.status).toBe(400)
    expect(response.body.field).toBe('status')
  })
})

describe('users routes', () => {
  it('returns current user profile', async () => {
    const app = buildAppForUsers()
    mocks.mockGetUserProfileById.mockResolvedValue({
      id: USER_ID,
      username: 'tester',
      displayName: 'Test User',
      avatarUrl: 'https://example.com/avatar.png',
      role: 'DM',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })

    const response = await request(app).get('/api/users/me').set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body.user.username).toBe('tester')
    expect(mocks.mockGetUserProfileById).toHaveBeenCalledWith(USER_ID)
  })

  it('returns current user characters', async () => {
    const app = buildAppForUsers()
    mocks.mockListCharactersForUser.mockResolvedValue([
      {
        id: '44444444-4444-4444-8444-444444444444',
        campaignId: CAMPAIGN_ID,
        userId: USER_ID,
        name: 'Aria',
        race: 'Elf',
        class: 'Wizard',
        subclass: 'Bladesinger',
        avatarUrl: null,
        metadata: { level: 5 },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const response = await request(app)
      .get('/api/users/me/characters')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body.characters).toHaveLength(1)
    expect(response.body.characters[0].name).toBe('Aria')
    expect(mocks.mockListCharactersForUser).toHaveBeenCalledWith(USER_ID)
  })
})
