import { Router, Request, Response, NextFunction } from 'express'
import {
  ErrorCode,
  PresenceState,
  Role,
  RoomType,
  SessionState,
  isValidRoomName,
  isValidUUID,
} from '@shared'
import type { EventEnvelope, UUID } from '@shared'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { addUserToSession, getSession, getSessionUsers } from '@/services/session/core.service'
import { clearRoomMessages } from '@/services/chat.service'
import { config } from '@/infra/config'
import {
  createRoom,
  deleteRoom,
  endWhisperBubbleForSession,
  ensureSessionDefaultRoomsForSession,
  getRoom,
  getRoomMemberIds,
  getSessionPresence,
  getRooms,
  joinRoom,
  leaveRoom,
  updatePresenceState,
} from '@/services/room.service'
import { appendSessionAuditEvent } from '@/services/runtime/runtime-streams.service'
import { broadcastSessionStatsSnapshot } from '@/services/session/stats.service'
import type { WebSocketManager } from '@/ws'
import { isGreenRoomName } from '@/utils'

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

async function ensureNoHomelessPresence(
  sessionId: UUID,
  dmId: UUID
): Promise<Array<{ userId: UUID; username: string; fromRoomId: UUID | null; toRoomId: UUID }>> {
  await ensureSessionDefaultRoomsForSession(sessionId, dmId)

  const rooms = await getRooms(sessionId)
  const mainRoom = rooms.find((room) => room.type === RoomType.MAIN)
  if (!mainRoom) {
    return []
  }

  const roomIds = new Set(rooms.map((room) => room.id))
  const presence = await getSessionPresence(sessionId)
  const moved: Array<{ userId: UUID; username: string; fromRoomId: UUID | null; toRoomId: UUID }> =
    []

  for (const entry of presence) {
    const hasValidPrimary = Boolean(entry.primaryRoomId && roomIds.has(entry.primaryRoomId))
    if (hasValidPrimary) {
      continue
    }

    const next = await joinRoom({
      sessionId,
      roomId: mainRoom.id,
      userId: entry.userId,
      username: entry.username,
      state:
        entry.state === PresenceState.OFFLINE
          ? PresenceState.OFFLINE
          : entry.state === PresenceState.IDLE
            ? PresenceState.IDLE
            : PresenceState.ONLINE,
    })

    if (!next) {
      continue
    }

    await updatePresenceState({
      sessionId,
      userId: entry.userId,
      username: entry.username,
      state: next.state,
      primaryRoomId: mainRoom.id,
      privateRoomId: null,
      campaignId: next.campaignId,
    })
    moved.push({
      userId: entry.userId,
      username: entry.username,
      fromRoomId: entry.primaryRoomId || null,
      toRoomId: mainRoom.id,
    })
  }

  return moved
}

function broadcastReconciledMoves(params: {
  wsManager?: WebSocketManager
  sessionId: UUID
  movedUsers: Array<{ userId: UUID; username: string; fromRoomId: UUID | null; toRoomId: UUID }>
  actorUserId: UUID
  actorUserRole: Role
  reason: string
}) {
  if (!params.wsManager || params.movedUsers.length === 0) {
    return
  }

  const timestamp = Date.now()

  for (const moved of params.movedUsers) {
    if (moved.fromRoomId) {
      params.wsManager.broadcastEventToSession(params.sessionId, {
        id: crypto.randomUUID() as UUID,
        type: 'ROOM:USER_LEFT',
        version: 1,
        userId: params.actorUserId,
        userRole: params.actorUserRole,
        sessionId: params.sessionId,
        roomId: moved.fromRoomId,
        timestamp,
        payload: {
          roomId: moved.fromRoomId,
          userId: moved.userId,
          username: moved.username,
          leftAt: timestamp,
          reason: params.reason,
          movedBy: params.actorUserId,
        },
      })
    }

    params.wsManager.broadcastEventToSession(params.sessionId, {
      id: crypto.randomUUID() as UUID,
      type: 'ROOM:USER_JOINED',
      version: 1,
      userId: params.actorUserId,
      userRole: params.actorUserRole,
      sessionId: params.sessionId,
      roomId: moved.toRoomId,
      timestamp,
      payload: {
        roomId: moved.toRoomId,
        userId: moved.userId,
        username: moved.username,
        joinedAt: timestamp,
        reason: params.reason,
        movedBy: params.actorUserId,
      },
    })
  }
}

