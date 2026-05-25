import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Server as HTTPServer } from 'http'
import type { EventEnvelope, UUID } from '@shared'

const {
  registerHandlerSpy,
  setWebSocketManagerMock,
  setIntervalMock,
  clearIntervalMock,
  verifyTokenMock,
  getSessionMock,
  getSessionPresenceMock,
} = vi.hoisted(() => {
  class MockWSServer {
    public clients = new Set<any>()
    public handlers = new Map<string, (...args: any[]) => void>()
    public close = vi.fn((cb?: () => void) => {
      cb?.()
    })

    on(event: string, handler: (...args: any[]) => void) {
      this.handlers.set(event, handler)
      return this
    }
  }

  const instances: MockWSServer[] = []

  const Server = class {
    public clients = new Set<any>()
    public handlers = new Map<string, (...args: any[]) => void>()
    public close = vi.fn((cb?: () => void) => {
      cb?.()
    })

    constructor(opts: any) {
      void opts
      instances.push(this as unknown as MockWSServer)
    }

    on(event: string, handler: (...args: any[]) => void) {
      this.handlers.set(event, handler)
      return this
    }
  }

  return {
    registerHandlerSpy: vi.fn(),
    setWebSocketManagerMock: vi.fn(),
    setIntervalMock: vi.fn(),
    clearIntervalMock: vi.fn(),
    verifyTokenMock: vi.fn(),
    getSessionMock: vi.fn(async () => null),
    getSessionPresenceMock: vi.fn(async () => []),
    MockServerCtor: Server,
  }
})

vi.mock('@/services/dev-mock/takeover.service', () => ({
  resolveEffectiveActor: vi.fn(async () => ({ userId: 'user-1', username: 'user-1' })),
  resolveEffectiveActorSnapshot: vi.fn(async () => null),
}))

vi.mock('@/services/chat-visibility.service', () => ({
  resolveTypingAudience: vi.fn(async () => undefined),
}))

vi.mock('@/repositories/campaign.repository', () => ({
  listCampaignMemberIds: vi.fn(async () => []),
}))

vi.mock('@/repositories/session.repository', () => ({
  findSessionById: vi.fn(async () => null),
}))

vi.mock('@/services/lobby/lobby-stats.service', () => ({
  broadcastLobbyStatsUpdated: vi.fn(async () => undefined),
}))

vi.mock('@/services/session/disconnect-cascade.service', () => ({
  sessionDisconnectCascadeService: {
    handleUserConnected: vi.fn(),
    handleUserDisconnected: vi.fn(),
  },
}))

vi.mock('@/ws/dispatcher', async () => {
  const actual = await vi.importActual<typeof import('@/ws/dispatcher')>('@/ws/dispatcher')
  return {
    ...actual,
    EventDispatcher: class extends actual.EventDispatcher {
      registerHandler(eventType: string, handler: any): void {
        registerHandlerSpy(eventType, handler)
        super.registerHandler(eventType, handler)
      }
    },
  }
})

vi.mock('ws', () => {
  class MockWebSocketServer {
    public clients = new Set<any>()
    public handlers = new Map<string, (...args: any[]) => void>()
    public close = vi.fn((cb?: () => void) => {
      cb?.()
    })

    constructor(opts: any) {
      void opts
    }

    on(event: string, handler: (...args: any[]) => void) {
      this.handlers.set(event, handler)
      return this
    }
  }

  return {
    WebSocket: class {},
    Server: MockWebSocketServer,
    WebSocketServer: MockWebSocketServer,
  }
})

vi.mock('@/ws/event-broadcaster', () => ({
  default: {
    setWebSocketManager: setWebSocketManagerMock,
  },
}))

vi.mock('@/services/room.service', () => ({
  ensurePresenceRecoveredFromSnapshots: vi.fn(async () => undefined),
  snapshotSessionPresence: vi.fn(async () => undefined),
  updatePresenceState: vi.fn(async () => undefined),
  getSessionPresence: getSessionPresenceMock,
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: vi.fn(() => null),
  verifyToken: verifyTokenMock,
}))

vi.mock('@/services/session/core.service', () => ({
  getSession: getSessionMock,
}))

