/**
 * Session Service
 * Handles session CRUD operations and state management.
 * All operations are deterministic and validated against contracts.
 */

import type { UUID, Session, SessionState, User } from '@shared'
import { SessionState as SessionStateEnum } from '@shared'
import { createError, ErrorCode } from '@shared'

/**
 * In-memory session store (Stage 1: no persistence)
 * In Stage 2+, this will be replaced with database operations.
 */
const sessions = new Map<UUID, Session & { users: Map<UUID, User> }>()

/**
 * Generate a deterministic UUID for Stage 1
 * (In production, use a real UUID library)
 */
function generateUUID(): UUID {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}` as UUID
}

/**
 * Create a new session
 */
export function createSession(
  name: string,
  dmId: UUID,
  description?: string
): Session {
  const sessionId = generateUUID()
  const now = Date.now()

  const session: Session & { users: Map<UUID, User> } = {
    id: sessionId,
    name,
    dmId,
    state: SessionStateEnum.IDLE,
    createdAt: now,
    users: new Map(),
  }

  sessions.set(sessionId, session)

  return {
    id: sessionId,
    name,
    dmId,
    state: SessionStateEnum.IDLE,
    createdAt: now,
  }
}

/**
 * Get a session by ID
 */
export function getSession(sessionId: UUID): Session | null {
  const session = sessions.get(sessionId)
  if (!session) return null

  return {
    id: session.id,
    name: session.name,
    dmId: session.dmId,
    state: session.state,
    createdAt: session.createdAt,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
  }
}

/**
 * Get all sessions (Stage 1: return all; later filter by user)
 */
export function getAllSessions(): Session[] {
  return Array.from(sessions.values()).map((session) => ({
    id: session.id,
    name: session.name,
    dmId: session.dmId,
    state: session.state,
    createdAt: session.createdAt,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
  }))
}

/**
 * Update session state (start, pause, resume, end)
 * Validates state transitions per Stage 0 contracts.
 */
export function updateSessionState(
  sessionId: UUID,
  newState: SessionState,
  dmId: UUID
): Session | null {
  const session = sessions.get(sessionId)
  if (!session) return null

  // DM-only check
  if (session.dmId !== dmId) {
    throw createError(ErrorCode.FORBIDDEN, {
      message: 'Only DM can change session state',
    })
  }

  // Validate state transition
  const validTransitions: Record<SessionState, SessionState[]> = {
    [SessionStateEnum.IDLE]: [SessionStateEnum.ACTIVE],
    [SessionStateEnum.ACTIVE]: [SessionStateEnum.PAUSED, SessionStateEnum.ENDED],
    [SessionStateEnum.PAUSED]: [SessionStateEnum.ACTIVE, SessionStateEnum.ENDED],
    [SessionStateEnum.ENDED]: [], // No transitions from ENDED
  }

  const allowedTransitions = validTransitions[session.state]
  if (!allowedTransitions.includes(newState)) {
    throw createError(ErrorCode.INVALID_STATE_TRANSITION, {
      context: {
        currentState: session.state,
        requestedState: newState,
        allowedTransitions,
      },
    })
  }

  // Apply state transition
  session.state = newState

  const now = Date.now()
  if (newState === SessionStateEnum.ACTIVE && !session.startedAt) {
    session.startedAt = now
  }
  if (newState === SessionStateEnum.ENDED) {
    session.endedAt = now
  }

  return {
    id: session.id,
    name: session.name,
    dmId: session.dmId,
    state: session.state,
    createdAt: session.createdAt,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
  }
}

/**
 * Add a user to a session
 */
export function addUserToSession(sessionId: UUID, user: User): boolean {
  const session = sessions.get(sessionId)
  if (!session) return false

  session.users.set(user.id, user)
  return true
}

/**
 * Remove a user from a session
 */
export function removeUserFromSession(sessionId: UUID, userId: UUID): boolean {
  const session = sessions.get(sessionId)
  if (!session) return false

  session.users.delete(userId)
  return true
}

/**
 * Get all users in a session
 */
export function getSessionUsers(sessionId: UUID): User[] {
  const session = sessions.get(sessionId)
  if (!session) return []

  return Array.from(session.users.values())
}

/**
 * Check if user is in session
 */
export function isUserInSession(sessionId: UUID, userId: UUID): boolean {
  const session = sessions.get(sessionId)
  if (!session) return false

  return session.users.has(userId)
}

/**
 * Delete a session (DM-only, stage-safe)
 */
export function deleteSession(sessionId: UUID, dmId: UUID): boolean {
  const session = sessions.get(sessionId)
  if (!session) return false

  if (session.dmId !== dmId) {
    throw createError(ErrorCode.FORBIDDEN, {
      message: 'Only DM can delete session',
    })
  }

  sessions.delete(sessionId)
  return true
}
