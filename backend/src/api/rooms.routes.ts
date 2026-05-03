import { Router, Request, Response, NextFunction } from 'express'
import { ErrorCode, PresenceState, Role, RoomType, isValidRoomName, isValidUUID } from '@shared'
import type { EventEnvelope, UUID } from '@shared'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { getSession, getSessionUsers } from '@/services/session.service'
import {
  createRoom,
  ensureSessionDefaultRoomsForSession,
  getRoom,
  getRoomMemberIds,
  getSessionPresence,
  getRooms,
  joinRoom,
  leaveRoom,
} from '@/services/room.service'
import type { WebSocketManager } from '@/ws'

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

function parseRoomType(value: unknown): RoomType | null {
  if (typeof value !== 'string') return null
  const upper = value.toUpperCase()
  if (upper === RoomType.MAIN || upper === RoomType.GROUP || upper === RoomType.PRIVATE) {
    return upper as RoomType
  }
  return null
}

function internalErrorResponse(res: Response) {
  return res.status(500).json({ code: ErrorCode.INTERNAL_ERROR, message: 'Internal server error' })
}

async function canAccessSessionRooms(sessionId: UUID, user: any): Promise<boolean> {
  const session = await getSession(sessionId)
  if (!session) return false

  if (user.role === Role.DM || session.dmId === (user.userId as UUID)) {
    return true
  }

  const members = await getSessionUsers(sessionId)
  return members.some((member) => member.id === (user.userId as UUID))
}

router.get('/:sessionId', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { sessionId } = req.params

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid sessionId' })
  }

  try {
    const allowed = await canAccessSessionRooms(sessionId as UUID, user)
    if (!allowed) {
      return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a session member' })
    }

    const session = await getSession(sessionId as UUID)
    if (session) {
      await ensureSessionDefaultRoomsForSession(sessionId as UUID, session.dmId)
    }

    const rooms = await getRooms(sessionId as UUID)
    return res.status(200).json({ rooms })
  } catch {
    return internalErrorResponse(res)
  }
})

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { sessionId, name, type } = req.body || {}

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid sessionId' })
  }

  if (!isValidRoomName(name)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid room name' })
  }

  const roomType = parseRoomType(type) || RoomType.GROUP

  try {
    const session = await getSession(sessionId as UUID)
    if (!session) {
      return res
        .status(404)
        .json({ code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found' })
    }

    if (user.role !== Role.DM && session.dmId !== (user.userId as UUID)) {
      return res
        .status(403)
        .json({ code: ErrorCode.FORBIDDEN, message: 'Only DM can create rooms' })
    }

    const room = await createRoom({
      sessionId: sessionId as UUID,
      name: name.trim(),
      type: roomType,
      createdBy: user.userId as UUID,
    })

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
      const event: EventEnvelope = {
        id: crypto.randomUUID() as UUID,
        type: 'ROOM:CREATED',
        version: 1,
        userId: user.userId as UUID,
        userRole: user.role,
        sessionId: sessionId as UUID,
        roomId: room.id,
        timestamp: room.createdAt,
        payload: {
          roomId: room.id,
          name: room.name,
          roomName: room.name,
          roomType: room.type,
          createdBy: room.createdBy,
          createdAt: room.createdAt,
        },
      }

      wsManager.broadcastEventToSession(sessionId as UUID, event)
    }

    return res.status(201).json({ room })
  } catch {
    return internalErrorResponse(res)
  }
})

router.post('/:roomId/join', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { roomId } = req.params

  if (!isValidUUID(roomId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid roomId' })
  }

  try {
    const room = await getRoom(roomId as UUID)
    if (!room) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Room not found' })
    }

    const allowed = await canAccessSessionRooms(room.sessionId, user)
    if (!allowed) {
      return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a session member' })
    }

    const presence = await joinRoom({
      sessionId: room.sessionId,
      roomId: room.id,
      userId: user.userId as UUID,
      username: user.username,
      state: PresenceState.ONLINE,
    })

    if (!presence) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Room not found' })
    }

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
      const event: EventEnvelope = {
        id: crypto.randomUUID() as UUID,
        type: 'ROOM:USER_JOINED',
        version: 1,
        userId: user.userId as UUID,
        userRole: user.role,
        sessionId: room.sessionId,
        roomId: room.id,
        timestamp: Date.now(),
        payload: {
          roomId: room.id,
          userId: user.userId,
          username: user.username,
          joinedAt: Date.now(),
        },
      }

      wsManager.broadcastEventToSession(room.sessionId, event)
    }

    return res.status(200).json({ ok: true, presence })
  } catch {
    return internalErrorResponse(res)
  }
})

