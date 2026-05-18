import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEnvelope } from '@shared'

const { mockUseStore, MockWebSocketClient, clientInstances } = vi.hoisted(() => {
  type State = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
  type ClientOptions = {
    url: string
    token: string
    sessionId?: string | null
    onStateChange?: (state: State) => void
    onError?: (error: Error) => void
    onAuthFailure?: (reason: string) => void
    onEvent?: (event: EventEnvelope) => void
  }

  class HoistedMockWebSocketClient {
    options: ClientOptions
    connectImpl?: () => Promise<void>
    connect = vi.fn(async () => {
      if (this.connectImpl) {
        return this.connectImpl()
      }
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

vi.mock('../../src/hooks/useStore', () => ({
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

vi.mock('../../src/ws/client', () => ({
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
      handleSessionCooldownStarted: vi.fn(),
      handleSessionCooldownExtended: vi.fn(),
      handleSessionCooldownEnded: vi.fn(),
      handleSessionEnded: vi.fn(),
      handleSessionStatsUpdated: vi.fn(),
      applySessionPresenceDeviceSessions: vi.fn(),
      handleMessageSent: vi.fn(() => calls.push('CHAT:MESSAGE_SENT')),
      handleMessageEdited: vi.fn(),
      handleMessageDeleted: vi.fn(),
      handleGreenroomMessageSent: vi.fn(),
      handleGreenroomMessageEdited: vi.fn(),
      handleGreenroomMessageDeleted: vi.fn(),
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
      resetSessionAudioState: vi.fn(),
      clearActiveEffects: vi.fn(),
      roomEnvironmentNames: {},
      rooms: {},
      clearRoomEnvironmentName: vi.fn(),
      currentEnvironment: undefined,
      clearEnvironment: vi.fn(),
      handlePresenceStateChanged: vi.fn(),
      handlePresenceGhostModeChanged: vi.fn(),
      handlePresenceProfileUpdated: vi.fn(),
      handleDmVoiceModeChanged: vi.fn(),
      handleEffectApplied: vi.fn(),
      handleEffectRemoved: vi.fn(),
      handlePresetLoaded: vi.fn(),
      handleEnvironmentSet: vi.fn(),
      handleDMOverrideApplied: vi.fn(),
      handleDMOverrideRemoved: vi.fn(),
      handleBroadcastStateChanged: vi.fn(),
      handleUserMuted: vi.fn(),
      handleUserUnmuted: vi.fn(),
      handleConnectionEstablished: vi.fn(),
    })
  })

  it('does not create a client when disabled or token is missing', async () => {
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')

    renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws',
        token: '',
        enabled: true,
      })
    )

    renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws',
        token: 'jwt-token',
        enabled: false,
      })
    )

    expect(clientInstances).toHaveLength(0)
  })

  it('send is a no-op when no client has been created', async () => {
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')

    const { result } = renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws',
        token: '',
        enabled: true,
      })
    )

    act(() => {
      result.current.send(makeEvent('CHAT:MESSAGE_SENT'))
    })

    expect(clientInstances).toHaveLength(0)
  })

  it('retryConnection is a no-op when no client exists', async () => {
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')

    const { result } = renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws',
        token: '',
        enabled: true,
      })
    )

    await act(async () => {
      await result.current.retryConnection()
    })

    expect(clientInstances).toHaveLength(0)
    expect(result.current.error).toBeNull()
  })

  it('opens a socket once per authenticated session context', async () => {
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')

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

  it('rebinds the websocket client when sessionId changes', async () => {
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')

    const { rerender } = renderHook(
      ({ sessionId }) =>
        useWebSocket({
          url: 'ws://localhost:3000/ws',
          token: 'jwt-token',
          enabled: true,
          sessionId,
        }),
      {
        initialProps: {
          sessionId: '33333333-3333-4333-8333-333333333333' as any,
        },
      }
    )

    await waitFor(() => {
      expect(clientInstances).toHaveLength(1)
    })

    const firstClient = clientInstances[0]
    rerender({ sessionId: '44444444-4444-4444-8444-444444444444' as any })

    await waitFor(() => {
      expect(clientInstances).toHaveLength(2)
    })
    expect(firstClient.disconnect).toHaveBeenCalledTimes(1)
    expect(clientInstances[1].options.sessionId).toBe('44444444-4444-4444-8444-444444444444')
  })

  it('disconnects the client on unmount', async () => {
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')

    const { unmount } = renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws',
        token: 'jwt-token',
        enabled: true,
      })
    )

    await waitFor(() => {
      expect(clientInstances).toHaveLength(1)
    })

    unmount()
    expect(clientInstances[0].disconnect).toHaveBeenCalledTimes(1)
  })

  it('cancels the deferred connect when unmounted before the timer fires', async () => {
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')

    const { unmount } = renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws',
        token: 'jwt-token',
        enabled: true,
      })
    )

    expect(clientInstances).toHaveLength(1)
    unmount()

    await act(async () => {
      await Promise.resolve()
    })

    expect(clientInstances[0].connect).not.toHaveBeenCalled()
  })

  it('captures initial connect failure from the deferred connect effect', async () => {
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws',
        token: 'jwt-token',
        enabled: true,
      })
    )

    expect(clientInstances).toHaveLength(1)
    clientInstances[0].connectImpl = async () => {
      throw new Error('initial connect failed')
    }

    await waitFor(() => {
      expect(result.current.error?.message).toBe('initial connect failed')
    })
    expect(errorSpy).toHaveBeenCalled()
  })

  it('routes inbound events to registered handlers in order', async () => {
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')
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

  it('captures client errors and clears them again on reconnect state changes', async () => {
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')

    const { result } = renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws',
        token: 'jwt-token',
        enabled: true,
      })
    )

    await waitFor(() => {
      expect(clientInstances).toHaveLength(1)
    })

    const onError = clientInstances[0].options.onError
    const onStateChange = clientInstances[0].options.onStateChange

    act(() => {
      onError?.(new Error('socket broke'))
    })
    expect(result.current.error?.message).toBe('socket broke')

    act(() => {
      onStateChange?.('reconnecting')
    })
    expect(result.current.error).toBeNull()
  })

  it('retryConnection disconnects then reconnects and clears an existing error', async () => {
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')

    const { result } = renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws',
        token: 'jwt-token',
        enabled: true,
      })
    )

    await waitFor(() => {
      expect(clientInstances).toHaveLength(1)
    })

    const onError = clientInstances[0].options.onError
    act(() => {
      onError?.(new Error('needs retry'))
    })

    await act(async () => {
      await result.current.retryConnection()
    })

    expect(clientInstances[0].disconnect).toHaveBeenCalled()
    expect(clientInstances[0].connect).toHaveBeenCalledTimes(2)
    expect(result.current.error).toBeNull()
  })

  it('stores the retry error when reconnect fails', async () => {
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')

    const { result } = renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws',
        token: 'jwt-token',
        enabled: true,
      })
    )

    await waitFor(() => {
      expect(clientInstances).toHaveLength(1)
    })

    clientInstances[0].connect.mockRejectedValueOnce(new Error('retry failed'))

    await act(async () => {
      await result.current.retryConnection()
    })

    expect(result.current.error?.message).toBe('retry failed')
  })

  it('handles reconnect transitions and continues dispatching events after reconnect', async () => {
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')
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
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')
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

  it('does nothing for ROOM:DELETED without a roomId payload', async () => {
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')
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

    act(() => {
      clientInstances[0].options.onEvent?.({
        ...makeEvent('ROOM:DELETED'),
        payload: {},
      })
    })

    expect(store.deleteRoom).not.toHaveBeenCalled()
    expect(store.clearRoomEnvironmentName).not.toHaveBeenCalled()
  })

  it('does not bridge greenroom chat when session rooms or greenroom room are missing', async () => {
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')
    const store = mockUseStore()

    renderHook(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws',
        token: 'jwt-token',
        enabled: true,
        sessionId: '33333333-3333-4333-8333-333333333333' as any,
      })
    )

    await waitFor(() => {
      expect(clientInstances).toHaveLength(1)
    })

    act(() => {
      clientInstances[0].options.onEvent?.({
        ...makeEvent('CHAT:MESSAGE_SENT'),
        sessionId: null as any,
      })
    })
    expect(store.handleMessageSent).not.toHaveBeenCalled()

    store.rooms = {
      ['33333333-3333-4333-8333-333333333333']: {
        ['99999999-9999-4999-8999-999999999999']: {
          id: '99999999-9999-4999-8999-999999999999',
          name: 'Main',
        },
      },
    }

    act(() => {
      clientInstances[0].options.onEvent?.({
        ...makeEvent('CHAT:MESSAGE_SENT'),
        sessionId: null as any,
      })
    })
    expect(store.handleMessageSent).not.toHaveBeenCalled()
  })

  it('applies device session updates only for valid payloads', async () => {
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')
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

    act(() => {
      clientInstances[0].options.onEvent?.({
        ...makeEvent('SESSION:DEVICE_SESSION_CONNECTED'),
        payload: { userId: undefined, deviceSessions: [] },
      })
      clientInstances[0].options.onEvent?.({
        ...makeEvent('SESSION:DEVICE_SESSION_DISCONNECTED'),
        payload: { userId: '22222222-2222-4222-8222-222222222222', deviceSessions: 'bad' },
      })
      clientInstances[0].options.onEvent?.({
        ...makeEvent('SESSION:DEVICE_SESSION_CONNECTED'),
        payload: {
          userId: '22222222-2222-4222-8222-222222222222',
          deviceSessions: [{ id: 'tab-1' }],
        },
      })
    })

    expect(store.applySessionPresenceDeviceSessions).toHaveBeenCalledTimes(1)
  })

  it('resets audio state on SESSION:ENDED and greenroom transitions', async () => {
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')
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

    act(() => {
      clientInstances[0].options.onEvent?.(makeEvent('SESSION:ENDED'))
      clientInstances[0].options.onEvent?.({
        ...makeEvent('ROOM:SESSION_TRANSITION_APPLIED'),
        payload: { nextState: 'IDLE' },
      })
    })

    expect(store.handleSessionEnded).toHaveBeenCalledTimes(1)
    expect(store.handleSessionRoomTransitionApplied).toHaveBeenCalledTimes(1)
    expect(store.resetSessionAudioState).toHaveBeenCalledTimes(2)
    expect(store.clearActiveEffects).toHaveBeenCalledTimes(2)
  })

  it('dispatches presence and audio events to their dedicated handlers', async () => {
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')
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

    act(() => {
      clientInstances[0].options.onEvent?.(makeEvent('PRESENCE:USER_GHOST_MODE_CHANGED'))
      clientInstances[0].options.onEvent?.(makeEvent('PRESENCE:PROFILE_UPDATED'))
      clientInstances[0].options.onEvent?.(makeEvent('AUDIO:DM_VOICE_MODE_CHANGED'))
      clientInstances[0].options.onEvent?.(makeEvent('AUDIO:VOICE_OF_GOD_CHANGED'))
      clientInstances[0].options.onEvent?.(makeEvent('AUDIO:USER_MUTED'))
      clientInstances[0].options.onEvent?.(makeEvent('AUDIO:USER_UNMUTED'))
      clientInstances[0].options.onEvent?.(makeEvent('WS:CONNECTED'))
    })

    expect(store.handlePresenceGhostModeChanged).toHaveBeenCalledTimes(1)
    expect(store.handlePresenceProfileUpdated).toHaveBeenCalledTimes(1)
    expect(store.handleDmVoiceModeChanged).toHaveBeenCalledTimes(1)
    expect(store.handleBroadcastStateChanged).toHaveBeenCalledTimes(1)
    expect(store.handleUserMuted).toHaveBeenCalledTimes(1)
    expect(store.handleUserUnmuted).toHaveBeenCalledTimes(1)
    expect(store.handleConnectionEstablished).toHaveBeenCalledTimes(1)
  })

  it('dispatches remaining room, notes, chat, presence, and audio handler registrations', async () => {
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')
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

    act(() => {
      clientInstances[0].options.onEvent?.(makeEvent('CHAT:ROOM_CONTEXT_CLEARED'))
      clientInstances[0].options.onEvent?.(makeEvent('CHAT:TYPING_STOPPED'))
      clientInstances[0].options.onEvent?.(makeEvent('NOTES:CREATED'))
      clientInstances[0].options.onEvent?.(makeEvent('NOTES:UPDATED'))
      clientInstances[0].options.onEvent?.(makeEvent('NOTES:DELETED'))
      clientInstances[0].options.onEvent?.(makeEvent('ROOM:CREATED'))
      clientInstances[0].options.onEvent?.(makeEvent('PRESENCE:STATE_CHANGED'))
      clientInstances[0].options.onEvent?.(makeEvent('AUDIO:EFFECT_APPLIED'))
      clientInstances[0].options.onEvent?.(makeEvent('AUDIO:EFFECT_REMOVED'))
      clientInstances[0].options.onEvent?.(makeEvent('AUDIO:ENVIRONMENT_SET'))
      clientInstances[0].options.onEvent?.(makeEvent('AUDIO:DM_OVERRIDE_APPLIED'))
      clientInstances[0].options.onEvent?.(makeEvent('AUDIO:DM_OVERRIDE_REMOVED'))
      clientInstances[0].options.onEvent?.(makeEvent('AUDIO:BROADCAST_STATE_CHANGED'))
    })

    expect(store.handleRoomContextCleared).toHaveBeenCalledTimes(1)
    expect(store.handleTypingStopped).toHaveBeenCalledTimes(1)
    expect(store.handleNoteCreated).toHaveBeenCalledTimes(1)
    expect(store.handleNoteUpdated).toHaveBeenCalledTimes(1)
    expect(store.handleNoteDeleted).toHaveBeenCalledTimes(1)
    expect(store.handleRoomCreated).toHaveBeenCalledTimes(1)
    expect(store.handlePresenceStateChanged).toHaveBeenCalledTimes(1)
    expect(store.handleEffectApplied).toHaveBeenCalledTimes(1)
    expect(store.handleEffectRemoved).toHaveBeenCalledTimes(1)
    expect(store.handleEnvironmentSet).toHaveBeenCalledTimes(1)
    expect(store.handleDMOverrideApplied).toHaveBeenCalledTimes(1)
    expect(store.handleDMOverrideRemoved).toHaveBeenCalledTimes(1)
    expect(store.handleBroadcastStateChanged).toHaveBeenCalledTimes(1)
  })

  it('routes ROOM:USER_LEFT and ROOM:USER_JOINED before ROOM:DELETED reconciliation', async () => {
    const { useWebSocket } = await import('../../src/hooks/useWebSocket')
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
