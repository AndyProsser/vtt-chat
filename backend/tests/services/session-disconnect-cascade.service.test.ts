import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  clearRoomMessages: vi.fn(),
  emitSessionBoundarySystemMessage: vi.fn(),
  applySessionStateRoomTransition: vi.fn(),
  deletePrivateRoomsForEndedSession: vi.fn(),
  getRooms: vi.fn(),
  getSessionPresence: vi.fn(),
  removePresenceProjection: vi.fn(),
  updatePresenceState: vi.fn(),
  clearRoomEnvironmentState: vi.fn(),
  clearSessionDMOverrideState: vi.fn(),
  getSessionAudioState: vi.fn(),
  updateSessionState: vi.fn(),
  getSession: vi.fn(),
  getSessionUsers: vi.fn(),
  broadcastSessionStatsSnapshot: vi.fn(),
  logSessionStateChange: vi.fn(),
}))

vi.mock('@/services/chat.service', () => ({
  clearRoomMessages: mocks.clearRoomMessages,
}))

vi.mock('@/services/system-messages.service', () => ({
  emitSessionBoundarySystemMessage: mocks.emitSessionBoundarySystemMessage,
}))

vi.mock('@/services/room.service', () => ({
  applySessionStateRoomTransition: mocks.applySessionStateRoomTransition,
  deletePrivateRoomsForEndedSession: mocks.deletePrivateRoomsForEndedSession,
  getRooms: mocks.getRooms,
  getSessionPresence: mocks.getSessionPresence,
  removePresenceProjection: mocks.removePresenceProjection,
  updatePresenceState: mocks.updatePresenceState,
}))

vi.mock('@/services/audio/audio-state', () => ({
  clearRoomEnvironmentState: mocks.clearRoomEnvironmentState,
  clearSessionDMOverrideState: mocks.clearSessionDMOverrideState,
  getSessionAudioState: mocks.getSessionAudioState,
}))

vi.mock('@/services/session/core.service', () => ({
  updateSessionState: mocks.updateSessionState,
  getSession: mocks.getSession,
  getSessionUsers: mocks.getSessionUsers,
}))

vi.mock('@/services/session/stats.service', () => ({
  broadcastSessionStatsSnapshot: mocks.broadcastSessionStatsSnapshot,
}))

vi.mock('@/services/session/logs.service', () => ({
  logSessionStateChange: mocks.logSessionStateChange,
}))

import { Role } from '@shared'
import type { EventEnvelope, UUID } from '@shared'
import { SessionDisconnectCascadeService } from '@/services/session/disconnect-cascade.service'

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as UUID
const USER_ID = '22222222-2222-4222-8222-222222222222' as UUID
const DM_ID = '33333333-3333-4333-8333-333333333333' as UUID
const ROOM_ID = '44444444-4444-4444-8444-444444444444' as UUID

