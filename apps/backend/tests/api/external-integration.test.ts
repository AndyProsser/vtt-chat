import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const DM_ID = '33333333-3333-4333-8333-333333333333'
const CHARACTER_ID = '44444444-4444-4444-8444-444444444444'

const mocks = vi.hoisted(() => ({
  mockExtractTokenFromHeader: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockCampaignMembershipFindUnique: vi.fn(),
  mockCharacterFindFirst: vi.fn(),
  mockCharacterUpdate: vi.fn(),
  mockCharacterUpdateMany: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockAdminAuditLogCreate: vi.fn(),
  mockCampaignFindUnique: vi.fn(),
  mockCampaignExternalLinkFindMany: vi.fn(),
  mockCampaignExternalLinkFindFirst: vi.fn(),
  mockCampaignExternalLinkCreate: vi.fn(),
  mockCampaignExternalLinkUpdate: vi.fn(),
  mockGetSessionPresence: vi.fn(),
  mockAppendSessionAuditEvent: vi.fn(),
  mockBroadcastPresenceProfileUpdate: vi.fn(),
  mockInventoryItemFindFirst: vi.fn(),
  mockInventoryItemFindMany: vi.fn(),
  mockInventoryItemCreate: vi.fn(),
  mockInventoryItemUpdate: vi.fn(),
  mockCurrencyWalletFindFirst: vi.fn(),
  mockCurrencyWalletCreate: vi.fn(),
  mockCurrencyWalletUpdate: vi.fn(),
  mockInventoryHistoryEntryCreate: vi.fn(),
  mockPendingExtensionSyncCreate: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: (...args: unknown[]) => mocks.mockExtractTokenFromHeader(...args),
  verifyToken: (...args: unknown[]) => mocks.mockVerifyToken(...args),
}))

vi.mock('@/infra/db', () => {
  const client: any = {
    // Run transactional callbacks against the same mocked client so the
    // per-method spies still observe calls made inside $transaction blocks.
    $transaction: (fn: (tx: typeof client) => unknown) => fn(client),
    $queryRaw: mocks.mockQueryRaw,
    campaignMembership: {
      findUnique: mocks.mockCampaignMembershipFindUnique,
    },
    character: {
      findFirst: mocks.mockCharacterFindFirst,
      update: mocks.mockCharacterUpdate,
      updateMany: mocks.mockCharacterUpdateMany,
    },
    adminAuditLog: {
      create: mocks.mockAdminAuditLogCreate,
    },
    campaign: {
      findUnique: mocks.mockCampaignFindUnique,
    },
    campaignExternalLink: {
      findMany: mocks.mockCampaignExternalLinkFindMany,
      findFirst: mocks.mockCampaignExternalLinkFindFirst,
      create: mocks.mockCampaignExternalLinkCreate,
      update: mocks.mockCampaignExternalLinkUpdate,
    },
    inventoryItem: {
      findFirst: mocks.mockInventoryItemFindFirst,
      findMany: mocks.mockInventoryItemFindMany,
      create: mocks.mockInventoryItemCreate,
      update: mocks.mockInventoryItemUpdate,
    },
    currencyWallet: {
      findFirst: mocks.mockCurrencyWalletFindFirst,
      create: mocks.mockCurrencyWalletCreate,
      update: mocks.mockCurrencyWalletUpdate,
    },
    inventoryHistoryEntry: {
      create: mocks.mockInventoryHistoryEntryCreate,
    },
    pendingExtensionSync: {
      create: mocks.mockPendingExtensionSyncCreate,
    },
  }
  return { getPrismaClient: () => client }
})

vi.mock('@/repositories/campaign.repository', () => ({
  createCampaignForUser: vi.fn(),
  createCharacterForCampaign: vi.fn(),
  getCampaignForUser: vi.fn(),
  isUserInCampaign: vi.fn(),
  joinCampaignForUser: vi.fn(),
  listCampaignsForUser: vi.fn(),
}))

vi.mock('@/services/session/core.service', () => ({
  createSession: vi.fn(),
}))

vi.mock('@/repositories/session.repository', () => ({
  listSessionsByCampaign: vi.fn(),
}))

vi.mock('@/services/room.service', () => ({
  getSessionPresence: (...args: unknown[]) => mocks.mockGetSessionPresence(...args),
}))

vi.mock('@/services/runtime/runtime-streams.service', () => ({
  appendSessionAuditEvent: (...args: unknown[]) => mocks.mockAppendSessionAuditEvent(...args),
}))

