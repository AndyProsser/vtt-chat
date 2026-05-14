import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { loggerMock, mockUseStore, MockRoom, roomInstances } = vi.hoisted(() => {
  type RoomHandler = (...args: unknown[]) => void

  function createDeferred() {
    let resolve!: () => void
    const promise = new Promise<void>((res) => {
      resolve = res
    })
    return { promise, resolve }
  }

  class HoistedMockRoom {
    handlers = new Map<string, RoomHandler[]>()
    connectDeferred = createDeferred()
    disconnect = vi.fn(async () => {
      this.emit('Disconnected')
    })
    connect = vi.fn(async () => {
      await this.connectDeferred.promise
      this.emit('Connected')
    })
    localParticipant = {
      publishTrack: vi.fn(),
      unpublishTrack: vi.fn(),
    }

    constructor() {
      roomInstances.push(this)
    }

    on(event: string, handler: RoomHandler) {
      const handlers = this.handlers.get(event) ?? []
      handlers.push(handler)
      this.handlers.set(event, handlers)
    }

    emit(event: string, ...args: unknown[]) {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(...args)
      }
    }
  }

  return {
    loggerMock: {
      info: vi.fn(),
      error: vi.fn(),
    },
    mockUseStore: vi.fn(),
    MockRoom: HoistedMockRoom,
    roomInstances: [] as HoistedMockRoom[],
  }
})

vi.mock('../../src/hooks/useStore', () => ({
  useStore: (
    selector: (state: {
      currentUser: { id: string; username: string; role: string }
      upsertLiveKitConnection: ReturnType<typeof vi.fn>
      clearLiveKitConnection: ReturnType<typeof vi.fn>
    }) => unknown
  ) => mockUseStore(selector),
}))

vi.mock('../../src/utils/logger', () => ({
  logger: loggerMock,
}))

vi.mock('livekit-client', () => ({
  AudioPresets: {
    music: {
      maxBitrate: 96000,
    },
  },
  ConnectionState: {
    Disconnected: 'disconnected',
    Connecting: 'connecting',
    Connected: 'connected',
    Reconnecting: 'reconnecting',
  },
  RoomEvent: {
    Connected: 'Connected',
    Disconnected: 'Disconnected',
    ParticipantConnected: 'ParticipantConnected',
    ParticipantDisconnected: 'ParticipantDisconnected',
    TrackSubscribed: 'TrackSubscribed',
    TrackUnsubscribed: 'TrackUnsubscribed',
  },
  Room: MockRoom,
  LocalAudioTrack: class {},
  LocalVideoTrack: class {},
}))

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useLiveKit', () => {
  beforeEach(() => {
    const currentUser = { id: 'user-1', username: 'andy', role: 'DM' }
    const upsertLiveKitConnection = vi.fn()
    const clearLiveKitConnection = vi.fn()

    roomInstances.length = 0
    mockUseStore.mockImplementation((selector) =>
      selector({ currentUser, upsertLiveKitConnection, clearLiveKitConnection })
    )
    loggerMock.info.mockReset()
    loggerMock.error.mockReset()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'token-1', url: 'wss://livekit.test' }),
      })
    )
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'auth-token'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    })
  })

  it('ignores a completed connect after disconnect is requested', async () => {
    const { useLiveKit } = await import('../../src/hooks/useLiveKit')

    const { result } = renderHook(() => useLiveKit('session-1', 'room-1'))

    await waitFor(() => {
      expect(roomInstances).toHaveLength(1)
    })

    const room = roomInstances[0]

    await act(async () => {
      await result.current.disconnect()
    })

    await act(async () => {
      room.connectDeferred.resolve()
      await room.connect.mock.results[0]?.value
    })

    expect(result.current.isConnected).toBe(false)
    expect(result.current.isConnecting).toBe(false)
    expect(result.current.room).toBeNull()
    expect(room.disconnect).toHaveBeenCalled()
  })

  it('keeps the latest room when an earlier connect resolves late', async () => {
    const { useLiveKit } = await import('../../src/hooks/useLiveKit')

    const { result, rerender } = renderHook(
      ({ sessionId, roomId }) => useLiveKit(sessionId, roomId),
      {
        initialProps: { sessionId: 'session-1', roomId: 'room-1' },
      }
    )

    await waitFor(() => {
      expect(roomInstances).toHaveLength(1)
    })

    const firstRoom = roomInstances[0]

    rerender({ sessionId: 'session-1', roomId: 'room-2' })

    await waitFor(() => {
      expect(roomInstances).toHaveLength(2)
    })

    const secondRoom = roomInstances[1]

    await act(async () => {
      firstRoom.connectDeferred.resolve()
      await firstRoom.connect.mock.results[0]?.value
    })

    expect(result.current.isConnected).toBe(false)

    await act(async () => {
      secondRoom.connectDeferred.resolve()
      await secondRoom.connect.mock.results[0]?.value
    })

    await waitFor(() => {
      expect(secondRoom.connect).toHaveBeenCalledTimes(1)
      expect(result.current.error).toBeNull()
    })

    await flushMicrotasks()
  })
})
