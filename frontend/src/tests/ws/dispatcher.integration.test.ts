import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEnvelope } from '@shared'

const { mockUseStore, MockWebSocketClient, clientInstances } = vi.hoisted(() => {
  type ClientOptions = {
    url: string
    token: string
    onStateChange?: (state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting') => void
    onError?: (error: Error) => void
    onEvent?: (event: EventEnvelope) => void
  }

  class HoistedMockWebSocketClient {
    options: ClientOptions
    connect = vi.fn(async () => {
      this.options.onStateChange?.('connecting')
      this.options.onStateChange?.('connected')
    })
    disconnect = vi.fn(() => {
      this.options.onStateChange?.('disconnected')
    })
    send = vi.fn()

    constructor(options: ClientOptions) {
      this.options = options
      clientInstances.push(this)
    }
  }

  return {
    mockUseStore: vi.fn(),
    MockWebSocketClient: HoistedMockWebSocketClient,
    clientInstances: [] as HoistedMockWebSocketClient[],
  }
})

vi.mock('../../hooks/useStore', () => ({
  useStore: Object.assign(
    (selector?: (state: any) => unknown) => {
      const state = mockUseStore()
      return typeof selector === 'function' ? selector(state) : state
    },
    {
      getState: () => mockUseStore(),
    }
  ),
}))

vi.mock('../../ws/client', () => ({
  WebSocketClient: MockWebSocketClient,
}))

function makeEvent(type: string): EventEnvelope {
  return {
    id: '11111111-1111-4111-8111-111111111111' as any,
    type,
    version: 1,
    userId: '22222222-2222-4222-8222-222222222222' as any,
    userRole: 'DM' as any,
    sessionId: '33333333-3333-4333-8333-333333333333' as any,
    roomId: null,
    timestamp: Date.now(),
    payload: {},
  }
}

describe('WebSocket dispatcher integration', () => {
  beforeEach(() => {
    clientInstances.length = 0
    const calls: string[] = []

    mockUseStore.mockReturnValue({
      calls,
      handleSessionCreated: vi.fn(() => calls.push('SESSION:CREATED')),
      handleSessionStateChanged: vi.fn(),
      handleSessionEnded: vi.fn(),
      handleMessageSent: vi.fn(() => calls.push('CHAT:MESSAGE_SENT')),
      handleMessageEdited: vi.fn(),
      handleMessageDeleted: vi.fn(),
      handleRoomContextCleared: vi.fn(),
      handleTypingStarted: vi.fn(() => calls.push('CHAT:TYPING_STARTED')),
      handleTypingStopped: vi.fn(),
      handleNoteCreated: vi.fn(),
      handleNoteUpdated: vi.fn(),
      handleNoteDeleted: vi.fn(),
      handleRoomCreated: vi.fn(),
      handleUserJoined: vi.fn(),
      handleUserLeft: vi.fn(),
      handleSessionRoomTransitionApplied: vi.fn(),
      handlePresenceStateChanged: vi.fn(),
      handleEffectApplied: vi.fn(),
      handleEffectRemoved: vi.fn(),
      handlePresetLoaded: vi.fn(() => calls.push('AUDIO:PRESET_LOADED')),
      handleEnvironmentSet: vi.fn(),
      handleDMOverrideApplied: vi.fn(),
      handleDMOverrideRemoved: vi.fn(),
      handleBroadcastStateChanged: vi.fn(),
      handleConnectionEstablished: vi.fn(),
    })
  })

  it('binds all required domain handlers during startup', async () => {
    const registerSpy = vi.spyOn(
      (await import('../../ws/dispatcher')).EventDispatcher.prototype,
      'register'
    )
    const { useWebSocket } = await import('../../hooks/useWebSocket')

    renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws',
        token: 'jwt-token',
        enabled: true,
      })
    )

    await waitFor(() => {
      expect(clientInstances).toHaveLength(1)
    })

    const registeredTypes = registerSpy.mock.calls.map((args) => args[0])
    expect(registeredTypes).toEqual(
      expect.arrayContaining([
        'SESSION:CREATED',
        'SESSION:STATE_CHANGED',
        'SESSION:ENDED',
        'CHAT:MESSAGE_SENT',
        'CHAT:TYPING_STARTED',
        'NOTES:CREATED',
        'ROOM:SESSION_TRANSITION_APPLIED',
        'PRESENCE:STATE_CHANGED',
        'AUDIO:EFFECT_APPLIED',
        'AUDIO:DM_OVERRIDE_REMOVED',
        'WS:CONNECTED',
      ])
    )

    registerSpy.mockRestore()
  })

  it('rejects malformed events with structured diagnostics', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = mockUseStore()
    const { useWebSocket } = await import('../../hooks/useWebSocket')

    renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws',
        token: 'jwt-token',
        enabled: true,
      })
    )

    await waitFor(() => {
      expect(clientInstances).toHaveLength(1)
    })

    const inbound = clientInstances[0].options.onEvent

    act(() => {
      inbound?.({
        id: 'bad',
        type: 'CHAT:MESSAGE_SENT',
        version: 1,
        userRole: 'DM',
        sessionId: '33333333-3333-4333-8333-333333333333',
        roomId: null,
        timestamp: Date.now(),
        payload: {},
      } as any)
    })

    expect(store.handleMessageSent).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
    expect(String(warnSpy.mock.calls[0][0])).toContain('Event validation failed')
    warnSpy.mockRestore()
  })

  it('preserves event ordering for same-session message bursts', async () => {
    const store = mockUseStore()
    const { useWebSocket } = await import('../../hooks/useWebSocket')

    renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws',
        token: 'jwt-token',
        enabled: true,
      })
    )

    await waitFor(() => {
      expect(clientInstances).toHaveLength(1)
    })

    const inbound = clientInstances[0].options.onEvent
    const eventA = makeEvent('CHAT:MESSAGE_SENT')
    const eventB = makeEvent('CHAT:TYPING_STARTED')
    eventA.sessionId = '33333333-3333-4333-8333-333333333333' as any
    eventB.sessionId = '33333333-3333-4333-8333-333333333333' as any

    act(() => {
      inbound?.(eventA)
      inbound?.(eventB)
    })

    expect(store.calls).toEqual(['CHAT:MESSAGE_SENT', 'CHAT:TYPING_STARTED'])
  })
})