async function canAccessSessionRooms(sessionId: UUID, user: any): Promise<boolean> {
  const session = await getSession(sessionId)
  if (!session) return false

  if (session.dmId === (user.userId as UUID)) {
    return true
  }

  const members = await getSessionUsers(sessionId)
  return members.some((member) => member.id === (user.userId as UUID))
}

async function listSessionRoomsHandler(req: Request, res: Response) {
  const user = (req as any).user
  const sessionId = req.params.sessionId

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
      await ensureNoHomelessPresence(sessionId as UUID, session.dmId)
    }

    const rooms = await getRooms(sessionId as UUID)
    return res.status(200).json({ rooms })
  } catch {
    return internalErrorResponse(res)
  }
}

async function createRoomHandler(req: Request, res: Response) {
  const user = (req as any).user
  const sessionId = req.params.sessionId || req.body?.sessionId
  const { name, type } = req.body || {}

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

    if (session.dmId !== (user.userId as UUID)) {
      return res
        .status(403)
        .json({ code: ErrorCode.FORBIDDEN, message: 'Only DM can create rooms' })
    }

    if (roomType === RoomType.PRIVATE) {
      return res.status(400).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'Private whisper group is system-managed and cannot be created manually',
      })
    }

    const room = await createRoom({
      sessionId: sessionId as UUID,
      name: name.trim(),
      type: roomType,
      createdBy: user.userId as UUID,
    })

    await appendSessionAuditEvent({
      sessionId: sessionId as UUID,
      actorUserId: user.userId as UUID,
      actorRole: user.role,
      actionType: 'ROOM_CREATED',
      targetType: 'ROOM',
      targetId: room.id,
      roomId: room.id,
      visibilityClass: 'SYSTEM',
      metadata: {
        roomName: room.name,
        roomType: room.type,
      },
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
}

async function joinRoomHandler(req: Request, res: Response) {
  const user = (req as any).user
  const { roomId } = req.params

  if (!isValidUUID(roomId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid roomId' })
  }

  try {
    let room = await getRoom(roomId as UUID)

    // Failback contract: if target group no longer exists, move to MAIN.
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

    await appendSessionAuditEvent({
      sessionId: room.sessionId,
      actorUserId: user.userId as UUID,
      actorRole: user.role,
      actionType: 'ROOM_JOINED',
      targetType: 'ROOM_MEMBERSHIP',
      targetId: user.userId as UUID,
      roomId: room.id,
      visibilityClass: 'SYSTEM',
      metadata: {
        roomType: room.type,
      },
    })

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
      await broadcastSessionStatsSnapshot({
        wsManager,
        sessionId: room.sessionId,
        actorUserId: user.userId as UUID,
        actorUserRole: user.role,
      })
    }

    return res.status(200).json({ ok: true, presence })
  } catch {
    return internalErrorResponse(res)
  }
}

async function leaveRoomHandler(req: Request, res: Response) {
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

    await appendSessionAuditEvent({
      sessionId: room.sessionId,
      actorUserId: user.userId as UUID,
      actorRole: user.role,
      actionType: 'ROOM_LEFT',
      targetType: 'ROOM_MEMBERSHIP',
      targetId: user.userId as UUID,
      roomId: room.id,
      visibilityClass: 'SYSTEM',
      metadata: {
        roomType: room.type,
      },
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
      await broadcastSessionStatsSnapshot({
        wsManager,
        sessionId: room.sessionId,
        actorUserId: user.userId as UUID,
        actorUserRole: user.role,
      })
    }

    return res.status(200).json({ ok: true, presence })
  } catch {
    return internalErrorResponse(res)
  }
}

async function moveRoomMemberHandler(req: Request, res: Response) {
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
    let room = await getRoom(roomId as UUID)

    const session = await getSession(sessionId as UUID)
    if (!session) {
      return res
        .status(404)
        .json({ code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found' })
    }

    if (!room) {
      await ensureSessionDefaultRoomsForSession(sessionId as UUID, session.dmId)
      room =
        (await getRooms(sessionId as UUID)).find((entry) => entry.type === RoomType.MAIN) || null
      if (!room) {
        return internalErrorResponse(res)
      }
    }

    if (room.sessionId !== (sessionId as UUID)) {
      return res
        .status(400)
        .json({ code: ErrorCode.INVALID_INPUT, message: 'roomId does not belong to sessionId' })
    }

    if (session.dmId !== (user.userId as UUID)) {
      return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Only DM can move users' })
    }

    const reconciledMoves = await ensureNoHomelessPresence(sessionId as UUID, session.dmId)
    const moveWsManager: WebSocketManager | undefined = req.app.locals.wsManager
    broadcastReconciledMoves({
      wsManager: moveWsManager,
      sessionId: sessionId as UUID,
      movedUsers: reconciledMoves,
      actorUserId: user.userId as UUID,
      actorUserRole: user.role as Role,
      reason: 'ROOM_FAILBACK_RECONCILE',
    })

    const sessionUsers = await getSessionUsers(sessionId as UUID)
    let targetUser = sessionUsers.find((entry) => entry.id === (targetUserId as UUID))

    if (!targetUser && config.isDevelopment) {
      const presence = await getSessionPresence(sessionId as UUID)
      const orphanedMock = presence.find(
        (entry) => entry.userId === (targetUserId as UUID) && entry.username.startsWith('dev_mock_')
      )

      if (orphanedMock) {
        await addUserToSession(sessionId as UUID, {
          id: orphanedMock.userId,
          username: orphanedMock.username,
          role: Role.PLAYER,
          createdAt: Date.now(),
        })

        const refreshedUsers = await getSessionUsers(sessionId as UUID)
        targetUser = refreshedUsers.find((entry) => entry.id === (targetUserId as UUID))
      }
    }

    if (!targetUser) {
      return res
        .status(404)
        .json({ code: ErrorCode.NOT_FOUND, message: 'Target user not in session' })
    }

    const presence = await getSessionPresence(sessionId as UUID)
    const previousPresence = presence.find((entry) => entry.userId === (targetUserId as UUID))
    const previousRoomId = previousPresence?.primaryRoomId
    const previousRoom = previousRoomId ? await getRoom(previousRoomId) : null

    const updatedPresence = await joinRoom({
      sessionId: sessionId as UUID,
      roomId: room.id,
      userId: targetUser.id as UUID,
      username: targetUser.username,
      state: PresenceState.ONLINE,
    })

    if (!updatedPresence) {
      const mainFallback = (await getRooms(sessionId as UUID)).find(
        (entry) => entry.type === RoomType.MAIN
      )
      if (!mainFallback) {
        return internalErrorResponse(res)
      }

      const fallbackPresence = await joinRoom({
        sessionId: sessionId as UUID,
        roomId: mainFallback.id,
        userId: targetUser.id as UUID,
        username: targetUser.username,
        state: PresenceState.ONLINE,
      })

      if (!fallbackPresence) {
        return internalErrorResponse(res)
      }

      await updatePresenceState({
        sessionId: sessionId as UUID,
        userId: targetUser.id as UUID,
        username: targetUser.username,
        state: fallbackPresence.state,
        primaryRoomId: fallbackPresence.primaryRoomId,
        privateRoomId: null,
        campaignId: fallbackPresence.campaignId,
      })

      await appendSessionAuditEvent({
        sessionId: sessionId as UUID,
        actorUserId: user.userId as UUID,
        actorRole: user.role,
        actionType: 'ROOM_MEMBER_MOVED',
        targetType: 'ROOM_MEMBERSHIP',
        targetId: targetUser.id as UUID,
        roomId: mainFallback.id,
        visibilityClass: 'SYSTEM',
        metadata: {
          fromRoomId: previousRoomId || null,
          toRoomId: mainFallback.id,
          reason: 'TARGET_ROOM_MISSING',
          movedBy: user.userId,
        },
      })

      return res.status(200).json({
        ok: true,
        movedBy: user.userId,
        movedFromRoomId: previousRoomId || null,
        movedToRoomId: mainFallback.id,
        presence: fallbackPresence,
        failbackReason: 'TARGET_ROOM_MISSING',
      })
    }

    const movedIntoWhisper = room.type === RoomType.PRIVATE && previousRoomId !== room.id
    const movedOutOfWhisper =
      previousRoom?.type === RoomType.PRIVATE && room.type !== RoomType.PRIVATE

    if (movedIntoWhisper || movedOutOfWhisper) {
      await updatePresenceState({
        sessionId: sessionId as UUID,
        userId: targetUser.id as UUID,
        username: targetUser.username,
        state: updatedPresence.state,
        primaryRoomId: updatedPresence.primaryRoomId,
        privateRoomId: movedIntoWhisper ? previousRoomId || null : null,
        campaignId: updatedPresence.campaignId,
      })
    }

    await appendSessionAuditEvent({
      sessionId: sessionId as UUID,
      actorUserId: user.userId as UUID,
      actorRole: user.role,
      actionType: 'ROOM_MEMBER_MOVED',
      targetType: 'ROOM_MEMBERSHIP',
      targetId: targetUser.id as UUID,
      roomId: room.id,
      visibilityClass: 'SYSTEM',
      metadata: {
        fromRoomId: previousRoomId || null,
        toRoomId: room.id,
        movedBy: user.userId,
      },
    })

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
      await broadcastSessionStatsSnapshot({
        wsManager,
        sessionId: sessionId as UUID,
        actorUserId: user.userId as UUID,
        actorUserRole: user.role,
      })
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
}

async function endWhisperHandler(req: Request, res: Response) {
  const user = (req as any).user
  const { roomId } = req.params
  const sessionId = req.body?.sessionId || req.query?.sessionId

  if (!isValidUUID(roomId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid roomId' })
  }

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid sessionId' })
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

    if (room.type !== RoomType.PRIVATE) {
      return res
        .status(400)
        .json({ code: ErrorCode.INVALID_INPUT, message: 'Only whisper room can be ended' })
    }

    const session = await getSession(sessionId as UUID)
    if (!session) {
      return res
        .status(404)
        .json({ code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found' })
    }

    if (session.dmId !== (user.userId as UUID)) {
      return res
        .status(403)
        .json({ code: ErrorCode.FORBIDDEN, message: 'Only DM can end whisper mode' })
    }

    const mainRoom = (await getRooms(sessionId as UUID)).find(
      (entry) => entry.type === RoomType.MAIN
    )
    if (!mainRoom) {
      return internalErrorResponse(res)
    }

    const movedUsers = await endWhisperBubbleForSession({
      sessionId: sessionId as UUID,
      whisperRoomId: room.id,
      fallbackRoomId: mainRoom.id,
    })

    const reconciledMoves = await ensureNoHomelessPresence(sessionId as UUID, session.dmId)

    await clearRoomMessages(sessionId as UUID, room.id)

    await appendSessionAuditEvent({
      sessionId: sessionId as UUID,
      actorUserId: user.userId as UUID,
      actorRole: user.role,
      actionType: 'WHISPER_ENDED',
      targetType: 'ROOM',
      targetId: room.id,
      roomId: room.id,
      visibilityClass: 'SYSTEM',
      metadata: {
        movedUsersCount: movedUsers.length,
        fallbackRoomId: mainRoom.id,
      },
    })

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
      broadcastReconciledMoves({
        wsManager,
        sessionId: sessionId as UUID,
        movedUsers: reconciledMoves,
        actorUserId: user.userId as UUID,
        actorUserRole: user.role as Role,
        reason: 'ROOM_FAILBACK_RECONCILE',
      })

      const timestamp = Date.now()

      for (const moved of movedUsers) {
        wsManager.broadcastEventToSession(sessionId as UUID, {
          id: crypto.randomUUID() as UUID,
          type: 'ROOM:USER_LEFT',
          version: 1,
          userId: user.userId as UUID,
          userRole: user.role,
          sessionId: sessionId as UUID,
          roomId: moved.fromRoomId,
          timestamp,
          payload: {
            roomId: moved.fromRoomId,
            userId: moved.userId,
            username: moved.username,
            leftAt: timestamp,
            reason: 'WHISPER_ENDED',
            movedBy: user.userId,
          },
        })

        wsManager.broadcastEventToSession(sessionId as UUID, {
          id: crypto.randomUUID() as UUID,
          type: 'ROOM:USER_JOINED',
          version: 1,
          userId: user.userId as UUID,
          userRole: user.role,
          sessionId: sessionId as UUID,
          roomId: moved.toRoomId,
          timestamp,
          payload: {
            roomId: moved.toRoomId,
            userId: moved.userId,
            username: moved.username,
            joinedAt: timestamp,
            reason: 'WHISPER_ENDED',
            movedBy: user.userId,
          },
        })
      }

      await broadcastSessionStatsSnapshot({
        wsManager,
        sessionId: sessionId as UUID,
        actorUserId: user.userId as UUID,
        actorUserRole: user.role,
      })
    }

    return res.status(200).json({
      ok: true,
      whisperRoomId: room.id,
      movedUsers: movedUsers.map((entry) => ({
        userId: entry.userId,
        fromRoomId: entry.fromRoomId,
        toRoomId: entry.toRoomId,
      })),
    })
  } catch {
    return internalErrorResponse(res)
  }
}

async function listRoomMembersHandler(req: Request, res: Response) {
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
}

async function deleteRoomHandler(req: Request, res: Response) {
  const user = (req as any).user
  const { roomId } = req.params
  const sessionId = req.body?.sessionId || req.query?.sessionId

  if (!isValidUUID(roomId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid roomId' })
  }

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid sessionId' })
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

    if (session.dmId !== (user.userId as UUID)) {
      return res
        .status(403)
        .json({ code: ErrorCode.FORBIDDEN, message: 'Only DM can delete rooms' })
    }

    if (room.type === RoomType.MAIN) {
      return res
        .status(400)
        .json({ code: ErrorCode.INVALID_INPUT, message: 'Main room cannot be deleted' })
    }

    if (room.type === RoomType.PRIVATE) {
      return endWhisperHandler(req, res)
    }

    if (isGreenRoomName(room.name)) {
      return res
        .status(400)
        .json({ code: ErrorCode.INVALID_INPUT, message: 'Greenroom cannot be deleted' })
    }

    let mainRoom = (await getRooms(sessionId as UUID)).find((entry) => entry.type === RoomType.MAIN)
    if (!mainRoom) {
      await ensureSessionDefaultRoomsForSession(sessionId as UUID, session.dmId)
      mainRoom = (await getRooms(sessionId as UUID)).find((entry) => entry.type === RoomType.MAIN)
    }

    if (!mainRoom) {
      return internalErrorResponse(res)
    }

    const reconciledMoves = await ensureNoHomelessPresence(sessionId as UUID, session.dmId)
    const roomMemberIds = await getRoomMemberIds(sessionId as UUID, room.id)
    const sessionUsers = await getSessionUsers(sessionId as UUID)
    const usernamesById = new Map<UUID, string>()
    const movedUserIds: UUID[] = []

    for (const memberId of roomMemberIds) {
      const member = sessionUsers.find((entry) => entry.id === memberId)
      if (!member) {
        continue
      }

      const movedPresence = await joinRoom({
        sessionId: sessionId as UUID,
        roomId: mainRoom.id,
        userId: member.id as UUID,
        username: member.username,
        state: PresenceState.ONLINE,
      })

      if (!movedPresence) {
        continue
      }

      usernamesById.set(member.id as UUID, member.username)
      movedUserIds.push(member.id as UUID)
    }

    await deleteRoom({ sessionId: sessionId as UUID, roomId: room.id })

    await appendSessionAuditEvent({
      sessionId: sessionId as UUID,
      actorUserId: user.userId as UUID,
      actorRole: user.role,
      actionType: 'ROOM_DELETED',
      targetType: 'ROOM',
      targetId: room.id,
      roomId: room.id,
      visibilityClass: 'SYSTEM',
      metadata: {
        movedToRoomId: mainRoom.id,
        movedUserCount: movedUserIds.length,
      },
    })

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
      broadcastReconciledMoves({
        wsManager,
        sessionId: sessionId as UUID,
        movedUsers: reconciledMoves,
        actorUserId: user.userId as UUID,
        actorUserRole: user.role as Role,
        reason: 'ROOM_FAILBACK_RECONCILE',
      })

      const timestamp = Date.now()

      for (const memberId of movedUserIds) {
        const username = usernamesById.get(memberId)
        if (!username) {
          continue
        }

        const leftEvent: EventEnvelope = {
          id: crypto.randomUUID() as UUID,
          type: 'ROOM:USER_LEFT',
          version: 1,
          userId: user.userId as UUID,
          userRole: user.role,
          sessionId: sessionId as UUID,
          roomId: room.id,
          timestamp,
          payload: {
            roomId: room.id,
            userId: memberId,
            username,
            leftAt: timestamp,
            reason: 'ROOM_CLOSED',
            movedBy: user.userId,
          },
        }
        wsManager.broadcastEventToSession(sessionId as UUID, leftEvent)

        const joinedEvent: EventEnvelope = {
          id: crypto.randomUUID() as UUID,
          type: 'ROOM:USER_JOINED',
          version: 1,
          userId: user.userId as UUID,
          userRole: user.role,
          sessionId: sessionId as UUID,
          roomId: mainRoom.id,
          timestamp,
          payload: {
            roomId: mainRoom.id,
            userId: memberId,
            username,
            joinedAt: timestamp,
            movedBy: user.userId,
            reason: 'ROOM_CLOSED',
          },
        }
        wsManager.broadcastEventToSession(sessionId as UUID, joinedEvent)
      }

      const event: EventEnvelope = {
        id: crypto.randomUUID() as UUID,
        type: 'ROOM:DELETED',
        version: 1,
        userId: user.userId as UUID,
        userRole: user.role,
        sessionId: sessionId as UUID,
        roomId: room.id,
        timestamp,
        payload: {
          roomId: room.id,
          deletedAt: timestamp,
          deletedBy: user.userId,
          movedToRoomId: mainRoom.id,
          movedUserIds,
        },
      }

      wsManager.broadcastEventToSession(sessionId as UUID, event)

      await broadcastSessionStatsSnapshot({
        wsManager,
        sessionId: sessionId as UUID,
        actorUserId: user.userId as UUID,
        actorUserRole: user.role,
      })
    }

    return res.status(200).json({ ok: true, deletedRoomId: room.id })
  } catch {
    return internalErrorResponse(res)
  }
}

router.get('/:sessionId', requireAuth, listSessionRoomsHandler)
router.get('/session/:sessionId', requireAuth, listSessionRoomsHandler)

router.post('/', requireAuth, createRoomHandler)
router.post('/session/:sessionId', requireAuth, createRoomHandler)

router.post('/:roomId/join', requireAuth, joinRoomHandler)
router.post('/:roomId/members/join', requireAuth, joinRoomHandler)

router.post('/:roomId/leave', requireAuth, leaveRoomHandler)
router.post('/:roomId/members/leave', requireAuth, leaveRoomHandler)

router.post('/:roomId/move-user', requireAuth, moveRoomMemberHandler)
router.post('/:roomId/members/move', requireAuth, moveRoomMemberHandler)
router.post('/:roomId/end-whisper', requireAuth, endWhisperHandler)

router.get('/:roomId/members', requireAuth, listRoomMembersHandler)
router.delete('/:roomId', requireAuth, deleteRoomHandler)

export default router
