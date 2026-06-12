import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111'
const DM_ID = '22222222-2222-4222-8222-222222222222'

const mocks = vi.hoisted(() => ({
  extractTokenFromHeader: vi.fn(),
  verifyToken: vi.fn(),
  listDiscoverableCampaigns: vi.fn(),
  createJoinRequest: vi.fn(),
  listPendingJoinRequests: vi.fn(),
  resolveJoinRequest: vi.fn(),
  retireCampaign: vi.fn(),
  resumeCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
  getCampaignDmId: vi.fn(),
  listCampaignMemberIds: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: (...args: unknown[]) => mocks.extractTokenFromHeader(...args),
  verifyToken: (...args: unknown[]) => mocks.verifyToken(...args),
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({}),
}))

vi.mock('@/repositories/campaign.repository', () => ({
  listDiscoverableCampaigns: (...args: unknown[]) => mocks.listDiscoverableCampaigns(...args),
  createJoinRequest: (...args: unknown[]) => mocks.createJoinRequest(...args),
  listPendingJoinRequests: (...args: unknown[]) => mocks.listPendingJoinRequests(...args),
  resolveJoinRequest: (...args: unknown[]) => mocks.resolveJoinRequest(...args),
  retireCampaign: (...args: unknown[]) => mocks.retireCampaign(...args),
  resumeCampaign: (...args: unknown[]) => mocks.resumeCampaign(...args),
  deleteCampaign: (...args: unknown[]) => mocks.deleteCampaign(...args),
  getCampaignDmId: (...args: unknown[]) => mocks.getCampaignDmId(...args),
  listCampaignMemberIds: (...args: unknown[]) => mocks.listCampaignMemberIds(...args),
}))

vi.mock('@/ws/event-broadcaster', () => ({
  default: {
    isReady: () => false,
    sendToUser: vi.fn(),
    sendToUsers: vi.fn(),
  },
}))

import campaignDiscoveryRoutes from '@/api/campaign-discovery.routes'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/campaigns', campaignDiscoveryRoutes)
  return app
}

describe('campaign discovery routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.extractTokenFromHeader.mockReturnValue('token')
    mocks.verifyToken.mockReturnValue({
      userId: DM_ID,
      username: 'gm',
      role: 'DM',
      authType: 'FULL',
    })
    mocks.getCampaignDmId.mockResolvedValue(DM_ID)
    mocks.listPendingJoinRequests.mockResolvedValue([
      {
        id: '33333333-3333-4333-8333-333333333333',
        userId: '44444444-4444-4444-8444-444444444444',
        username: 'ari',
        displayName: 'Ari',
        avatarUrl: null,
        message: 'Would love to join.',
        requestedAt: new Date('2026-05-30T10:00:00.000Z'),
      },
    ])
  })

  it('lists pending join requests for the campaign DM', async () => {
    const app = buildApp()

    const response = await request(app)
      .get(`/api/campaigns/${CAMPAIGN_ID}/join-request`)
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(mocks.listPendingJoinRequests).toHaveBeenCalledWith(CAMPAIGN_ID)
    expect(response.body.requests).toHaveLength(1)
    expect(response.body.requests[0]).toMatchObject({
      username: 'ari',
      displayName: 'Ari',
      message: 'Would love to join.',
    })
  })

  it('rejects join-request review for non-DM users', async () => {
    const app = buildApp()
    mocks.getCampaignDmId.mockResolvedValue('99999999-9999-4999-8999-999999999999')

    const response = await request(app)
      .get(`/api/campaigns/${CAMPAIGN_ID}/join-request`)
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(403)
    expect(response.body.message).toBe('Only the campaign DM can review join requests.')
  })
})
