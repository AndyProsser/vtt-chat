import { beforeEach, describe, expect, it, vi } from 'vitest'

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const DM_ID = '33333333-3333-4333-8333-333333333333'

const mocks = vi.hoisted(() => ({
  mockCampaignMembershipFindUnique: vi.fn(),
  mockCharacterFindFirst: vi.fn(),
  mockCharacterUpdate: vi.fn(),
  mockAdminAuditLogCreate: vi.fn(),
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    campaignMembership: {
      findUnique: mocks.mockCampaignMembershipFindUnique,
    },
    character: {
      findFirst: mocks.mockCharacterFindFirst,
      update: mocks.mockCharacterUpdate,
    },
    adminAuditLog: {
      create: mocks.mockAdminAuditLogCreate,
    },
  }),
}))

import { syncExternalIntegration } from '../../src/services/integration-sync.service'

describe('integration-sync.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
      campaign: {
        extensionSyncPolicy: 'DM_ONLY',
        currentDmId: DM_ID,
      },
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
      campaign: {
        extensionSyncPolicy: 'DM_AND_PLAYERS',
        currentDmId: DM_ID,
      },
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
      campaign: {
        extensionSyncPolicy: 'DM_AND_PLAYERS',
        currentDmId: DM_ID,
      },
    })
    mocks.mockCharacterFindFirst.mockResolvedValueOnce({
      id: 'char-1',
      metadata: { previous: true },
    })
    mocks.mockCharacterUpdate.mockResolvedValueOnce({ id: 'char-1' })
    mocks.mockAdminAuditLogCreate.mockResolvedValueOnce({ id: 'audit-1' })

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

    expect(result).toEqual({
      ok: true,
      applied: {
        characterUpdate: true,
        campaignUpdate: false,
      },
    })
    expect(mocks.mockCharacterUpdate).toHaveBeenCalledWith({
      where: { id: 'char-1' },
      data: {
        metadata: { previous: true, level: 7 },
        class: 'Ranger',
        subclass: 'Hunter',
      },
    })
    expect(mocks.mockAdminAuditLogCreate).toHaveBeenCalledTimes(1)
  })
})
