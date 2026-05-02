import { describe, expect, it } from 'vitest'
import {
  SERVER_EVENT_TYPES,
  SERVER_SESSION_EVENT_TYPES,
  SERVER_ROOM_EVENT_TYPES,
  SERVER_PRESENCE_EVENT_TYPES,
  SERVER_CHAT_EVENT_TYPES,
  SERVER_NOTES_EVENT_TYPES,
  SERVER_AUDIO_EVENT_TYPES,
  isServerEventType,
} from '@/ws/events/server-events'

describe('server-events', () => {
  it('SERVER_EVENT_TYPES contains all domain sub-lists', () => {
    const allTypes = new Set(SERVER_EVENT_TYPES)

    for (const t of SERVER_SESSION_EVENT_TYPES) expect(allTypes.has(t)).toBe(true)
    for (const t of SERVER_ROOM_EVENT_TYPES) expect(allTypes.has(t)).toBe(true)
    for (const t of SERVER_PRESENCE_EVENT_TYPES) expect(allTypes.has(t)).toBe(true)
    for (const t of SERVER_CHAT_EVENT_TYPES) expect(allTypes.has(t)).toBe(true)
    for (const t of SERVER_NOTES_EVENT_TYPES) expect(allTypes.has(t)).toBe(true)
    for (const t of SERVER_AUDIO_EVENT_TYPES) expect(allTypes.has(t)).toBe(true)
  })

  it('isServerEventType returns true for known server event types', () => {
    expect(isServerEventType('SESSION:CREATED')).toBe(true)
    expect(isServerEventType('SESSION:ENDED')).toBe(true)
    expect(isServerEventType('ROOM:SESSION_TRANSITION_APPLIED')).toBe(true)
    expect(isServerEventType('PRESENCE:RECONNECTED')).toBe(true)
    expect(isServerEventType('CHAT:MESSAGE_SENT')).toBe(true)
    expect(isServerEventType('AUDIO:DM_OVERRIDE_APPLIED')).toBe(true)
  })

  it('isServerEventType returns false for unknown event types', () => {
    expect(isServerEventType('UNKNOWN:EVENT')).toBe(false)
    expect(isServerEventType('')).toBe(false)
  })

  it('SERVER_EVENT_TYPES has no duplicate entries', () => {
    const unique = new Set(SERVER_EVENT_TYPES)
    expect(unique.size).toBe(SERVER_EVENT_TYPES.length)
  })
})
