import { beforeEach, describe, expect, it, vi } from 'vitest'

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const DM_ID = '33333333-3333-4333-8333-333333333333'
const CHARACTER_ID = '44444444-4444-4444-8444-444444444444'

const mocks = vi.hoisted(() => ({
  mockCampaignMembershipFindUnique: vi.fn(),
  mockCharacterFindFirst: vi.fn(),
  mockCharacterUpdate: vi.fn(),
  mockCharacterUpdateMany: vi.fn(),
  mockExecuteRaw: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockAdminAuditLogCreate: vi.fn(),
  mockInventoryItemFindFirst: vi.fn(),
  mockInventoryItemCreate: vi.fn(),
  mockInventoryItemUpdate: vi.fn(),
  mockCurrencyWalletFindFirst: vi.fn(),
  mockCurrencyWalletCreate: vi.fn(),
  mockCurrencyWalletUpdate: vi.fn(),
  mockInventoryHistoryEntryCreate: vi.fn(),
  mockPendingExtensionSyncCreate: vi.fn(),
  mockInventoryItemFindMany: vi.fn(),
  mockEventBroadcasterSendToUser: vi.fn(),
}))

vi.mock('@/infra/db', () => {
  const client: any = {
    $executeRaw: mocks.mockExecuteRaw,
    $queryRaw: mocks.mockQueryRaw,
    // Run transactional callbacks against the same mocked client so existing
    // per-method spies (update / updateMany / $executeRaw) still observe calls.
    $transaction: (fn: (tx: typeof client) => unknown) => fn(client),
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

vi.mock('@/ws/event-broadcaster', () => ({
  default: {
    sendToUser: mocks.mockEventBroadcasterSendToUser,
    broadcastToSession: vi.fn(),
    isReady: () => true,
  },
}))

import { syncExternalIntegration } from '@/services/integration-sync.service'

const NOW = new Date('2026-06-16T00:00:00.000Z')

function buildItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    campaignId: CAMPAIGN_ID,
    ownerType: 'character',
    ownerId: CHARACTER_ID,
    name: 'Longsword',
    quantity: 1,
    source: 'EXTERNAL',
    srdKey: null,
    srdCategory: 'EQUIPMENT',
    notes: null,
    externalId: 'ddb-item-1',
    externalSource: 'dndbeyond',
    addedByUserId: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function buildWalletRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wallet-1',
    campaignId: CAMPAIGN_ID,
    ownerType: 'character',
    ownerId: CHARACTER_ID,
    cp: 0,
    sp: 0,
    ep: 0,
    gp: 0,
    pp: 0,
    updatedAt: NOW,
    ...overrides,
  }
}

/** Full Layer 2 defaults — explicit per the production Prisma schema defaults. */
function fullPolicyCampaign(overrides: Record<string, unknown> = {}) {
  return {
    extensionSyncPolicy: 'DM_AND_PLAYERS',
    currentDmId: DM_ID,
    extensionInventorySyncEnabled: true,
    extensionCurrencySyncEnabled: true,
    extensionPartyInventorySyncAccess: 'DM_ONLY',
    extensionSyncConflictResolution: 'OVERWRITE',
    ...overrides,
  }
}

describe('integration-sync.service', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.mockExecuteRaw.mockResolvedValue(1)
    mocks.mockQueryRaw.mockResolvedValue([])
    mocks.mockInventoryItemFindMany.mockResolvedValue([])
    mocks.mockCharacterUpdate.mockResolvedValue({})
    mocks.mockCharacterUpdateMany.mockResolvedValue({ count: 0 })
    mocks.mockInventoryItemFindFirst.mockResolvedValue(null)
    mocks.mockInventoryItemCreate.mockImplementation(async ({ data }: any) => buildItemRow(data))
    mocks.mockInventoryItemUpdate.mockImplementation(async ({ where, data }: any) =>
      buildItemRow({ id: where.id, ...data })
    )
    mocks.mockCurrencyWalletFindFirst.mockResolvedValue(null)
    mocks.mockCurrencyWalletCreate.mockImplementation(async ({ data }: any) => buildWalletRow(data))
    mocks.mockCurrencyWalletUpdate.mockImplementation(async ({ where, data }: any) =>
      buildWalletRow({ id: where.id, ...data })
    )
    mocks.mockInventoryHistoryEntryCreate.mockResolvedValue({})
    mocks.mockPendingExtensionSyncCreate.mockImplementation(async ({ data }: any) => ({
      id: 'pending-1',
      ...data,
    }))
    mocks.mockAdminAuditLogCreate.mockResolvedValue({ id: 'audit-1' })
  })

  it('rejects sync for non-members', async () => {
    mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce(null)

    const result = await syncExternalIntegration({
      campaignId: CAMPAIGN_ID,
      externalSystem: 'dndbeyond',
      source: 'player',
      user: {
        userId: USER_ID,
        username: 'player-one',
        role: 'PLAYER',
      },
    })

    expect(result).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      message: 'Not a member of this campaign',
    })
  })

  it('rejects sync policy violations', async () => {
    mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
      campaign: fullPolicyCampaign({ extensionSyncPolicy: 'DM_ONLY' }),
    })

    const result = await syncExternalIntegration({
      campaignId: CAMPAIGN_ID,
      externalSystem: 'dndbeyond',
      source: 'player',
      user: {
        userId: USER_ID,
        username: 'player-one',
        role: 'PLAYER',
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('SYNC_POLICY_VIOLATION')
    }
  })

  it('validates character update payload requirements', async () => {
    mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
      campaign: fullPolicyCampaign(),
    })

    const result = await syncExternalIntegration({
      campaignId: CAMPAIGN_ID,
      externalSystem: 'dndbeyond',
      source: 'player',
      user: {
        userId: USER_ID,
        username: 'player-one',
        role: 'PLAYER',
      },
      characterUpdate: {
        level: 7,
      },
    })

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_CHARACTER_UPDATE',
      message: 'characterUpdate.externalCharacterId is required',
      field: 'characterUpdate.externalCharacterId',
    })
  })

  it('applies sync updates and writes audit log on success', async () => {
    mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
      campaign: fullPolicyCampaign(),
    })
    mocks.mockCharacterFindFirst.mockResolvedValueOnce({
      id: 'char-1',
      userId: USER_ID,
      isActive: false,
    })
    mocks.mockCharacterUpdate.mockResolvedValueOnce({ id: 'char-1' })

    const result = await syncExternalIntegration({
      campaignId: CAMPAIGN_ID,
      externalSystem: 'dndbeyond',
      source: 'player',
      user: {
        userId: USER_ID,
        username: 'player-one',
        role: 'PLAYER',
      },
      characterUpdate: {
        externalCharacterId: 'ddb-char-1',
        level: 7,
        class: 'Ranger',
        subclass: 'Hunter',
      },
    })

    expect(result).toMatchObject({
      ok: true,
      applied: {
        characterUpdate: true,
        campaignUpdate: false,
      },
    })
    // Synced character is activated so the PARTY/presence projections (which read the
    // active character) render the synced data. Columns + overwritten metadata are
    // written together in the activating update.
    expect(mocks.mockCharacterUpdate).toHaveBeenCalledWith({
      where: { id: 'char-1' },
      data: {
        class: 'Ranger',
        subclass: 'Hunter',
        isActive: true,
        metadata: { level: 7 },
      },
    })
    // Inactive synced character: its owner's other active characters are deactivated
    // to maintain the single-active invariant.
    expect(mocks.mockCharacterUpdateMany).toHaveBeenCalledWith({
      where: {
        campaignId: CAMPAIGN_ID,
        userId: USER_ID,
        id: { not: 'char-1' },
        isActive: true,
      },
      data: { isActive: false },
    })
    // Metadata is read under a row lock (SELECT ... FOR UPDATE) before the overwrite.
    expect(mocks.mockQueryRaw).toHaveBeenCalledOnce()
    expect(mocks.mockAdminAuditLogCreate).toHaveBeenCalledTimes(1)
  })

  it('overwrites the stats section from the extension, dropping stale flat keys and any legacy nested shape', async () => {
    mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
      campaign: fullPolicyCampaign(),
    })
    mocks.mockCharacterFindFirst.mockResolvedValueOnce({
      id: 'char-1',
      userId: USER_ID,
      isActive: true,
    })
    // Existing metadata carries STALE data the extension must overwrite: a wrong
    // strength, a stale combat key not in the new payload, and a legacy nested `stats`.
    mocks.mockQueryRaw.mockResolvedValueOnce([
      {
        metadata: {
          level: 1,
          strength: 99,
          hpTemp: 50,
          stats: { abilityScores: { str: 99 } },
          features: ['Old Feature'],
        },
      },
    ])

    const result = await syncExternalIntegration({
      campaignId: CAMPAIGN_ID,
      externalSystem: 'dndbeyond',
      source: 'player',
      user: { userId: USER_ID, username: 'player-one', role: 'PLAYER' },
      characterUpdate: {
        externalCharacterId: '151855498',
        name: 'Silk',
        level: 4,
        stats: {
          initiative: 3,
          proficiencyBonus: 2,
          passivePerception: 14,
          abilityScores: { str: 10, dex: 16, con: 10, int: 8, wis: 14, cha: 17 },
          hp: { current: 23, max: 23, temp: 0 },
          ac: 14,
          speed: 30,
        },
        features: ['Magical Cunning'],
      },
    })

    expect(result.ok).toBe(true)
    // Already active → no sibling deactivation needed.
    expect(mocks.mockCharacterUpdateMany).not.toHaveBeenCalled()
    expect(mocks.mockQueryRaw).toHaveBeenCalledOnce()

    const writtenMetadata = mocks.mockCharacterUpdate.mock.calls[0][0].data.metadata as Record<
      string,
      unknown
    >
    // Canonical flat stats from the payload (extension is source of truth).
    expect(writtenMetadata).toMatchObject({
      level: 4,
      strength: 10,
      dexterity: 16,
      constitution: 10,
      intelligence: 8,
      wisdom: 14,
      charisma: 17,
      hpCurrent: 23,
      hpMax: 23,
      hpTemp: 0,
      ac: 14,
      initiative: 3,
      passivePerception: 14,
      proficiencyBonus: 2,
      speed: 30,
      features: ['Magical Cunning'],
    })
    // Stale strength overwritten, not merged.
    expect(writtenMetadata.strength).toBe(10)
    // Legacy nested representation removed.
    expect(writtenMetadata.stats).toBeUndefined()
    expect(writtenMetadata.abilityScores).toBeUndefined()
  })

  it('preserves an existing stats section when a stats-less packet arrives (multi-packet sync)', async () => {
    mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
      campaign: fullPolicyCampaign(),
    })
    mocks.mockCharacterFindFirst.mockResolvedValueOnce({
      id: 'char-1',
      userId: USER_ID,
      isActive: true,
    })
    // A previous packet already persisted canonical flat stats.
    mocks.mockQueryRaw.mockResolvedValueOnce([
      { metadata: { level: 4, strength: 10, dexterity: 16, hpCurrent: 23, hpMax: 23 } },
    ])

    const result = await syncExternalIntegration({
      campaignId: CAMPAIGN_ID,
      externalSystem: 'dndbeyond',
      source: 'player',
      user: { userId: USER_ID, username: 'player-one', role: 'PLAYER' },
      // Stats-less packet (the common "first packet" shape).
      characterUpdate: { externalCharacterId: '151855498', name: 'Silk', level: 4 },
    })

    expect(result.ok).toBe(true)
    const writtenMetadata = mocks.mockCharacterUpdate.mock.calls[0][0].data.metadata as Record<
      string,
      unknown
    >
    // Existing stats survive — absent sections are not touched.
    expect(writtenMetadata).toMatchObject({
      level: 4,
      strength: 10,
      dexterity: 16,
      hpCurrent: 23,
      hpMax: 23,
    })
  })

  describe('Layer 2: inventory-specific policy', () => {
    const baseUser = { userId: USER_ID, username: 'player-one', role: 'PLAYER' }

    it('rejects an inventory-only request when extensionInventorySyncEnabled is false', async () => {
      mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
        campaign: fullPolicyCampaign({ extensionInventorySyncEnabled: false }),
      })

      const result = await syncExternalIntegration({
        campaignId: CAMPAIGN_ID,
        externalSystem: 'dndbeyond',
        source: 'player',
        user: baseUser,
        inventoryUpdate: {
          externalCharacterId: 'ddb-char-1',
          items: [{ externalId: 'i1', name: 'Sword', quantity: 1 }],
        },
      })

      expect(result).toEqual({
        ok: false,
        code: 'SYNC_POLICY_DISABLED',
        message: 'Inventory or currency sync is disabled for this campaign',
      })
      expect(mocks.mockCharacterFindFirst).not.toHaveBeenCalled()
    })

    it('rejects a currency-only request when extensionCurrencySyncEnabled is false', async () => {
      mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
        campaign: fullPolicyCampaign({ extensionCurrencySyncEnabled: false }),
      })

      const result = await syncExternalIntegration({
        campaignId: CAMPAIGN_ID,
        externalSystem: 'dndbeyond',
        source: 'player',
        user: baseUser,
        currencyUpdate: { externalCharacterId: 'ddb-char-1', wallet: { gp: 10 } },
      })

      expect(result).toEqual({
        ok: false,
        code: 'SYNC_POLICY_DISABLED',
        message: 'Inventory or currency sync is disabled for this campaign',
      })
    })

    it('partially applies characterUpdate when inventory is disabled, reporting skippedReasons', async () => {
      mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
        campaign: fullPolicyCampaign({ extensionInventorySyncEnabled: false }),
      })
      mocks.mockCharacterFindFirst.mockResolvedValueOnce({ id: CHARACTER_ID, metadata: {} })
      mocks.mockCharacterUpdate.mockResolvedValueOnce({ id: CHARACTER_ID })

      const result = await syncExternalIntegration({
        campaignId: CAMPAIGN_ID,
        externalSystem: 'dndbeyond',
        source: 'player',
        user: baseUser,
        characterUpdate: { externalCharacterId: 'ddb-char-1', level: 5 },
        inventoryUpdate: {
          externalCharacterId: 'ddb-char-1',
          items: [{ externalId: 'i1', name: 'Sword', quantity: 1 }],
        },
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.applied.characterUpdate).toBe(true)
        expect(result.applied.inventoryItemsUpserted).toBe(0)
        expect(result.applied.skippedReasons).toEqual({ inventory: 'SYNC_POLICY_DISABLED' })
      }
    })

    it('rejects a party-only request from a player when extensionPartyInventorySyncAccess is DM_ONLY', async () => {
      mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
        campaign: fullPolicyCampaign({ extensionPartyInventorySyncAccess: 'DM_ONLY' }),
      })

      const result = await syncExternalIntegration({
        campaignId: CAMPAIGN_ID,
        externalSystem: 'dndbeyond',
        source: 'player',
        user: baseUser,
        partyInventoryUpdate: {
          items: [{ externalId: 'p1', name: 'Bag of Holding', quantity: 1 }],
        },
      })

      expect(result).toEqual({
        ok: false,
        code: 'SYNC_POLICY_PARTY_ACCESS_DENIED',
        message: 'Party inventory/currency sync is not permitted for this caller',
      })
    })

    it('allows a DM-sourced party request when extensionPartyInventorySyncAccess is DM_ONLY', async () => {
      mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
        campaign: fullPolicyCampaign({ extensionPartyInventorySyncAccess: 'DM_ONLY' }),
      })

      const result = await syncExternalIntegration({
        campaignId: CAMPAIGN_ID,
        externalSystem: 'dndbeyond',
        source: 'dm',
        user: { userId: DM_ID, username: 'dm-one', role: 'DM' },
        partyInventoryUpdate: {
          items: [{ externalId: 'p1', name: 'Bag of Holding', quantity: 1 }],
        },
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.applied.partyInventoryItemsUpserted).toBe(1)
      }
      expect(mocks.mockInventoryItemCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ownerType: 'party', ownerId: null }),
        })
      )
    })

    it('allows a player-sourced party request when extensionPartyInventorySyncAccess is ALL_PLAYERS', async () => {
      mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
        campaign: fullPolicyCampaign({ extensionPartyInventorySyncAccess: 'ALL_PLAYERS' }),
      })

      const result = await syncExternalIntegration({
        campaignId: CAMPAIGN_ID,
        externalSystem: 'dndbeyond',
        source: 'player',
        user: baseUser,
        partyCurrencyUpdate: { wallet: { gp: 10 } },
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.applied.partyCurrencyUpdated).toBe(true)
      }
    })

    it('discards a conflicting item under IGNORE while still applying a net-new item', async () => {
      mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
        campaign: fullPolicyCampaign({ extensionSyncConflictResolution: 'IGNORE' }),
      })
      mocks.mockCharacterFindFirst.mockResolvedValueOnce({ id: CHARACTER_ID })
      mocks.mockInventoryItemFindFirst.mockImplementation(async ({ where }: any) =>
        where.externalId === 'existing-1'
          ? buildItemRow({ externalId: 'existing-1', name: 'Old Name', quantity: 1 })
          : null
      )

      const result = await syncExternalIntegration({
        campaignId: CAMPAIGN_ID,
        externalSystem: 'dndbeyond',
        source: 'player',
        user: baseUser,
        inventoryUpdate: {
          externalCharacterId: 'ddb-char-1',
          items: [
            { externalId: 'existing-1', name: 'New Name', quantity: 5 },
            { externalId: 'new-1', name: 'New Item', quantity: 1 },
          ],
        },
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.applied.inventoryItemsUpserted).toBe(1)
        expect(result.applied.pendingConflicts).toBeUndefined()
      }
      expect(mocks.mockInventoryItemUpdate).not.toHaveBeenCalled()
    })

    it('queues a conflicting item under PROMPT and notifies the DM, while applying a net-new item', async () => {
      mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
        campaign: fullPolicyCampaign({ extensionSyncConflictResolution: 'PROMPT' }),
      })
      mocks.mockCharacterFindFirst.mockResolvedValueOnce({ id: CHARACTER_ID })
      mocks.mockInventoryItemFindFirst.mockImplementation(async ({ where }: any) =>
        where.externalId === 'existing-1'
          ? buildItemRow({ externalId: 'existing-1', name: 'Old Name', quantity: 1 })
          : null
      )

      const result = await syncExternalIntegration({
        campaignId: CAMPAIGN_ID,
        externalSystem: 'dndbeyond',
        source: 'player',
        user: baseUser,
        inventoryUpdate: {
          externalCharacterId: 'ddb-char-1',
          items: [
            { externalId: 'existing-1', name: 'New Name', quantity: 5 },
            { externalId: 'new-1', name: 'New Item', quantity: 1 },
          ],
        },
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.applied.inventoryItemsUpserted).toBe(1)
        expect(result.applied.pendingConflicts).toBe(1)
      }
      expect(mocks.mockPendingExtensionSyncCreate).toHaveBeenCalledTimes(1)
      expect(mocks.mockEventBroadcasterSendToUser).toHaveBeenCalledWith(
        DM_ID,
        expect.objectContaining({
          type: 'INVENTORY:EXTENSION_SYNC_PENDING',
          payload: expect.objectContaining({ kind: 'ITEM', characterId: CHARACTER_ID }),
        })
      )
    })

    it('discards an entire conflicting currency update under IGNORE', async () => {
      mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
        campaign: fullPolicyCampaign({ extensionSyncConflictResolution: 'IGNORE' }),
      })
      mocks.mockCharacterFindFirst.mockResolvedValueOnce({ id: CHARACTER_ID })
      mocks.mockCurrencyWalletFindFirst.mockResolvedValue(buildWalletRow({ gp: 50 }))

      const result = await syncExternalIntegration({
        campaignId: CAMPAIGN_ID,
        externalSystem: 'dndbeyond',
        source: 'player',
        user: baseUser,
        currencyUpdate: { externalCharacterId: 'ddb-char-1', wallet: { gp: 10 } },
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.applied.currencyUpdated).toBe(false)
      }
      expect(mocks.mockCurrencyWalletUpdate).not.toHaveBeenCalled()
    })

    it('queues a conflicting currency update under PROMPT and notifies the DM', async () => {
      mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
        campaign: fullPolicyCampaign({ extensionSyncConflictResolution: 'PROMPT' }),
      })
      mocks.mockCharacterFindFirst.mockResolvedValueOnce({ id: CHARACTER_ID })
      mocks.mockCurrencyWalletFindFirst.mockResolvedValue(buildWalletRow({ gp: 50 }))

      const result = await syncExternalIntegration({
        campaignId: CAMPAIGN_ID,
        externalSystem: 'dndbeyond',
        source: 'player',
        user: baseUser,
        currencyUpdate: { externalCharacterId: 'ddb-char-1', wallet: { gp: 10 } },
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.applied.currencyUpdated).toBe(false)
        expect(result.applied.pendingConflicts).toBe(1)
      }
      expect(mocks.mockEventBroadcasterSendToUser).toHaveBeenCalledWith(
        DM_ID,
        expect.objectContaining({ payload: expect.objectContaining({ kind: 'CURRENCY' }) })
      )
    })

    it('falls back to OVERWRITE for a party-owned conflict under PROMPT (no DM-review queue for party records)', async () => {
      mocks.mockCampaignMembershipFindUnique.mockResolvedValueOnce({
        campaign: fullPolicyCampaign({
          extensionSyncConflictResolution: 'PROMPT',
          extensionPartyInventorySyncAccess: 'DM_ONLY',
        }),
      })
      mocks.mockInventoryItemFindFirst.mockResolvedValue(
        buildItemRow({
          ownerType: 'party',
          ownerId: null,
          externalId: 'p1',
          name: 'Old Name',
          quantity: 1,
        })
      )

      const result = await syncExternalIntegration({
        campaignId: CAMPAIGN_ID,
        externalSystem: 'dndbeyond',
        source: 'dm',
        user: { userId: DM_ID, username: 'dm-one', role: 'DM' },
        partyInventoryUpdate: { items: [{ externalId: 'p1', name: 'New Name', quantity: 2 }] },
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.applied.partyInventoryItemsUpserted).toBe(1)
        expect(result.applied.pendingConflicts).toBeUndefined()
      }
      expect(mocks.mockPendingExtensionSyncCreate).not.toHaveBeenCalled()
      expect(mocks.mockEventBroadcasterSendToUser).not.toHaveBeenCalled()
    })
  })
})
