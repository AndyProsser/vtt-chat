/**
 * Chat Service
 * Prisma-backed message persistence with visibility filtering.
 * Reference: docs/subsystems/CHAT-SYSTEM.md
 */

import { MessageType } from '@shared'
import type { UUID } from '@shared'
import type { StoredMessage } from '@/types/chat.types'
import {
  createChatMessageRecord,
  deleteMessageRecord,
  deleteSessionMessages,
  findLatestSessionStartBoundaryTimestamp,
  findMessageById,
  getChatCounts,
  listMessagesBySessionIdsPage,
  listMessagesBySessionIds,
  listSessionMessagesPage,
  listSessionMessages,
  listSessionMessagesSince,
  softDeleteMessageRecord,
  updateMessageRecord,
  listCampaignMessages,
  listCampaignMessagesSince,
  listCampaignMessagesPage,
  deleteCampaignMessages,
} from '@/repositories/chat.repository'
import { findSessionById, listSessionsByCampaign } from '@/repositories/session.repository'
import { listCampaignGroupRooms, findRoomById } from '@/repositories/room.repository'
import {
  appendChatRuntimeEvent,
  appendSessionAuditEvent,
} from '@/services/runtime/runtime-streams.service'
import { isGreenRoomName } from '@/utils'

const SYSTEM_CHAT_AUTHOR_ID = '00000000-0000-0000-0000-000000000000' as UUID
const SYSTEM_CHAT_AUTHOR_USERNAME = 'SYSTEM'

interface ChatVisibilityPayload {
  visibleTo?: UUID[]
  roomId?: UUID
  targetIds?: UUID[]
}

function toVisibilityClass(params: {
  type: MessageType
  isDmOnly: boolean
  isOffTheRecord?: boolean
}): 'PUBLIC' | 'ROLE_SCOPED' | 'PRIVATE' | 'SYSTEM' {
  if (params.type === MessageType.SYSTEM) {
    return 'SYSTEM'
  }

  if (
    params.type === MessageType.WHISPER ||
    params.type === MessageType.DM ||
    params.isOffTheRecord
  ) {
    return 'PRIVATE'
  }

  if (params.isDmOnly) {
    return 'ROLE_SCOPED'
  }

  return 'PUBLIC'
}

function parseUUIDArray(value: unknown): UUID[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is UUID => typeof item === 'string')
}

function parseVisibility(value: unknown): ChatVisibilityPayload {
  if (!value) {
    return {}
  }

  if (Array.isArray(value)) {
    return {
      visibleTo: parseUUIDArray(value),
    }
  }

  if (typeof value === 'object') {
    const maybeObject = value as Record<string, unknown>
    return {
      visibleTo: parseUUIDArray(maybeObject.visibleTo),
      roomId: typeof maybeObject.roomId === 'string' ? (maybeObject.roomId as UUID) : undefined,
      targetIds: parseUUIDArray(maybeObject.targetIds),
    }
  }

  return {}
}

function computeVisibility(
  type: MessageType,
  authorId: UUID,
  dmId: UUID,
  roomId?: UUID,
  recipientId?: UUID,
  visibleAudience?: UUID[]
): ChatVisibilityPayload {
  const visibility: ChatVisibilityPayload = roomId ? { roomId } : {}

  const audience = Array.from(new Set(visibleAudience ?? []))
  if (audience.length > 0) {
    visibility.visibleTo = audience
  }

  if (type === MessageType.DM) {
    visibility.visibleTo = Array.from(new Set([authorId, dmId, ...audience]))
    return visibility
  }

  if (type !== MessageType.WHISPER) {
    return visibility
  }

  const visibleTo = new Set<UUID>([authorId, dmId, ...audience])
  if (recipientId) visibleTo.add(recipientId)
  visibility.visibleTo = Array.from(visibleTo)
  const targetIds = audience.filter((userId) => userId !== authorId && userId !== dmId)
  visibility.targetIds = targetIds.length > 0 ? targetIds : recipientId ? [recipientId] : undefined

  return visibility
}

/**
 * Determine if a message should be stored at campaign level (greenroom) or session level.
 * Returns { campaignId, sessionId, isGreenroom } based on room and session context.
 */