vi.mock('@/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('WebSocketManager', () => {
  beforeEach(() => {
    registerHandlerSpy.mockClear()
    setWebSocketManagerMock.mockClear()
    setIntervalMock.mockClear()
    clearIntervalMock.mockClear()
    verifyTokenMock.mockReset()
    getSessionMock.mockReset()
    getSessionPresenceMock.mockReset()
    ;(getSessionMock as any).mockResolvedValue({
      id: 'session-1',
      dmId: 'dm-1',
    })
    ;(getSessionPresenceMock as any).mockResolvedValue([])

    vi.stubGlobal(
      'setInterval',
      setIntervalMock.mockImplementation(() => 1 as any)
    )
    vi.stubGlobal('clearInterval', clearIntervalMock)
  })

  it('registers required domain handlers on startup', async () => {
    const { WebSocketManager } = await import('@/ws/index')

    const manager = new WebSocketManager(new HTTPServer())

    const registeredTypes = registerHandlerSpy.mock.calls.map((call) => call[0])
    expect(registeredTypes).toEqual(
      expect.arrayContaining([
        'SESSION:CREATED',
        'SESSION:STARTED',
        'SESSION:PAUSED',
        'SESSION:RESUMED',
        'SESSION:ENDED',
        'CHAT:MESSAGE_SENT',
        'CHAT:TYPING_STARTED',
        'ROOM:USER_JOINED',
        'PRESENCE:STATE_CHANGED',
        'NOTES:UPDATED',
        'AUDIO:EFFECT_APPLIED',
        'AUDIO:EFFECT_REMOVED',
        'AUDIO:PRESET_LOADED',
        'AUDIO:DM_OVERRIDE_REMOVED',
      ])
    )

    await manager.close()
  })

  it('exposes connection/session counts from tracked clients', async () => {
    const { WebSocketManager } = await import('@/ws/index')

    const manager = new WebSocketManager(new HTTPServer())

    expect(manager.getConnectionCount()).toBe(0)
    expect(manager.getSessionCount()).toBe(0)

    await manager.close()
  })

  it('closes server and clears snapshot interval on shutdown', async () => {
    setIntervalMock
      .mockImplementationOnce(() => 101 as any) // heartbeat
      .mockImplementationOnce(() => 202 as any) // snapshot interval

    const { WebSocketManager } = await import('@/ws/index')

    const manager = new WebSocketManager(new HTTPServer())

    await manager.close()

    expect(clearIntervalMock).toHaveBeenCalledWith(202)
    expect(clearIntervalMock).toHaveBeenCalledTimes(2)
  })

  it('rebroadcasts typing only to the sender room audience plus DM', async () => {
    const { WebSocketManager } = await import('@/ws/index')

    const manager = new WebSocketManager(new HTTPServer())
    const wss = (manager as any).wss

    const createSocket = () => {
      const sent: Array<{ type: string; event?: EventEnvelope }> = []

      return {
        readyState: 1,
        authPayload: undefined,
        connectionState: undefined,
        authTimeoutId: undefined,
        send: vi.fn((payload: string) => {
          sent.push(JSON.parse(payload))
        }),
        close: vi.fn(),
        terminate: vi.fn(),
        ping: vi.fn(),
        sent,
      }
    }

    const authenticateSocket = async (socket: ReturnType<typeof createSocket>, payload: any) => {
      verifyTokenMock.mockReturnValueOnce(payload)
      wss.clients.add(socket)

      await (manager as any).handleMessage(
        socket,
        JSON.stringify({ type: 'WS:AUTH', token: 'jwt-token', sessionId: 'session-1' })
      )
    }

    const senderSocket = createSocket()
    const sameRoomSocket = createSocket()
    const dmSocket = createSocket()
    const otherRoomSocket = createSocket()

    ;(getSessionPresenceMock as any).mockResolvedValue([
      {
        userId: 'player-1',
        username: 'Alice',
        state: 'ONLINE',
        primaryRoomId: 'room-a',
        privateRoomId: undefined,
        lastSeenAt: Date.now(),
      },
      {
        userId: 'player-2',
        username: 'Bea',
        state: 'ONLINE',
        primaryRoomId: 'room-a',
        privateRoomId: undefined,
        lastSeenAt: Date.now(),
      },
      {
        userId: 'player-3',
        username: 'Cy',
        state: 'ONLINE',
        primaryRoomId: 'room-b',
        privateRoomId: undefined,
        lastSeenAt: Date.now(),
      },
      {
        userId: 'dm-1',
        username: 'Morgan',
        state: 'ONLINE',
        primaryRoomId: 'room-b',
        privateRoomId: undefined,
        lastSeenAt: Date.now(),
      },
    ])

    await authenticateSocket(senderSocket, {
      userId: 'player-1',
      username: 'Alice',
      role: 'PLAYER',
    })
    await authenticateSocket(sameRoomSocket, {
      userId: 'player-2',
      username: 'Bea',
      role: 'PLAYER',
    })
    await authenticateSocket(dmSocket, {
      userId: 'dm-1',
      username: 'Morgan',
      role: 'DM',
    })
    await authenticateSocket(otherRoomSocket, {
      userId: 'player-3',
      username: 'Cy',
      role: 'PLAYER',
    })

    const event: EventEnvelope = {
      id: 'evt-1' as UUID,
      type: 'CHAT:TYPING_STARTED',
      version: 1,
      userId: 'player-1' as UUID,
      userRole: 'PLAYER' as any,
      sessionId: 'session-1' as UUID,
      roomId: 'room-a' as UUID,
      timestamp: Date.now(),
      payload: {
        userId: 'player-1',
        username: 'Alice',
        roomId: 'room-a',
        startedAt: Date.now(),
      },
    }

    const visibleTo = await (manager as any).resolveClientEventAudience(event)
    ;(manager as any).broadcastToSession('session-1', event, senderSocket, visibleTo)

    const sameRoomEvents = sameRoomSocket.sent.filter(
      (message) => message.type === 'WS:EVENT' && message.event?.type === 'CHAT:TYPING_STARTED'
    )
    const dmEvents = dmSocket.sent.filter(
      (message) => message.type === 'WS:EVENT' && message.event?.type === 'CHAT:TYPING_STARTED'
    )
    const otherRoomEvents = otherRoomSocket.sent.filter(
      (message) => message.type === 'WS:EVENT' && message.event?.type === 'CHAT:TYPING_STARTED'
    )
    const senderEvents = senderSocket.sent.filter(
      (message) => message.type === 'WS:EVENT' && message.event?.type === 'CHAT:TYPING_STARTED'
    )

    expect(visibleTo).toEqual(['player-1', 'dm-1', 'player-2'])
    expect(sameRoomEvents).toHaveLength(1)
    expect(dmEvents).toHaveLength(1)
    expect(otherRoomEvents).toHaveLength(0)
    expect(senderEvents).toHaveLength(0)
    expect(sameRoomEvents[0]?.event?.type).toBe('CHAT:TYPING_STARTED')

    await manager.close()
  })
})
