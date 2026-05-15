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
  listSessionMessages,
  softDeleteMessageRecord,
  updateMessageRecord,
} from '@/repositories/chat.repository'

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
