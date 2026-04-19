/**
 * Session Logs Repository
 * Persistence layer for session event logs
 */

import { getPrismaClient } from '@/infra/db'
import type { UUID } from '@shared'

const prisma = getPrismaClient()

export interface SessionLogRecord {
  sessionId: UUID
  userId?: UUID
  username: string
  eventType: 'JOINED' | 'LEFT' | 'STATE_CHANGED'
  detail?: string
}

/**
 * Log a session event
 */
export async function createSessionLog(log: SessionLogRecord): Promise<void> {
  await prisma.sessionLog.create({
    data: {
      sessionId: log.sessionId,
      userId: log.userId,
      username: log.username,
      eventType: log.eventType,
      detail: log.detail,
    },
  })
}

/**
 * Get all logs for a session
 */
export async function getSessionLogs(
  sessionId: UUID,
  limit?: number,
  offset?: number
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
  return prisma.sessionLog.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  })
}

/**
 * Get session logs for a specific event type
 */
export async function getSessionLogsByType(
  sessionId: UUID,
  eventType: 'JOINED' | 'LEFT' | 'STATE_CHANGED',
  limit?: number,
  offset?: number
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
  return prisma.sessionLog.findMany({
    where: { sessionId, eventType },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  })
}

/**
 * Count logs for a session
 */
export async function countSessionLogs(sessionId: UUID): Promise<number> {
  return prisma.sessionLog.count({
    where: { sessionId },
  })
}
