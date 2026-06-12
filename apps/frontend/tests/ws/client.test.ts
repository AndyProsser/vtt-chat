import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEnvelope, UUID } from '@shared'
import { WebSocketClient } from '../../src/ws/client'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static failSend = false
  static failSendAfter: number | null = null

  url: string
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((error: unknown) => void) | null = null
  onclose: ((event?: { code?: number; reason?: string }) => void) | null = null

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    if (MockWebSocket.failSendAfter !== null) {
      MockWebSocket.failSendAfter -= 1
      if (MockWebSocket.failSendAfter < 0) {
        throw new Error('send failed')
      }
    }
    if (MockWebSocket.failSend) {
      throw new Error('send failed')
    }
    this.sent.push(data)
  }

  close() {
    this.onclose?.()
  }

  emitClose(code?: number, reason?: string) {
    this.onclose?.({ code, reason })
  }

  emitOpen() {
    this.onopen?.()
  }

  emitMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  emitRaw(data: string) {
    this.onmessage?.({ data })
  }

  emitError(error: unknown) {
    this.onerror?.(error)
  }
}

function makeEvent(id = '11111111-1111-4111-8111-111111111111'): EventEnvelope {
  return {
    id: id as UUID,
    type: 'CHAT:MESSAGE_SENT',
    version: 1,
    userId: '22222222-2222-4222-8222-222222222222' as UUID,
    userRole: 'PLAYER' as any,
    sessionId: '33333333-3333-4333-8333-333333333333' as UUID,
    roomId: null,
    timestamp: 1700000000000,
    payload: { text: 'hi' },
  }
}

