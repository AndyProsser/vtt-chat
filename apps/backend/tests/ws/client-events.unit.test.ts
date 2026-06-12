import { describe, expect, it } from 'vitest'
import {
  CLIENT_EVENT_TYPES,
  CLIENT_CHAT_EVENT_TYPES,
  CLIENT_ROOM_EVENT_TYPES,
  CLIENT_PRESENCE_EVENT_TYPES,
  CLIENT_NOTES_EVENT_TYPES,
  CLIENT_AUDIO_EVENT_TYPES,
  isClientEventType,
} from '@/ws/events/client-events'

describe('client-events', () => {
  it('CLIENT_EVENT_TYPES contains all domain sub-lists', () => {
    const allTypes = new Set(CLIENT_EVENT_TYPES)

    for (const t of CLIENT_CHAT_EVENT_TYPES) expect(allTypes.has(t)).toBe(true)
    for (const t of CLIENT_ROOM_EVENT_TYPES) expect(allTypes.has(t)).toBe(true)
    for (const t of CLIENT_PRESENCE_EVENT_TYPES) expect(allTypes.has(t)).toBe(true)
    for (const t of CLIENT_NOTES_EVENT_TYPES) expect(allTypes.has(t)).toBe(true)
    for (const t of CLIENT_AUDIO_EVENT_TYPES) expect(allTypes.has(t)).toBe(true)
  })

  it('isClientEventType returns true for known client event types', () => {
    expect(isClientEventType('CHAT:MESSAGE_SENT')).toBe(true)
    expect(isClientEventType('ROOM:USER_JOINED')).toBe(true)
    expect(isClientEventType('PRESENCE:STATE_CHANGED')).toBe(true)
    expect(isClientEventType('NOTES:CREATED')).toBe(true)
    expect(isClientEventType('AUDIO:EFFECT_APPLIED')).toBe(true)
  })

  it('isClientEventType returns false for server-only or unknown event types', () => {
    expect(isClientEventType('SESSION:CREATED')).toBe(false)
    expect(isClientEventType('ROOM:SESSION_TRANSITION_APPLIED')).toBe(false)
    expect(isClientEventType('PRESENCE:RECONNECTED')).toBe(false)
    expect(isClientEventType('UNKNOWN:EVENT')).toBe(false)
    expect(isClientEventType('')).toBe(false)
  })

  it('CLIENT_EVENT_TYPES has no duplicate entries', () => {
    const unique = new Set(CLIENT_EVENT_TYPES)
    expect(unique.size).toBe(CLIENT_EVENT_TYPES.length)
  })
})
