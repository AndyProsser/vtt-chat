/**
 * Chat Service
 * In-memory message store with visibility filtering.
 * Stage 4: IC/OOC/Whisper message pipeline.
 * Reference: docs/subsystems/CHAT-SYSTEM.md
 */

import { MessageType } from '@shared'
import type { UUID } from '@shared'

export interface StoredMessage {
  id: UUID
  sessionId: UUID
  authorId: UUID
  authorUsername: string
  content: string
  type: MessageType
  isDmOnly: boolean
  /** Populated for WHISPER: set of user IDs that may see this message */
  visibleTo?: UUID[]
  createdAt: number
  editedAt?: number
  deletedAt?: number
  deletedBy?: UUID
}

// In-memory store: sessionId → message map
const messageStore = new Map<UUID, Map<UUID, StoredMessage>>()

function getSessionMessages(sessionId: UUID): Map<UUID, StoredMessage> {
  if (!messageStore.has(sessionId)) {
    messageStore.set(sessionId, new Map())
  }
  return messageStore.get(sessionId)!
}

/**
 * Compute the set of user IDs that can see a message.
 * Returns undefined for non-whisper messages (visible to all).
 */
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

/**
 * Returns true if the given user can see the message.
 */
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

/**
 * Send a new message. Returns the stored message and the visibleTo filter
 * (undefined = visible to all in session).
 */
export function sendMessage(params: {
  sessionId: UUID
  authorId: UUID
  authorUsername: string
  dmId: UUID
  content: string
  type: MessageType
  recipientId?: UUID
}): StoredMessage {
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

  getSessionMessages(sessionId).set(id, message)
  return message
}

/**
 * Get all messages visible to the requesting user in a session.
 */
export function getMessages(
  sessionId: UUID,
  requesterId: UUID,
  requesterRole: string
): StoredMessage[] {
  const messages = getSessionMessages(sessionId)
  return Array.from(messages.values()).filter((m) => canSeeMessage(m, requesterId, requesterRole))
}

/**
 * Edit a message. Returns the updated message or null if not found/unauthorized.
 */
export function editMessage(
  messageId: UUID,
  requesterId: UUID,
  requesterRole: string,
  newContent: string
): StoredMessage | null {
  for (const [, messages] of messageStore) {
    const message = messages.get(messageId)
    if (!message) continue
    if (message.deletedAt !== undefined) return null
    if (requesterRole !== 'DM' && message.authorId !== requesterId) return null

    const updated: StoredMessage = {
      ...message,
      content: newContent,
      editedAt: Date.now(),
    }
    messages.set(messageId, updated)
    return updated
  }
  return null
}

/**
 * Soft-delete a message. Returns the updated message or null if not found/unauthorized.
 */
export function deleteMessage(
  messageId: UUID,
  requesterId: UUID,
  requesterRole: string
): StoredMessage | null {
  for (const [, messages] of messageStore) {
    const message = messages.get(messageId)
    if (!message) continue
    if (message.deletedAt !== undefined) return null
    if (requesterRole !== 'DM' && message.authorId !== requesterId) return null

    const deleted: StoredMessage = {
      ...message,
      deletedAt: Date.now(),
      deletedBy: requesterId,
    }
    messages.set(messageId, deleted)
    return deleted
  }
  return null
}

/**
 * Clear all messages for a session (e.g. on session end).
 */
export function clearSessionMessages(sessionId: UUID): void {
  messageStore.delete(sessionId)
}
