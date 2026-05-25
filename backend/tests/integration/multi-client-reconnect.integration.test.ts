/**
 * W1: Multi-Client Reconnect Soak
 *
 * Tests that the state-recovery layer correctly handles concurrent reconnections
 * from multiple clients in the same session, including:
 *  - Each client receiving only events after its own lastEventId
 *  - Full-replay fallback when lastEventId is unknown (simulated packet loss)
 *  - Strict session isolation: no event cross-contamination across sessions
 *  - Concurrent reconnect fanout: all clients recovering simultaneously return
 *    correct, independent replay slices
 *  - FIFO cap (1000 events/session) is respected under high-volume scenarios
 *
 * Pass criteria:
 *  - All concurrent reconnect assertions must resolve without data races
 *  - Zero events from session B appear in session A replays
 *  - Each client's replay slice is exactly the events after its lastEventId
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
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

const SESSION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID
const SESSION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as UUID

function makeEvent(id: string, sessionId: UUID, seq?: number): EventEnvelope {
  return {
    id: id as UUID,
    type: 'CHAT:MESSAGE_SENT',
    version: 1,
    userId: 'user-0000-0000-0000-000000000000' as UUID,
    userRole: 'PLAYER' as any,
    sessionId,
    roomId: null,
    timestamp: Date.now() + (seq ?? 0),
    payload: { seq },
  }
}

function seedEvents(sessionId: UUID, count: number, prefix = 'evt'): string[] {
  const ids: string[] = []
  for (let i = 1; i <= count; i += 1) {
    const id = `${prefix}-${String(i).padStart(4, '0')}`
    registerEventForRecovery(sessionId, makeEvent(id, sessionId, i))
    ids.push(id)
  }
  return ids
}

describe('multi-client reconnect soak', () => {
  beforeEach(() => {
    clearSessionRecoveryState(SESSION_A)
    clearSessionRecoveryState(SESSION_B)
  })

  // ----- Basic multi-client concurrent reconnect -----

  it('all clients in the same session reconnect concurrently and get correct replay slices', async () => {
    // Seed 20 events into session A
    const eventIds = seedEvents(SESSION_A, 20)

    // Client 1 saw events 1-5, disconnected after event-0005
    const c1 = createConnectionState('u1' as UUID, SESSION_A, 'conn-1')
    updateConnectionState(c1, eventIds[4]) // last seen: event-0005

    // Client 2 saw events 1-10, disconnected after event-0010
    const c2 = createConnectionState('u2' as UUID, SESSION_A, 'conn-2')
    updateConnectionState(c2, eventIds[9]) // last seen: event-0010

    // Client 3 saw nothing (brand new connection or full-loss scenario)
    const c3 = createConnectionState('u3' as UUID, SESSION_A, 'conn-3')
    // lastEventId intentionally left undefined

    // Client 4 has stale/unknown lastEventId (packet loss, event evicted)
    const c4 = createConnectionState('u4' as UUID, SESSION_A, 'conn-4')
    updateConnectionState(c4, 'unknown-event-id-lost-in-transit')

    // All reconnect concurrently
    c1.isReconnecting = true
    c2.isReconnecting = true
    c3.isReconnecting = true
    c4.isReconnecting = true

    const [r1, r2, r3, r4] = await Promise.all([
      Promise.resolve(handleReconnect(c1, [])),
      Promise.resolve(handleReconnect(c2, [])),
      Promise.resolve(handleReconnect(c3, [])),
      Promise.resolve(handleReconnect(c4, [])),
    ])

    // c1 missed events 6-20 (15 events)
    expect(r1).toHaveLength(15)
    expect(r1[0].id).toBe(eventIds[5])
    expect(r1[14].id).toBe(eventIds[19])

    // c2 missed events 11-20 (10 events)
    expect(r2).toHaveLength(10)
    expect(r2[0].id).toBe(eventIds[10])
    expect(r2[9].id).toBe(eventIds[19])

    // c3 has no lastEventId → full replay of all 20 events
    expect(r3).toHaveLength(20)
    expect(r3[0].id).toBe(eventIds[0])
    expect(r3[19].id).toBe(eventIds[19])

    // c4 has unknown lastEventId → full replay (safe fallback)
    expect(r4).toHaveLength(20)

    // All reconnect flags cleared
    expect(c1.isReconnecting).toBe(false)
    expect(c2.isReconnecting).toBe(false)
    expect(c3.isReconnecting).toBe(false)
    expect(c4.isReconnecting).toBe(false)
  })

  // ----- Session isolation (fanout cross-contamination guard) -----

  it('events from session B never appear in session A replays under concurrent load', async () => {
    seedEvents(SESSION_A, 10, 'sa')
    seedEvents(SESSION_B, 10, 'sb')

    // Four clients split across two sessions reconnect simultaneously
    const clients = [
      createConnectionState('uA1' as UUID, SESSION_A, 'conn-a1'),
      createConnectionState('uA2' as UUID, SESSION_A, 'conn-a2'),
      createConnectionState('uB1' as UUID, SESSION_B, 'conn-b1'),
      createConnectionState('uB2' as UUID, SESSION_B, 'conn-b2'),
    ]

    for (const c of clients) {
      c.isReconnecting = true
    }

    const replays = await Promise.all(clients.map((c) => Promise.resolve(handleReconnect(c, []))))

    const [rA1, rA2, rB1, rB2] = replays

    // All replays are non-empty
    for (const r of replays) {
      expect(r.length).toBeGreaterThan(0)
    }

    // Session A clients only see session A events
    for (const event of [...rA1, ...rA2]) {
      expect(event.sessionId).toBe(SESSION_A)
      expect((event.id as string).startsWith('sa-')).toBe(true)
    }

    // Session B clients only see session B events
    for (const event of [...rB1, ...rB2]) {
      expect(event.sessionId).toBe(SESSION_B)
      expect((event.id as string).startsWith('sb-')).toBe(true)
    }
  })

  // ----- Fanout under concurrent state transitions -----

  it('new events registered during concurrent reconnects are available to future clients', async () => {
    seedEvents(SESSION_A, 5, 'pre')

    const earlyClient = createConnectionState('u-early' as UUID, SESSION_A, 'conn-early')
    updateConnectionState(earlyClient, 'pre-0005')
    earlyClient.isReconnecting = true

    // Simulate events arriving while earlyClient is reconnecting
    const lateEventIds = seedEvents(SESSION_A, 3, 'post')

    const lateClient = createConnectionState('u-late' as UUID, SESSION_A, 'conn-late')
    lateClient.isReconnecting = true

    const [earlyReplay, lateReplay] = await Promise.all([
      Promise.resolve(handleReconnect(earlyClient, [])),
      Promise.resolve(handleReconnect(lateClient, [])),
    ])

    // Early client: saw pre-0001 to pre-0005, should get post events only
    expect(earlyReplay.map((e) => e.id)).toEqual(lateEventIds)

    // Late client: no lastEventId, should get all 8 events
    expect(lateReplay).toHaveLength(8)
    expect(lateReplay.slice(5).map((e) => e.id)).toEqual(lateEventIds)
  })

  // ----- FIFO cap under high-volume -----

  it('FIFO cap is respected when multiple clients register high event volumes', async () => {
    // Seed 600 events, then 600 more (total 1200, cap is 1000)
    for (let i = 1; i <= 600; i += 1) {
      registerEventForRecovery(SESSION_A, makeEvent(`bulk-a-${i}`, SESSION_A, i))
    }
    for (let i = 1; i <= 600; i += 1) {
      registerEventForRecovery(SESSION_A, makeEvent(`bulk-b-${i}`, SESSION_A, 600 + i))
    }

    const c = createConnectionState('u-bulk' as UUID, SESSION_A, 'conn-bulk')
    c.isReconnecting = true
    const replay = handleReconnect(c, [])

    // Exactly 1000 events retained, oldest 200 are evicted
    expect(replay).toHaveLength(1000)
    // First retained event is bulk-a-201 (1-based, so index 200 in original series)
    expect(replay[0].id).toBe('bulk-a-201')
    // Last event is bulk-b-600
    expect(replay[999].id).toBe('bulk-b-600')
  })

  // ----- Idempotent reconnect flag clearing -----

  it('calling handleReconnect a second time (idempotent) returns empty replay and flag stays false', () => {
    seedEvents(SESSION_A, 5)

    const c = createConnectionState('u-idem' as UUID, SESSION_A, 'conn-idem')
    c.isReconnecting = true

    // First reconnect
    const first = handleReconnect(c, [])
    expect(first).toHaveLength(5)
    expect(c.isReconnecting).toBe(false)

    // Second reconnect attempt after lastEventId has been advanced to the final event
    updateConnectionState(c, first[first.length - 1].id as string)
    c.isReconnecting = true
    const second = handleReconnect(c, [])

    // No new events since last seen
    expect(second).toHaveLength(0)
    expect(c.isReconnecting).toBe(false)
  })

  // ----- DM + players reconnect topology -----

  it('DM and three players in same session each recover independent slices on reconnect', async () => {
    const dm = createConnectionState('dm-uuid' as UUID, SESSION_A, 'conn-dm')
    const p1 = createConnectionState('p1-uuid' as UUID, SESSION_A, 'conn-p1')
    const p2 = createConnectionState('p2-uuid' as UUID, SESSION_A, 'conn-p2')
    const p3 = createConnectionState('p3-uuid' as UUID, SESSION_A, 'conn-p3')

    // Simulate staggered activity: DM sees all 15, P1 sees 1-5, P2 sees 1-10, P3 is brand new
    const evIds = seedEvents(SESSION_A, 15, 'dm-session')

    updateConnectionState(dm, evIds[14]) // DM is current
    updateConnectionState(p1, evIds[4]) // Player 1 missed 10
    updateConnectionState(p2, evIds[9]) // Player 2 missed 5
    // p3 has no lastEventId

    for (const c of [dm, p1, p2, p3]) {
      c.isReconnecting = true
    }

    const [dmReplay, p1Replay, p2Replay, p3Replay] = await Promise.all([
      Promise.resolve(handleReconnect(dm, [])),
      Promise.resolve(handleReconnect(p1, [])),
      Promise.resolve(handleReconnect(p2, [])),
      Promise.resolve(handleReconnect(p3, [])),
    ])

    expect(dmReplay).toHaveLength(0) // DM is fully current
    expect(p1Replay).toHaveLength(10) // Missed events 6-15
    expect(p2Replay).toHaveLength(5) // Missed events 11-15
    expect(p3Replay).toHaveLength(15) // Full replay

    // No cross-client contamination: each replay slice starts from correct position
    if (p1Replay.length > 0) expect(p1Replay[0].id).toBe(evIds[5])
    if (p2Replay.length > 0) expect(p2Replay[0].id).toBe(evIds[10])
  })
})