describe('session disconnect cascade service', () => {
  let service: SessionDisconnectCascadeService
  const wsManager = {
    broadcastEventToSession: vi.fn((_sessionId: UUID, _event: EventEnvelope) => undefined),
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    service = new SessionDisconnectCascadeService()

    mocks.getSessionPresence.mockResolvedValue([
      {
        sessionId: SESSION_ID,
        userId: USER_ID,
        username: 'alice',
        state: 'ONLINE',
        ghost: false,
        primaryRoomId: ROOM_ID,
        lastSeenAt: Date.now(),
      },
    ])

    mocks.getSession.mockResolvedValue({
      id: SESSION_ID,
      name: 'Session 1',
      dmId: DM_ID,
      state: 'ACTIVE',
      createdAt: Date.now(),
    })

    mocks.getSessionUsers.mockResolvedValue([
      { id: DM_ID, username: 'dm', role: 'DM' },
      { id: USER_ID, username: 'alice', role: 'PLAYER' },
    ])

    mocks.updatePresenceState.mockImplementation(async (params: any) => ({
      sessionId: params.sessionId,
      userId: params.userId,
      username: params.username,
      state: params.state,
      ghost: params.ghost || false,
      primaryRoomId: params.primaryRoomId || ROOM_ID,
      privateRoomId: params.privateRoomId,
      lastSeenAt: Date.now(),
    }))

    mocks.updateSessionState.mockResolvedValue({
      id: SESSION_ID,
      name: 'Session 1',
      dmId: DM_ID,
      state: 'ENDED',
      createdAt: Date.now(),
    })

    mocks.applySessionStateRoomTransition.mockResolvedValue({
      mainRoomId: ROOM_ID,
      mainRoomName: 'Main Room',
      greenRoomId: ROOM_ID,
      greenRoomName: 'Green Room',
      targetRoomId: ROOM_ID,
      targetRoomName: 'Green Room',
      movedUsers: 0,
      targetState: 'OFFLINE',
    })

    mocks.getSessionAudioState.mockResolvedValue({
      dmOverrides: [],
      broadcast: { enabled: false, broadcastRoomId: null },
      rooms: [],
      environments: [],
      sessionId: SESSION_ID,
    })

    mocks.getRooms.mockResolvedValue([{ id: ROOM_ID, name: 'Green Room', type: 'GROUP' }])
  })

  afterEach(() => {
    service.dispose()
    vi.useRealTimers()
  })

  it('enters ghost mode after 5s and expires projection after 60s ttl', async () => {
    await service.handleUserDisconnected({
      sessionId: SESSION_ID,
      userId: USER_ID,
      username: 'alice',
      userRole: Role.PLAYER,
      wsManager,
      isUserConnected: () => false,
      isSessionConnected: () => true,
    })

    await vi.advanceTimersByTimeAsync(5_000)
    expect(mocks.getSessionPresence).toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(60_000)
    expect(mocks.removePresenceProjection).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      userId: USER_ID,
    })

    const ghostEvent = wsManager.broadcastEventToSession.mock.calls.find(
      (call: any[]) => call[1]?.type === 'PRESENCE:USER_GHOST_MODE_CHANGED'
    )
    expect(ghostEvent).toBeDefined()
  })

  it('cancels pending user timers when the user reconnects', async () => {
    await service.handleUserDisconnected({
      sessionId: SESSION_ID,
      userId: USER_ID,
      username: 'alice',
      userRole: Role.PLAYER,
      wsManager,
      isUserConnected: () => false,
      isSessionConnected: () => true,
    })

    service.handleUserConnected(SESSION_ID, USER_ID)
    await vi.advanceTimersByTimeAsync(70_000)

    expect(mocks.removePresenceProjection).not.toHaveBeenCalled()
  })

  it('auto-stops session after everyone leaves for 60s', async () => {
    await service.handleUserDisconnected({
      sessionId: SESSION_ID,
      userId: USER_ID,
      username: 'alice',
      userRole: Role.PLAYER,
      wsManager,
      isUserConnected: () => false,
      isSessionConnected: () => false,
    })

    await vi.advanceTimersByTimeAsync(60_000)

    expect(mocks.updateSessionState).toHaveBeenCalledWith(SESSION_ID, 'ENDED', DM_ID)
    expect(mocks.applySessionStateRoomTransition).toHaveBeenCalled()
  })

  it('flags CLEANUP immediately when table has fully disconnected outside active/paused', async () => {
    mocks.getSession.mockResolvedValue({
      id: SESSION_ID,
      name: 'Session 1',
      dmId: DM_ID,
      state: 'INACTIVE',
      createdAt: Date.now(),
    })
    mocks.updateSessionState.mockResolvedValue({
      id: SESSION_ID,
      name: 'Session 1',
      dmId: DM_ID,
      state: 'CLEANUP',
      createdAt: Date.now(),
    })
    mocks.getSessionPresence.mockResolvedValue([
      {
        sessionId: SESSION_ID,
        userId: DM_ID,
        username: 'dm',
        state: 'OFFLINE',
        ghost: false,
        primaryRoomId: ROOM_ID,
        lastSeenAt: Date.now(),
      },
      {
        sessionId: SESSION_ID,
        userId: USER_ID,
        username: 'alice',
        state: 'OFFLINE',
        ghost: false,
        primaryRoomId: ROOM_ID,
        lastSeenAt: Date.now(),
      },
    ])

    await service.handleUserDisconnected({
      sessionId: SESSION_ID,
      userId: USER_ID,
      username: 'alice',
      userRole: Role.PLAYER,
      wsManager,
      isUserConnected: () => false,
      isSessionConnected: () => false,
    })

    expect(mocks.updateSessionState).toHaveBeenCalledWith(SESSION_ID, 'CLEANUP', DM_ID)
    expect(mocks.clearRoomMessages).not.toHaveBeenCalled()
  })
})
