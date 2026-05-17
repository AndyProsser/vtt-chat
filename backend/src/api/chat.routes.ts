/**
 * Chat Routes
 * REST endpoints for sending, editing, and fetching messages.
 * IC/OOC/Whisper message pipeline with visibility filtering.
 */

import { Router, Request, Response, NextFunction } from 'express'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { getSession } from '@/services/session/core.service'
import { findSessionById } from '@/repositories/session.repository'
import { sendMessage, editMessage, deleteMessage, getMessagesPage } from '@/services/chat.service'
import { getRoom, getSessionPresence } from '@/services/room.service'
import { resolveRoomAudience, uniqueVisibleAudience } from '@/services/chat-visibility.service'
import type { StoredMessage } from '@/types/chat.types'
import { isValidUUID, isValidMessageContent, isValidMessageType } from '@shared'
import { ErrorCode } from '@shared'
import type { UUID } from '@shared'
import { MessageType, RoomType, SessionState } from '@shared'
import type { EventEnvelope } from '@shared'
import type { WebSocketManager } from '@/ws'
import { resolveEffectiveSessionRole } from '@/services/session/authz.service'
import { resolveEffectiveActor } from '@/services/dev-mock/takeover.service'
import { isGreenRoomName } from '@/utils'

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
    sessionId: message.sessionId as UUID,
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
      targetIds: message.targetIds,
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
    sessionId: message.sessionId as UUID,
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
    sessionId: message.sessionId as UUID,
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

    const effective = await resolveEffectiveActor({
      sessionId: sessionId as UUID,
      actorUserId: user.userId as UUID,
      actorUsername: user.username,
    })

    const authz = await resolveEffectiveSessionRole({
      sessionId: sessionId as UUID,
      userId: effective.userId,
    })
    if (!authz.ok) {
      return res.status(403).json({
        code: authz.code === 'SESSION_NOT_FOUND' ? ErrorCode.NOT_FOUND : ErrorCode.FORBIDDEN,
        message: authz.message,
      })
    }
    const requesterRole = authz.role

    if ((type === MessageType.IC || type === MessageType.DM) && requesterRole === 'SPECTATOR') {
      return res
        .status(403)
        .json({ code: ErrorCode.FORBIDDEN, message: 'Spectators may not send chat messages' })
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
      if (type !== MessageType.WHISPER) {
        return res.status(403).json({
          code: ErrorCode.FORBIDDEN,
          message: 'Whisper bubble only allows whisper messages',
        })
      }
    }

    if (requesterRole !== 'DM') {
      const presence = await getSessionPresence(sessionId as UUID)
      const requesterPresence = presence.find((entry) => entry.userId === effective.userId)
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

    if (room.type === RoomType.PRIVATE && type !== MessageType.WHISPER) {
      return res.status(400).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'Whisper group chat only supports whisper messages',
        field: 'type',
      })
    }

    if (session.state !== SessionState.ACTIVE && !allowGreenroomChatOutsideActive) {
      return res.status(409).json({
        code: ErrorCode.INVALID_SESSION,
        message: 'Chat is only available in greenroom before or after active play',
      })
    }

    if (type === MessageType.WHISPER && room.type !== RoomType.PRIVATE) {
      if (!recipientId || !isValidUUID(recipientId)) {
        return res.status(400).json({
          code: ErrorCode.INVALID_INPUT,
          message: 'Whisper requires a valid recipientId',
          field: 'recipientId',
        })
      }
    }

    let visibleTo: UUID[] | undefined
    let isOffTheRecord = false
    if (type === MessageType.WHISPER && room.type === RoomType.PRIVATE) {
      visibleTo = await resolveRoomAudience({
        sessionId: sessionId as UUID,
        roomId: roomId as UUID,
        dmId: session.dmId,
      })
      isOffTheRecord = true
    } else if (type === MessageType.WHISPER) {
      const presence = await getSessionPresence(sessionId as UUID)
      const recipientPresence = presence.find((entry) => entry.userId === (recipientId as UUID))
      const recipientIsDm = (recipientId as UUID) === session.dmId
      const recipientInCurrentRoom = recipientPresence?.primaryRoomId === (roomId as UUID)

      if (!recipientIsDm && !recipientInCurrentRoom) {
        return res.status(403).json({
          code: ErrorCode.FORBIDDEN,
          message: 'Whispers may only target the DM or users in your current room',
        })
      }

      visibleTo = uniqueVisibleAudience([effective.userId, session.dmId, recipientId as UUID])
    } else if (type === MessageType.DM) {
      visibleTo = uniqueVisibleAudience([effective.userId, session.dmId])
    } else {
      visibleTo = await resolveRoomAudience({
        sessionId: sessionId as UUID,
        roomId: roomId as UUID,
        dmId: session.dmId,
      })
    }

    const stored = await sendMessage({
      sessionId: sessionId as UUID,
      roomId: roomId as UUID,
      authorId: effective.userId,
      authorUsername: effective.username,
      actorRole: requesterRole,
      dmId: session.dmId,
      content,
      type,
      recipientId: recipientId as UUID | undefined,
      visibleTo,
      isOffTheRecord,
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
    const limitRaw = req.query.limit
    const beforeRaw = req.query.before
    const sinceLatestStartRaw = req.query.sinceLatestStart

    if (!isValidUUID(sessionId)) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid sessionId' })
    }

    if (roomId !== undefined && !isValidUUID(roomId)) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid roomId' })
    }

    if (limitRaw !== undefined && Number.isNaN(Number(limitRaw))) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid limit' })
    }

    if (beforeRaw !== undefined && Number.isNaN(Number(beforeRaw))) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid before' })
    }

    const session = await getSession(sessionId as UUID)
    if (!session) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Session not found' })
    }

    const effective = await resolveEffectiveActor({
      sessionId: sessionId as UUID,
      actorUserId: user.userId as UUID,
      actorUsername: user.username,
    })

    const authz = await resolveEffectiveSessionRole({
      sessionId: sessionId as UUID,
      userId: effective.userId,
    })
    if (!authz.ok) {
      return res.status(403).json({
        code: authz.code === 'SESSION_NOT_FOUND' ? ErrorCode.NOT_FOUND : ErrorCode.FORBIDDEN,
        message: authz.message,
      })
    }
    const requesterRole = authz.role

    if (roomId !== undefined) {
      const room = await getRoom(roomId as UUID)
      if (!room || room.sessionId !== (sessionId as UUID)) {
        return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Room not found' })
      }

      if (room.type === 'PRIVATE') {
        return res.status(200).json({ messages: [] })
      }
    }

    if (requesterRole !== 'DM' && roomId !== undefined) {
      const presence = await getSessionPresence(sessionId as UUID)
      const requesterPresence = presence.find((entry) => entry.userId === effective.userId)
      if (!requesterPresence || requesterPresence.primaryRoomId !== (roomId as UUID)) {
        return res.status(403).json({
          code: ErrorCode.FORBIDDEN,
          message: 'You may only view chat in your current room',
        })
      }
    }

    const parsedLimit = limitRaw !== undefined ? Number(limitRaw) : undefined
    const parsedBefore = beforeRaw !== undefined ? Number(beforeRaw) : undefined
    const sinceLatestStart =
      sinceLatestStartRaw === '1' || sinceLatestStartRaw === 'true' || sinceLatestStartRaw === 'yes'

    // Session-scoped chat only (greenroom now uses separate campaign endpoints)
    const page = await getMessagesPage(
      sessionId as UUID,
      effective.userId,
      requesterRole,
      roomId !== undefined ? (roomId as UUID) : undefined,
      {
        limit: parsedLimit,
        before: parsedBefore,
        sinceLatestStart,
      }
    )
    return res.status(200).json({
      messages: page.messages,
      pagination: {
        hasMore: page.hasMore,
        nextBefore: page.nextBefore,
      },
    })
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
      if (updated.sessionId) {
        wsManager.broadcastEventToSession(updated.sessionId, event, updated.visibleTo)
      }
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
      if (deleted.sessionId) {
        wsManager.broadcastEventToSession(deleted.sessionId, event)
      }
    }

    return res.status(200).json({ ok: true })
  } catch {
    return internalErrorResponse(res)
  }
})

