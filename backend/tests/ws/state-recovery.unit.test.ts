import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { EventEnvelope, UUID } from '@shared'

vi.mock('@/infra/redis', () => ({
  getRedisClient: vi.fn(async () => ({
    del: vi.fn(async () => 1),
  })),
}))

import {
  clearSessionRecoveryState,
  createConnectionState,
  handleReconnect,
  registerEventForRecovery,
  updateConnectionState,
} from '@/ws/state-recovery'

const SESSION_ID = '33333333-3333-4333-8333-333333333333' as UUID
const SESSION_ID_2 = '44444444-4444-4444-8444-444444444444' as UUID
const USER_ID = '22222222-2222-4222-8222-222222222222' as UUID

function makeEvent(id: string, sessionId: UUID = SESSION_ID): EventEnvelope {
  return {
    id: id as UUID,
    type: 'CHAT:MESSAGE_SENT',
    version: 1,
    userId: USER_ID,
    userRole: 'DM' as any,
    sessionId,
    roomId: null,
    timestamp: Date.now(),
    payload: { message: id },
  }
}

describe('state recovery', () => {
  beforeEach(() => {
    clearSessionRecoveryState(SESSION_ID)
    clearSessionRecoveryState(SESSION_ID_2)
  })

  it('creates a connection state with defaults', () => {
    const state = createConnectionState(USER_ID, SESSION_ID, 'conn-1')

    expect(state.userId).toBe(USER_ID)
    expect(state.sessionId).toBe(SESSION_ID)
    expect(state.connectionId).toBe('conn-1')
    expect(state.isReconnecting).toBe(false)
    expect(typeof state.connectedAt).toBe('number')
    expect(state.lastEventId).toBeUndefined()
  })

  it('updates last seen event id for a connection', () => {
    const state = createConnectionState(USER_ID, SESSION_ID, 'conn-2')

    updateConnectionState(state, 'event-42')

    expect(state.lastEventId).toBe('event-42')
  })

  it('replays only events after lastEventId on reconnect and clears reconnect flag', () => {
    registerEventForRecovery(SESSION_ID, makeEvent('event-1'))
    registerEventForRecovery(SESSION_ID, makeEvent('event-2'))
    registerEventForRecovery(SESSION_ID, makeEvent('event-3'))

    const state = createConnectionState(USER_ID, SESSION_ID, 'conn-3')
    state.isReconnecting = true
    updateConnectionState(state, 'event-1')

    const replay = handleReconnect(state, [])

    expect(replay.map((e) => e.id)).toEqual(['event-2', 'event-3'])
    expect(state.isReconnecting).toBe(false)
  })

  it('falls back to full replay when lastEventId is unknown', () => {
    registerEventForRecovery(SESSION_ID, makeEvent('event-a'))
    registerEventForRecovery(SESSION_ID, makeEvent('event-b'))

    const state = createConnectionState(USER_ID, SESSION_ID, 'conn-4')
    state.isReconnecting = true
    updateConnectionState(state, 'missing-event')

    const replay = handleReconnect(state, [])

    expect(replay.map((e) => e.id)).toEqual(['event-a', 'event-b'])
    expect(state.isReconnecting).toBe(false)
  })

  it('clears session recovery log when requested', () => {
    registerEventForRecovery(SESSION_ID, makeEvent('event-z'))

    clearSessionRecoveryState(SESSION_ID)

    const state = createConnectionState(USER_ID, SESSION_ID, 'conn-5')
    const replay = handleReconnect(state, [])

    expect(replay).toEqual([])
  })

  it('keeps only the latest 1000 events per session (FIFO truncation)', () => {
    for (let i = 1; i <= 1005; i += 1) {
      registerEventForRecovery(SESSION_ID, makeEvent(`event-${i}`))
    }

    const state = createConnectionState(USER_ID, SESSION_ID, 'conn-fifo')
    const replay = handleReconnect(state, [])

    expect(replay).toHaveLength(1000)
    expect(replay[0].id).toBe('event-6')
    expect(replay[999].id).toBe('event-1005')
  })

  it('isolates recovery logs by session id', () => {
    registerEventForRecovery(SESSION_ID, makeEvent('event-s1'))
    registerEventForRecovery(SESSION_ID_2, makeEvent('event-s2', SESSION_ID_2))

    const state1 = createConnectionState(USER_ID, SESSION_ID, 'conn-s1')
    const state2 = createConnectionState(USER_ID, SESSION_ID_2, 'conn-s2')

    const replay1 = handleReconnect(state1, [])
    const replay2 = handleReconnect(state2, [])

    expect(replay1.map((e) => e.id)).toEqual(['event-s1'])
    expect(replay2.map((e) => e.id)).toEqual(['event-s2'])
  })
})
