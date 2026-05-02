import { describe, expect, it } from 'vitest'
import type { EventEnvelope } from '@shared'
import {
  getEventType,
  isEventForSession,
  isEventType,
  sortEventsByTimestamp,
} from '../../utils/ws-events'

function makeEvent(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    id: '11111111-1111-4111-8111-111111111111' as any,
    type: 'CHAT:MESSAGE_SENT',
    version: 1,
    userId: '22222222-2222-4222-8222-222222222222' as any,
    userRole: 'PLAYER' as any,
    sessionId: '33333333-3333-4333-8333-333333333333' as any,
    roomId: null,
    timestamp: 100,
    payload: {},
    ...overrides,
  }
}

describe('ws-events utils', () => {
  it('isEventForSession returns true when session matches', () => {
    const event = makeEvent()
    expect(isEventForSession(event, event.sessionId as any)).toBe(true)
  })

  it('isEventForSession returns false when session differs', () => {
    const event = makeEvent()
    expect(isEventForSession(event, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as any)).toBe(false)
  })

  it('getEventType returns event type', () => {
    const event = makeEvent({ type: 'NOTES:NOTE_CREATED' as any })
    expect(getEventType(event)).toBe('NOTES:NOTE_CREATED')
  })

  it('sortEventsByTimestamp returns sorted copy', () => {
    const a = makeEvent({ id: 'a' as any, timestamp: 300 })
    const b = makeEvent({ id: 'b' as any, timestamp: 100 })
    const c = makeEvent({ id: 'c' as any, timestamp: 200 })
    const input = [a, b, c]

    const result = sortEventsByTimestamp(input)

    expect(result.map((e) => e.id)).toEqual(['b', 'c', 'a'])
    expect(input.map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('isEventType checks allowed types', () => {
    const event = makeEvent({ type: 'ROOM:CREATED' as any })
    expect(isEventType(event, ['ROOM:CREATED', 'ROOM:DELETED'])).toBe(true)
    expect(isEventType(event, ['CHAT:MESSAGE_SENT'])).toBe(false)
  })
})