async function determineMessageContext(
  sessionId: UUID,
  roomId?: UUID
): Promise<{ campaignId?: string; sessionId?: string; isGreenroom: boolean }> {
  if (!roomId) {
    return { sessionId, isGreenroom: false }
  }

  try {
    const room = await findRoomById(roomId)
    if (!room) {
      return { sessionId, isGreenroom: false }
    }

    // Check if this is a greenroom GROUP
    if (room.type === 'GROUP' && isGreenRoomName(room.name)) {
      const session = await findSessionById(sessionId)
      if (session?.campaignId) {
        return { campaignId: session.campaignId, isGreenroom: true }
      }
    }
  } catch (error) {
    // If room lookup fails, fall back to session-scoped
    console.error(`Failed to determine message context for room ${roomId}:`, error)
  }

  return { sessionId, isGreenroom: false }
}

export interface ChatHistoryPageOptions {
  before?: number
  limit?: number
  sinceLatestStart?: boolean
}

export interface ChatHistoryPageResult {
  messages: StoredMessage[]
  hasMore: boolean
  nextBefore?: number
  hasEarlier?: boolean
}

function normalizeHistoryLimit(limit?: number): number {
  if (!Number.isFinite(limit) || !limit) {
    return 20
  }

  return Math.max(1, Math.min(100, Math.floor(limit)))
}

function mapStoredMessage(row: {
  id: string
  sessionId?: string | null
  campaignId?: string | null
  authorId: string
  authorUsername: string
  content: string
  type: 'IC' | 'OOC' | 'WHISPER' | 'DM' | 'SYSTEM'
  isDmOnly: boolean
  isOffTheRecord: boolean
  visibleTo: unknown
  createdAt: Date
  editedAt: Date | null
  deletedAt: Date | null
  deletedBy: string | null
}): StoredMessage {
  const visibility = parseVisibility(row.visibleTo)

  // For greenroom messages stored at campaign level, use sessionId from context
  // but keep campaignId for potential future context switching
  return {
    id: row.id as UUID,
    sessionId: row.sessionId as UUID, // May be null for campaign-scoped greenroom messages
    roomId: visibility.roomId,
    authorId: row.authorId as UUID,
    authorUsername: row.authorUsername,
    content: row.content,
    type: row.type as MessageType,
    isDmOnly: row.isDmOnly,
    isOffTheRecord: row.isOffTheRecord,
    visibleTo: visibility.visibleTo,
    targetIds: visibility.targetIds,
    createdAt: row.createdAt.getTime(),
    editedAt: row.editedAt?.getTime(),
    deletedAt: row.deletedAt?.getTime(),
    deletedBy: row.deletedBy ? (row.deletedBy as UUID) : undefined,
  }
}

export function canSeeMessage(
  message: StoredMessage,
  requesterId: UUID,
  requesterRole: string,
  requestedRoomId?: UUID
): boolean {
  if (message.deletedAt !== undefined) return false
  if (requestedRoomId && message.roomId && message.roomId !== requestedRoomId) return false
  if (requesterRole === 'DM') return true
  if (!message.visibleTo) return true
  return message.visibleTo.includes(requesterId)
}