router.post('/:roomId/leave', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { roomId } = req.params

  if (!isValidUUID(roomId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid roomId' })
  }

  try {
    const room = await getRoom(roomId as UUID)
    if (!room) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Room not found' })
    }

    const allowed = await canAccessSessionRooms(room.sessionId, user)
    if (!allowed) {
      return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a session member' })
    }

    const presence = await leaveRoom({
      sessionId: room.sessionId,
      roomId: room.id,
      userId: user.userId as UUID,
      state: PresenceState.IDLE,
    })

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
      const event: EventEnvelope = {
        id: crypto.randomUUID() as UUID,
        type: 'ROOM:USER_LEFT',
        version: 1,
        userId: user.userId as UUID,
        userRole: user.role,
        sessionId: room.sessionId,
        roomId: room.id,
        timestamp: Date.now(),
        payload: {
          roomId: room.id,
          userId: user.userId,
          username: user.username,
          leftAt: Date.now(),
          reason: 'VOLUNTARY',
        },
      }

      wsManager.broadcastEventToSession(room.sessionId, event)
    }

    return res.status(200).json({ ok: true, presence })
  } catch {
    return internalErrorResponse(res)
  }
})

router.post('/:roomId/move-user', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { roomId } = req.params
  const { sessionId, targetUserId } = req.body || {}

  if (!isValidUUID(roomId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid roomId' })
  }

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid sessionId' })
  }

  if (!isValidUUID(targetUserId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid targetUserId' })
  }

  try {
    const room = await getRoom(roomId as UUID)
    if (!room) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Room not found' })
    }

    if (room.sessionId !== (sessionId as UUID)) {
      return res
        .status(400)
        .json({ code: ErrorCode.INVALID_INPUT, message: 'roomId does not belong to sessionId' })
    }

    const session = await getSession(sessionId as UUID)
    if (!session) {
      return res
        .status(404)
        .json({ code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found' })
    }

    if (user.role !== Role.DM || session.dmId !== (user.userId as UUID)) {
      return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Only DM can move users' })
    }

    const sessionUsers = await getSessionUsers(sessionId as UUID)
    const targetUser = sessionUsers.find((entry) => entry.id === (targetUserId as UUID))
    if (!targetUser) {
      return res
        .status(404)
        .json({ code: ErrorCode.NOT_FOUND, message: 'Target user not in session' })
    }

    const presence = await getSessionPresence(sessionId as UUID)
    const previousPresence = presence.find((entry) => entry.userId === (targetUserId as UUID))
    const previousRoomId = previousPresence?.primaryRoomId

    const updatedPresence = await joinRoom({
      sessionId: sessionId as UUID,
      roomId: room.id,
      userId: targetUser.id as UUID,
      username: targetUser.username,
      state: PresenceState.ONLINE,
    })

    if (!updatedPresence) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Room not found' })
    }

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
      const timestamp = Date.now()

      if (previousRoomId && previousRoomId !== room.id) {
        const leftEvent: EventEnvelope = {
          id: crypto.randomUUID() as UUID,
          type: 'ROOM:USER_LEFT',
          version: 1,
          userId: user.userId as UUID,
          userRole: user.role,
          sessionId: sessionId as UUID,
          roomId: previousRoomId,
          timestamp,
          payload: {
            roomId: previousRoomId,
            userId: targetUser.id,
            username: targetUser.username,
            leftAt: timestamp,
            reason: 'DM_MOVE',
            movedBy: user.userId,
          },
        }

        wsManager.broadcastEventToSession(sessionId as UUID, leftEvent)
      }

      const joinedEvent: EventEnvelope = {
        id: crypto.randomUUID() as UUID,
        type: 'ROOM:USER_JOINED',
        version: 1,
        userId: user.userId as UUID,
        userRole: user.role,
        sessionId: sessionId as UUID,
        roomId: room.id,
        timestamp,
        payload: {
          roomId: room.id,
          userId: targetUser.id,
          username: targetUser.username,
          joinedAt: timestamp,
          movedBy: user.userId,
        },
      }

      wsManager.broadcastEventToSession(sessionId as UUID, joinedEvent)
    }

    return res.status(200).json({
      ok: true,
      movedBy: user.userId,
      movedFromRoomId: previousRoomId || null,
      movedToRoomId: room.id,
      presence: updatedPresence,
    })
  } catch {
    return internalErrorResponse(res)
  }
})

router.get('/:roomId/members', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { roomId } = req.params

  if (!isValidUUID(roomId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid roomId' })
  }

  try {
    const room = await getRoom(roomId as UUID)
    if (!room) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Room not found' })
    }

    const allowed = await canAccessSessionRooms(room.sessionId, user)
    if (!allowed) {
      return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a session member' })
    }

    const members = await getRoomMemberIds(room.sessionId, room.id)
    return res.status(200).json({ roomId: room.id, members })
  } catch {
    return internalErrorResponse(res)
  }
})

export default router