vi.mock('@/services/session/presence-profile-broadcast.service', () => ({
  broadcastPresenceProfileUpdate: (...args: unknown[]) =>
    mocks.mockBroadcastPresenceProfileUpdate(...args),
}))

vi.mock('@/services/guest-auth', () => ({
  browseSpectatorCampaignsForUser: vi.fn(),
  getSpectatorWaitlistStatus: vi.fn(),
  validatePlayerInviteCode: vi.fn(),
  validateSpectatorInviteCode: vi.fn(),
}))

import integrationsRoutes from '@/api/integrations.routes'
import campaignRoutes from '@/api/campaign.routes'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/integrations', integrationsRoutes)
  app.use('/api/campaigns', campaignRoutes)
  return app
}

describe('external integration endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.mockInventoryItemFindMany.mockResolvedValue([])
    mocks.mockQueryRaw.mockResolvedValue([])

    mocks.mockExtractTokenFromHeader.mockImplementation((authHeader?: string) => {
      if (!authHeader) return null
      return authHeader.replace('Bearer ', '')
    })

    mocks.mockVerifyToken.mockReturnValue({
      userId: USER_ID,
      username: 'player-one',
      role: 'PLAYER',
      authType: 'FULL',
    })

    mocks.mockAdminAuditLogCreate.mockResolvedValue({ id: 'audit-1' })
    mocks.mockAppendSessionAuditEvent.mockResolvedValue(undefined)
    mocks.mockBroadcastPresenceProfileUpdate.mockResolvedValue(undefined)

    mocks.mockInventoryItemFindFirst.mockResolvedValue(null)
    mocks.mockInventoryItemCreate.mockImplementation(async ({ data }: any) => ({
      id: 'item-1',
      source: 'EXTERNAL',
      srdKey: null,
      srdCategory: 'EQUIPMENT',
      notes: null,
      externalSource: null,
      addedByUserId: USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    }))
    mocks.mockInventoryItemUpdate.mockImplementation(async ({ where, data }: any) => ({
      id: where.id,
      campaignId: CAMPAIGN_ID,
      ownerType: 'character',
      ownerId: CHARACTER_ID,
      source: 'EXTERNAL',
      srdKey: null,
      srdCategory: 'EQUIPMENT',
      externalId: null,
      externalSource: null,
      addedByUserId: USER_ID,
      createdAt: new Date(),
      ...data,
    }))
    mocks.mockCurrencyWalletFindFirst.mockResolvedValue(null)
    mocks.mockCurrencyWalletCreate.mockImplementation(async ({ data }: any) => ({
      id: 'wallet-1',
      cp: 0,
      sp: 0,
      ep: 0,
      gp: 0,
      pp: 0,
      updatedAt: new Date(),
      ...data,
    }))
    mocks.mockCurrencyWalletUpdate.mockImplementation(async ({ where, data }: any) => ({
      id: where.id,
      campaignId: CAMPAIGN_ID,
      ownerType: 'character',
      ownerId: CHARACTER_ID,
      ...data,
    }))
    mocks.mockInventoryHistoryEntryCreate.mockResolvedValue({})
    mocks.mockPendingExtensionSyncCreate.mockImplementation(async ({ data }: any) => ({
      id: 'pending-1',
      ...data,
    }))
  })

  it('returns 400 for invalid campaignId on sync', async () => {
    const app = buildApp()

    const response = await request(app)
      .post('/api/integrations/external/sync')
      .set('Authorization', 'Bearer token')
      .send({
        campaignId: 'invalid-id',
        externalSystem: 'dndbeyond',
        source: 'player',
      })

    expect(response.status).toBe(400)
    expect(response.body.field).toBe('campaignId')
  })

  it('returns 401 for sync requests without auth', async () => {
    const app = buildApp()
    mocks.mockExtractTokenFromHeader.mockReturnValueOnce(null)

    const response = await request(app).post('/api/integrations/external/sync').send({
      campaignId: CAMPAIGN_ID,
      externalSystem: 'dndbeyond',
      source: 'player',
    })

    expect(response.status).toBe(401)
    expect(response.body.code).toBe('UNAUTHORIZED')
  })

  it('returns 403 for non-members attempting sync', async () => {
    const app = buildApp()
    mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce(null)

    const response = await request(app)
      .post('/api/integrations/external/sync')
      .set('Authorization', 'Bearer token')
      .send({
        campaignId: CAMPAIGN_ID,
        externalSystem: 'dndbeyond',
        source: 'player',
      })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FORBIDDEN')
  })

  it('enforces DM_ONLY policy for non-DM player sync attempts', async () => {
    const app = buildApp()

    mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
      campaign: {
        extensionSyncPolicy: 'DM_ONLY',
        currentDmId: DM_ID,
      },
    })

    const response = await request(app)
      .post('/api/integrations/external/sync')
      .set('Authorization', 'Bearer token')
      .send({
        campaignId: CAMPAIGN_ID,
        externalSystem: 'dndbeyond',
        source: 'player',
      })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('SYNC_POLICY_VIOLATION')
  })

  it('enforces NONE policy for all sync attempts', async () => {
    const app = buildApp()

    mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
      campaign: {
        extensionSyncPolicy: 'NONE',
        currentDmId: USER_ID,
      },
    })

    const response = await request(app)
      .post('/api/integrations/external/sync')
      .set('Authorization', 'Bearer token')
      .send({
        campaignId: CAMPAIGN_ID,
        externalSystem: 'dndbeyond',
        source: 'dm',
      })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('SYNC_POLICY_VIOLATION')
  })

  it('allows DM_ONLY sync updates from the campaign DM', async () => {
    const app = buildApp()

    mocks.mockVerifyToken.mockReturnValueOnce({
      userId: DM_ID,
      username: 'dm-one',
      role: 'DM',
      authType: 'FULL',
    })

    mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
      campaign: {
        extensionSyncPolicy: 'DM_ONLY',
        currentDmId: DM_ID,
      },
    })

    const response = await request(app)
      .post('/api/integrations/external/sync')
      .set('Authorization', 'Bearer token')
      .send({
        campaignId: CAMPAIGN_ID,
        externalSystem: 'dndbeyond',
        source: 'dm',
        campaignUpdate: {
          title: 'Updated Campaign Name',
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.applied).toEqual({
      characterUpdate: false,
      campaignUpdate: true,
    })
    expect(mocks.mockAdminAuditLogCreate).toHaveBeenCalledTimes(1)
  })

  it('returns 400 when character sync payload omits externalCharacterId', async () => {
    const app = buildApp()

    mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
      campaign: {
        extensionSyncPolicy: 'DM_AND_PLAYERS',
        currentDmId: DM_ID,
      },
    })

    const response = await request(app)
      .post('/api/integrations/external/sync')
      .set('Authorization', 'Bearer token')
      .send({
        campaignId: CAMPAIGN_ID,
        externalSystem: 'dndbeyond',
        source: 'player',
        characterUpdate: {
          level: 8,
        },
      })

    expect(response.status).toBe(400)
    expect(response.body.field).toBe('characterUpdate.externalCharacterId')
  })

  it('applies character updates and audit logging under DM_AND_PLAYERS policy', async () => {
    const app = buildApp()

    mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
      campaign: {
        extensionSyncPolicy: 'DM_AND_PLAYERS',
        currentDmId: DM_ID,
      },
    })

    mocks.mockCharacterFindFirst.mockResolvedValueOnce({
      id: CHARACTER_ID,
      userId: USER_ID,
      isActive: true,
      metadata: { previous: true },
    })
    // Row-locked metadata read inside the sync transaction (SELECT ... FOR UPDATE)
    mocks.mockQueryRaw.mockResolvedValueOnce([{ metadata: { previous: true } }])

    mocks.mockCharacterUpdate.mockResolvedValueOnce({ id: CHARACTER_ID })
    mocks.mockGetSessionPresence.mockResolvedValueOnce([{ userId: USER_ID }])

    const { listSessionsByCampaign } = await import('@/repositories/session.repository')
    vi.mocked(listSessionsByCampaign).mockResolvedValueOnce([{ id: CAMPAIGN_ID } as any])

    const appWithWs = buildApp()
    const broadcastEventToSession = vi.fn()
    appWithWs.locals.wsManager = { broadcastEventToSession }

    const response = await request(appWithWs)
      .post('/api/integrations/external/sync')
      .set('Authorization', 'Bearer token')
      .send({
        campaignId: CAMPAIGN_ID,
        externalSystem: 'dndbeyond',
        source: 'player',
        characterUpdate: {
          externalCharacterId: 'ddb-char-1',
          level: 7,
          class: 'Ranger',
          subclass: 'Hunter',
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.applied).toMatchObject({
      characterUpdate: true,
      campaignUpdate: false,
    })

    expect(mocks.mockCharacterUpdate).toHaveBeenCalledWith({
      where: { id: CHARACTER_ID },
      data: {
        metadata: { previous: true, level: 7 },
        class: 'Ranger',
        subclass: 'Hunter',
        isActive: true,
      },
    })

    expect(mocks.mockAdminAuditLogCreate).toHaveBeenCalledTimes(1)
    expect(mocks.mockAppendSessionAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: CAMPAIGN_ID,
        campaignId: CAMPAIGN_ID,
        actorUserId: USER_ID,
        actionType: 'INTEGRATIONS.EXTERNAL_SYNCED',
        targetType: 'INTEGRATION_PROFILE',
        targetId: USER_ID,
        visibilityClass: 'ROLE_SCOPED',
        metadata: expect.objectContaining({
          externalSystem: 'dndbeyond',
          source: 'player',
          hasCharacterUpdate: true,
          hasCampaignUpdate: false,
        }),
      })
    )
    expect(broadcastEventToSession).toHaveBeenCalledTimes(0)
    expect(mocks.mockBroadcastPresenceProfileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        wsManager: expect.objectContaining({ broadcastEventToSession }),
        sessionIds: [CAMPAIGN_ID],
        userId: USER_ID,
      })
    )
  })

  it('lists external links for campaign DM', async () => {
    const app = buildApp()

    mocks.mockCampaignFindUnique.mockResolvedValueOnce({ currentDmId: USER_ID })
    mocks.mockCampaignExternalLinkFindMany.mockResolvedValueOnce([
      {
        id: 'link-1',
        externalSystem: 'dndbeyond',
        externalId: 'ddb-campaign-1',
        linkedAt: new Date('2026-04-29T00:00:00.000Z'),
        linkedByUser: {
          id: USER_ID,
          username: 'player-one',
          displayName: 'Player One',
        },
      },
    ])

    const response = await request(app)
      .get(`/api/campaigns/${CAMPAIGN_ID}/external-links`)
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body.links).toHaveLength(1)
    expect(response.body.links[0].externalSystem).toBe('dndbeyond')
  })

  it('rejects external-links listing for non-DM', async () => {
    const app = buildApp()

    mocks.mockCampaignFindUnique.mockResolvedValueOnce({ currentDmId: DM_ID })

    const response = await request(app)
      .get(`/api/campaigns/${CAMPAIGN_ID}/external-links`)
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FORBIDDEN')
  })

  it('returns 404 when campaign external-links are requested for missing campaign', async () => {
    const app = buildApp()

    mocks.mockCampaignFindUnique.mockResolvedValueOnce(null)

    const response = await request(app)
      .get(`/api/campaigns/${CAMPAIGN_ID}/external-links`)
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(404)
    expect(response.body.code).toBe('NOT_FOUND')
  })

  it('creates new campaign external link for DM', async () => {
    const app = buildApp()

    mocks.mockCampaignFindUnique.mockResolvedValueOnce({ currentDmId: USER_ID })
    mocks.mockCampaignExternalLinkFindFirst.mockResolvedValueOnce(null)
    mocks.mockCampaignExternalLinkCreate.mockResolvedValueOnce({
      id: 'link-new',
      externalSystem: 'dndbeyond',
      externalId: 'ddb-campaign-new',
      linkedAt: new Date('2026-04-29T00:00:00.000Z'),
    })

    const response = await request(app)
      .post(`/api/campaigns/${CAMPAIGN_ID}/external-links`)
      .set('Authorization', 'Bearer token')
      .send({
        externalSystem: 'dndbeyond',
        externalId: 'ddb-campaign-new',
      })

    expect(response.status).toBe(201)
    expect(response.body.message).toBe('External link created')
    expect(response.body.link.externalId).toBe('ddb-campaign-new')
    expect(mocks.mockAdminAuditLogCreate).toHaveBeenCalledTimes(1)
  })

  it('returns 409 for duplicate campaign external links', async () => {
    const app = buildApp()

    mocks.mockCampaignFindUnique.mockResolvedValueOnce({ currentDmId: USER_ID })
    mocks.mockCampaignExternalLinkFindFirst.mockResolvedValueOnce({
      id: 'link-existing',
      externalSystem: 'dndbeyond',
      externalId: 'ddb-campaign-1',
    })

    const response = await request(app)
      .post(`/api/campaigns/${CAMPAIGN_ID}/external-links`)
      .set('Authorization', 'Bearer token')
      .send({
        externalSystem: 'dndbeyond',
        externalId: 'ddb-campaign-1',
      })

    expect(response.status).toBe(409)
    expect(response.body.code).toBe('LINK_ALREADY_EXISTS')
  })

  it('updates existing campaign external link when externalId changes', async () => {
    const app = buildApp()

    mocks.mockCampaignFindUnique.mockResolvedValueOnce({ currentDmId: USER_ID })
    mocks.mockCampaignExternalLinkFindFirst.mockResolvedValueOnce({
      id: 'link-existing',
      externalSystem: 'dndbeyond',
      externalId: 'ddb-campaign-old',
    })
    mocks.mockCampaignExternalLinkUpdate.mockResolvedValueOnce({
      id: 'link-existing',
      externalSystem: 'dndbeyond',
      externalId: 'ddb-campaign-new',
      linkedAt: new Date('2026-04-29T00:00:00.000Z'),
    })

    const response = await request(app)
      .post(`/api/campaigns/${CAMPAIGN_ID}/external-links`)
      .set('Authorization', 'Bearer token')
      .send({
        externalSystem: 'dndbeyond',
        externalId: 'ddb-campaign-new',
      })

    expect(response.status).toBe(200)
    expect(response.body.message).toBe('External link updated')
    expect(response.body.link.externalId).toBe('ddb-campaign-new')
    expect(mocks.mockCampaignExternalLinkUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.mockAdminAuditLogCreate).toHaveBeenCalledTimes(1)
  })

  it('partially applies a combined sync request when currency sync is policy-disabled', async () => {
    const app = buildApp()

    mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
      campaign: {
        extensionSyncPolicy: 'DM_AND_PLAYERS',
        currentDmId: DM_ID,
        extensionInventorySyncEnabled: true,
        extensionCurrencySyncEnabled: false,
        extensionPartyInventorySyncAccess: 'DM_ONLY',
        extensionSyncConflictResolution: 'OVERWRITE',
      },
    })
    mocks.mockCharacterFindFirst.mockResolvedValue({ id: CHARACTER_ID })

    const response = await request(app)
      .post('/api/integrations/external/sync')
      .set('Authorization', 'Bearer token')
      .send({
        campaignId: CAMPAIGN_ID,
        externalSystem: 'dndbeyond',
        source: 'player',
        inventoryUpdate: {
          externalCharacterId: 'ddb-char-1',
          items: [{ externalId: 'ddb-item-1', name: 'Longsword', quantity: 1 }],
        },
        currencyUpdate: {
          externalCharacterId: 'ddb-char-1',
          wallet: { gp: 10 },
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.applied).toEqual({
      characterUpdate: false,
      campaignUpdate: false,
      inventoryItemsUpserted: 1,
      currencyUpdated: false,
      skippedReasons: { currency: 'SYNC_POLICY_DISABLED' },
    })
  })

  it('rejects a player-sourced party-only sync request when party access is DM_ONLY', async () => {
    const app = buildApp()

    mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
      campaign: {
        extensionSyncPolicy: 'DM_AND_PLAYERS',
        currentDmId: DM_ID,
        extensionInventorySyncEnabled: true,
        extensionCurrencySyncEnabled: true,
        extensionPartyInventorySyncAccess: 'DM_ONLY',
        extensionSyncConflictResolution: 'OVERWRITE',
      },
    })

    const response = await request(app)
      .post('/api/integrations/external/sync')
      .set('Authorization', 'Bearer token')
      .send({
        campaignId: CAMPAIGN_ID,
        externalSystem: 'dndbeyond',
        source: 'player',
        partyInventoryUpdate: {
          items: [{ externalId: 'ddb-item-2', name: 'Bag of Holding', quantity: 1 }],
        },
      })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('SYNC_POLICY_PARTY_ACCESS_DENIED')
  })

  it('applies a DM-sourced party sync request when party access is DM_ONLY', async () => {
    const app = buildApp()

    mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
      campaign: {
        extensionSyncPolicy: 'DM_AND_PLAYERS',
        currentDmId: DM_ID,
        extensionInventorySyncEnabled: true,
        extensionCurrencySyncEnabled: true,
        extensionPartyInventorySyncAccess: 'DM_ONLY',
        extensionSyncConflictResolution: 'OVERWRITE',
      },
    })

    mocks.mockVerifyToken.mockReturnValueOnce({
      userId: DM_ID,
      username: 'dm-one',
      role: 'DM',
      authType: 'FULL',
    })

    const response = await request(app)
      .post('/api/integrations/external/sync')
      .set('Authorization', 'Bearer token')
      .send({
        campaignId: CAMPAIGN_ID,
        externalSystem: 'dndbeyond',
        source: 'dm',
        partyInventoryUpdate: {
          items: [{ externalId: 'ddb-item-2', name: 'Bag of Holding', quantity: 1 }],
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.applied).toEqual({
      characterUpdate: false,
      campaignUpdate: false,
      partyInventoryItemsUpserted: 1,
    })
  })
})
