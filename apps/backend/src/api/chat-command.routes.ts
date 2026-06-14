/**
 * Chat Command Routes
 * Handles slash commands that require server-side execution.
 * Currently handles /roll (dice rolling). Other commands (/me, /OOC, /dm, /whisper)
 * are translated client-side into standard message types before hitting /api/chat/message.
 *
 * All commands are re-validated server-side for role and session state regardless of
 * what the client claims.
 */

import { Router, Request, Response, NextFunction } from 'express'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { getSession } from '@/services/session/core.service'
import { sendMessage } from '@/services/chat.service'
import { getRoom, getSessionPresence } from '@/services/room.service'
import { resolveRoomAudience } from '@/services/chat-visibility.service'
import { resolveEffectiveSessionRole } from '@/services/session/authz.service'
import { resolveEffectiveActor } from '@/services/dev-mock/takeover.service'
import { rollDice } from '@/utils/dice'
import { isValidUUID } from '@shared'
import { ErrorCode } from '@shared'
import { MessageType, SessionState, Role } from '@shared'
import type { UUID } from '@shared'
import type { EventEnvelope } from '@shared'
import type { WebSocketManager } from '@/ws'
import type { StoredMessage } from '@/types/chat.types'

const router = Router()

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
      metadata: message.metadata,
    },
  }
}

/**
 * POST /api/chat/command
 * Execute a slash command that requires server-side processing.
 *
 * Body: { command: 'roll', args: string, sessionId: UUID, roomId: UUID }
 *
 * Currently supports:
 *   - roll: Parses dice notation, rolls server-side, persists as ROLL message.
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { command, args, sessionId, roomId } = req.body

    if (typeof command !== 'string' || !command) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Missing command' })
    }

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

    const room = await getRoom(roomId as UUID)
    if (!room || room.sessionId !== (sessionId as UUID)) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Room not found' })
    }

    // Commands require an ACTIVE session
    if (session.state !== SessionState.ACTIVE) {
      return res.status(409).json({
        code: ErrorCode.INVALID_SESSION,
        message: `That action isn't available while the session is ${session.state.toLowerCase()}.`,
      })
    }

    // DM can target any room; players must be in the room they're posting to
    if (requesterRole !== Role.DM) {
      const presence = await getSessionPresence(sessionId as UUID)
      const requesterPresence = presence.find((entry) => entry.userId === effective.userId)
      if (!requesterPresence || requesterPresence.primaryRoomId !== (roomId as UUID)) {
        return res.status(403).json({
          code: ErrorCode.FORBIDDEN,
          message: 'You may only use commands in your current room',
        })
      }
    }

    const normalizedCommand = command.toLowerCase().replace(/^\//, '')

    if (normalizedCommand === 'roll') {
      return handleRollCommand({
        req,
        res,
        args: typeof args === 'string' ? args.trim() : '',
        sessionId: sessionId as UUID,
        roomId: roomId as UUID,
        session,
        effective,
        requesterRole,
      })
    }

    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: `Unknown command /${normalizedCommand}. Type / to see available commands.`,
    })
  } catch {
    return res.status(500).json({ code: ErrorCode.INTERNAL_ERROR, message: 'Internal server error' })
  }
})

interface CommandHandlerParams {
  req: Request
  res: Response
  args: string
  sessionId: UUID
  roomId: UUID
  session: { dmId: UUID; state: string }
  effective: { userId: UUID; username: string }
  requesterRole: string
}

async function handleRollCommand({
  req,
  res,
  args,
  sessionId,
  roomId,
  session,
  effective,
  requesterRole,
}: CommandHandlerParams) {
  // /roll is available to DM and PLAYER only
  if (requesterRole === Role.SPECTATOR) {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message: '/roll is not available to your role.',
    })
  }

  if (!args) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Usage: /roll [dice] — e.g. /roll 1d20+5',
    })
  }

  const result = rollDice(args)
  if (!result) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: `Invalid dice expression "${args}". Usage: /roll [NdX+M] — e.g. /roll 2d6+3`,
    })
  }

  const visibleTo = await resolveRoomAudience({
    sessionId,
    roomId,
    dmId: session.dmId,
  })

  const rollSummary =
    result.rolls.length === 1
      ? `${result.total}`
      : `${result.rolls.join(' + ')}${result.modifier !== 0 ? ` ${result.modifier > 0 ? '+' : ''}${result.modifier}` : ''} = ${result.total}`

  const content = `🎲 ${effective.username} rolled ${result.expression}: ${rollSummary}`

  const stored = await sendMessage({
    sessionId,
    roomId,
    authorId: effective.userId,
    authorUsername: effective.username,
    actorRole: requesterRole,
    dmId: session.dmId,
    content,
    type: MessageType.ROLL,
    visibleTo,
    metadata: {
      rollResult: {
        kind: 'ROLL_RESULT',
        expression: result.expression,
        rolls: result.rolls,
        modifier: result.modifier,
        total: result.total,
      },
    },
  })

  const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
  if (wsManager) {
    const event = buildMessageSentEvent(stored, effective.userId, requesterRole)
    wsManager.broadcastEventToSession(sessionId, event, stored.visibleTo)
  }

  return res.status(201).json({ message: stored })
}

export default router
