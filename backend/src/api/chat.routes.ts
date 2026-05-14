/**
 * Chat Routes
 * REST endpoints for sending, editing, and fetching messages.
 * IC/OOC/Whisper message pipeline with visibility filtering.
 */

import { Router, Request, Response, NextFunction } from 'express'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { getSession } from '@/services/session.service'
import { sendMessage, editMessage, deleteMessage, getMessages } from '@/services/chat.service'
import { getRoom, getSessionPresence } from '@/services/room.service'
import type { StoredMessage } from '@/types/chat.types'
import { isValidUUID, isValidMessageContent, isValidMessageType } from '@shared'
import { ErrorCode } from '@shared'
import type { UUID } from '@shared'
import { MessageType, SessionState } from '@shared'
import type { EventEnvelope } from '@shared'
import type { WebSocketManager } from '@/ws'
import { resolveEffectiveSessionRole } from '@/services/session/authz.service'
import { resolveEffectiveActor } from '@/services/dev-mock/takeover.service'

const router = Router()

/**
 * Middleware: Verify auth token
 */
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractTokenFromHeader(req.headers.authorization)
  if (!token) {
    return res
      .status(401)
      .json({ code: ErrorCode.UNAUTHORIZED, message: 'Missing Authorization header' })
  }

  const user = verifyToken(token)
  if (!user) {
    return res
      .status(401)
      .json({ code: ErrorCode.UNAUTHORIZED, message: 'Authentication required' })
  }

  ;(req as any).user = user
  next()
}

function internalErrorResponse(res: Response) {
  return res.status(500).json({ code: ErrorCode.INTERNAL_ERROR, message: 'Internal server error' })
}

function isGreenRoomName(name: string): boolean {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ')
  return normalized === 'green room' || normalized === 'green-room'
}

/**
 * Build a CHAT:MESSAGE_SENT event envelope for WS broadcast.
 */
function buildMessageSentEvent(
  message: StoredMessage,
  userId: UUID,
  userRole: string
): EventEnvelope {
  return {
    id: crypto.randomUUID() as UUID,
    type: 'CHAT:MESSAGE_SENT',
    version: 1,
    userId,
    userRole: userRole as any,
    sessionId: message.sessionId,
    roomId: message.roomId || null,
    timestamp: message.createdAt,
    payload: {
      messageId: message.id,
      roomId: message.roomId,
      authorId: message.authorId,
      authorUsername: message.authorUsername,
      content: message.content,
      type: message.type,
      isDmOnly: message.isDmOnly,
      isOffTheRecord: message.isOffTheRecord,
      visibleTo: message.visibleTo,
    },
  }
}

function buildMessageEditedEvent(
  message: StoredMessage,
  userId: UUID,
  userRole: string
): EventEnvelope {
  return {
    id: crypto.randomUUID() as UUID,
    type: 'CHAT:MESSAGE_EDITED',
    version: 1,
    userId,
    userRole: userRole as any,
    sessionId: message.sessionId,
    roomId: message.roomId || null,
    timestamp: message.editedAt ?? Date.now(),
    payload: {
      messageId: message.id,
      content: message.content,
    },
  }
}

function buildMessageDeletedEvent(
  message: StoredMessage,
  requesterId: UUID,
  userRole: string
): EventEnvelope {
  return {
    id: crypto.randomUUID() as UUID,
    type: 'CHAT:MESSAGE_DELETED',
    version: 1,
    userId: requesterId,
    userRole: userRole as any,
    sessionId: message.sessionId,
    roomId: message.roomId || null,
    timestamp: message.deletedAt ?? Date.now(),
    payload: {
      messageId: message.id,
    },
  }
}

/**
 * POST /api/chat/message
 * Send a new message to a room-scoped chat stream.
 */