export async function sendMessage(params: {
  sessionId: UUID
  roomId?: UUID
  authorId: UUID
  authorUsername: string
  actorRole?: string
  dmId: UUID
  content: string
  type: MessageType
  recipientId?: UUID
  visibleTo?: UUID[]
  isOffTheRecord?: boolean
}): Promise<StoredMessage> {
  const {
    sessionId,
    roomId,
    authorId,
    authorUsername,
    actorRole,
    dmId,
    content,
    type,
    recipientId,
    visibleTo,
    isOffTheRecord,
  } = params
  const resolvedAuthorId = type === MessageType.SYSTEM ? SYSTEM_CHAT_AUTHOR_ID : authorId
  const resolvedAuthorUsername =
    type === MessageType.SYSTEM ? SYSTEM_CHAT_AUTHOR_USERNAME : authorUsername

  const id = crypto.randomUUID() as UUID
  const visibility = computeVisibility(type, resolvedAuthorId, dmId, roomId, recipientId, visibleTo)

  // Determine if this is a greenroom message (campaign-scoped) or session message
  const context = await determineMessageContext(sessionId, roomId)

  const message: StoredMessage = {
    id,
    sessionId,
    roomId,
    authorId: resolvedAuthorId,
    authorUsername: resolvedAuthorUsername,
    content,
    type,
    isDmOnly: type === MessageType.WHISPER || type === MessageType.DM,
    isOffTheRecord: isOffTheRecord ?? false,
    visibleTo: visibility.visibleTo,
    targetIds: visibility.targetIds,
    createdAt: Date.now(),
  }

  if (message.isOffTheRecord) {
    return message
  }

  const visibilityClass = toVisibilityClass({
    type,
    isDmOnly: message.isDmOnly,
    isOffTheRecord: message.isOffTheRecord,
  })

  await appendChatRuntimeEvent({
    sessionId,
    messageId: id,
    action: 'MESSAGE_SENT',
    roomId,
    authorId: resolvedAuthorId,
    messageType: type,
    visibilityClass,
    timestamp: message.createdAt,
    payload: {
      isDmOnly: message.isDmOnly,
      isOffTheRecord: message.isOffTheRecord,
      visibleAudienceCount: visibility.visibleTo?.length ?? 0,
    },
  })

  await appendSessionAuditEvent({
    sessionId,
    actorUserId: resolvedAuthorId,
    actorRole: actorRole || (type === MessageType.SYSTEM ? 'SYSTEM' : 'PLAYER'),
    actionType: 'CHAT.MESSAGE_SENT',
    targetType: 'MESSAGE',
    targetId: id,
    roomId,
    visibilityClass,
    timestamp: message.createdAt,
    metadata: {
      messageType: type,
      isDmOnly: message.isDmOnly,
      isOffTheRecord: message.isOffTheRecord,
      visibleAudienceCount: visibility.visibleTo?.length ?? 0,
      contentLength: content.length,
    },
  })

  await createChatMessageRecord({
    id,
    sessionId: context.isGreenroom ? undefined : sessionId,
    campaignId: context.isGreenroom ? context.campaignId : undefined,
    authorId: resolvedAuthorId,
    authorUsername: resolvedAuthorUsername,
    content,
    type,
    isDmOnly: message.isDmOnly,
    isOffTheRecord: message.isOffTheRecord,
    visibleTo: visibility,
    createdAt: new Date(message.createdAt),
  })

  return message
}

/**
 * Send a message to the campaign greenroom (campaign-scoped, OOC-only).
 * Messages sent here are visible to all campaign members and persist across session boundaries.
 */
export async function sendCampaignGreenroomMessage(params: {
  campaignId: UUID
  authorId: UUID
  authorUsername: string
  dmId: UUID
  content: string
  visibleTo?: UUID[]
}): Promise<StoredMessage> {
  const { campaignId, authorId, authorUsername, dmId, content, visibleTo } = params
  const id = crypto.randomUUID() as UUID

  const visibility = computeVisibility(
    MessageType.OOC,
    authorId,
    dmId,
    undefined,
    undefined,
    visibleTo
  )

  const message: StoredMessage = {
    id,
    sessionId: undefined,
    roomId: undefined,
    authorId,
    authorUsername,
    content,
    type: MessageType.OOC,
    isDmOnly: false,
    isOffTheRecord: false,
    visibleTo: visibility.visibleTo,
    targetIds: visibility.targetIds,
    createdAt: Date.now(),
  }

  await createChatMessageRecord({
    id,
    campaignId,
    authorId,
    authorUsername,
    content,
    type: MessageType.OOC,
    isDmOnly: false,
    isOffTheRecord: false,
    visibleTo: visibility,
    createdAt: new Date(message.createdAt),
  })

  return message
}

export async function getMessages(
  sessionId: UUID,
  requesterId: UUID,
  requesterRole: string,
  roomId?: UUID,
  options?: { sinceLatestStart?: boolean }
): Promise<StoredMessage[]> {
  const sinceLatestStart = options?.sinceLatestStart === true
  const latestStartBoundary = sinceLatestStart
    ? await findLatestSessionStartBoundaryTimestamp(sessionId)
    : null
  const rows = await listSessionMessagesSince(sessionId, latestStartBoundary ?? undefined)
  const messages = rows.map(mapStoredMessage)
  return messages.filter((m) => {
    // DM can see all messages (audit)
    if (requesterRole === 'DM') return canSeeMessage(m, requesterId, requesterRole, roomId)
    // Other users cannot see off-the-record messages
    if (m.isOffTheRecord) return false
    return canSeeMessage(m, requesterId, requesterRole, roomId)
  })
}

