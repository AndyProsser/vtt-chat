import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Server as HTTPServer } from 'http'
import type { UUID } from '@shared'

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as UUID
const USER_ID = '22222222-2222-4222-8222-222222222222' as UUID

const mocks = vi.hoisted(() => ({
  mockVerifyToken: vi.fn(),
  mockEnsurePresenceRecoveredFromSnapshots: vi.fn(async () => undefined),
  mockUpdatePresenceState: vi.fn(async () => undefined),
  mockSnapshotSessionPresence: vi.fn(async () => undefined),
  mockSetWebSocketManager: vi.fn(),
  mockHandleUserConnected: vi.fn(),
  mockHandleUserDisconnected: vi.fn(async () => undefined),
  mockSetInterval: vi.fn(),
  mockClearInterval: vi.fn(),
}))

vi.mock('ws', () => {
  class MockWebSocket {
    static OPEN = 1
  }

  class MockWebSocketServer {
    public clients = new Set<any>()
    public handlers = new Map<string, (...args: any[]) => void>()

    constructor(opts: any) {
      void opts
    }

    on(event: string, handler: (...args: any[]) => void) {
      this.handlers.set(event, handler)
      return this
    }

    close(cb?: () => void) {
      cb?.()
    }
  }

  return {
    WebSocket: MockWebSocket,
    WebSocketServer: MockWebSocketServer,
    Server: MockWebSocketServer,
  }
})

vi.mock('@/services/auth.service', () => ({
  verifyToken: mocks.mockVerifyToken,
}))

vi.mock('@/services/room.service', () => ({
  ensurePresenceRecoveredFromSnapshots: mocks.mockEnsurePresenceRecoveredFromSnapshots,
  updatePresenceState: mocks.mockUpdatePresenceState,
  snapshotSessionPresence: mocks.mockSnapshotSessionPresence,
}))

vi.mock('@/services/event-broadcaster.service', () => ({
  default: {
    setWebSocketManager: mocks.mockSetWebSocketManager,
  },
}))

vi.mock('@/services/session-disconnect-cascade.service', () => ({
  sessionDisconnectCascadeService: {
    handleUserConnected: mocks.mockHandleUserConnected,
    handleUserDisconnected: mocks.mockHandleUserDisconnected,
  },
}))

vi.mock('@/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

type MockClientSocket = {
  readyState: number
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  ping: ReturnType<typeof vi.fn>
  terminate: ReturnType<typeof vi.fn>
  authPayload?: { userId: UUID; username: string; role: 'PLAYER'; sessionId: UUID }
  connectionState?: { userId: UUID; sessionId: UUID; connectionId: string }
}

function createSocket(): MockClientSocket {
  return {
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
    ping: vi.fn(),
    terminate: vi.fn(),
  }
}

describe('websocket disconnect/reconnect sequencing (same user multi-tab)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    mocks.mockSetInterval
      .mockImplementationOnce(() => 101 as any) // snapshot interval
      .mockImplementationOnce(() => 202 as any) // heartbeat interval

    vi.stubGlobal('setInterval', mocks.mockSetInterval)
    vi.stubGlobal('clearInterval', mocks.mockClearInterval)

    mocks.mockVerifyToken.mockReturnValue({
      userId: USER_ID,
      username: 'alice',
      role: 'PLAYER',
      sessionId: SESSION_ID,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not start disconnect cascade while another tab for same user remains connected', async () => {
    const { WebSocketManager } = await import('@/ws/index')
    const manager = new WebSocketManager(new HTTPServer())

    const tabA = createSocket()
    const tabB = createSocket()

    ;(manager as any).authenticateConnection(tabA, 'token')
    ;(manager as any).authenticateConnection(tabB, 'token')
    ;(manager as any).handleDisconnection(tabA)

    expect(mocks.mockHandleUserDisconnected).not.toHaveBeenCalled()
    expect(mocks.mockHandleUserConnected).toHaveBeenCalledTimes(2)
    ;(manager as any).handleDisconnection(tabB)

    expect(mocks.mockHandleUserDisconnected).toHaveBeenCalledTimes(1)
    expect(mocks.mockHandleUserDisconnected).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        userId: USER_ID,
      })
    )

    await manager.close()
  })

  it('rapid reconnect after last-tab disconnect emits connect cancellation path without extra ghost-trigger disconnects', async () => {
    const { WebSocketManager } = await import('@/ws/index')
    const manager = new WebSocketManager(new HTTPServer())

    const tabA = createSocket()
    ;(manager as any).authenticateConnection(tabA, 'token')
    ;(manager as any).handleDisconnection(tabA)
    expect(mocks.mockHandleUserDisconnected).toHaveBeenCalledTimes(1)

    const tabReconnect = createSocket()
    ;(manager as any).authenticateConnection(tabReconnect, 'token')

    expect(mocks.mockHandleUserConnected).toHaveBeenCalledWith(SESSION_ID, USER_ID)
    expect(mocks.mockHandleUserDisconnected).toHaveBeenCalledTimes(1)

    await manager.close()
  })
})
