/**
 * State Recovery
 * Handles reconnection and state synchronization after network failure.
 * Tracks last event ID per connection and replays missing events.
 */

import type { UUID } from '@shared'
import type { EventEnvelope } from '@shared'
import { getRedisClient } from '@/infra/redis'
import { logger } from '@/utils'

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
 * Event log for state recovery.
 * Uses in-memory buffering for replay.
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

const RECOVERY_STREAM_MAX_EVENTS = 1000

function recoveryStreamKey(sessionId: UUID): string {
  return `ws:session:${sessionId}:events`
}

function parseVisibleAudience(raw: string | undefined): UUID[] {
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((value): value is UUID => typeof value === 'string')
  } catch {
    return []
  }
}

function parseStreamEvent(raw: string | undefined): EventEnvelope | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as EventEnvelope
    if (!parsed || typeof parsed !== 'object' || typeof parsed.id !== 'string') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/**
 * Handle user reconnection
 */
export function handleReconnect(
  connectionState: ConnectionState,
  events: EventEnvelope[]
): EventEnvelope[] {
  void events

  const recoveredEvents = eventLog.getEventsSince(
    connectionState.sessionId,
    connectionState.lastEventId
  )

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
 * Register event in durable Redis stream for restart-safe replay.
 * This is non-fatal: failures are logged and in-memory recovery path remains available.
 */
export async function registerEventForRecoveryDurable(
  sessionId: UUID,
  event: EventEnvelope,
  visibleTo?: UUID[]
): Promise<void> {
  try {
    const redis = await getRedisClient()
    const key = recoveryStreamKey(sessionId)

    await (redis as any).xAdd(key, '*', {
      eventId: event.id,
      timestamp: String(event.timestamp),
      visibleTo: JSON.stringify(visibleTo || []),
      event: JSON.stringify(event),
    })

    // Keep stream bounded for predictable replay cost.
    await (redis as any).xTrim(key, 'MAXLEN', RECOVERY_STREAM_MAX_EVENTS)
  } catch (error) {
    logger.warn('ws.recovery', 'Failed to append durable recovery event', {
      sessionId,
      eventId: event.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Read replay events from Redis stream for a reconnecting user.
 * If lastEventId is unknown, it falls back to full stream replay.
 */
export async function replayEventsForConnectionDurable(params: {
  sessionId: UUID
  userId: UUID
  lastEventId?: string
}): Promise<EventEnvelope[]> {
  try {
    const redis = await getRedisClient()
    const entries = (await (redis as any).xRange(
      recoveryStreamKey(params.sessionId),
      '-',
      '+'
    )) as Array<{ id: string; message: Record<string, string> }>

    if (!entries?.length) {
      return []
    }

    const parsedEntries = entries
      .map((entry) => {
        const event = parseStreamEvent(entry.message?.event)
        if (!event) {
          return null
        }

        const visibleTo = parseVisibleAudience(entry.message?.visibleTo)
        return {
          event,
          visibleTo,
        }
      })
      .filter(
        (
          entry
        ): entry is {
          event: EventEnvelope
          visibleTo: UUID[]
        } => entry !== null
      )

    if (!parsedEntries.length) {
      return []
    }

    let startIndex = 0
    if (params.lastEventId) {
      const found = parsedEntries.findIndex((entry) => entry.event.id === params.lastEventId)
      startIndex = found >= 0 ? found + 1 : 0
    }

    return parsedEntries
      .slice(startIndex)
      .filter((entry) => {
        if (!entry.visibleTo.length) {
          return true
        }
        return entry.visibleTo.includes(params.userId)
      })
      .map((entry) => entry.event)
  } catch (error) {
    logger.warn('ws.recovery', 'Failed to replay durable recovery events', {
      sessionId: params.sessionId,
      userId: params.userId,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

/**
 * Update last seen event for a connection
 */
export function updateConnectionState(connectionState: ConnectionState, lastEventId: string): void {
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
  void (async () => {
    try {
      const redis = await getRedisClient()
      await redis.del(recoveryStreamKey(sessionId))
    } catch {
      // Non-fatal cleanup path.
    }
  })()
}
