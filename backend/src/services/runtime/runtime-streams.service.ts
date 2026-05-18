import { randomUUID } from 'node:crypto'
import type { UUID } from '@shared'
import { getRedisClient } from '@/infra/redis'
import { logger } from '@/utils'

export type SessionAuditVisibilityClass = 'PUBLIC' | 'ROLE_SCOPED' | 'PRIVATE' | 'SYSTEM'

export interface SessionAuditEventInput {
  eventId?: UUID
  timestamp?: number
  sessionId: UUID
  campaignId?: UUID
  actorUserId?: UUID
  actorRole?: string
  actionType: string
  targetType?: string
  targetId?: UUID
  roomId?: UUID
  visibilityClass: SessionAuditVisibilityClass
  metadata?: Record<string, unknown>
}

export interface NormalizedSessionAuditEvent {
  eventId: UUID
  timestamp: number
  sessionId: UUID
  campaignId: string
  actorUserId: string
  actorRole: string
  actionType: string
  targetType: string
  targetId: string
  roomId: string
  visibilityClass: SessionAuditVisibilityClass
  metadata: Record<string, unknown>
}

export interface ChatRuntimeEventInput {
  sessionId: UUID
  messageId: UUID
  action: 'MESSAGE_SENT' | 'MESSAGE_EDITED' | 'MESSAGE_DELETED'
  roomId?: UUID
  authorId?: UUID
  messageType?: string
  visibilityClass?: SessionAuditVisibilityClass
  timestamp?: number
  payload?: Record<string, unknown>
}

function auditStreamKey(sessionId: UUID): string {
  return `audit:session:${sessionId}:stream`
}

function chatStreamKey(sessionId: UUID): string {
  return `chat:session:${sessionId}:stream`
}

function toMetadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

export function normalizeSessionAuditEvent(
  input: SessionAuditEventInput
): NormalizedSessionAuditEvent {
  return {
    eventId: input.eventId ?? (randomUUID() as UUID),
    timestamp: input.timestamp ?? Date.now(),
    sessionId: input.sessionId,
    campaignId: input.campaignId ?? '',
    actorUserId: input.actorUserId ?? '',
    actorRole: input.actorRole ?? 'SYSTEM',
    actionType: input.actionType,
    targetType: input.targetType ?? '',
    targetId: input.targetId ?? '',
    roomId: input.roomId ?? '',
    visibilityClass: input.visibilityClass,
    metadata: toMetadataRecord(input.metadata),
  }
}

/**
 * Append a normalized session audit event to Redis stream.
 * This path is intentionally non-fatal: API/domain mutations continue if Redis is unavailable.
 */
export async function appendSessionAuditEvent(input: SessionAuditEventInput): Promise<void> {
  try {
    const redis = await getRedisClient()
    const normalized = normalizeSessionAuditEvent(input)

    await redis.xAdd(auditStreamKey(input.sessionId), '*', {
      eventId: normalized.eventId,
      timestamp: String(normalized.timestamp),
      sessionId: normalized.sessionId,
      campaignId: normalized.campaignId,
      actorUserId: normalized.actorUserId,
      actorRole: normalized.actorRole,
      actionType: normalized.actionType,
      targetType: normalized.targetType,
      targetId: normalized.targetId,
      roomId: normalized.roomId,
      visibilityClass: normalized.visibilityClass,
      metadata: JSON.stringify(normalized.metadata),
    })
  } catch (error) {
    logger.warn('runtime.audit', 'Failed to append session audit event', {
      sessionId: input.sessionId,
      actionType: input.actionType,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Append chat runtime projection event to Redis stream.
 * This stream supports low-latency fan-out/recovery diagnostics without replacing DB durability.
 */
export async function appendChatRuntimeEvent(input: ChatRuntimeEventInput): Promise<void> {
  try {
    const redis = await getRedisClient()
    const timestamp = input.timestamp ?? Date.now()

    await redis.xAdd(chatStreamKey(input.sessionId), '*', {
      eventId: randomUUID(),
      timestamp: String(timestamp),
      action: input.action,
      sessionId: input.sessionId,
      messageId: input.messageId,
      roomId: input.roomId ?? '',
      authorId: input.authorId ?? '',
      messageType: input.messageType ?? '',
      visibilityClass: input.visibilityClass ?? 'PUBLIC',
      payload: JSON.stringify(input.payload ?? {}),
    })
  } catch (error) {
    logger.warn('runtime.chat', 'Failed to append chat runtime event', {
      sessionId: input.sessionId,
      messageId: input.messageId,
      action: input.action,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
