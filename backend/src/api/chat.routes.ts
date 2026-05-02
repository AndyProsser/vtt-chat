/**
 * Chat Routes
 * REST endpoints for sending, editing, and fetching messages.
 * Stage 4: IC/OOC/Whisper message pipeline with visibility filtering.
 */

import { Router, Request, Response, NextFunction } from 'express'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { getSession } from '@/services/session.service'
import { sendMessage, editMessage, deleteMessage, getMessages } from '@/services/chat.service'
import type { StoredMessage } from '@/types/chat.types'
import { isValidUUID, isValidMessageContent, isValidMessageType } from '@shared'
import { ErrorCode } from '@shared'
import type { UUID } from '@shared'
import { MessageType, SessionState } from '@shared'
import type { EventEnvelope } from '@shared'
import type { WebSocketManager } from '@/ws'

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
    roomId: null,
    timestamp: message.createdAt,
    payload: {
      messageId: message.id,
      authorId: message.authorId,
      authorUsername: message.authorUsername,
      content: message.content,
      type: message.type,
      isDmOnly: message.isDmOnly,
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
    roomId: null,
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
    roomId: null,
    timestamp: message.deletedAt ?? Date.now(),
    payload: {
      messageId: message.id,
    },
  }
}

/**
 * POST /api/chat/message
 * Send a new message to a session.
 * - IC: DM and PLAYER only
 * - OOC: all roles
 * - WHISPER: DM and PLAYER only; requires recipientId
 * - Session must be ACTIVE
 */
router.post('/message', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { sessionId, content, type, recipientId } = req.body

    if (!isValidUUID(sessionId)) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid sessionId' })
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

    // Permission check by message type
    const role: string = user.role
    if (type === MessageType.IC && role === 'SPECTATOR') {
      return res
        .status(403)
        .json({ code: ErrorCode.FORBIDDEN, message: 'Spectators may not send IC messages' })
    }
    if (type === MessageType.WHISPER && role === 'SPECTATOR') {
      return res
        .status(403)
        .json({ code: ErrorCode.FORBIDDEN, message: 'Spectators may not send whispers' })
    }
    if (type === MessageType.SYSTEM && role !== 'DM') {
      return res
        .status(403)
        .json({ code: ErrorCode.FORBIDDEN, message: 'Only DM may send system messages' })
    }

    // Validate session exists and is ACTIVE
    const session = await getSession(sessionId as UUID)
    if (!session) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Session not found' })
    }
    if (session.state !== SessionState.ACTIVE) {
      return res.status(409).json({
        code: ErrorCode.INVALID_SESSION,
        message: 'Session is not active',
      })
    }

    // Validate WHISPER recipient
    if (type === MessageType.WHISPER) {
      if (!recipientId || !isValidUUID(recipientId)) {
        return res.status(400).json({
          code: ErrorCode.INVALID_INPUT,
          message: 'Whisper requires a valid recipientId',
          field: 'recipientId',
        })
      }
    }

    const stored = await sendMessage({
      sessionId: sessionId as UUID,
      authorId: user.userId as UUID,
      authorUsername: user.username,
      dmId: session.dmId,
      content,
      type,
      recipientId: recipientId as UUID | undefined,
    })

    // Broadcast WS:EVENT to visible clients
    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
      const event = buildMessageSentEvent(stored, user.userId as UUID, user.role)
      wsManager.broadcastEventToSession(sessionId as UUID, event, stored.visibleTo)
    }

    return res.status(201).json({ message: stored })
  } catch {
    return internalErrorResponse(res)
  }
})

/**
 * GET /api/chat/messages/:sessionId
 * Retrieve message history for a session (visibility-filtered).
 */
router.get('/messages/:sessionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { sessionId } = req.params

    if (!isValidUUID(sessionId)) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid sessionId' })
    }

    const session = await getSession(sessionId as UUID)
    if (!session) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Session not found' })
    }

    const messages = await getMessages(sessionId as UUID, user.userId as UUID, user.role)
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

    // Broadcast edit event to session (same visibility as original)
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

    // Broadcast deletion event to all in session (everyone knows a message was deleted)
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
