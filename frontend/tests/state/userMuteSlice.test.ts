import { beforeEach, describe, it, expect } from 'vitest'
import type { UUID } from '@shared'
import { useStore } from '@/state/store'

const TEST_SESSION_ID = '123e4567-e89b-12d3-a456-426614174000' as UUID
const TEST_USER_ID1 = '223e4567-e89b-12d3-a456-426614174000' as UUID
const TEST_USER_ID2 = '323e4567-e89b-12d3-a456-426614174000' as UUID

describe('userMuteSlice', () => {
  beforeEach(() => {
    // Reset state between tests
    useStore.setState({ userMuteState: {} })
  })

  it('setUserMute adds mute state for a user in a session', () => {
    const store = useStore.getState()

    store.setUserMute(TEST_SESSION_ID, TEST_USER_ID1, true)

    expect(useStore.getState().userMuteState[TEST_SESSION_ID]?.[TEST_USER_ID1]).toBe(true)
  })

  it('setUserMute can set multiple users in same session', () => {
    const store = useStore.getState()

    store.setUserMute(TEST_SESSION_ID, TEST_USER_ID1, true)
    store.setUserMute(TEST_SESSION_ID, TEST_USER_ID2, false)

    expect(useStore.getState().userMuteState[TEST_SESSION_ID]?.[TEST_USER_ID1]).toBe(true)
    expect(useStore.getState().userMuteState[TEST_SESSION_ID]?.[TEST_USER_ID2]).toBe(false)
  })

  it('setUserMuteBySession replaces entire session mute map', () => {
    const store = useStore.getState()

    const muteMap: Record<UUID, boolean> = {
      [TEST_USER_ID1]: true,
      [TEST_USER_ID2]: false,
    }

    store.setUserMuteBySession(TEST_SESSION_ID, muteMap)

    expect(useStore.getState().userMuteState[TEST_SESSION_ID]).toEqual(muteMap)
  })

  it('clearUserMuteState clears specific session', () => {
    const store = useStore.getState()

    // Set up initial state
    store.setUserMute(TEST_SESSION_ID, TEST_USER_ID1, true)
    const anotherSessionId = '423e4567-e89b-12d3-a456-426614174000' as UUID
    store.setUserMute(anotherSessionId, TEST_USER_ID2, false)

    store.clearUserMuteState(TEST_SESSION_ID)

    expect(useStore.getState().userMuteState[TEST_SESSION_ID]).toBeUndefined()
    expect(useStore.getState().userMuteState[anotherSessionId]).toBeDefined()
  })

  it('clearUserMuteState clears all sessions when no sessionId provided', () => {
    const store = useStore.getState()

    // Set up initial state
    store.setUserMute(TEST_SESSION_ID, TEST_USER_ID1, true)
    const anotherSessionId = '423e4567-e89b-12d3-a456-426614174000' as UUID
    store.setUserMute(anotherSessionId, TEST_USER_ID2, false)

    store.clearUserMuteState()

    expect(useStore.getState().userMuteState).toEqual({})
  })

  it('handleUserMuted sets user as muted via WS event', () => {
    const store = useStore.getState()

    const event = {
      id: '523e4567-e89b-12d3-a456-426614174000' as UUID,
      type: 'AUDIO:USER_MUTED' as const,
      version: 1,
      userId: TEST_USER_ID1,
      userRole: 'PLAYER' as const,
      sessionId: TEST_SESSION_ID,
      roomId: null,
      timestamp: Date.now(),
      payload: {
        userId: TEST_USER_ID1,
        userMuted: true,
        mutedAt: Date.now(),
      },
    }

    store.handleUserMuted(event as any)

    expect(useStore.getState().userMuteState[TEST_SESSION_ID]?.[TEST_USER_ID1]).toBe(true)
  })

  it('handleUserUnmuted sets user as unmuted via WS event', () => {
    const store = useStore.getState()

    // Set up initial state with user muted
    store.setUserMute(TEST_SESSION_ID, TEST_USER_ID1, true)

    const event = {
      id: '523e4567-e89b-12d3-a456-426614174000' as UUID,
      type: 'AUDIO:USER_UNMUTED' as const,
      version: 1,
      userId: TEST_USER_ID1,
      userRole: 'PLAYER' as const,
      sessionId: TEST_SESSION_ID,
      roomId: null,
      timestamp: Date.now(),
      payload: {
        userId: TEST_USER_ID1,
        userMuted: false,
        mutedAt: Date.now(),
      },
    }

    store.handleUserUnmuted(event as any)

    expect(useStore.getState().userMuteState[TEST_SESSION_ID]?.[TEST_USER_ID1]).toBe(false)
  })
})
