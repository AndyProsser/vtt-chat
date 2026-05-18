import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sessionCreate: vi.fn(),
  sessionFindMany: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionUpdate: vi.fn(),
  sessionDelete: vi.fn(),
  sessionCount: vi.fn(),
  sessionMemberUpsert: vi.fn(),
  sessionMemberDeleteMany: vi.fn(),
  sessionMemberFindMany: vi.fn(),
  userFindMany: vi.fn(),
  characterFindMany: vi.fn(),
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    session: {
      create: mocks.sessionCreate,
      findMany: mocks.sessionFindMany,
      findUnique: mocks.sessionFindUnique,
      update: mocks.sessionUpdate,
      delete: mocks.sessionDelete,
      count: mocks.sessionCount,
    },
    sessionMember: {
      upsert: mocks.sessionMemberUpsert,
      deleteMany: mocks.sessionMemberDeleteMany,
      findMany: mocks.sessionMemberFindMany,
    },
    user: {
      findMany: mocks.userFindMany,
    },
    character: {
      findMany: mocks.characterFindMany,
    },
  }),
}))

import {
  campaignHasActiveSessions,
  createSessionRecord,
  getSessionParticipantProfiles,
  listCooldownSessionsWithCampaign,
  listSessionsByCampaign,
  removeSessionMember,
  updateSessionStateRecord,
} from '@/repositories/session.repository'

describe('session repository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates and lists campaign sessions with mapped fields', async () => {
    await createSessionRecord({
      id: 's-1',
      campaignId: 'c-1',
      name: 'Session 1',
      dmId: 'u-dm',
      state: 'IDLE',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      description: 'desc',
      plannedDurationMinutes: 120,
    })

    expect(mocks.sessionCreate).toHaveBeenCalledTimes(1)

    mocks.sessionFindMany.mockResolvedValueOnce([
      {
        id: 's-1',
        campaignId: 'c-1',
        name: 'Session 1',
        description: 'desc',
        plannedDurationMinutes: 120,
        cumulativePauseMs: 1,
        pauseCount: 2,
        pauseStartedAt: null,
        dmId: 'u-dm',
        state: 'COOLDOWN',
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        startedAt: new Date('2026-05-01T00:10:00.000Z'),
        endedAt: new Date('2026-05-01T01:10:00.000Z'),
      },
    ])

    const rows = await listSessionsByCampaign('c-1')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 's-1',
      campaignId: 'c-1',
      state: 'COOLDOWN',
      pauseCount: 2,
    })
  })

  it('updates session state payload using optional fields', async () => {
    await updateSessionStateRecord({
      sessionId: 's-1',
      newState: 'PAUSED',
      startedAt: new Date('2026-05-01T00:00:00.000Z'),
      cumulativePauseMs: 33,
      pauseCount: 1,
      pauseStartedAt: null,
    })

    expect(mocks.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's-1' },
        data: expect.objectContaining({
          state: 'PAUSED',
          cumulativePauseMs: 33,
          pauseCount: 1,
          pauseStartedAt: null,
        }),
      })
    )
  })

  it('reports active session count and maps cooldown campaign rows', async () => {
    mocks.sessionCount.mockResolvedValueOnce(1)
    const hasActive = await campaignHasActiveSessions('c-1')
    expect(hasActive).toBe(true)

    mocks.sessionFindMany.mockResolvedValueOnce([
      {
        id: 's-2',
        dmId: 'u-dm',
        name: 'Cooldown',
        campaignId: null,
        endedAt: null,
        campaign: null,
      },
    ])

    const rows = await listCooldownSessionsWithCampaign()
    expect(rows).toEqual([
      {
        id: 's-2',
        dmId: 'u-dm',
        name: 'Cooldown',
        campaignId: null,
        endedAt: null,
        campaign: null,
      },
    ])
  })

  it('removes session members and resolves participant profiles', async () => {
    mocks.sessionMemberDeleteMany.mockResolvedValueOnce({ count: 1 })
    const removed = await removeSessionMember({ sessionId: 's-1', userId: 'u-1' })
    expect(removed).toBe(true)

    mocks.sessionFindUnique.mockResolvedValueOnce({
      campaignId: 'c-1',
      members: [
        { userId: 'u-1', username: 'alpha' },
        { userId: 'u-2', username: 'beta' },
      ],
    })
    mocks.userFindMany.mockResolvedValueOnce([
      { id: 'u-1', username: 'alpha', displayName: 'Alpha Name', avatarUrl: 'a.png' },
    ])
    mocks.characterFindMany.mockResolvedValueOnce([
      {
        userId: 'u-1',
        name: 'Char Alpha',
        race: 'Elf',
        class: 'Rogue',
        subclass: 'Arcane Trickster',
        avatarUrl: 'char.png',
        metadata: { level: 7, hp: 33 },
        isActive: true,
        updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      },
      {
        userId: 'u-2',
        name: 'Char Beta',
        race: 'Dwarf',
        class: 'Cleric',
        subclass: null,
        avatarUrl: null,
        metadata: ['not-a-record'],
        isActive: false,
        updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    ])

    const profiles = await getSessionParticipantProfiles('s-1')
    expect(profiles['u-1']).toMatchObject({
      playerName: 'Alpha Name',
      characterName: 'Char Alpha',
      level: 7,
      characterStats: { level: 7, hp: 33 },
    })
    expect(profiles['u-2']).toMatchObject({
      playerName: 'beta',
      characterName: 'Char Beta',
      level: null,
      characterStats: null,
    })
  })
})
