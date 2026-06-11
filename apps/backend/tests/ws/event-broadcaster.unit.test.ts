import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Role, type EventEnvelope, type UUID } from '@shared'
import broadcaster from '@/ws/event-broadcaster'

function buildEvent(sessionId: UUID): EventEnvelope {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID,
    type: 'TEST:EVENT',
    version: 1,
    userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as UUID,
    userRole: Role.DM,
    sessionId,
    roomId: null,
    timestamp: Date.now(),
    payload: { ok: true },
  }
}

describe('event broadcaster', () => {
  beforeEach(() => {
    // Reset singleton state between tests.
    ;(broadcaster as any).wsManager = null
  })

  it('reports readiness based on WebSocket manager initialization', () => {
    expect(broadcaster.isReady()).toBe(false)

    const wsManager = {
      broadcastEventToSession: vi.fn(),
    } as any

    broadcaster.setWebSocketManager(wsManager)
    expect(broadcaster.isReady()).toBe(true)
  })

  it('throws when broadcasting before initialization', () => {
    const sessionId = '11111111-1111-4111-8111-111111111111' as UUID
    const event = buildEvent(sessionId)

    expect(() => broadcaster.broadcastToSession(sessionId, event)).toThrow(
      'WebSocketManager not initialized in broadcaster'
    )
  })

  it('forwards broadcast to the configured manager', () => {
    const wsManager = {
      broadcastEventToSession: vi.fn(),
    } as any

    broadcaster.setWebSocketManager(wsManager)

    const sessionId = '22222222-2222-4222-8222-222222222222' as UUID
    const event = buildEvent(sessionId)
    const visibleTo = ['33333333-3333-4333-8333-333333333333' as UUID]

    broadcaster.broadcastToSession(sessionId, event, visibleTo)

    expect(wsManager.broadcastEventToSession).toHaveBeenCalledWith(sessionId, event, visibleTo)
  })
})
