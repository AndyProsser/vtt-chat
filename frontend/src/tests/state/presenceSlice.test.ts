import { beforeEach, describe, expect, it } from 'vitest'
import type { EventEnvelope, UUID } from '@shared'
import { useStore } from '../../state/store'

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as UUID
const USER_ID = '22222222-2222-4222-8222-222222222222' as UUID
const NOW = 1700000000000

function makeEvent(payload: Record<string, unknown>): EventEnvelope {
  return {
    id: '00000000-0000-4000-8000-000000000000' as any,
    type: 'SESSION:STATS_UPDATED',
    version: 1,
    userId: USER_ID as any,
    userRole: 'DM' as any,
    sessionId: SESSION_ID as any,
    roomId: null,
    timestamp: NOW,
    payload,
  }
}

describe('presenceSlice session stats', () => {
  beforeEach(() => {
    useStore.getState().reset()
  })

  it('replaces stats snapshot directly', () => {
    useStore.getState().replaceSessionStatsSnapshot(SESSION_ID, {
      connectedPlayersWithDm: 4,
      connectedPlayers: 3,
      connectedSpectators: 1,
      connectedTotal: 5,
      updatedAt: NOW,
    })

    expect(useStore.getState().sessionStatsBySessionId[SESSION_ID]).toEqual({
      connectedPlayersWithDm: 4,
      connectedPlayers: 3,
      connectedSpectators: 1,
      connectedTotal: 5,
      updatedAt: NOW,
    })
  })

  it('handles SESSION:STATS_UPDATED event payload', () => {
    useStore.getState().handleSessionStatsUpdated(
      makeEvent({
        connectedPlayersWithDm: 6,
        connectedPlayers: 5,
        connectedSpectators: 2,
        connectedTotal: 8,
        updatedAt: NOW + 10,
      })
    )

    expect(useStore.getState().sessionStatsBySessionId[SESSION_ID]).toEqual({
      connectedPlayersWithDm: 6,
      connectedPlayers: 5,
      connectedSpectators: 2,
      connectedTotal: 8,
      updatedAt: NOW + 10,
    })
  })

  it('clears stats map when clearing session presence', () => {
    useStore.getState().replaceSessionStatsSnapshot(SESSION_ID, {
      connectedPlayersWithDm: 2,
      connectedPlayers: 1,
      connectedSpectators: 0,
      connectedTotal: 2,
      updatedAt: NOW,
    })

    useStore.getState().clearSessionPresence(SESSION_ID)

    expect(useStore.getState().sessionStatsBySessionId[SESSION_ID]).toBeUndefined()
  })
})
