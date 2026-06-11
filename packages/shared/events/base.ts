/**
 * Event Base Schema
 * All WebSocket and internal events must conform to this contract.
 * Reference: docs/architecture/EVENT-BUS.md
 */

import type { UUID, Role } from '../types'

/**
 * Standard event envelope that wraps all domain events.
 * Every event MUST include these fields.
 */
export interface EventEnvelope<T = Record<string, any>> {
  /** Unique event ID for tracking and idempotency */
  id: UUID

  /** Fully qualified event type: DOMAIN_EVENT_ACTION */
  type: string

  /** Version of this event schema for forward compatibility */
  version: 1

  /** User who triggered this event (may be SYSTEM for autonomous events) */
  userId: UUID

  /** Role of the user for permission validation */
  userRole: Role

  /** Session this event belongs to (always required) */
  sessionId: UUID

  /** Room this event is scoped to (null for session-level events) */
  roomId: UUID | null

  /** Unix timestamp in milliseconds */
  timestamp: number

  /** The actual event payload - subsystem-specific */
  payload: T

  /** Metadata: transport info, trace IDs, etc. (not sent to clients) */
  meta?: {
    traceId?: string
    source?: 'WS' | 'REST' | 'INTERNAL'
    sessionId?: string
  }
}

/**
 * Validation contract for event envelopes.
 * Every event must pass these checks before entering the system.
 */
export interface EventValidationRules {
  /** Event must have a valid non-empty type string */
  requireType: boolean

  /** Event must reference a valid session */
  requireSession: boolean

  /** User must have permission to perform this action */
  requirePermission: boolean

  /** Payload must match subsystem schema */
  requirePayloadSchema: boolean

  /** Timestamp must be within acceptable skew window */
  requireRecentTimestamp: boolean
}

/**
 * Standard validation result.
 */
export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings?: string[]
}

/**
 * Standard error format for event validation failures.
 */
export interface ValidationError {
  code: string
  message: string
  field?: string
  value?: any
}
