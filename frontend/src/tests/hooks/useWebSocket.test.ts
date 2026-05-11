import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEnvelope } from '@shared'

const { mockUseStore, MockWebSocketClient, clientInstances } = vi.hoisted(() => {
  type State = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
  type ClientOptions = {
    url: string
    token: string
    onStateChange?: (state: State) => void
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

describe('useWebSocket', () => {
  beforeEach(() => {
    clientInstances.length = 0

    const calls: string[] = []
    mockUseStore.mockReturnValue({
      calls,
      handleSessionCreated: vi.fn(),
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
      deleteRoom: vi.fn(),
      handleUserJoined: vi.fn(),
      handleUserLeft: vi.fn(),
      handleSessionRoomTransitionApplied: vi.fn(),
      roomEnvironmentNames: {},
      clearRoomEnvironmentName: vi.fn(),
      currentEnvironment: undefined,
      clearEnvironment: vi.fn(),
      handlePresenceStateChanged: vi.fn(),
      handleEffectApplied: vi.fn(),
      handleEffectRemoved: vi.fn(),
      handlePresetLoaded: vi.fn(),
      handleEnvironmentSet: vi.fn(),
      handleDMOverrideApplied: vi.fn(),
      handleDMOverrideRemoved: vi.fn(),
      handleBroadcastStateChanged: vi.fn(),
      handleConnectionEstablished: vi.fn(),
    })
  })

  it('opens a socket once per authenticated session context', async () => {
    const { useWebSocket } = await import('../../hooks/useWebSocket')

    const { rerender } = renderHook(
      ({ token, enabled }) =>
        useWebSocket({
          url: 'ws://localhost:3000/ws',
          token,
          enabled,
        }),
      { initialProps: { token: 'jwt-token', enabled: true } }
    )

    await waitFor(() => {
      expect(clientInstances).toHaveLength(1)
      expect(clientInstances[0].connect).toHaveBeenCalledTimes(1)
    })

    rerender({ token: 'jwt-token', enabled: true })
    expect(clientInstances).toHaveLength(1)
    expect(clientInstances[0].connect).toHaveBeenCalledTimes(1)
  })

  it('routes inbound events to registered handlers in order', async () => {
    const { useWebSocket } = await import('../../hooks/useWebSocket')
    const store = mockUseStore()

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
    expect(inbound).toBeTypeOf('function')

    act(() => {
      inbound?.(makeEvent('CHAT:MESSAGE_SENT'))
      inbound?.(makeEvent('CHAT:TYPING_STARTED'))
    })

    expect(store.handleMessageSent).toHaveBeenCalledTimes(1)
    expect(store.handleTypingStarted).toHaveBeenCalledTimes(1)
    expect(store.calls).toEqual(['CHAT:MESSAGE_SENT', 'CHAT:TYPING_STARTED'])
  })

  it('handles reconnect transitions and continues dispatching events after reconnect', async () => {
    const { useWebSocket } = await import('../../hooks/useWebSocket')
    const store = mockUseStore()

    const { result } = renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws',
        token: 'jwt-token',
        enabled: true,
      })
    )

    await waitFor(() => {
      expect(clientInstances).toHaveLength(1)
      expect(result.current.state).toBe('connected')
    })

    const onStateChange = clientInstances[0].options.onStateChange
    const inbound = clientInstances[0].options.onEvent

    act(() => {
      onStateChange?.('reconnecting')
    })
    expect(result.current.state).toBe('reconnecting')
    expect(result.current.isConnected).toBe(false)

    act(() => {
      onStateChange?.('connected')
      inbound?.(makeEvent('AUDIO:PRESET_LOADED'))
    })

    expect(result.current.state).toBe('connected')
    expect(result.current.isConnected).toBe(true)
    expect(store.handlePresetLoaded).toHaveBeenCalledTimes(1)
  })

  it('removes deleted rooms and clears deleted room environment mappings', async () => {
    const { useWebSocket } = await import('../../hooks/useWebSocket')
    const store = mockUseStore()

    store.roomEnvironmentNames = {
      ['44444444-4444-4444-8444-444444444444']: 'Forest',
    }
    store.currentEnvironment = {
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Forest',
      reverbSend: 0.2,
      lowpassFreq: 4000,
      roomGain: 0,
    }

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
        ...makeEvent('ROOM:DELETED'),
        payload: {
          roomId: '44444444-4444-4444-8444-444444444444',
        },
      })
    })

    expect(store.deleteRoom).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444'
    )
    expect(store.clearRoomEnvironmentName).toHaveBeenCalledWith(
      '44444444-4444-4444-8444-444444444444'
    )
    expect(store.clearEnvironment).toHaveBeenCalledTimes(1)
  })

  it('routes ROOM:USER_LEFT and ROOM:USER_JOINED before ROOM:DELETED reconciliation', async () => {
    const { useWebSocket } = await import('../../hooks/useWebSocket')
    const store = mockUseStore()

    const eventOrder: string[] = []
    store.handleUserLeft.mockImplementation(() => eventOrder.push('ROOM:USER_LEFT'))
    store.handleUserJoined.mockImplementation(() => eventOrder.push('ROOM:USER_JOINED'))
    store.deleteRoom.mockImplementation(() => eventOrder.push('ROOM:DELETED'))

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
        ...makeEvent('ROOM:USER_LEFT'),
        payload: {
          roomId: '77777777-7777-4777-8777-777777777777',
          userId: '88888888-8888-4888-8888-888888888888',
        },
      })
      inbound?.({
        ...makeEvent('ROOM:USER_JOINED'),
        payload: {
          roomId: '99999999-9999-4999-8999-999999999999',
          userId: '88888888-8888-4888-8888-888888888888',
          username: 'alice',
        },
      })
      inbound?.({
        ...makeEvent('ROOM:DELETED'),
        payload: {
          roomId: '77777777-7777-4777-8777-777777777777',
        },
      })
    })

    expect(eventOrder).toEqual(['ROOM:USER_LEFT', 'ROOM:USER_JOINED', 'ROOM:DELETED'])
  })
})
