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
  deleteSessionMessages,
  findMessageById,
  getChatCounts,
  listSessionMessages,
  softDeleteMessageRecord,
  updateMessageRecord,
} from '@/repositories/chat.repository'

function parseUUIDArray(value: unknown): UUID[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is UUID => typeof item === 'string')
}

function computeVisibility(
  type: MessageType,
  authorId: UUID,
  dmId: UUID,
  recipientId?: UUID
): UUID[] | undefined {
  if (type !== MessageType.WHISPER) return undefined
  const visibleTo = new Set<UUID>([authorId, dmId])
  if (recipientId) visibleTo.add(recipientId)
  return Array.from(visibleTo)
}

function mapStoredMessage(row: {
  id: string
  sessionId: string
  authorId: string
  authorUsername: string
  content: string
  type: 'IC' | 'OOC' | 'WHISPER' | 'SYSTEM'
  isDmOnly: boolean
  visibleTo: unknown
  createdAt: Date
  editedAt: Date | null
  deletedAt: Date | null
  deletedBy: string | null
}): StoredMessage {
  return {
    id: row.id as UUID,
    sessionId: row.sessionId as UUID,
    authorId: row.authorId as UUID,
    authorUsername: row.authorUsername,
    content: row.content,
    type: row.type as MessageType,
    isDmOnly: row.isDmOnly,
    visibleTo: parseUUIDArray(row.visibleTo),
    createdAt: row.createdAt.getTime(),
    editedAt: row.editedAt?.getTime(),
    deletedAt: row.deletedAt?.getTime(),
    deletedBy: row.deletedBy ? (row.deletedBy as UUID) : undefined,
  }
}

export function canSeeMessage(
  message: StoredMessage,
  requesterId: UUID,
  requesterRole: string
): boolean {
  if (message.deletedAt !== undefined) return false
  if (requesterRole === 'DM') return true
  if (!message.visibleTo) return true
  return message.visibleTo.includes(requesterId)
}

export async function sendMessage(params: {
  sessionId: UUID
  authorId: UUID
  authorUsername: string
  dmId: UUID
  content: string
  type: MessageType
  recipientId?: UUID
}): Promise<StoredMessage> {
  const { sessionId, authorId, authorUsername, dmId, content, type, recipientId } = params

  const id = crypto.randomUUID() as UUID
  const visibleTo = computeVisibility(type, authorId, dmId, recipientId)

  const message: StoredMessage = {
    id,
    sessionId,
    authorId,
    authorUsername,
    content,
    type,
    isDmOnly: type === MessageType.WHISPER,
    visibleTo,
    createdAt: Date.now(),
  }

  await createChatMessageRecord({
    id,
    sessionId,
    authorId,
    authorUsername,
    content,
    type,
    isDmOnly: message.isDmOnly,
    visibleTo,
    createdAt: new Date(message.createdAt),
  })

  return message
}

export async function getMessages(
  sessionId: UUID,
  requesterId: UUID,
  requesterRole: string
): Promise<StoredMessage[]> {
  const rows = await listSessionMessages(sessionId)
  const messages = rows.map(mapStoredMessage)
  return messages.filter((m) => canSeeMessage(m, requesterId, requesterRole))
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

export async function getChatTelemetrySnapshot(): Promise<{
  totalMessages: number
  messagesLastMinute: number
  activeChatSessions: number
}> {
  return getChatCounts()
}
