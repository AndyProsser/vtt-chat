/**
 * Session Logs Service
 * Business logic for session event logging
 */

import type { UUID } from '@shared'
import {
  createSessionLog,
  getSessionLogs,
  getSessionLogsByType,
  countSessionLogs,
} from '@/repositories/session-logs.repository'

export interface SessionLogData {
  sessionId: UUID
  userId?: UUID
  username: string
  eventType: 'JOINED' | 'LEFT' | 'STATE_CHANGED'
  detail?: string
}

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
 * Get session event history
 */
export async function getSessionEventHistory(
  sessionId: UUID,
  limit: number = 50,
  offset: number = 0
): Promise<
  Array<{
    id: string
    sessionId: string
    userId: string | null
    username: string
    eventType: string
    detail: string | null
    createdAt: Date
  }>
> {
  return getSessionLogs(sessionId, limit, offset)
}

/**
 * Get count of session logs
 */
export async function getSessionEventCount(sessionId: UUID): Promise<number> {
  return countSessionLogs(sessionId)
}