router.post('/message', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { sessionId, roomId, content, type, recipientId } = req.body

    if (!isValidUUID(sessionId)) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid sessionId' })
    }

    if (!isValidUUID(roomId)) {
      return res.status(400).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'Invalid roomId',
        field: 'roomId',
      })
    }

    if (!isValidMessageContent(content)) {
      return res.status(400).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'Invalid message content (1–4000 characters)',
        field: 'content',
      })
    }

    if (!isValidMessageType(type)) {
      return res.status(400).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'Invalid message type (IC, OOC, WHISPER)',
        field: 'type',
      })
    }

    const session = await getSession(sessionId as UUID)
    if (!session) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Session not found' })
    }

    const authz = await resolveEffectiveSessionRole({
      sessionId: sessionId as UUID,
      userId: user.userId as UUID,
    })
    if (!authz.ok) {
      return res.status(403).json({
        code: authz.code === 'SESSION_NOT_FOUND' ? ErrorCode.NOT_FOUND : ErrorCode.FORBIDDEN,
        message: authz.message,
      })
    }
    const requesterRole = authz.role

    if (type === MessageType.IC && requesterRole === 'SPECTATOR') {
      return res
        .status(403)
        .json({ code: ErrorCode.FORBIDDEN, message: 'Spectators may not send IC messages' })
    }
    if (type === MessageType.WHISPER && requesterRole === 'SPECTATOR') {
      return res
        .status(403)
        .json({ code: ErrorCode.FORBIDDEN, message: 'Spectators may not send whispers' })
    }
    if (type === MessageType.SYSTEM && requesterRole !== 'DM') {
      return res
        .status(403)
        .json({ code: ErrorCode.FORBIDDEN, message: 'Only DM may send system messages' })
    }

    const room = await getRoom(roomId as UUID)
    if (!room || room.sessionId !== (sessionId as UUID)) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Room not found' })
    }

    if (session.state === SessionState.PAUSED) {
      return res.status(409).json({
        code: ErrorCode.INVALID_SESSION,
        message: 'Chat is disabled during intermission',
      })
    }

    if (room.type === 'PRIVATE') {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'Whisper bubble does not allow chat logging or message persistence',
      })
    }

    if (requesterRole !== 'DM') {
      const presence = await getSessionPresence(sessionId as UUID)
      const requesterPresence = presence.find((entry) => entry.userId === (user.userId as UUID))
      if (!requesterPresence || requesterPresence.primaryRoomId !== (roomId as UUID)) {
        return res.status(403).json({
          code: ErrorCode.FORBIDDEN,
          message: 'You may only chat in your current room',
        })
      }
    }

    const allowGreenroomChatOutsideActive =
      room.type === 'GROUP' && isGreenRoomName(room.name) && session.state !== SessionState.ACTIVE

    if (isGreenRoomName(room.name) && type !== MessageType.OOC) {
      return res.status(400).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'Greenroom chat only supports OOC messages',
        field: 'type',
      })
    }

    if (session.state !== SessionState.ACTIVE && !allowGreenroomChatOutsideActive) {
      return res.status(409).json({
        code: ErrorCode.INVALID_SESSION,
        message: 'Chat is only available in greenroom before or after active play',
      })
    }

    if (type === MessageType.WHISPER) {
      if (!recipientId || !isValidUUID(recipientId)) {
        return res.status(400).json({
          code: ErrorCode.INVALID_INPUT,
          message: 'Whisper requires a valid recipientId',
          field: 'recipientId',
        })
      }
    }

    const effective = await resolveEffectiveActor({
      sessionId: sessionId as UUID,
      actorUserId: user.userId as UUID,
      actorUsername: user.username,
    })

    const stored = await sendMessage({
      sessionId: sessionId as UUID,
      roomId: roomId as UUID,
      authorId: effective.userId,
      authorUsername: effective.username,
      dmId: session.dmId,
      content,
      type,
      recipientId: recipientId as UUID | undefined,
    })

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
      const event = buildMessageSentEvent(stored, effective.userId, requesterRole)
      wsManager.broadcastEventToSession(sessionId as UUID, event, stored.visibleTo)
    }

    return res.status(201).json({ message: stored })
  } catch {
    return internalErrorResponse(res)
  }
})

/**
 * GET /api/chat/messages/:sessionId
 * Retrieve message history for a room in a session.
 */
router.get('/messages/:sessionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { sessionId } = req.params
    const roomId = req.query.roomId

    if (!isValidUUID(sessionId)) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid sessionId' })
    }

    if (!isValidUUID(roomId)) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid roomId' })
    }

    const session = await getSession(sessionId as UUID)
    if (!session) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Session not found' })
    }

    const authz = await resolveEffectiveSessionRole({
      sessionId: sessionId as UUID,
      userId: user.userId as UUID,
    })
    if (!authz.ok) {
      return res.status(403).json({
        code: authz.code === 'SESSION_NOT_FOUND' ? ErrorCode.NOT_FOUND : ErrorCode.FORBIDDEN,
        message: authz.message,
      })
    }
    const requesterRole = authz.role

    const room = await getRoom(roomId as UUID)
    if (!room || room.sessionId !== (sessionId as UUID)) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Room not found' })
    }

    if (room.type === 'PRIVATE') {
      return res.status(200).json({ messages: [] })
    }

    if (requesterRole !== 'DM') {
      const presence = await getSessionPresence(sessionId as UUID)
      const requesterPresence = presence.find((entry) => entry.userId === (user.userId as UUID))
      if (!requesterPresence || requesterPresence.primaryRoomId !== (roomId as UUID)) {
        return res.status(403).json({
          code: ErrorCode.FORBIDDEN,
          message: 'You may only view chat in your current room',
        })
      }
    }

    const messages = await getMessages(
      sessionId as UUID,
      user.userId as UUID,
      requesterRole,
      roomId as UUID
    )
    return res.status(200).json({ messages })
  } catch {
    return internalErrorResponse(res)
  }
})

/**
 * PUT /api/chat/message/:id
 * Edit a message (author or DM only).
 */
router.put('/message/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { id } = req.params
    const { content } = req.body

    if (!isValidUUID(id)) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid message id' })
    }

    if (!isValidMessageContent(content)) {
      return res.status(400).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'Invalid message content (1–4000 characters)',
        field: 'content',
      })
    }

    const updated = await editMessage(id as UUID, user.userId as UUID, user.role, content)
    if (!updated) {
      return res
        .status(403)
        .json({ code: ErrorCode.FORBIDDEN, message: 'Cannot edit this message' })
    }

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
      const event = buildMessageEditedEvent(updated, user.userId as UUID, user.role)
      wsManager.broadcastEventToSession(updated.sessionId, event, updated.visibleTo)
    }

    return res.status(200).json({ message: updated })
  } catch {
    return internalErrorResponse(res)
  }
})

/**
 * DELETE /api/chat/message/:id
 * Soft-delete a message (author or DM only).
 */
router.delete('/message/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { id } = req.params

    if (!isValidUUID(id)) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid message id' })
    }

    const deleted = await deleteMessage(id as UUID, user.userId as UUID, user.role)
    if (!deleted) {
      return res
        .status(403)
        .json({ code: ErrorCode.FORBIDDEN, message: 'Cannot delete this message' })
    }

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
      const event = buildMessageDeletedEvent(deleted, user.userId as UUID, user.role)
      wsManager.broadcastEventToSession(deleted.sessionId, event)
    }

    return res.status(200).json({ ok: true })
  } catch {
    return internalErrorResponse(res)
  }
})

export default router
