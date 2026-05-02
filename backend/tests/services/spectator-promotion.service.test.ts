import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockSessionFindUnique: vi.fn(),
  mockSpectatorWaitlistFindFirst: vi.fn(),
  mockSpectatorWaitlistUpdateMany: vi.fn(),
  mockCampaignMembershipUpsert: vi.fn(),
  mockSessionMemberUpsert: vi.fn(),
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    session: {
      findUnique: mocks.mockSessionFindUnique,
    },
    spectatorWaitlist: {
      findFirst: mocks.mockSpectatorWaitlistFindFirst,
      updateMany: mocks.mockSpectatorWaitlistUpdateMany,
    },
    campaignMembership: {
      upsert: mocks.mockCampaignMembershipUpsert,
    },
    sessionMember: {
      upsert: mocks.mockSessionMemberUpsert,
    },
  }),
}))

vi.mock('@/services/auth.service', () => ({
  createToken: vi.fn(),
  hashPassword: vi.fn(),
}))

import { promoteNextWaitlistedSpectatorForSession } from '@/services/guest-auth.service'

describe('promoteNextWaitlistedSpectatorForSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('promotes the oldest waitlisted spectator into the active session', async () => {
    mocks.mockSessionFindUnique.mockResolvedValueOnce({
      id: 'session-1',
      campaignId: 'campaign-1',
      members: [],
      campaign: {
        id: 'campaign-1',
        spectatorMax: 2,
        spectatorWaitlistEnabled: true,
      },
    })
    mocks.mockSpectatorWaitlistFindFirst.mockResolvedValueOnce({
      id: 'waitlist-1',
      waitlistToken: 'wait-123',
      user: {
        id: 'user-1',
        username: 'queued-spectator',
        displayName: 'Queued Spectator',
      },
    })
    mocks.mockSpectatorWaitlistUpdateMany.mockResolvedValueOnce({ count: 1 })
    mocks.mockCampaignMembershipUpsert.mockResolvedValueOnce({ id: 'membership-1' })
    mocks.mockSessionMemberUpsert.mockResolvedValueOnce({ id: 'session-member-1' })

    const result = await promoteNextWaitlistedSpectatorForSession('session-1')

    expect(result).toEqual({
      promoted: true,
      campaignId: 'campaign-1',
      sessionId: 'session-1',
      waitlistToken: 'wait-123',
      user: {
        id: 'user-1',
        username: 'queued-spectator',
        displayName: 'Queued Spectator',
        role: 'SPECTATOR',
        authType: 'GUEST',
      },
    })
    expect(mocks.mockSpectatorWaitlistUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'waitlist-1',
        promoted: false,
      },
      data: {
        promoted: true,
        promotedAt: expect.any(Date),
      },
    })
    expect(mocks.mockCampaignMembershipUpsert).toHaveBeenCalledWith({
      where: {
        campaignId_userId: {
          campaignId: 'campaign-1',
          userId: 'user-1',
        },
      },
      create: {
        campaignId: 'campaign-1',
        userId: 'user-1',
        role: 'SPECTATOR',
      },
      update: {
        role: 'SPECTATOR',
      },
    })
    expect(mocks.mockSessionMemberUpsert).toHaveBeenCalledWith({
      where: {
        sessionId_userId: {
          sessionId: 'session-1',
          userId: 'user-1',
        },
      },
      create: {
        sessionId: 'session-1',
        userId: 'user-1',
        username: 'queued-spectator',
        role: 'SPECTATOR',
      },
      update: {
        role: 'SPECTATOR',
        username: 'queued-spectator',
      },
    })
  })

  it('does nothing when the session is already at spectator capacity', async () => {
    mocks.mockSessionFindUnique.mockResolvedValueOnce({
      id: 'session-1',
      campaignId: 'campaign-1',
      members: [{ id: 'spectator-a' }, { id: 'spectator-b' }],
      campaign: {
        id: 'campaign-1',
        spectatorMax: 2,
        spectatorWaitlistEnabled: true,
      },
    })

    const result = await promoteNextWaitlistedSpectatorForSession('session-1')

    expect(result).toEqual({ promoted: false })
    expect(mocks.mockSpectatorWaitlistFindFirst).not.toHaveBeenCalled()
  })
})
