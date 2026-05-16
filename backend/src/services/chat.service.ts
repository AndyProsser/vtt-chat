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
  findMessageById,
  getChatCounts,
  listMessagesBySessionIdsPage,
  listMessagesBySessionIds,
  listSessionMessagesPage,
  listSessionMessages,
  softDeleteMessageRecord,
  updateMessageRecord,
} from '@/repositories/chat.repository'
import { findSessionById, listSessionsByCampaign } from '@/repositories/session.repository'
import { listCampaignGroupRooms } from '@/repositories/room.repository'

const SYSTEM_CHAT_AUTHOR_ID = '00000000-0000-0000-0000-000000000000' as UUID
const SYSTEM_CHAT_AUTHOR_USERNAME = 'SYSTEM'

interface ChatVisibilityPayload {
  visibleTo?: UUID[]
  roomId?: UUID
  targetIds?: UUID[]
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

  if (visibleAudience && visibleAudience.length > 0) {
    visibility.visibleTo = Array.from(new Set(visibleAudience))
  }

  if (type !== MessageType.WHISPER) {
    return visibility
  }

  const visibleTo = new Set<UUID>([authorId, dmId])
  if (recipientId) visibleTo.add(recipientId)
  visibility.visibleTo = Array.from(visibleTo)
  visibility.targetIds = recipientId ? [recipientId] : undefined

  return visibility
}

function isGreenRoomName(name: string): boolean {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ')
  return normalized === 'green room' || normalized === 'green-room'
}

export interface ChatHistoryPageOptions {
  before?: number
  limit?: number
}

export interface ChatHistoryPageResult {
  messages: StoredMessage[]
  hasMore: boolean
  nextBefore?: number
}

function normalizeHistoryLimit(limit?: number): number {
  if (!Number.isFinite(limit) || !limit) {
    return 20
  }

  return Math.max(1, Math.min(100, Math.floor(limit)))
}

function mapStoredMessage(row: {
  id: string
  sessionId: string
  authorId: string
  authorUsername: string
  content: string
  type: 'IC' | 'OOC' | 'WHISPER' | 'SYSTEM'
  isDmOnly: boolean
  isOffTheRecord: boolean
  visibleTo: unknown
  createdAt: Date
  editedAt: Date | null
  deletedAt: Date | null
  deletedBy: string | null
}): StoredMessage {
  const visibility = parseVisibility(row.visibleTo)

  return {
    id: row.id as UUID,
    sessionId: row.sessionId as UUID,
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

  const message: StoredMessage = {
    id,
    sessionId,
    roomId,
    authorId: resolvedAuthorId,
    authorUsername: resolvedAuthorUsername,
    content,
    type,
    isDmOnly: type === MessageType.WHISPER,
    isOffTheRecord: isOffTheRecord ?? false,
    visibleTo: visibility.visibleTo,
    targetIds: visibility.targetIds,
    createdAt: Date.now(),
  }

  await createChatMessageRecord({
    id,
    sessionId,
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

export async function getMessages(
  sessionId: UUID,
  requesterId: UUID,
  requesterRole: string,
  roomId?: UUID
): Promise<StoredMessage[]> {
  const rows = await listSessionMessages(sessionId)
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
  if (options?.limit === undefined) {
    const allMessages = await getMessages(sessionId, requesterId, requesterRole, roomId)
    return {
      messages: allMessages,
      hasMore: false,
      nextBefore: allMessages.length > 0 ? allMessages[0]?.createdAt : undefined,
    }
  }

  const page = await listSessionMessagesPage({
    sessionId,
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
 * Retrieves merged greenroom chat across all sessions in the same campaign.
 * If the session is standalone (no campaign), this falls back to the session-scoped query.
 */
export async function getCampaignGreenroomMessages(
  sessionId: UUID,
  requesterId: UUID,
  requesterRole: string,
  roomId: UUID
): Promise<StoredMessage[]> {
  const session = await findSessionById(sessionId)
  if (!session?.campaignId) {
    return getMessages(sessionId, requesterId, requesterRole, roomId)
  }

  const [campaignSessions, campaignGroupRooms] = await Promise.all([
    listSessionsByCampaign(session.campaignId),
    listCampaignGroupRooms(session.campaignId),
  ])

  const greenroomRoomIds = new Set(
    campaignGroupRooms.filter((room) => isGreenRoomName(room.name)).map((room) => room.id as UUID)
  )

  if (!greenroomRoomIds.has(roomId)) {
    return getMessages(sessionId, requesterId, requesterRole, roomId)
  }

  if (greenroomRoomIds.size === 0) {
    return []
  }

  const campaignSessionIds = Array.from(new Set(campaignSessions.map((item) => item.id)))
  const rows = await listMessagesBySessionIds(campaignSessionIds)
  const messages = rows
    .map(mapStoredMessage)
    .filter((message) => message.roomId && greenroomRoomIds.has(message.roomId))

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
  sessionId: UUID,
  requesterId: UUID,
  requesterRole: string,
  roomId: UUID,
  options?: ChatHistoryPageOptions
): Promise<ChatHistoryPageResult> {
  if (options?.limit === undefined) {
    const allMessages = await getCampaignGreenroomMessages(
      sessionId,
      requesterId,
      requesterRole,
      roomId
    )
    return {
      messages: allMessages,
      hasMore: false,
      nextBefore: allMessages.length > 0 ? allMessages[0]?.createdAt : undefined,
    }
  }

  const session = await findSessionById(sessionId)
  if (!session?.campaignId) {
    return getMessagesPage(sessionId, requesterId, requesterRole, roomId, options)
  }

  const [campaignSessions, campaignGroupRooms] = await Promise.all([
    listSessionsByCampaign(session.campaignId),
    listCampaignGroupRooms(session.campaignId),
  ])

  const greenroomRoomIds = new Set(
    campaignGroupRooms.filter((room) => isGreenRoomName(room.name)).map((room) => room.id as UUID)
  )

  if (!greenroomRoomIds.has(roomId)) {
    return getMessagesPage(sessionId, requesterId, requesterRole, roomId, options)
  }

  if (greenroomRoomIds.size === 0) {
    return { messages: [], hasMore: false }
  }

  const campaignSessionIds = Array.from(new Set(campaignSessions.map((item) => item.id)))
  const page = await listMessagesBySessionIdsPage({
    sessionIds: campaignSessionIds,
    before: options?.before ? new Date(options.before) : undefined,
    limit: normalizeHistoryLimit(options?.limit),
  })

  const messages = page.rows
    .map(mapStoredMessage)
    .filter((message) => message.roomId && greenroomRoomIds.has(message.roomId))
    .filter((message) => {
      if (requesterRole === 'DM') {
        return canSeeMessage(message, requesterId, requesterRole)
      }
      if (message.isOffTheRecord) {
        return false
      }
      return canSeeMessage(message, requesterId, requesterRole)
    })

  const nextBefore = messages.length > 0 ? messages[0]?.createdAt : options?.before
  return {
    messages,
    hasMore: page.hasMore,
    nextBefore,
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
