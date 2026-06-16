import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111'
const DM_ID = '22222222-2222-4222-8222-222222222222'

const mocks = vi.hoisted(() => ({
  mockExtractTokenFromHeader: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockCampaignMembershipFindUnique: vi.fn(),
  mockCampaignFindUnique: vi.fn(),
  mockCampaignUpdate: vi.fn(),
  mockSessionFindFirst: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  createToken: vi.fn(),
  extractTokenFromHeader: (...args: unknown[]) => mocks.mockExtractTokenFromHeader(...args),
  verifyToken: (...args: unknown[]) => mocks.mockVerifyToken(...args),
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    campaignMembership: {
      findUnique: mocks.mockCampaignMembershipFindUnique,
    },
    campaign: {
      findUnique: mocks.mockCampaignFindUnique,
      update: mocks.mockCampaignUpdate,
    },
    session: {
      findFirst: mocks.mockSessionFindFirst,
    },
  }),
}))

import campaignRoutes from '@/api/campaign.routes'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/campaigns', campaignRoutes)
  return app
}

/** A campaign row with every field the PATCH /settings handler falls back to when omitted. */
function buildCampaignRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CAMPAIGN_ID,
    name: 'Test Campaign',
    description: null,
    posterUrl: null,
    discoverable: false,
    spectatorPolicy: 'NONE',
    spectatorMax: null,
    spectatorWaitlistEnabled: false,
    spectatorReconnectGraceSecs: 60,
    dmAutoTargetOnFirstPlayerJoin: true,
    postSessionChatEnabled: true,
    postSessionChatDurationMs: 300000,
    extensionSyncPolicy: 'DM_AND_PLAYERS',
    extensionInventorySyncEnabled: true,
    extensionCurrencySyncEnabled: true,
    extensionPartyInventorySyncAccess: 'DM_ONLY',
    extensionSyncConflictResolution: 'OVERWRITE',
    lateJoinPolicy: 'OPEN',
    lateJoinGraceMinutes: 30,
    defaultSessionDurationMins: 240,
    supportedPlatforms: ['ANY'],
    dndRuleset: '2024',
    currentDmId: DM_ID,
    inviteCode: 'invite-1',
    inviteActive: true,
    spectatorInviteCode: null,
    spectatorInviteActive: false,
    sessionScheduleType: null,
    sessionScheduleDay: null,
    sessionScheduleNth: null,
    sessionScheduleHour: null,
    sessionScheduleMinute: null,
    sessionScheduleTz: null,
    nextSessionDate: null,
    nextSessionIsManual: false,
    ...overrides,
  }
}

