import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageType, RoomType, SessionState } from '@shared'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const DM_ID = '22222222-2222-4222-8222-222222222222'
const MAIN_ROOM_ID = '33333333-3333-4333-8333-333333333333'
const GREEN_ROOM_ID = '44444444-4444-4444-8444-444444444444'
const AUTHOR_ID = '55555555-5555-4555-8555-555555555555'

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  getSession: vi.fn(),
}))

vi.mock('@/services/chat.service', () => ({
  sendMessage: mocks.sendMessage,
}))

vi.mock('@/services/session/core.service', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/services/room.service', () => ({
  getSessionPresence: vi.fn(async () => []),
  getRooms: vi.fn(),
  updatePresenceState: vi.fn(),
}))

vi.mock('@/ws/event-broadcaster', () => ({
  default: {
    isReady: () => false,
    broadcastToSession: vi.fn(),
  },
}))

vi.mock('@/repositories/audio.repository', () => ({
  listAudioDMOverridesBySession: vi.fn(async () => []),
}))

vi.mock('@/services/audio/effects.service', () => ({
  removeDMOverrideState: vi.fn(),
  setUserMuteState: vi.fn(),
}))

import { __testOnly } from '@/services/dev-mock/simulation.service'

describe('mock simulation service greenroom gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __testOnly.resetRuntime()

    mocks.sendMessage.mockResolvedValue({
      id: '99999999-9999-4999-8999-999999999999',
      sessionId: SESSION_ID,
      roomId: GREEN_ROOM_ID,
      authorId: AUTHOR_ID,
      authorUsername: 'dev_mock_alpha',
      content: 'Testing mock chatter',
      type: MessageType.OOC,
      isDmOnly: false,
      createdAt: 123,
      visibleTo: undefined,
    })
  })

  it('suppresses mock chat outside Greenroom when session is not active', async () => {
    mocks.getSession.mockResolvedValue({
      id: SESSION_ID,
      dmId: DM_ID,
      state: SessionState.IDLE,
    })

    await __testOnly.emitPersistedChatMessage({
      sessionId: SESSION_ID as any,
      runtime: {
        config: {
          speakingSimulatorEnabled: true,
          chatSimulatorEnabled: true,
          disconnectSimulatorEnabled: false,
          multiDeviceSimulatorEnabled: false,
          playerCount: 1,
          disconnectRealismProfile: 'BALANCED',
          disconnectChancePerTick: 0.18,
          ghostMinDurationMs: 2500,
          ghostMaxDurationMs: 7000,
        },
        isRunning: true,
        startedAt: 0,
        lastTouchedAt: 0,
        tickTimer: null,
        speakingNow: new Set(),
        typingNow: new Set(),
        disconnectedByUserId: new Map(),
        messageSentAtByType: { IC: [], OOC: [], WHISPER: [], DM: [] },
        multiDeviceByUserId: new Map(),
        transferByUserId: new Map(),
        multiDeviceSetupAt: 0,
      },
      author: {
        userId: AUTHOR_ID as any,
        username: 'dev_mock_alpha',
        primaryRoomId: MAIN_ROOM_ID as any,
        state: 'ONLINE' as any,
      },
      users: [],
      roomsById: new Map([
        [MAIN_ROOM_ID as any, { id: MAIN_ROOM_ID as any, type: RoomType.MAIN, name: 'Main Room' }],
        [
          GREEN_ROOM_ID as any,
          { id: GREEN_ROOM_ID as any, type: RoomType.GROUP, name: 'Green Room' },
        ],
      ]),
    })

    expect(mocks.sendMessage).not.toHaveBeenCalled()
  })

  it('forces Greenroom OOC messages for mocks before active play', async () => {
    mocks.getSession.mockResolvedValue({
      id: SESSION_ID,
      dmId: DM_ID,
      state: SessionState.IDLE,
    })

    await __testOnly.emitPersistedChatMessage({
      sessionId: SESSION_ID as any,
      runtime: {
        config: {
          speakingSimulatorEnabled: true,
          chatSimulatorEnabled: true,
          disconnectSimulatorEnabled: false,
          multiDeviceSimulatorEnabled: false,
          playerCount: 1,
          disconnectRealismProfile: 'BALANCED',
          disconnectChancePerTick: 0.18,
          ghostMinDurationMs: 2500,
          ghostMaxDurationMs: 7000,
        },
        isRunning: true,
        startedAt: 0,
        lastTouchedAt: 0,
        tickTimer: null,
        speakingNow: new Set(),
        typingNow: new Set(),
        disconnectedByUserId: new Map(),
        messageSentAtByType: { IC: [], OOC: [], WHISPER: [], DM: [] },
        multiDeviceByUserId: new Map(),
        transferByUserId: new Map(),
        multiDeviceSetupAt: 0,
      },
      author: {
        userId: AUTHOR_ID as any,
        username: 'dev_mock_alpha',
        primaryRoomId: GREEN_ROOM_ID as any,
        state: 'ONLINE' as any,
      },
      users: [],
      roomsById: new Map([
        [MAIN_ROOM_ID as any, { id: MAIN_ROOM_ID as any, type: RoomType.MAIN, name: 'Main Room' }],
        [
          GREEN_ROOM_ID as any,
          { id: GREEN_ROOM_ID as any, type: RoomType.GROUP, name: 'Green Room' },
        ],
      ]),
    })

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        roomId: GREEN_ROOM_ID,
        type: MessageType.OOC,
      })
    )
  })

  it('can emit DM-only messages from mocks during active sessions', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    mocks.getSession.mockResolvedValue({
      id: SESSION_ID,
      dmId: DM_ID,
      state: SessionState.ACTIVE,
    })

    await __testOnly.emitPersistedChatMessage({
      sessionId: SESSION_ID as any,
      runtime: {
        config: {
          speakingSimulatorEnabled: true,
          chatSimulatorEnabled: true,
          disconnectSimulatorEnabled: false,
          multiDeviceSimulatorEnabled: false,
          playerCount: 1,
          disconnectRealismProfile: 'BALANCED',
          disconnectChancePerTick: 0.18,
          ghostMinDurationMs: 2500,
          ghostMaxDurationMs: 7000,
        },
        isRunning: true,
        startedAt: 0,
        lastTouchedAt: 0,
        tickTimer: null,
        speakingNow: new Set(),
        typingNow: new Set(),
        disconnectedByUserId: new Map(),
        messageSentAtByType: { IC: [], OOC: [], WHISPER: [], DM: [] },
        multiDeviceByUserId: new Map(),
        transferByUserId: new Map(),
        multiDeviceSetupAt: 0,
      },
      author: {
        userId: AUTHOR_ID as any,
        username: 'dev_mock_alpha',
        primaryRoomId: MAIN_ROOM_ID as any,
        state: 'ONLINE' as any,
      },
      users: [
        {
          userId: AUTHOR_ID as any,
          username: 'dev_mock_alpha',
          primaryRoomId: MAIN_ROOM_ID as any,
          state: 'ONLINE' as any,
        },
      ],
      roomsById: new Map([
        [MAIN_ROOM_ID as any, { id: MAIN_ROOM_ID as any, type: RoomType.GROUP, name: 'Group A' }],
      ]),
    })

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        roomId: MAIN_ROOM_ID,
        type: MessageType.DM,
        recipientId: undefined,
        visibleTo: [AUTHOR_ID, DM_ID],
      })
    )

    randomSpy.mockRestore()
  })

  it('keeps whispers to one same-room player plus DM visibility', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const sameRoomRecipientId = '66666666-6666-4666-8666-666666666666'
    const otherRoomRecipientId = '77777777-7777-4777-8777-777777777777'

    mocks.getSession.mockResolvedValue({
      id: SESSION_ID,
      dmId: DM_ID,
      state: SessionState.ACTIVE,
    })

    await __testOnly.emitPersistedChatMessage({
      sessionId: SESSION_ID as any,
      runtime: {
        config: {
          speakingSimulatorEnabled: true,
          chatSimulatorEnabled: true,
          disconnectSimulatorEnabled: false,
          multiDeviceSimulatorEnabled: false,
          playerCount: 1,
          disconnectRealismProfile: 'BALANCED',
          disconnectChancePerTick: 0.18,
          ghostMinDurationMs: 2500,
          ghostMaxDurationMs: 7000,
        },
        isRunning: true,
        startedAt: 0,
        lastTouchedAt: 0,
        tickTimer: null,
        speakingNow: new Set(),
        typingNow: new Set(),
        disconnectedByUserId: new Map(),
        messageSentAtByType: { IC: [], OOC: [], WHISPER: [], DM: [] },
        multiDeviceByUserId: new Map(),
        transferByUserId: new Map(),
        multiDeviceSetupAt: 0,
      },
      author: {
        userId: AUTHOR_ID as any,
        username: 'dev_mock_alpha',
        primaryRoomId: MAIN_ROOM_ID as any,
        state: 'ONLINE' as any,
      },
      users: [
        {
          userId: AUTHOR_ID as any,
          username: 'dev_mock_alpha',
          primaryRoomId: MAIN_ROOM_ID as any,
          state: 'ONLINE' as any,
        },
        {
          userId: sameRoomRecipientId as any,
          username: 'dev_mock_bravo',
          primaryRoomId: MAIN_ROOM_ID as any,
          state: 'ONLINE' as any,
        },
        {
          userId: otherRoomRecipientId as any,
          username: 'dev_mock_charlie',
          primaryRoomId: GREEN_ROOM_ID as any,
          state: 'ONLINE' as any,
        },
      ],
      roomsById: new Map([
        [MAIN_ROOM_ID as any, { id: MAIN_ROOM_ID as any, type: RoomType.GROUP, name: 'Group A' }],
        [GREEN_ROOM_ID as any, { id: GREEN_ROOM_ID as any, type: RoomType.GROUP, name: 'Group B' }],
      ]),
    })

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        roomId: MAIN_ROOM_ID,
        type: MessageType.WHISPER,
        recipientId: sameRoomRecipientId,
        visibleTo: [AUTHOR_ID, DM_ID, sameRoomRecipientId],
      })
    )

    randomSpy.mockRestore()
  })
})
