import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PresenceState } from '@shared'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const MAIN_ROOM_ID = '22222222-2222-4222-8222-222222222222'
const GHOST_USER_ID = '33333333-3333-4333-8333-333333333333'

const mocks = vi.hoisted(() => ({
  mockHashPassword: vi.fn(),
  mockGetRooms: vi.fn(),
  mockJoinRoom: vi.fn(),
  mockLeaveRoom: vi.fn(),
  mockAddUserToSession: vi.fn(),
  mockRemoveUserFromSession: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  prismaClient: {
    session: {
      findUnique: vi.fn(),
    },
    sessionMember: {
      findMany: vi.fn(),
    },
    user: {
      upsert: vi.fn(),
    },
    character: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    campaignMembership: {
      upsert: vi.fn(),
    },
  },
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => mocks.prismaClient,
}))

vi.mock('@/services/auth.service', () => ({
  hashPassword: mocks.mockHashPassword,
  createToken: vi.fn(),
}))

vi.mock('@/services/room.service', () => ({
  getSessionPresence: vi.fn(),
  getRooms: mocks.mockGetRooms,
  joinRoom: mocks.mockJoinRoom,
  leaveRoom: mocks.mockLeaveRoom,
}))

vi.mock('@/services/session.service', () => ({
  addUserToSession: mocks.mockAddUserToSession,
  removeUserFromSession: mocks.mockRemoveUserFromSession,
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: mocks.mockLoggerInfo,
    warn: mocks.mockLoggerWarn,
  },
}))

import { ensureDevMockPlayersForSession } from '@/services/dev-mock/players.service'

describe('dev-mock-players service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.mockHashPassword.mockResolvedValue('hashed-password')
    mocks.mockGetRooms.mockResolvedValue([
      {
        id: MAIN_ROOM_ID,
        name: 'Main Room',
        type: 'MAIN',
      },
    ])
    mocks.mockJoinRoom.mockResolvedValue({
      sessionId: SESSION_ID,
      userId: GHOST_USER_ID,
      primaryRoomId: MAIN_ROOM_ID,
    })
    mocks.mockAddUserToSession.mockResolvedValue(true)
    mocks.mockRemoveUserFromSession.mockResolvedValue({
      removed: true,
      promotedSpectator: { promoted: false },
    })
    mocks.mockLeaveRoom.mockResolvedValue({
      sessionId: SESSION_ID,
      userId: GHOST_USER_ID,
      primaryRoomId: undefined,
      state: PresenceState.OFFLINE,
    })

    mocks.prismaClient.session.findUnique.mockResolvedValue({
      id: SESSION_ID,
      campaignId: null,
      state: 'ACTIVE',
    })
    mocks.prismaClient.sessionMember.findMany.mockResolvedValue([
      {
        userId: GHOST_USER_ID,
        username: 'dev_mock_ghost',
      },
    ])
    mocks.prismaClient.user.upsert.mockImplementation(
      async ({ create }: { create: { username: string; displayName: string; email: string } }) => ({
        id: create.username,
        username: create.username,
        displayName: create.displayName,
        email: create.email,
      })
    )
  })

  it('prunes stale DEV mock members before reseeding the session roster', async () => {
    await ensureDevMockPlayersForSession(SESSION_ID as any)

    expect(mocks.mockLeaveRoom).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      roomId: MAIN_ROOM_ID,
      userId: GHOST_USER_ID,
      state: PresenceState.OFFLINE,
    })

    expect(mocks.mockRemoveUserFromSession).toHaveBeenCalledWith(SESSION_ID, GHOST_USER_ID)
    expect(mocks.mockJoinRoom).toHaveBeenCalled()
  })
})