describe('campaign settings — extension inventory sync policy fields', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.mockExtractTokenFromHeader.mockImplementation((header?: string) =>
      header ? header.replace('Bearer ', '') : null
    )
    mocks.mockVerifyToken.mockReturnValue({ userId: DM_ID, username: 'dm-one' })
    mocks.mockSessionFindFirst.mockResolvedValue(null)
    mocks.mockCampaignUpdate.mockImplementation(async ({ data }: any) => buildCampaignRow(data))
  })

  describe('GET /:campaignId/settings', () => {
    it('returns the four extension inventory sync policy fields', async () => {
      mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
        campaign: { ...buildCampaignRow(), sessions: [] },
      })
      const app = buildApp()

      const response = await request(app)
        .get(`/api/campaigns/${CAMPAIGN_ID}/settings`)
        .set('Authorization', 'Bearer token')

      expect(response.status).toBe(200)
      expect(response.body.campaign).toMatchObject({
        extensionInventorySyncEnabled: true,
        extensionCurrencySyncEnabled: true,
        extensionPartyInventorySyncAccess: 'DM_ONLY',
        extensionSyncConflictResolution: 'OVERWRITE',
      })
    })
  })

  describe('PATCH /:campaignId/settings', () => {
    it('rejects an invalid extensionPartyInventorySyncAccess value', async () => {
      mocks.mockCampaignFindUnique.mockResolvedValueOnce(buildCampaignRow())
      const app = buildApp()

      const response = await request(app)
        .patch(`/api/campaigns/${CAMPAIGN_ID}/settings`)
        .set('Authorization', 'Bearer token')
        .send({ extensionPartyInventorySyncAccess: 'EVERYONE' })

      expect(response.status).toBe(400)
      expect(response.body.field).toBe('extensionPartyInventorySyncAccess')
    })

    it('rejects an invalid extensionSyncConflictResolution value', async () => {
      mocks.mockCampaignFindUnique.mockResolvedValueOnce(buildCampaignRow())
      const app = buildApp()

      const response = await request(app)
        .patch(`/api/campaigns/${CAMPAIGN_ID}/settings`)
        .set('Authorization', 'Bearer token')
        .send({ extensionSyncConflictResolution: 'MERGE' })

      expect(response.status).toBe(400)
      expect(response.body.field).toBe('extensionSyncConflictResolution')
    })

    it('persists valid values for all four fields', async () => {
      mocks.mockCampaignFindUnique.mockResolvedValueOnce(buildCampaignRow())
      const app = buildApp()

      const response = await request(app)
        .patch(`/api/campaigns/${CAMPAIGN_ID}/settings`)
        .set('Authorization', 'Bearer token')
        .send({
          extensionInventorySyncEnabled: false,
          extensionCurrencySyncEnabled: false,
          extensionPartyInventorySyncAccess: 'ALL_PLAYERS',
          extensionSyncConflictResolution: 'PROMPT',
        })

      expect(response.status).toBe(200)
      expect(mocks.mockCampaignUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            extensionInventorySyncEnabled: false,
            extensionCurrencySyncEnabled: false,
            extensionPartyInventorySyncAccess: 'ALL_PLAYERS',
            extensionSyncConflictResolution: 'PROMPT',
          }),
        })
      )
      expect(response.body.campaign).toMatchObject({
        extensionInventorySyncEnabled: false,
        extensionCurrencySyncEnabled: false,
        extensionPartyInventorySyncAccess: 'ALL_PLAYERS',
        extensionSyncConflictResolution: 'PROMPT',
      })
    })

    it('preserves existing values for the four fields when omitted from the request', async () => {
      mocks.mockCampaignFindUnique.mockResolvedValueOnce(
        buildCampaignRow({
          extensionInventorySyncEnabled: false,
          extensionPartyInventorySyncAccess: 'ALL_PLAYERS',
        })
      )
      const app = buildApp()

      const response = await request(app)
        .patch(`/api/campaigns/${CAMPAIGN_ID}/settings`)
        .set('Authorization', 'Bearer token')
        .send({ name: 'Renamed Campaign' })

      expect(response.status).toBe(200)
      expect(mocks.mockCampaignUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            extensionInventorySyncEnabled: false,
            extensionPartyInventorySyncAccess: 'ALL_PLAYERS',
          }),
        })
      )
    })

    it('rejects changes to the four fields while a session is ACTIVE', async () => {
      mocks.mockCampaignFindUnique.mockResolvedValueOnce(buildCampaignRow())
      mocks.mockSessionFindFirst.mockResolvedValueOnce({ id: 'session-1', state: 'ACTIVE' })
      const app = buildApp()

      const response = await request(app)
        .patch(`/api/campaigns/${CAMPAIGN_ID}/settings`)
        .set('Authorization', 'Bearer token')
        .send({ extensionSyncConflictResolution: 'IGNORE' })

      expect(response.status).toBe(403)
      expect(response.body.fields).toContain('extensionSyncConflictResolution')
    })

    it('allows unrelated settings changes while a session is ACTIVE if the four fields are unchanged', async () => {
      mocks.mockCampaignFindUnique.mockResolvedValueOnce(buildCampaignRow())
      mocks.mockSessionFindFirst.mockResolvedValueOnce({ id: 'session-1', state: 'ACTIVE' })
      const app = buildApp()

      const response = await request(app)
        .patch(`/api/campaigns/${CAMPAIGN_ID}/settings`)
        .set('Authorization', 'Bearer token')
        .send({ name: 'Renamed Campaign' })

      expect(response.status).toBe(200)
    })
  })
})