export async function getMessagesPage(
  sessionId: UUID,
  requesterId: UUID,
  requesterRole: string,
  roomId?: UUID,
  options?: ChatHistoryPageOptions
): Promise<ChatHistoryPageResult> {
  const sinceLatestStart = options?.sinceLatestStart === true
  const latestStartBoundary = sinceLatestStart
    ? await findLatestSessionStartBoundaryTimestamp(sessionId)
    : null

  if (options?.limit === undefined) {
    const allMessages = await getMessages(sessionId, requesterId, requesterRole, roomId, {
      sinceLatestStart,
    })
    return {
      messages: allMessages,
      hasMore: false,
      nextBefore: allMessages.length > 0 ? allMessages[0]?.createdAt : undefined,
    }
  }

  const page = await listSessionMessagesPage({
    sessionId,
    since: latestStartBoundary ?? undefined,
    before: options?.before ? new Date(options.before) : undefined,
    limit: normalizeHistoryLimit(options?.limit),
  })

  const messages = page.rows.map(mapStoredMessage).filter((m) => {
    if (requesterRole === 'DM') return canSeeMessage(m, requesterId, requesterRole, roomId)
    if (m.isOffTheRecord) return false
    return canSeeMessage(m, requesterId, requesterRole, roomId)
  })

  const nextBefore = messages.length > 0 ? messages[0]?.createdAt : options?.before
  return {
    messages,
    hasMore: page.hasMore,
    nextBefore,
  }
}

/**
 * Retrieves greenroom chat for a campaign using campaign-level queries.
 * This is optimized to a single O(1) index lookup instead of multi-session joins.
 */
export async function getCampaignGreenroomMessages(
  campaignId: UUID,
  requesterId: UUID,
  requesterRole: string,
  options?: { since?: number }
): Promise<StoredMessage[]> {
  const rows = options?.since
    ? await listCampaignMessagesSince(campaignId, new Date(options.since))
    : await listCampaignMessages(campaignId)
  const messages = rows.map(mapStoredMessage)

  return messages.filter((message) => {
    if (requesterRole === 'DM') {
      return canSeeMessage(message, requesterId, requesterRole)
    }
    if (message.isOffTheRecord) {
      return false
    }
    return canSeeMessage(message, requesterId, requesterRole)
  })
}

export async function getCampaignGreenroomMessagesPage(
  campaignId: UUID,
  requesterId: UUID,
  requesterRole: string,
  options?: ChatHistoryPageOptions & { since?: number }
): Promise<ChatHistoryPageResult> {
  const isTodayBoundedFirstPage = options?.since !== undefined && options?.before === undefined

  if (options?.limit === undefined) {
    const allMessages = await getCampaignGreenroomMessages(campaignId, requesterId, requesterRole, {
      since: options?.since,
    })

    const { hasCampaignMessagesBefore } = await import('@/repositories/chat.repository')
    const hasEarlier =
      isTodayBoundedFirstPage && options?.since !== undefined
        ? await hasCampaignMessagesBefore({
            campaignId,
            before: new Date(options.since),
          })
        : undefined

    return {
      messages: allMessages,
      hasMore: false,
      nextBefore: allMessages.length > 0 ? allMessages[0]?.createdAt : undefined,
      hasEarlier,
    }
  }

  const { hasCampaignMessagesBefore, listCampaignMessagesPage } =
    await import('@/repositories/chat.repository')

  const page = await listCampaignMessagesPage({
    campaignId,
    since: options?.since ? new Date(options.since) : undefined,
    before: options?.before ? new Date(options.before) : undefined,
    limit: normalizeHistoryLimit(options?.limit),
  })

  const messages = page.rows.map(mapStoredMessage).filter((message) => {
    if (requesterRole === 'DM') {
      return canSeeMessage(message, requesterId, requesterRole)
    }
    if (message.isOffTheRecord) {
      return false
    }
    return canSeeMessage(message, requesterId, requesterRole)
  })

  const nextBefore = messages.length > 0 ? messages[0]?.createdAt : options?.before
  const hasEarlier =
    isTodayBoundedFirstPage && options?.since !== undefined
      ? await hasCampaignMessagesBefore({
          campaignId,
          before: new Date(options.since),
        })
      : undefined

  return {
    messages,
    hasMore: page.hasMore,
    nextBefore,
    hasEarlier,
  }
}

