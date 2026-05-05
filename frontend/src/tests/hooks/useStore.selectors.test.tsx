import { act, renderHook, waitFor } from '@testing-library/react'
import { ConnectionState } from 'livekit-client'
import type { UUID } from '@shared'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Session } from '@/types/session'
import { useStore as useRootStore } from '../../state/store'
import { useStore } from '../../hooks/useStore'

const SESSION_ID_1 = '11111111-1111-4111-8111-111111111111' as UUID
const SESSION_ID_2 = '22222222-2222-4222-8222-222222222222' as UUID
const ROOM_ID_1 = '33333333-3333-4333-8333-333333333333' as UUID
const ROOM_ID_2 = '44444444-4444-4444-8444-444444444444' as UUID
const DM_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' as UUID

const SESSION_1: Session = {
  id: SESSION_ID_1,
  name: 'Alpha Table',
  dmId: DM_ID,
  state: 'ACTIVE' as Session['state'],
  createdAt: 1700000000000,
}

describe('useStore selectors', () => {
  beforeEach(() => {
    const store = useRootStore.getState()
    store.replaceSessions([])
    store.setCurrentSession(null)
    store.setBroadcastState({
      enabled: false,
      broadcastRoomId: undefined,
      dmId: undefined,
      changedAt: undefined,
    })
    store.clearLiveKitConnectionsForSession()
  })

  it('re-exports the root Zustand store hook', () => {
    expect(useStore).toBe(useRootStore)
  })

  it('updates session and broadcast selectors from the shared root store', async () => {
    const { result } = renderHook(() => ({
      currentSessionId: useStore((state) => state.currentSessionId),
      activeSessionName: useStore((state) =>
        state.currentSessionId ? (state.sessions[state.currentSessionId]?.name ?? null) : null
      ),
      broadcastModeEnabled: useStore((state) => state.broadcastModeEnabled),
      broadcastRoomId: useStore((state) => state.broadcastRoomId ?? null),
    }))

    expect(result.current).toEqual({
      currentSessionId: null,
      activeSessionName: null,
      broadcastModeEnabled: false,
      broadcastRoomId: null,
    })

    act(() => {
      const store = useRootStore.getState()
      store.createSession(SESSION_1)
      store.setCurrentSession(SESSION_ID_1)
      store.setBroadcastState({
        enabled: true,
        broadcastRoomId: ROOM_ID_1,
        dmId: DM_ID,
        changedAt: 1700000001000,
      })
    })

    await waitFor(() => {
      expect(result.current).toEqual({
        currentSessionId: SESSION_ID_1,
        activeSessionName: 'Alpha Table',
        broadcastModeEnabled: true,
        broadcastRoomId: ROOM_ID_1,
      })
    })
  })

  it('tracks livekit snapshots and filters them by session cleanup', async () => {
    const { result } = renderHook(() => useStore((state) => state.livekitConnections))

    act(() => {
      const store = useRootStore.getState()
      store.upsertLiveKitConnection('room-primary', {
        sessionId: SESSION_ID_1,
        roomId: ROOM_ID_1,
        channel: 'room',
        connectionState: ConnectionState.Connected,
        isConnected: true,
        isConnecting: false,
        error: null,
      })
      store.upsertLiveKitConnection('broadcast-secondary', {
        sessionId: SESSION_ID_2,
        roomId: ROOM_ID_2,
        channel: 'broadcast',
        connectionState: ConnectionState.Connecting,
        isConnected: false,
        isConnecting: true,
        error: 'pending',
      })
    })

    await waitFor(() => {
      expect(
        Object.values(result.current)
          .filter((entry) => entry.sessionId === SESSION_ID_1)
          .map((entry) => entry.key)
      ).toEqual(['room-primary'])
      expect(
        Object.values(result.current)
          .filter((entry) => entry.sessionId === SESSION_ID_2)
          .map((entry) => entry.key)
      ).toEqual(['broadcast-secondary'])
    })

    act(() => {
      useRootStore.getState().clearLiveKitConnectionsForSession(SESSION_ID_1)
    })

    await waitFor(() => {
      expect(
        Object.values(result.current)
          .filter((entry) => entry.sessionId === SESSION_ID_1)
          .map((entry) => entry.key)
      ).toEqual([])
      expect(
        Object.values(result.current)
          .filter((entry) => entry.sessionId === SESSION_ID_2)
          .map((entry) => entry.key)
      ).toEqual(['broadcast-secondary'])
    })
  })
})
