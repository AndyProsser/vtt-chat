import { beforeEach, describe, expect, it, vi } from 'vitest'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const DM_ID = '22222222-2222-4222-8222-222222222222'
const PLAYER_ID = '33333333-3333-4333-8333-333333333333'
const NOW = 1_700_000_000_000

const mocks = vi.hoisted(() => ({
  listCleanupCandidateSessions: vi.fn(),
  listCooldownSessionsWithCampaign: vi.fn(),
  listEndedSessionsWithCampaign: vi.fn(),
  campaignHasActiveSessions: vi.fn(),
  listEndedSessionIdsByCampaign: vi.fn(),
  getRooms: vi.fn(),
  getSessionPresence: vi.fn(),
  updateSessionState: vi.fn(),
  getSessionUsers: vi.fn(),
  clearRoomMessages: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock('@/infra/config', () => ({
  config: {
    sessionCleanup: {
      jobIntervalMinutes: 5,
      minCleanupAgeMinutes: 20,
      endedDisconnectGraceMs: 60_000,
    },
  },
}))

vi.mock('@/repositories/session.repository', () => ({
  listCleanupCandidateSessions: mocks.listCleanupCandidateSessions,
  listCooldownSessionsWithCampaign: mocks.listCooldownSessionsWithCampaign,
  listEndedSessionsWithCampaign: mocks.listEndedSessionsWithCampaign,
  campaignHasActiveSessions: mocks.campaignHasActiveSessions,
  listEndedSessionIdsByCampaign: mocks.listEndedSessionIdsByCampaign,
}))

vi.mock('@/services/room.service', () => ({
  getRooms: mocks.getRooms,
  getSessionPresence: mocks.getSessionPresence,
}))

vi.mock('@/services/session/core.service', () => ({
  updateSessionState: mocks.updateSessionState,
  getSessionUsers: mocks.getSessionUsers,
}))

vi.mock('@/services/chat.service', () => ({
  clearRoomMessages: mocks.clearRoomMessages,
}))

vi.mock('@/utils', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
  },
  isGreenRoomName: (name: string) => name.toLowerCase().includes('green room'),
}))

import { sessionCleanupJobService } from '@/services/session/cleanup-job.service'

describe('session-cleanup-job.service grace timing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.clearAllMocks()

    mocks.listCooldownSessionsWithCampaign.mockResolvedValue([])
    mocks.listCleanupCandidateSessions.mockResolvedValue([])
    mocks.campaignHasActiveSessions.mockResolvedValue(false)
    mocks.listEndedSessionIdsByCampaign.mockResolvedValue([])
    mocks.getRooms.mockResolvedValue([])

    mocks.getSessionUsers.mockResolvedValue([
      { id: DM_ID, username: 'dm', role: 'DM' },
      { id: PLAYER_ID, username: 'player', role: 'PLAYER' },
    ])

    mocks.updateSessionState.mockResolvedValue({
      id: SESSION_ID,
      dmId: DM_ID,
      state: 'CLEANUP',
      name: 'Session 1',
    })
  })

  it('does not transition ENDED session to CLEANUP when all table members were offline for 59s', async () => {
    mocks.listEndedSessionsWithCampaign.mockResolvedValue([
      {
        id: SESSION_ID,
        dmId: DM_ID,
        name: 'Session 1',
        campaignId: null,
        endedAt: new Date(NOW - 10 * 60_000),
      },
    ])

    mocks.getSessionPresence.mockResolvedValue([
      {
        userId: DM_ID,
        state: 'OFFLINE',
        lastSeenAt: NOW - 59_000,
      },
      {
        userId: PLAYER_ID,
        state: 'OFFLINE',
        lastSeenAt: NOW - 59_000,
      },
    ])

    await sessionCleanupJobService.runLifecycleWorkerOnce()

    expect(mocks.updateSessionState).not.toHaveBeenCalledWith(SESSION_ID, 'CLEANUP', DM_ID)
  })

  it('transitions ENDED session to CLEANUP when all table members were offline for 60s', async () => {
    mocks.listEndedSessionsWithCampaign.mockResolvedValue([
      {
        id: SESSION_ID,
        dmId: DM_ID,
        name: 'Session 1',
        campaignId: null,
        endedAt: new Date(NOW - 10 * 60_000),
      },
    ])

    mocks.getSessionPresence.mockResolvedValue([
      {
        userId: DM_ID,
        state: 'OFFLINE',
        lastSeenAt: NOW - 60_000,
      },
      {
        userId: PLAYER_ID,
        state: 'OFFLINE',
        lastSeenAt: NOW - 60_000,
      },
    ])

    await sessionCleanupJobService.runLifecycleWorkerOnce()

    expect(mocks.updateSessionState).toHaveBeenCalledWith(SESSION_ID, 'CLEANUP', DM_ID)
  })
})
