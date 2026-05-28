import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userUpsert: vi.fn(),
  userUpdateMany: vi.fn(),
  userFindUnique: vi.fn(),
  campaignMembershipFindMany: vi.fn(),
  campaignMembershipFindUnique: vi.fn(),
  campaignMembershipUpsert: vi.fn(),
  campaignMembershipCreate: vi.fn(),
  campaignMembershipFindManyMemberIds: vi.fn(),
  campaignFindUnique: vi.fn(),
  campaignFindMany: vi.fn(),
  campaignCreate: vi.fn(),
  characterFindMany: vi.fn(),
  characterFindFirst: vi.fn(),
  characterUpdate: vi.fn(),
  txUserUpdateMany: vi.fn(),
  txCampaignCreate: vi.fn(),
  txCampaignMembershipCreate: vi.fn(),
  txCharacterCreate: vi.fn(),
  txCharacterUpdateMany: vi.fn(),
  txCharacterUpdate: vi.fn(),
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    user: {
      upsert: mocks.userUpsert,
      updateMany: mocks.userUpdateMany,
      findUnique: mocks.userFindUnique,
    },
    campaignMembership: {
      findMany: (args: unknown) => {
        if ((args as any)?.select?.userId) {
          return mocks.campaignMembershipFindManyMemberIds(args)
        }
        return mocks.campaignMembershipFindMany(args)
      },
      findUnique: mocks.campaignMembershipFindUnique,
      upsert: mocks.campaignMembershipUpsert,
      create: mocks.campaignMembershipCreate,
    },
    campaign: {
      findUnique: mocks.campaignFindUnique,
      findMany: mocks.campaignFindMany,
      create: mocks.campaignCreate,
    },
    character: {
      findMany: mocks.characterFindMany,
      findFirst: mocks.characterFindFirst,
      update: mocks.characterUpdate,
    },
    $transaction: (callback: any) => {
      const tx = {
        user: { updateMany: mocks.txUserUpdateMany },
        campaign: { create: mocks.txCampaignCreate },
        campaignMembership: { create: mocks.txCampaignMembershipCreate },
        character: {
          create: mocks.txCharacterCreate,
          updateMany: mocks.txCharacterUpdateMany,
          update: mocks.txCharacterUpdate,
        },
      }
      return callback(tx)
    },
  }),
}))

import {
  createCharacterForCampaign,
  createCampaignForUser,
  getCampaignForUser,
  getCampaignDmId,
  getUserProfileById,
  isUserInCampaign,
  joinCampaignForUser,
  listCharactersForUser,
  listCampaignMemberIds,
  listCampaignsForUser,
  listDiscoverableCampaigns,
  updateCharacterForCampaignMember,
  upsertUserAccount,
} from '@/repositories/campaign.repository'

