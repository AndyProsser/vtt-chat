/**
 * Session Logs Service
 * Business logic for session event logging
 */

import type { UUID } from '@shared'
import type { SessionLogEntry } from '@/types/session-log.types'
import {
  countSessionLogs,
  createSessionLog,
  getSessionLogs,
  getSessionLogsByType,
} from '@/repositories/session-logs.repository'

/**
 * Log a user joining a session
 */
export async function logSessionJoin(
  sessionId: UUID,
  userId: UUID,
  username: string
): Promise<void> {
  await createSessionLog({
    sessionId,
    userId,
    username,
    eventType: 'JOINED',
    detail: `${username} joined the session`,
  })
}

/**
 * Log a user leaving a session
 */
export async function logSessionLeave(
  sessionId: UUID,
  userId: UUID,
  username: string
): Promise<void> {
  await createSessionLog({
    sessionId,
    userId,
    username,
    eventType: 'LEFT',
    detail: `${username} left the session`,
  })
}

/**
 * Log a session state change
 */
export async function logSessionStateChange(
  sessionId: UUID,
  dmId: UUID,
  dmUsername: string,
  oldState: string,
  newState: string
): Promise<void> {
  await createSessionLog({
    sessionId,
    userId: dmId,
    username: dmUsername,
    eventType: 'STATE_CHANGED',
    detail: `Session state changed from ${oldState} to ${newState}`,
  })
}

/**
 * Log a cooldown extension operation.
 */
export async function logSessionCooldownExtended(
  sessionId: UUID,
  dmId: UUID,
  dmUsername: string,
  extensionMs: number
): Promise<void> {
  await createSessionLog({
    sessionId,
    userId: dmId,
    username: dmUsername,
    eventType: 'STATE_CHANGED',
    detail: `Cooldown extended by ${extensionMs}ms`,
  })
}

/**
 * Count how many times cooldown has been extended for this session.
 */
export async function countSessionCooldownExtensions(sessionId: UUID): Promise<number> {
  const stateChanges = await getSessionLogsByType(sessionId, 'STATE_CHANGED', 200, 0)
  return stateChanges.reduce((count, entry) => {
    if (entry.detail?.startsWith('Cooldown extended by ')) {
      return count + 1
    }
    return count
  }, 0)
}

/**
 * Get session event history
 */
export async function getSessionEventHistory(
  sessionId: UUID,
  limit: number = 50,
  offset: number = 0
): Promise<SessionLogEntry[]> {
  const rows = await getSessionLogs(sessionId, limit, offset)
  return rows.map((row) => ({
    ...row,
    id: row.id as UUID,
    sessionId: row.sessionId as UUID,
    userId: (row.userId as UUID | null) ?? null,
  }))
}

/**
 * Get count of session logs
 */
export async function getSessionEventCount(sessionId: UUID): Promise<number> {
  return countSessionLogs(sessionId)
}
