import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEnvelope, UUID } from '@shared'
import { PresenceState, RoomType } from '@shared'

const {
  createRoomMock,
  joinRoomMock,
  leaveRoomMock,
  updatePresenceStateMock,
  applyDMOverrideStateMock,
  removeDMOverrideStateMock,
  setRoomEnvironmentStateMock,
  loggerDebugMock,
  loggerInfoMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  createRoomMock: vi.fn(async () => null),
  joinRoomMock: vi.fn(async () => null),
  leaveRoomMock: vi.fn(async () => null),
  updatePresenceStateMock: vi.fn(async () => null),
  applyDMOverrideStateMock: vi.fn(async () => null),
  removeDMOverrideStateMock: vi.fn(async () => null),
  setRoomEnvironmentStateMock: vi.fn(async () => null),
  loggerDebugMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}))

vi.mock('@/services/room.service', () => ({
  createRoom: createRoomMock,
  joinRoom: joinRoomMock,
  leaveRoom: leaveRoomMock,
  updatePresenceState: updatePresenceStateMock,
}))

vi.mock('@/services/audio/audio-state', () => ({
  applyDMOverrideState: applyDMOverrideStateMock,
  removeDMOverrideState: removeDMOverrideStateMock,
  setRoomEnvironmentState: setRoomEnvironmentStateMock,
}))

vi.mock('@/services/notes.service', () => ({
  createNote: vi.fn(),
  deleteNote: vi.fn(),
  updateNote: vi.fn(),
}))

vi.mock('@/services/chat.service', () => ({
  deleteMessage: vi.fn(),
  editMessage: vi.fn(),
  sendMessage: vi.fn(),
}))

vi.mock('@/services/session/core.service', () => ({
  getSession: vi.fn(),
}))

vi.mock('@/services/dev-mock/takeover.service', () => ({
  resolveEffectiveActor: vi.fn(async () => ({ userId: 'resolved', username: 'resolved' })),
}))

vi.mock('@/utils', () => ({
  logger: {
    debug: loggerDebugMock,
    info: loggerInfoMock,
    error: loggerErrorMock,
  },
}))

function makeEvent(type: string, payload: Record<string, unknown>): EventEnvelope {
  return {
    id: '11111111-1111-4111-8111-111111111111' as UUID,
    type,
    version: 1,
    userId: '22222222-2222-4222-8222-222222222222' as UUID,
    userRole: 'DM' as any,
    sessionId: '33333333-3333-4333-8333-333333333333' as UUID,
    roomId: null,
    timestamp: Date.now(),
    payload,
  }
}