export async function editMessage(
  messageId: UUID,
  requesterId: UUID,
  requesterRole: string,
  newContent: string
): Promise<StoredMessage | null> {
  const row = await findMessageById(messageId)
  if (!row) return null

  const message = mapStoredMessage(row)
  if (message.deletedAt !== undefined) return null
  if (message.type === MessageType.SYSTEM) return null
  if (requesterRole !== 'DM' && message.authorId !== requesterId) return null

  const editedAt = Date.now()

  const visibilityClass = toVisibilityClass({
    type: message.type,
    isDmOnly: message.isDmOnly,
    isOffTheRecord: message.isOffTheRecord,
  })

  if (message.sessionId) {
    await appendChatRuntimeEvent({
      sessionId: message.sessionId,
      messageId,
      action: 'MESSAGE_EDITED',
      roomId: message.roomId,
      authorId: requesterId,
      messageType: message.type,
      visibilityClass,
      timestamp: editedAt,
      payload: {
        editorId: requesterId,
        contentLength: newContent.length,
      },
    })

    await appendSessionAuditEvent({
      sessionId: message.sessionId,
      actorUserId: requesterId,
      actorRole: requesterRole,
      actionType: 'CHAT.MESSAGE_EDITED',
      targetType: 'MESSAGE',
      targetId: messageId,
      roomId: message.roomId,
      visibilityClass,
      timestamp: editedAt,
      metadata: {
        editorId: requesterId,
        contentLength: newContent.length,
      },
    })
  }

  await updateMessageRecord({
    messageId,
    content: newContent,
    editedAt: new Date(editedAt),
  })

  return {
    ...message,
    content: newContent,
    editedAt,
  }
}

export async function deleteMessage(
  messageId: UUID,
  requesterId: UUID,
  requesterRole: string
): Promise<StoredMessage | null> {
  const row = await findMessageById(messageId)
  if (!row) return null

  const message = mapStoredMessage(row)
  if (message.deletedAt !== undefined) return null
  if (message.type === MessageType.SYSTEM) return null
  if (requesterRole !== 'DM' && message.authorId !== requesterId) return null

  const deletedAt = Date.now()

  const visibilityClass = toVisibilityClass({
    type: message.type,
    isDmOnly: message.isDmOnly,
    isOffTheRecord: message.isOffTheRecord,
  })

  if (message.sessionId) {
    await appendChatRuntimeEvent({
      sessionId: message.sessionId,
      messageId,
      action: 'MESSAGE_DELETED',
      roomId: message.roomId,
      authorId: requesterId,
      messageType: message.type,
      visibilityClass,
      timestamp: deletedAt,
      payload: {
        deletedBy: requesterId,
      },
    })

    await appendSessionAuditEvent({
      sessionId: message.sessionId,
      actorUserId: requesterId,
      actorRole: requesterRole,
      actionType: 'CHAT.MESSAGE_DELETED',
      targetType: 'MESSAGE',
      targetId: messageId,
      roomId: message.roomId,
      visibilityClass,
      timestamp: deletedAt,
      metadata: {
        deletedBy: requesterId,
      },
    })
  }

  await softDeleteMessageRecord({
    messageId,
    deletedBy: requesterId,
    deletedAt: new Date(deletedAt),
  })

  return {
    ...message,
    deletedAt,
    deletedBy: requesterId,
  }
}

export function clearSessionMessages(sessionId: UUID): void {
  void deleteSessionMessages(sessionId)
}

export async function clearRoomMessages(sessionId: UUID, roomId: UUID): Promise<number> {
  const rows = await listSessionMessages(sessionId)

  const targetMessageIds = rows
    .map((row) => ({ id: row.id as UUID, visibility: parseVisibility(row.visibleTo) }))
    .filter((row) => row.visibility.roomId === roomId)
    .map((row) => row.id)

  for (const messageId of targetMessageIds) {
    await deleteMessageRecord(messageId)
  }

  return targetMessageIds.length
}

export async function getChatTelemetrySnapshot(): Promise<{
  totalMessages: number
  messagesLastMinute: number
  activeChatSessions: number
}> {
  return getChatCounts()
}
