import { beforeEach, describe, expect, it } from 'vitest'
import type { EventEnvelope, UUID } from '@shared'
import { useStore } from '../../state/store'

const USER_ID = '11111111-1111-4111-8111-111111111111' as UUID
const SESSION_ID = '22222222-2222-4222-8222-222222222222' as UUID

function makeConnectedEvent(): EventEnvelope {
  return {
    id: '00000000-0000-4000-8000-000000000000' as any,
    type: 'WS:CONNECTED',
    version: 1,
    userId: USER_ID as any,
    userRole: 'PLAYER' as any,
    sessionId: SESSION_ID as any,
    roomId: null,
    timestamp: 1700000000000,
    payload: {
      userId: USER_ID,
      username: 'alice',
      userRole: 'PLAYER',
      connectionId: 'conn-1',
    },
  }
}

describe('metadataSlice', () => {
  beforeEach(() => {
    useStore.getState().reset()
  })

  it('setCurrentUser sets currentUser', () => {
    useStore.getState().setCurrentUser({ id: USER_ID, username: 'alice', role: 'PLAYER' as any })
    expect(useStore.getState().currentUser).toEqual({
      id: USER_ID,
      username: 'alice',
      role: 'PLAYER',
    })
  })

  it('setIsAuthenticated toggles auth state', () => {
    useStore.getState().setIsAuthenticated(true)
    expect(useStore.getState().isAuthenticated).toBe(true)
    useStore.getState().setIsAuthenticated(false)
    expect(useStore.getState().isAuthenticated).toBe(false)
  })

  it('setIsLoading toggles loading state', () => {
    useStore.getState().setIsLoading(true)
    expect(useStore.getState().isLoading).toBe(true)
    useStore.getState().setIsLoading(false)
    expect(useStore.getState().isLoading).toBe(false)
  })

  it('setError sets and clears error', () => {
    useStore.getState().setError('boom')
    expect(useStore.getState().error).toBe('boom')
    useStore.getState().setError(undefined)
    expect(useStore.getState().error).toBeUndefined()
  })

  it('clearMetadata resets metadata state', () => {
    useStore.getState().setCurrentUser({ id: USER_ID, username: 'alice', role: 'PLAYER' as any })
    useStore.getState().setIsAuthenticated(true)
    useStore.getState().setIsLoading(true)
    useStore.getState().setError('oops')

    useStore.getState().clearMetadata()

    expect(useStore.getState().currentUser).toBeNull()
    expect(useStore.getState().isAuthenticated).toBe(false)
    expect(useStore.getState().isLoading).toBe(false)
    expect(useStore.getState().error).toBeUndefined()
  })

  it('handleConnectionEstablished sets currentUser and authenticated', () => {
    useStore.getState().setError('stale')
    useStore.getState().handleConnectionEstablished(makeConnectedEvent())

    expect(useStore.getState().currentUser).toEqual({
      id: USER_ID,
      username: 'alice',
      role: 'PLAYER',
    })
    expect(useStore.getState().isAuthenticated).toBe(true)
    expect(useStore.getState().error).toBeUndefined()
  })
})