describe('ws handlers', () => {
  beforeEach(() => {
    createRoomMock.mockClear()
    joinRoomMock.mockClear()
    leaveRoomMock.mockClear()
    updatePresenceStateMock.mockClear()
    applyDMOverrideStateMock.mockClear()
    removeDMOverrideStateMock.mockClear()
    setRoomEnvironmentStateMock.mockClear()
    loggerDebugMock.mockClear()
    loggerInfoMock.mockClear()
    loggerErrorMock.mockClear()
  })

  it('handleRoomCreated creates room with fallbacks and logs event', async () => {
    const { roomHandlers } = await import('@/ws/handlers')
    const event = makeEvent('ROOM:CREATED', {
      roomName: 'Tavern',
      roomType: RoomType.MAIN,
    })

    await roomHandlers.handleRoomCreated(event)

    expect(createRoomMock).toHaveBeenCalledWith({
      sessionId: event.sessionId,
      name: 'Tavern',
      type: RoomType.MAIN,
      createdBy: event.userId,
    })
    expect(loggerDebugMock).toHaveBeenCalledWith(
      'ws.handlers',
      'Handled ROOM:CREATED',
      expect.objectContaining({
        eventId: event.id,
        sessionId: event.sessionId,
      })
    )
  })

  it('handleRoomCreated skips createRoom when no room name is provided', async () => {
    const { roomHandlers } = await import('@/ws/handlers')
    const event = makeEvent('ROOM:CREATED', {
      roomType: RoomType.GROUP,
    })

    await roomHandlers.handleRoomCreated(event)

    expect(createRoomMock).not.toHaveBeenCalled()
    expect(loggerDebugMock).toHaveBeenCalled()
  })

  it('handleUserJoined calls joinRoom only when payload is complete', async () => {
    const { roomHandlers } = await import('@/ws/handlers')
    const validEvent = makeEvent('ROOM:USER_JOINED', {
      roomId: '44444444-4444-4444-8444-444444444444',
      userId: '55555555-5555-4555-8555-555555555555',
      username: 'player1',
    })

    await roomHandlers.handleUserJoined(validEvent)
    expect(joinRoomMock).toHaveBeenCalledWith({
      sessionId: validEvent.sessionId,
      roomId: '44444444-4444-4444-8444-444444444444',
      userId: '55555555-5555-4555-8555-555555555555',
      username: 'player1',
      state: PresenceState.ONLINE,
    })

    const invalidEvent = makeEvent('ROOM:USER_JOINED', {
      roomId: '44444444-4444-4444-8444-444444444444',
      userId: '55555555-5555-4555-8555-555555555555',
    })
    await roomHandlers.handleUserJoined(invalidEvent)

    expect(joinRoomMock).toHaveBeenCalledTimes(1)
  })

  it('handlePresenceStateChanged maps newState and roomId correctly', async () => {
    const { roomHandlers } = await import('@/ws/handlers')

    const eventWithNewState = makeEvent('PRESENCE:STATE_CHANGED', {
      userId: '66666666-6666-4666-8666-666666666666',
      username: 'rogue',
      roomId: '77777777-7777-4777-8777-777777777777',
      newState: PresenceState.SPEAKING,
      presence: PresenceState.IDLE,
    })

    await roomHandlers.handlePresenceStateChanged(eventWithNewState)

    expect(updatePresenceStateMock).toHaveBeenCalledWith({
      sessionId: eventWithNewState.sessionId,
      userId: '66666666-6666-4666-8666-666666666666',
      username: 'rogue',
      state: PresenceState.SPEAKING,
      primaryRoomId: '77777777-7777-4777-8777-777777777777',
    })

    const eventWithoutRoom = makeEvent('PRESENCE:STATE_CHANGED', {
      userId: '66666666-6666-4666-8666-666666666666',
      username: 'rogue',
      presence: PresenceState.ONLINE,
      roomId: null,
    })

    await roomHandlers.handlePresenceStateChanged(eventWithoutRoom)

    expect(updatePresenceStateMock).toHaveBeenNthCalledWith(2, {
      sessionId: eventWithoutRoom.sessionId,
      userId: '66666666-6666-4666-8666-666666666666',
      username: 'rogue',
      state: PresenceState.ONLINE,
      primaryRoomId: undefined,
    })
  })

  it('chat/session/notes handlers log the handled event type', async () => {
    const { chatHandlers, sessionHandlers, notesHandlers, audioHandlers } =
      await import('@/ws/handlers')

    await chatHandlers.handleTypingStopped(makeEvent('CHAT:TYPING_STOPPED', {}))
    await sessionHandlers.handleSessionPaused(makeEvent('SESSION:PAUSED', {}))
    await notesHandlers.handleNoteUpdated(makeEvent('NOTES:UPDATED', {}))
    await audioHandlers.handleDMOverrideRemoved(makeEvent('AUDIO:DM_OVERRIDE_REMOVED', {}))

    const logMessages = loggerDebugMock.mock.calls.map((call) => call[1])
    expect(logMessages).toEqual(
      expect.arrayContaining([
        'Handled CHAT:TYPING_STOPPED',
        'Handled SESSION:PAUSED',
        'Handled NOTES:UPDATED',
      ])
    )

    expect(removeDMOverrideStateMock).not.toHaveBeenCalled()
    expect(loggerInfoMock).toHaveBeenCalled()
  })
})