/**
 * GET /campaign/:campaignId/chat
 * Get all campaign greenroom messages (campaign-scoped, OOC only, persistent across sessions)
 */
router.get('/campaign/:campaignId/chat', requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params
    const sessionIdRaw = req.query.sessionId
    const user = (req as any).user

    if (!isValidUUID(campaignId as string)) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId' })
    }

    let since: number | undefined
    if (sessionIdRaw !== undefined) {
      if (!isValidUUID(sessionIdRaw)) {
        return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid sessionId' })
      }

      const session = await findSessionById(sessionIdRaw as UUID)
      if (!session || session.campaignId !== (campaignId as UUID)) {
        return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Session not found' })
      }

      since = session.startedAt ? session.startedAt.getTime() : undefined
    }

    const { getCampaignGreenroomMessages } = await import('@/services/chat.service')
    const messages = await getCampaignGreenroomMessages(
      campaignId as UUID,
      user.userId as UUID,
      user.role,
      {
        since,
      }
    )

    return res.status(200).json({ messages })
  } catch {
    return internalErrorResponse(res)
  }
})

/**
 * GET /campaign/:campaignId/chat/page
 * Get paginated campaign greenroom messages
 */
router.get('/campaign/:campaignId/chat/page', requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params
    const { before, limit, sessionId } = req.query
    const user = (req as any).user

    if (!isValidUUID(campaignId as string)) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId' })
    }

    let since: number | undefined
    if (sessionId !== undefined) {
      if (!isValidUUID(sessionId)) {
        return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid sessionId' })
      }

      const session = await findSessionById(sessionId as UUID)
      if (!session || session.campaignId !== (campaignId as UUID)) {
        return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Session not found' })
      }

      since = session.startedAt ? session.startedAt.getTime() : undefined
    }

    const { getCampaignGreenroomMessagesPage } = await import('@/services/chat.service')
    const result = await getCampaignGreenroomMessagesPage(
      campaignId as UUID,
      user.userId as UUID,
      user.role,
      {
        before: before ? parseInt(before as string) : undefined,
        limit: limit ? parseInt(limit as string) : 20,
        since,
      }
    )

    return res.status(200).json(result)
  } catch {
    return internalErrorResponse(res)
  }
})

