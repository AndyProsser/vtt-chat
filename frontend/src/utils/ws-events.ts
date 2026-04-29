import type { EventEnvelope, UUID } from '@shared'

export function isEventForSession(event: EventEnvelope, sessionId: UUID): boolean {
  return event.sessionId === sessionId
}

export function getEventType(event: EventEnvelope): string {
  return event.type
}

export function sortEventsByTimestamp(events: EventEnvelope[]): EventEnvelope[] {
  return [...events].sort((a, b) => a.timestamp - b.timestamp)
}

export function isEventType(event: EventEnvelope, allowedTypes: readonly string[]): boolean {
  return allowedTypes.includes(event.type)
}