describe('WebSocketClient', () => {
  const OriginalWebSocket = globalThis.WebSocket
  let randomUuidSpy: ReturnType<typeof vi.spyOn> | null = null

  beforeEach(() => {
    MockWebSocket.instances = []
    MockWebSocket.failSend = false
    MockWebSocket.failSendAfter = null
    vi.useFakeTimers()
    ;(globalThis as any).WebSocket = MockWebSocket
    if (globalThis.crypto?.randomUUID) {
      randomUuidSpy = vi
        .spyOn(globalThis.crypto, 'randomUUID')
        .mockReturnValue('99999999-9999-4999-8999-999999999999')
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    ;(globalThis as any).WebSocket = OriginalWebSocket
    randomUuidSpy?.mockRestore()
    randomUuidSpy = null
    vi.restoreAllMocks()
  })

  it('connects and sends WS:AUTH token on open', async () => {
    const onStateChange = vi.fn()
    const client = new WebSocketClient({
      url: 'ws://localhost:3000/ws',
      token: 'jwt-token',
      onStateChange,
    })

    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    expect(client.getState()).toBe('connecting')

    socket.emitOpen()
    await connectPromise

    expect(client.getState()).toBe('connected')
    expect(onStateChange).toHaveBeenCalledWith('connecting')
    expect(onStateChange).toHaveBeenCalledWith('connected')
    const authPayload = JSON.parse(socket.sent[0])
    expect(authPayload.type).toBe('WS:AUTH')
    expect(authPayload.token).toBe('jwt-token')
    expect(typeof authPayload.deviceSessionId).toBe('string')
    expect(authPayload.deviceClass).toBe('DESKTOP')
  })

  it('queues events while disconnected and flushes queue on reconnect', async () => {
    const client = new WebSocketClient({
      url: 'ws://localhost:3000/ws',
      token: 'jwt-token',
    })

    const event = makeEvent()
    client.send(event)
    expect(client.getQueuedEvents()).toHaveLength(1)

    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    socket.emitOpen()
    await connectPromise

    // First frame is auth, second is flushed queued event
    expect(socket.sent).toHaveLength(2)
    expect(socket.sent[1]).toBe(JSON.stringify(event))
    expect(client.getQueuedEvents()).toHaveLength(0)
  })

  it('send emits directly when connected', async () => {
    const client = new WebSocketClient({ url: 'ws://localhost:3000/ws', token: 'jwt-token' })
    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    socket.emitOpen()
    await connectPromise

    const event = makeEvent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    client.send(event)

    expect(socket.sent[socket.sent.length - 1]).toBe(JSON.stringify(event))
  })

  it('rejects invalid event IDs', () => {
    const onError = vi.fn()
    const client = new WebSocketClient({
      url: 'ws://localhost:3000/ws',
      token: 'jwt-token',
      onError,
    })

    client.send({ ...makeEvent(), id: 'not-a-uuid' as any })
    expect(onError).toHaveBeenCalledTimes(1)
    expect(client.getQueuedEvents()).toHaveLength(0)
  })

  it('disconnect closes socket and sets disconnected state', async () => {
    const onStateChange = vi.fn()
    const client = new WebSocketClient({
      url: 'ws://localhost:3000/ws',
      token: 'jwt-token',
      onStateChange,
    })

    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    socket.emitOpen()
    await connectPromise

    client.disconnect()
    expect(client.getState()).toBe('disconnected')
    expect(onStateChange).toHaveBeenCalledWith('disconnected')
  })

  it('routes WS:EVENT payloads to onEvent', async () => {
    const onEvent = vi.fn()
    const client = new WebSocketClient({
      url: 'ws://localhost:3000/ws',
      token: 'jwt-token',
      onEvent,
    })

    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    socket.emitOpen()
    await connectPromise

    const evt = makeEvent()
    socket.emitMessage({ type: 'WS:EVENT', event: evt })
    expect(onEvent).toHaveBeenCalledWith(evt)
  })

  it('normalizes WS:CONNECTED into EventEnvelope', async () => {
    const onEvent = vi.fn()
    const onError = vi.fn()
    const client = new WebSocketClient({
      url: 'ws://localhost:3000/ws',
      token: 'jwt-token',
      onEvent,
      onError,
    })

    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    socket.emitOpen()
    await connectPromise

    socket.emitMessage({
      type: 'WS:CONNECTED',
      connectionId: 'conn-1',
      userId: '22222222-2222-4222-8222-222222222222',
      username: 'alice',
      role: 'PLAYER',
    })

    expect(onError).not.toHaveBeenCalled()
    const emitted = onEvent.mock.calls[0]?.[0] as EventEnvelope
    expect(emitted.type).toBe('WS:CONNECTED')
    expect(emitted.payload).toMatchObject({ username: 'alice', connectionId: 'conn-1' })
  })

  it('reports error for WS:CONNECTED with invalid userId', async () => {
    const onError = vi.fn()
    const onEvent = vi.fn()
    const client = new WebSocketClient({
      url: 'ws://localhost:3000/ws',
      token: 'jwt-token',
      onError,
      onEvent,
    })

    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    socket.emitOpen()
    await connectPromise

    socket.emitMessage({
      type: 'WS:CONNECTED',
      connectionId: 'conn-1',
      userId: 'bad-id',
      username: 'alice',
      role: 'PLAYER',
    })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('surfaces WS:ERROR payload message through onError', async () => {
    const onError = vi.fn()
    const client = new WebSocketClient({
      url: 'ws://localhost:3000/ws',
      token: 'jwt-token',
      onError,
    })

    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    socket.emitOpen()
    await connectPromise

    socket.emitMessage({ type: 'WS:ERROR', code: 'X', message: 'Server exploded' })
    expect(onError).toHaveBeenCalledTimes(1)
    expect(String(onError.mock.calls[0]?.[0]?.message)).toContain('Server exploded')
  })

  it('handles malformed incoming JSON as parse error', async () => {
    const onError = vi.fn()
    const client = new WebSocketClient({
      url: 'ws://localhost:3000/ws',
      token: 'jwt-token',
      onError,
    })

    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    socket.emitOpen()
    await connectPromise

    socket.emitRaw('not-json')
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('schedules reconnect after close with exponential backoff', async () => {
    const onStateChange = vi.fn()
    const client = new WebSocketClient({
      url: 'ws://localhost:3000/ws',
      token: 'jwt-token',
      onStateChange,
      reconnectDelayMs: 100,
      maxReconnectAttempts: 2,
    })

    const connectPromise = client.connect()
    const socket1 = MockWebSocket.instances[0]!
    socket1.emitOpen()
    await connectPromise

    // Trigger close -> should move disconnected then reconnecting and schedule connect
    socket1.onclose?.()
    expect(client.getState()).toBe('reconnecting')

    vi.advanceTimersByTime(100)
    const socket2 = MockWebSocket.instances[1]
    expect(socket2).toBeDefined()
  })

  it('clearQueue empties queued events', () => {
    const client = new WebSocketClient({ url: 'ws://localhost:3000/ws', token: 'jwt-token' })
    client.send(makeEvent())
    client.send(makeEvent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
    expect(client.getQueuedEvents()).toHaveLength(2)
    client.clearQueue()
    expect(client.getQueuedEvents()).toHaveLength(0)
  })

  it('ignores connect when already connected', async () => {
    const client = new WebSocketClient({ url: 'ws://localhost:3000/ws', token: 'jwt-token' })
    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    socket.emitOpen()
    await connectPromise

    await client.connect()
    expect(MockWebSocket.instances).toHaveLength(1)
  })

  it('queues event when socket send throws while connected', async () => {
    const onError = vi.fn()
    const client = new WebSocketClient({
      url: 'ws://localhost:3000/ws',
      token: 'jwt-token',
      onError,
    })
    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    socket.emitOpen()
    await connectPromise

    MockWebSocket.failSend = true
    const event = makeEvent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    client.send(event)

    expect(onError).toHaveBeenCalledTimes(1)
    expect(client.getQueuedEvents()).toEqual([event])
  })

  it('keeps queued event when flush fails on reconnect', async () => {
    const client = new WebSocketClient({ url: 'ws://localhost:3000/ws', token: 'jwt-token' })
    const queued = makeEvent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    client.send(queued)

    MockWebSocket.failSendAfter = 1
    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    socket.emitOpen()
    await connectPromise

    expect(client.getQueuedEvents()).toEqual([queued])
    expect(socket.sent).toHaveLength(1)
  })

  it('accepts raw event envelopes for backward compatibility', async () => {
    const onEvent = vi.fn()
    const client = new WebSocketClient({
      url: 'ws://localhost:3000/ws',
      token: 'jwt-token',
      onEvent,
    })

    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    socket.emitOpen()
    await connectPromise

    const evt = makeEvent()
    socket.emitMessage(evt)
    expect(onEvent).toHaveBeenCalledWith(evt)
  })

  it('accepts WS:ACK without surfacing an error', async () => {
    const onError = vi.fn()
    const client = new WebSocketClient({
      url: 'ws://localhost:3000/ws',
      token: 'jwt-token',
      onError,
    })

    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    socket.emitOpen()
    await connectPromise

    socket.emitMessage({ type: 'WS:ACK', eventId: 'evt-1', status: 'ok' })
    expect(onError).not.toHaveBeenCalled()
  })

  it('calls onAuthFailure and rejects when closed with explicit auth failure code', async () => {
    const onAuthFailure = vi.fn()
    const onError = vi.fn()
    const client = new WebSocketClient({
      url: 'ws://localhost:3000/ws',
      token: 'jwt-token',
      onAuthFailure,
      onError,
    })

    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    socket.emitClose(4401, 'invalid token')

    await expect(connectPromise).rejects.toThrow(/auth failure/i)
    expect(onAuthFailure).toHaveBeenCalledWith('invalid token')
    expect(client.getState()).toBe('disconnected')
    vi.advanceTimersByTime(5000)
    expect(MockWebSocket.instances).toHaveLength(1)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('treats protocol-order close as reconnectable instead of auth failure', async () => {
    const onAuthFailure = vi.fn()
    const client = new WebSocketClient({
      url: 'ws://localhost:3000/ws',
      token: 'jwt-token',
      onAuthFailure,
      reconnectDelayMs: 100,
      maxReconnectAttempts: 1,
    })

    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    socket.emitOpen()
    await connectPromise

    socket.emitClose(1008, 'Authenticate first using WS:AUTH')
    expect(onAuthFailure).not.toHaveBeenCalled()
    expect(client.getState()).toBe('reconnecting')
  })

  it('treats 1008 unauthorized close as auth failure', async () => {
    const onAuthFailure = vi.fn()
    const client = new WebSocketClient({
      url: 'ws://localhost:3000/ws',
      token: 'jwt-token',
      onAuthFailure,
    })

    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    socket.emitClose(1008, 'Unauthorized')

    await expect(connectPromise).rejects.toThrow(/auth failure/i)
    expect(onAuthFailure).toHaveBeenCalledWith('Unauthorized')
  })

  it('uses provided sessionId in auth payload', async () => {
    const sessionId = '44444444-4444-4444-8444-444444444444' as UUID
    const client = new WebSocketClient({
      url: 'ws://localhost:3000/ws',
      token: 'jwt-token',
      sessionId,
    })

    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    socket.emitOpen()
    await connectPromise

    const authPayload = JSON.parse(socket.sent[0])
    expect(authPayload.sessionId).toBe(sessionId)
  })

  it('reuses session storage device session id when available', async () => {
    window.sessionStorage.setItem('vtt-chat:device-session-id', 'device-session-from-storage')
    const client = new WebSocketClient({ url: 'ws://localhost:3000/ws', token: 'jwt-token' })

    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    socket.emitOpen()
    await connectPromise

    const authPayload = JSON.parse(socket.sent[0])
    expect(authPayload.deviceSessionId).toBe('device-session-from-storage')
  })

  it('infers mobile device class from user agent', async () => {
    const originalNavigator = globalThis.navigator
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile' },
    })

    const client = new WebSocketClient({ url: 'ws://localhost:3000/ws', token: 'jwt-token' })
    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    socket.emitOpen()
    await connectPromise

    const authPayload = JSON.parse(socket.sent[0])
    expect(authPayload.deviceClass).toBe('MOBILE')

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    })
  })

  it('infers tablet device class from user agent', async () => {
    const originalNavigator = globalThis.navigator
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' },
    })

    const client = new WebSocketClient({ url: 'ws://localhost:3000/ws', token: 'jwt-token' })
    const connectPromise = client.connect()
    const socket = MockWebSocket.instances[0]!
    socket.emitOpen()
    await connectPromise

    const authPayload = JSON.parse(socket.sent[0])
    expect(authPayload.deviceClass).toBe('TABLET')

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    })
  })
})
