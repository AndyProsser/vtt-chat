import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const mocks = vi.hoisted(() => ({
  mockExtractTokenFromHeader: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockBrowseSpectatorCampaignsForUser: vi.fn(),
  mockGetSpectatorWaitlistStatus: vi.fn(),
  mockValidatePlayerInviteCode: vi.fn(),
  mockValidateSpectatorInviteCode: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: (...args: unknown[]) => mocks.mockExtractTokenFromHeader(...args),
  verifyToken: (...args: unknown[]) => mocks.mockVerifyToken(...args),
}))

vi.mock('@/services/guest-auth', () => ({
  browseSpectatorCampaignsForUser: (...args: unknown[]) =>
    mocks.mockBrowseSpectatorCampaignsForUser(...args),
  getSpectatorWaitlistStatus: (...args: unknown[]) => mocks.mockGetSpectatorWaitlistStatus(...args),
  validatePlayerInviteCode: (...args: unknown[]) => mocks.mockValidatePlayerInviteCode(...args),
  validateSpectatorInviteCode: (...args: unknown[]) =>
    mocks.mockValidateSpectatorInviteCode(...args),
}))

vi.mock('@/repositories/campaign.repository', () => ({
  listCampaignsForUser: vi.fn(),
  createCampaignForUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  isUserInCampaign: vi.fn(),
  joinCampaignForUser: vi.fn(),
  createCharacterForCampaign: vi.fn(),
}))

vi.mock('@/services/session/core.service', () => ({
  createSession: vi.fn(),
}))

vi.mock('@/repositories/session.repository', () => ({
  listSessionsByCampaign: vi.fn(),
}))

import campaignRoutes from '@/api/campaign.routes'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/campaigns', campaignRoutes)
  return app
}

describe('campaign browse and waitlist endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.mockExtractTokenFromHeader.mockImplementation((authHeader?: string) => {
      if (!authHeader) return null
      return authHeader.replace('Bearer ', '')
    })
    mocks.mockVerifyToken.mockReturnValue({
      userId: USER_ID,
      username: 'viewer',
      role: 'PLAYER',
      authType: 'FULL',
    })
    mocks.mockValidatePlayerInviteCode.mockResolvedValue({ valid: false, reason: 'INVITE_EXPIRED' })
    mocks.mockValidateSpectatorInviteCode.mockResolvedValue({
      valid: false,
      reason: 'INVITE_EXPIRED',
    })
  })

  it('returns browse campaigns for authenticated full accounts', async () => {
    const app = buildApp()
    mocks.mockBrowseSpectatorCampaignsForUser.mockResolvedValueOnce([
      {
        campaignId: 'campaign-public',
        name: 'Open Keep',
        dmDisplayName: 'Mira',
        sessionActive: true,
        spectatorPolicy: 'GUESTS',
        private: false,
        spectatorSlotsFilled: 1,
        spectatorSlotsMax: 3,
        joinEnabled: true,
      },
      {
        campaignId: 'campaign-private',
        name: 'Hidden Court',
        dmDisplayName: 'Jules',
        sessionActive: false,
        spectatorPolicy: 'NONE',
        private: true,
        spectatorSlotsFilled: 0,
        spectatorSlotsMax: 2,
        joinEnabled: false,
      },
    ])

    const response = await request(app)
      .get('/api/campaigns/browse')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body.campaigns).toHaveLength(2)
    expect(response.body.campaigns[0]).toMatchObject({
      campaignId: 'campaign-public',
      joinEnabled: true,
      private: false,
    })
    expect(response.body.campaigns[1]).toMatchObject({
      campaignId: 'campaign-private',
      joinEnabled: false,
      private: true,
    })
  })

  it('returns 403 for guest accounts browsing campaigns', async () => {
    const app = buildApp()
    mocks.mockBrowseSpectatorCampaignsForUser.mockRejectedValueOnce(
      new Error('FULL_ACCOUNT_REQUIRED')
    )

    const response = await request(app)
      .get('/api/campaigns/browse')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FULL_ACCOUNT_REQUIRED')
  })

  it('returns 404 when browsing campaigns for a missing user', async () => {
    const app = buildApp()
    mocks.mockBrowseSpectatorCampaignsForUser.mockRejectedValueOnce(new Error('USER_NOT_FOUND'))

    const response = await request(app)
      .get('/api/campaigns/browse')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(404)
    expect(response.body.code).toBe('USER_NOT_FOUND')
  })

  it('returns 400 when waitlist status is requested with invalid campaignId', async () => {
    const app = buildApp()

    const response = await request(app).get(
      '/api/campaigns/invalid-id/spectator/waitlist-status?waitlistToken=token-1'
    )

    expect(response.status).toBe(400)
    expect(response.body.field).toBe('campaignId')
  })

  it('returns 404 when waitlist token is unknown', async () => {
    const app = buildApp()
    mocks.mockGetSpectatorWaitlistStatus.mockResolvedValueOnce({
      campaignId: '11111111-1111-4111-8111-111111111111',
      status: 'NOT_FOUND',
    })

    const response = await request(app).get(
      '/api/campaigns/11111111-1111-4111-8111-111111111111/spectator/waitlist-status?waitlistToken=unknown'
    )

    expect(response.status).toBe(404)
    expect(response.body.status).toBe('NOT_FOUND')
  })
})
