/**
 * State Recovery
 * Handles reconnection and state synchronization after network failure.
 * Tracks last event ID per connection and replays missing events.
 */

import type { UUID } from '@shared'
import type { EventEnvelope } from '@shared'

/**
 * Connection state for tracking reconnections
 */
export interface ConnectionState {
  userId: UUID
  sessionId: UUID
  connectionId: string
  connectedAt: number
  lastEventId?: string
  isReconnecting: boolean
}

/**
 * Event log for state recovery
 * In Stage 1: in-memory; later stages use Redis/database
 */
class EventLog {
  private events: Map<string, EventEnvelope[]> = new Map()
  private maxEventsPerSession = 1000

  /**
   * Add an event to the log
   */
  addEvent(sessionId: UUID, event: EventEnvelope): void {
    if (!this.events.has(sessionId)) {
      this.events.set(sessionId, [])
    }

    const sessionEvents = this.events.get(sessionId)!
    sessionEvents.push(event)

    // Keep only recent events (FIFO)
    if (sessionEvents.length > this.maxEventsPerSession) {
      sessionEvents.shift()
    }
  }

  /**
   * Get events after a specific event ID
   * Returns empty array if lastEventId not found (full resync)
   */
  getEventsSince(sessionId: UUID, lastEventId?: string): EventEnvelope[] {
    const sessionEvents = this.events.get(sessionId) || []

    if (!lastEventId) {
      // Full resync: return all events
      return sessionEvents
    }

    // Find where to start
    const startIndex = sessionEvents.findIndex((e) => e.id === lastEventId)
    if (startIndex === -1) {
      // Event not found: return all (full resync)
      return sessionEvents
    }

    // Return events after lastEventId
    return sessionEvents.slice(startIndex + 1)
  }

  /**
   * Clear events for a session (cleanup after session ends)
   */
  clearSession(sessionId: UUID): void {
    this.events.delete(sessionId)
  }
}

/**
 * Global event log instance
 */
const eventLog = new EventLog()

/**
 * Handle user reconnection
 */
export function handleReconnect(
  connectionState: ConnectionState,
  events: EventEnvelope[]
): EventEnvelope[] {
  const recoveredEvents = eventLog.getEventsSince(connectionState.sessionId, connectionState.lastEventId)

  // Mark reconnection complete
  connectionState.isReconnecting = false

  return recoveredEvents
}

/**
 * Register an event for state recovery
 */
export function registerEventForRecovery(sessionId: UUID, event: EventEnvelope): void {
  eventLog.addEvent(sessionId, event)
}

/**
 * Update last seen event for a connection
 */
export function updateConnectionState(
  connectionState: ConnectionState,
  lastEventId: string
): void {
  connectionState.lastEventId = lastEventId
}

/**
 * Create a new connection state
 */
export function createConnectionState(
  userId: UUID,
  sessionId: UUID,
  connectionId: string
): ConnectionState {
  return {
    userId,
    sessionId,
    connectionId,
    connectedAt: Date.now(),
    isReconnecting: false,
  }
}

/**
 * Clear a session from recovery log (when session ends)
 */
export function clearSessionRecoveryState(sessionId: UUID): void {
  eventLog.clearSession(sessionId)
}
