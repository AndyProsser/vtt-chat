import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Server as HTTPServer } from 'http'

const { registerHandlerSpy, setWebSocketManagerMock, setIntervalMock, clearIntervalMock } =
  vi.hoisted(() => {
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
      MockServerCtor: Server,
    }
  })

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
  return {
    WebSocket: class {},
    Server: class {
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
    },
  }
})

vi.mock('@/services/event-broadcaster.service', () => ({
  default: {
    setWebSocketManager: setWebSocketManagerMock,
  },
}))

vi.mock('@/core/rooms/room.service', () => ({
  ensurePresenceRecoveredFromSnapshots: vi.fn(async () => undefined),
  snapshotSessionPresence: vi.fn(async () => undefined),
  updatePresenceState: vi.fn(async () => undefined),
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: vi.fn(() => null),
  verifyToken: vi.fn(() => null),
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
    expect(clearIntervalMock).toHaveBeenCalledTimes(1)
  })
})