describe('campaign repository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upserts DM user accounts and assigns campaign admin role', async () => {
    mocks.userUpsert.mockResolvedValueOnce({
      id: 'u-1',
      username: 'dm-user',
      displayName: 'DM User',
      avatarUrl: null,
      role: 'DM',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
    })

    const user = await upsertUserAccount({ username: 'dm-user', role: 'DM' })
    expect(user.role).toBe('DM')
    expect(mocks.userUpdateMany).toHaveBeenCalledTimes(1)

    mocks.userUpsert.mockResolvedValueOnce({
      id: 'u-2',
      username: 'player-user',
      displayName: 'Player User',
      avatarUrl: null,
      role: 'PLAYER',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
    })

    await upsertUserAccount({ username: 'player-user', role: 'PLAYER' })
    expect(mocks.userUpdateMany).toHaveBeenCalledTimes(1)
  })

  it('returns null for unknown user profile and maps existing profile', async () => {
    mocks.userFindUnique.mockResolvedValueOnce(null)
    const missing = await getUserProfileById('u-missing')
    expect(missing).toBeNull()

    mocks.userFindUnique.mockResolvedValueOnce({
      id: 'u-2',
      username: 'player-a',
      displayName: 'Player A',
      avatarUrl: 'a.png',
      role: 'PLAYER',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
    })
    const found = await getUserProfileById('u-2')
    expect(found?.username).toBe('player-a')
  })

  it('maps campaign listings with rounded presence labels', async () => {
    mocks.campaignMembershipFindMany.mockResolvedValueOnce([
      {
        role: 'PLAYER',
        joinedAt: new Date('2026-05-01T00:00:00.000Z'),
        campaign: {
          id: 'c-1',
          name: 'Iron Keep',
          description: null,
          posterUrl: null,
          inviteCode: 'ABC123',
          extensionSyncPolicy: 'DM_ONLY',
          currentDmId: 'u-dm',
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          updatedAt: new Date('2026-05-01T00:00:00.000Z'),
          currentDm: { username: 'dm', displayName: 'DM', avatarUrl: null },
          members: [
            { userId: 'u-p1', role: 'PLAYER' },
            { userId: 'u-p2', role: 'PLAYER' },
            { userId: 'u-p3', role: 'PLAYER' },
            { userId: 'u-s1', role: 'SPECTATOR' },
          ],
          sessions: [
            {
              state: 'ACTIVE',
              presence: [
                { userId: 'u-dm', state: 'ONLINE' },
                { userId: 'u-p1', state: 'ONLINE' },
                { userId: 'u-p2', state: 'ONLINE' },
                { userId: 'u-p3', state: 'ONLINE' },
                { userId: 'u-s1', state: 'ONLINE' },
              ],
            },
          ],
        },
      },
    ])

    const rows = await listCampaignsForUser('u-member')
    expect(rows[0]).toMatchObject({
      id: 'c-1',
      latestSessionState: 'ACTIVE',
      connectedPlayers: 3,
      connectedPlayersRounded: 5,
      connectedPlayersLabel: '~5',
      connectedSpectators: 1,
      connectedSpectatorsLabel: '1',
    })
  })

  it('creates campaign via transaction and supports membership join checks', async () => {
    mocks.txCampaignCreate.mockResolvedValueOnce({
      id: 'c-2',
      name: 'Vault',
      description: 'Desc',
      inviteCode: 'INV999',
      currentDmId: 'u-dm',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    })

    const created = await createCampaignForUser({
      name: 'Vault',
      description: 'Desc',
      currentDmId: 'u-dm',
    })

    expect(created.id).toBe('c-2')
    expect(mocks.txCampaignMembershipCreate).toHaveBeenCalledTimes(1)

    mocks.campaignFindUnique.mockResolvedValueOnce({ id: 'c-join', inviteCode: 'JOIN42' })
    mocks.campaignMembershipUpsert.mockResolvedValueOnce({})
    const joined = await joinCampaignForUser({
      campaignId: 'c-join',
      userId: 'u-player',
      inviteCode: 'JOIN42',
      role: 'PLAYER',
    })
    expect(joined).toBe(true)

    mocks.campaignFindUnique.mockResolvedValueOnce({ id: 'c-join', inviteCode: 'RIGHT' })
    const denied = await joinCampaignForUser({
      campaignId: 'c-join',
      userId: 'u-player',
      inviteCode: 'WRONG',
      role: 'PLAYER',
    })
    expect(denied).toBe(false)

    mocks.campaignMembershipFindUnique.mockResolvedValueOnce({
      campaignId: 'c-join',
      userId: 'u-player',
    })
    expect(await isUserInCampaign({ campaignId: 'c-join', userId: 'u-player' })).toBe(true)

    mocks.campaignMembershipFindManyMemberIds.mockResolvedValueOnce([
      { userId: 'u-1' },
      { userId: 'u-2' },
    ])
    expect(await listCampaignMemberIds('c-join')).toEqual(['u-1', 'u-2'])

    mocks.campaignFindUnique.mockResolvedValueOnce({ currentDmId: 'u-dm' })
    expect(await getCampaignDmId('c-join')).toBe('u-dm')
  })

  it('maps campaign details and listCharacters for membership lookups', async () => {
    mocks.campaignMembershipFindUnique.mockResolvedValueOnce({
      campaign: {
        id: 'c-1',
        name: 'Iron Keep',
        description: 'Desc',
        inviteCode: 'ABC123',
        currentDmId: 'u-dm',
        postSessionChatEnabled: true,
        postSessionChatDurationMs: 60_000,
        sessions: [{ state: 'COOLDOWN', endedAt: new Date('2026-05-01T00:00:00.000Z') }],
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    })

    const campaign = await getCampaignForUser({ campaignId: 'c-1', userId: 'u-1' })
    expect(campaign).toMatchObject({
      id: 'c-1',
      latestSessionState: 'COOLDOWN',
      postSessionChatEnabled: true,
    })

    mocks.characterFindMany.mockResolvedValueOnce([
      {
        id: 'ch-1',
        campaignId: 'c-1',
        userId: 'u-1',
        name: 'Aria',
        status: 'ALIVE',
        race: 'Elf',
        class: 'Rogue',
        subclass: 'Arcane Trickster',
        avatarUrl: null,
        metadata: { level: 7 },
        isActive: true,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    ])

    const characters = await listCharactersForUser('u-1')
    expect(characters[0]).toMatchObject({ id: 'ch-1', name: 'Aria', status: 'ALIVE' })
  })

  it('lists discoverable campaigns without invalid UUID fallback when user has no memberships', async () => {
    mocks.campaignMembershipFindMany.mockResolvedValueOnce([])
    mocks.campaignFindMany.mockResolvedValueOnce([
      {
        id: 'c-discover-1',
        name: 'Open Table',
        description: null,
        posterUrl: null,
        discoverable: true,
        spectatorPolicy: 'NONE',
        spectatorInviteCode: null,
        spectatorInviteActive: false,
        currentDmId: 'u-dm',
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        currentDm: { username: 'dm', displayName: 'DM', avatarUrl: null },
        members: [],
        sessions: [],
      },
    ])

    const rows = await listDiscoverableCampaigns('u-viewer')

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'c-discover-1',
      discoverable: true,
      activeConnectedCount: 0,
    })

    expect(mocks.campaignFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({
          id: expect.anything(),
        }),
      })
    )
  })

  it('creates and updates campaign characters including null metadata path', async () => {
    mocks.txCharacterCreate.mockResolvedValueOnce({
      id: 'ch-2',
      campaignId: 'c-1',
      userId: 'u-1',
      name: 'Borin',
      status: 'ALIVE',
      race: 'Dwarf',
      class: 'Cleric',
      subclass: null,
      avatarUrl: null,
      metadata: { level: 5 },
      isActive: true,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    })

    const created = await createCharacterForCampaign({
      campaignId: 'c-1',
      userId: 'u-1',
      name: 'Borin',
      class: 'Cleric',
      metadata: { level: 5 },
      isActive: true,
    })

    expect(created.id).toBe('ch-2')
    expect(mocks.txCharacterUpdateMany).toHaveBeenCalledTimes(1)

    mocks.characterFindFirst.mockResolvedValueOnce(null)
    const missing = await updateCharacterForCampaignMember({
      campaignId: 'c-1',
      userId: 'u-1',
      characterId: 'missing',
      name: 'Nope',
    })
    expect(missing).toBeNull()

    mocks.characterFindFirst.mockResolvedValueOnce({
      id: 'ch-2',
      campaignId: 'c-1',
      userId: 'u-1',
    })
    mocks.txCharacterUpdate.mockResolvedValueOnce({
      id: 'ch-2',
      campaignId: 'c-1',
      userId: 'u-1',
      name: 'Borin Updated',
      status: 'ALIVE',
      race: null,
      class: 'Cleric',
      subclass: null,
      avatarUrl: null,
      metadata: null,
      isActive: true,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    })

    const updated = await updateCharacterForCampaignMember({
      campaignId: 'c-1',
      userId: 'u-1',
      characterId: 'ch-2',
      name: 'Borin Updated',
      metadata: null,
      isActive: true,
    })

    expect(updated?.name).toBe('Borin Updated')
    expect(mocks.txCharacterUpdateMany).toHaveBeenCalledTimes(2)
  })
})
