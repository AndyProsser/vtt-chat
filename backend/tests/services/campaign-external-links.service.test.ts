import { beforeEach, describe, expect, it, vi } from 'vitest'

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const DM_ID = '33333333-3333-4333-8333-333333333333'

const mocks = vi.hoisted(() => ({
  mockCampaignFindUnique: vi.fn(),
  mockCampaignExternalLinkFindMany: vi.fn(),
  mockCampaignExternalLinkFindFirst: vi.fn(),
  mockCampaignExternalLinkCreate: vi.fn(),
  mockCampaignExternalLinkUpdate: vi.fn(),
  mockAdminAuditLogCreate: vi.fn(),
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    campaign: {
      findUnique: mocks.mockCampaignFindUnique,
    },
    campaignExternalLink: {
      findMany: mocks.mockCampaignExternalLinkFindMany,
      findFirst: mocks.mockCampaignExternalLinkFindFirst,
      create: mocks.mockCampaignExternalLinkCreate,
      update: mocks.mockCampaignExternalLinkUpdate,
    },
    adminAuditLog: {
      create: mocks.mockAdminAuditLogCreate,
    },
  }),
}))

import {
  listCampaignExternalLinks,
  upsertCampaignExternalLink,
} from '../../src/services/campaign-external-links.service'

describe('campaign-external-links.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists links for campaign DM', async () => {
    mocks.mockCampaignFindUnique.mockResolvedValueOnce({ currentDmId: USER_ID })
    mocks.mockCampaignExternalLinkFindMany.mockResolvedValueOnce([
      {
        id: 'link-1',
        externalSystem: 'dndbeyond',
        externalId: 'ddb-campaign-1',
        linkedAt: new Date('2026-05-01T00:00:00.000Z'),
        linkedByUser: {
          id: USER_ID,
          username: 'dm-user',
          displayName: 'DM User',
        },
      },
    ])

    const result = await listCampaignExternalLinks({
      campaignId: CAMPAIGN_ID,
      requesterUserId: USER_ID,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.links).toHaveLength(1)
      expect(result.links[0].externalId).toBe('ddb-campaign-1')
    }
  })

  it('denies listing for non-DM users', async () => {
    mocks.mockCampaignFindUnique.mockResolvedValueOnce({ currentDmId: DM_ID })

    const result = await listCampaignExternalLinks({
      campaignId: CAMPAIGN_ID,
      requesterUserId: USER_ID,
    })

    expect(result).toEqual({ ok: false, code: 'FORBIDDEN' })
  })

  it('creates a new external link and writes audit log', async () => {
    mocks.mockCampaignFindUnique.mockResolvedValueOnce({ currentDmId: USER_ID })
    mocks.mockCampaignExternalLinkFindFirst.mockResolvedValueOnce(null)
    mocks.mockCampaignExternalLinkCreate.mockResolvedValueOnce({
      id: 'link-new',
      externalSystem: 'dndbeyond',
      externalId: 'ddb-campaign-new',
      linkedAt: new Date('2026-05-01T00:00:00.000Z'),
    })
    mocks.mockAdminAuditLogCreate.mockResolvedValueOnce({ id: 'audit-1' })

    const result = await upsertCampaignExternalLink({
      campaignId: CAMPAIGN_ID,
      externalSystem: 'dndbeyond',
      externalId: 'ddb-campaign-new',
      actor: {
        userId: USER_ID,
        username: 'dm-user',
        role: 'DM',
      },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe('created')
      expect(result.message).toBe('External link created')
    }
    expect(mocks.mockCampaignExternalLinkCreate).toHaveBeenCalledTimes(1)
    expect(mocks.mockAdminAuditLogCreate).toHaveBeenCalledTimes(1)
  })

  it('updates existing external link when externalId changes', async () => {
    mocks.mockCampaignFindUnique.mockResolvedValueOnce({ currentDmId: USER_ID })
    mocks.mockCampaignExternalLinkFindFirst.mockResolvedValueOnce({
      id: 'link-1',
      externalSystem: 'dndbeyond',
      externalId: 'ddb-campaign-old',
    })
    mocks.mockCampaignExternalLinkUpdate.mockResolvedValueOnce({
      id: 'link-1',
      externalSystem: 'dndbeyond',
      externalId: 'ddb-campaign-new',
      linkedAt: new Date('2026-05-01T00:00:00.000Z'),
    })
    mocks.mockAdminAuditLogCreate.mockResolvedValueOnce({ id: 'audit-1' })

    const result = await upsertCampaignExternalLink({
      campaignId: CAMPAIGN_ID,
      externalSystem: 'dndbeyond',
      externalId: 'ddb-campaign-new',
      actor: {
        userId: USER_ID,
        username: 'dm-user',
        role: 'DM',
      },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe('updated')
      expect(result.message).toBe('External link updated')
    }
    expect(mocks.mockCampaignExternalLinkUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.mockAdminAuditLogCreate).toHaveBeenCalledTimes(1)
  })

  it('returns duplicate-link conflict when link already matches', async () => {
    mocks.mockCampaignFindUnique.mockResolvedValueOnce({ currentDmId: USER_ID })
    mocks.mockCampaignExternalLinkFindFirst.mockResolvedValueOnce({
      id: 'link-1',
      externalSystem: 'dndbeyond',
      externalId: 'ddb-campaign-1',
    })

    const result = await upsertCampaignExternalLink({
      campaignId: CAMPAIGN_ID,
      externalSystem: 'dndbeyond',
      externalId: 'ddb-campaign-1',
      actor: {
        userId: USER_ID,
        username: 'dm-user',
        role: 'DM',
      },
    })

    expect(result).toEqual({
      ok: false,
      code: 'LINK_ALREADY_EXISTS',
      message: 'Campaign is already linked to dndbeyond campaign ddb-campaign-1',
    })
    expect(mocks.mockCampaignExternalLinkCreate).not.toHaveBeenCalled()
    expect(mocks.mockCampaignExternalLinkUpdate).not.toHaveBeenCalled()
  })
})