/**
 * POST /campaign/:campaignId/chat
 * Send a message to the campaign greenroom (OOC-only, visible to all campaign members)
 */
router.post('/campaign/:campaignId/chat', requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params
    const { content } = req.body
    const user = (req as any).user

    if (!isValidUUID(campaignId as string)) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId' })
    }

    if (!isValidMessageContent(content)) {
      return res
        .status(400)
        .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid message content' })
    }

    // Verify the sender is a campaign member (spectators cannot post to greenroom)
    const { isUserInCampaign, getCampaignDmId } = await import('@/repositories/campaign.repository')
    const isMember = await isUserInCampaign({
      userId: user.userId as string,
      campaignId: campaignId as string,
    })
    if (!isMember) {
      return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a campaign member' })
    }

    // Resolve the campaign DM for visibility computation
    const dmId = await getCampaignDmId(campaignId as string)
    if (!dmId) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
    }

    const { sendCampaignGreenroomMessage } = await import('@/services/chat.service')
    const message = await sendCampaignGreenroomMessage({
      campaignId: campaignId as UUID,
      authorId: user.userId as UUID,
      authorUsername: user.username,
      dmId: dmId as UUID,
      content,
    })

    // Broadcast to all campaign members via campaign-scoped WS delivery
    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
      const event: EventEnvelope = {
        id: crypto.randomUUID() as UUID,
        type: 'CHAT:MESSAGE_SENT',
        version: 1,
        userId: user.userId as UUID,
        userRole: user.role as any,
        sessionId: null as any,
        roomId: null,
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
          targetIds: message.targetIds,
        },
      }
      await wsManager.broadcastToCampaignMembers(campaignId as UUID, event)
    }

    return res.status(201).json(message)
  } catch {
    return internalErrorResponse(res)
  }
})

export default router
