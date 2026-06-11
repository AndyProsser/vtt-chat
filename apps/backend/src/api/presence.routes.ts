import { Router, Request, Response, NextFunction } from 'express'
import { ErrorCode, PresenceState, isValidPresenceState, isValidUUID } from '@shared'
import type { EventEnvelope, UUID } from '@shared'
import { getSessionParticipantProfiles } from '@/repositories/session.repository'
import { getPrismaClient } from '@/infra/db'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { getSession, getSessionUsers } from '@/services/session/core.service'
import {
  ensurePresenceRecoveredFromSnapshots,
  getSessionPresence,
  getRoom,
  joinRoom,
  snapshotSessionPresence,
  updatePresenceState,
} from '@/services/room.service'
import { getMockTakeoverSnapshot } from '@/services/dev-mock/takeover.service'
import {
  broadcastSessionStatsSnapshot,
  getSessionStatsSnapshot,
} from '@/services/session/stats.service'
import { appendSessionAuditEvent } from '@/services/runtime/runtime-streams.service'
import { ensureMockSimulationRunning } from '@/services/dev-mock/simulation.service'
import type { WebSocketManager } from '@/ws'
import eventBroadcaster from '@/ws/event-broadcaster'

const router = Router()
const prisma = getPrismaClient()

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

async function canAccessSessionPresence(sessionId: UUID, user: any): Promise<boolean> {
  const session = await getSession(sessionId)
  if (!session) return false

  if (session.dmId === (user.userId as UUID)) {
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
    const allowed = await canAccessSessionPresence(sessionId as UUID, user)
    if (!allowed) {
      return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a session member' })
    }

    const currentSession = await getSession(sessionId as UUID)
    if (!currentSession) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Session not found' })
    }

    const currentSessionRecord = await prisma.session.findUnique({
      where: { id: sessionId as UUID },
      select: { campaignId: true },
    })

    await ensureMockSimulationRunning(sessionId as UUID)

    const presence = await getSessionPresence(sessionId as UUID)
    const sessionUsers = await getSessionUsers(sessionId as UUID)
    const sessionRoleByUserId = new Map(sessionUsers.map((entry) => [entry.id as UUID, entry.role]))
    const sessionUserIds = new Set(sessionUsers.map((entry) => entry.id as UUID))
    const scopedPresence = presence.filter((entry) => sessionUserIds.has(entry.userId))
    const profiles = await getSessionParticipantProfiles(sessionId as UUID)
    const stats = await getSessionStatsSnapshot(sessionId as UUID)
    const identity = await getMockTakeoverSnapshot({
      sessionId: sessionId as UUID,
      actorUserId: user.userId as UUID,
    })
    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    const deviceSessionsByUser =
      wsManager?.getSessionDeviceSessionsSnapshot(sessionId as UUID) || {}

    return res.status(200).json({
      presence: scopedPresence.map((entry) => {
        const deviceSessions = deviceSessionsByUser[entry.userId] || []
        const hasActiveUnmuted = deviceSessions.some((d: any) => d.isActive && d.isMuted === false)
        const computedUserMuted =
          entry.userMuted !== undefined ? entry.userMuted : !hasActiveUnmuted
        return {
          ...entry,
          role: sessionRoleByUserId.get(entry.userId),
          deviceSessions,
          userMuted: computedUserMuted,
          ...(profiles[entry.userId] || {}),
        }
      }),
      stats,
      identity,
    })
  } catch {
    return internalErrorResponse(res)
  }
})

// Get presence for a single user within a session (enriched like the
// session-level presence endpoint). Useful for client-side enrichment when
// a single participant joins and we only need that user's full presence.
router.get('/:sessionId/user/:userId', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { sessionId, userId } = req.params

  if (!isValidUUID(sessionId) || !isValidUUID(userId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid id' })
  }

  try {
    const allowed = await canAccessSessionPresence(sessionId as UUID, user)
    if (!allowed) {
      return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a session member' })
    }

    const currentSession = await getSession(sessionId as UUID)
    if (!currentSession) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Session not found' })
    }

    await ensureMockSimulationRunning(sessionId as UUID)

    const presence = await getSessionPresence(sessionId as UUID)
    const sessionUsers = await getSessionUsers(sessionId as UUID)
    const sessionRoleByUserId = new Map(sessionUsers.map((entry) => [entry.id as UUID, entry.role]))
    const sessionUserIds = new Set(sessionUsers.map((entry) => entry.id as UUID))
    const scopedPresence = presence.filter((entry) => sessionUserIds.has(entry.userId))
    const profiles = await getSessionParticipantProfiles(sessionId as UUID)
    const stats = await getSessionStatsSnapshot(sessionId as UUID)
    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    const deviceSessionsByUser =
      wsManager?.getSessionDeviceSessionsSnapshot(sessionId as UUID) || {}

    const found = scopedPresence.find((p) => p.userId === (userId as UUID))
    if (!found) {
      return res
        .status(404)
        .json({ code: ErrorCode.NOT_FOUND, message: 'User presence not found in session' })
    }

    const deviceSessions = deviceSessionsByUser[found.userId] || []
    const hasActiveUnmuted = deviceSessions.some((d: any) => d.isActive && d.isMuted === false)
    const computedUserMuted = found.userMuted !== undefined ? found.userMuted : !hasActiveUnmuted

    return res.status(200).json({
      presence: {
        ...found,
        role: sessionRoleByUserId.get(found.userId),
        deviceSessions,
        userMuted: computedUserMuted,
        ...(profiles[found.userId] || {}),
      },
      stats,
    })
  } catch (err) {
    return internalErrorResponse(res)
  }
})

router.put('/:sessionId/state', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { sessionId } = req.params
  const { state, roomId, privateRoomId, previousGroupId, ghostMode } = req.body || {}

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid sessionId' })
  }

  if (!isValidPresenceState(state)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid presence state' })
  }

  if (roomId !== undefined && roomId !== null && !isValidUUID(roomId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid roomId' })
  }

  if (privateRoomId !== undefined && privateRoomId !== null && !isValidUUID(privateRoomId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid privateRoomId' })
  }

  if (previousGroupId !== undefined && previousGroupId !== null && !isValidUUID(previousGroupId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid previousGroupId' })
  }

  if (ghostMode !== undefined && typeof ghostMode !== 'boolean') {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid ghostMode' })
  }

  try {
    const allowed = await canAccessSessionPresence(sessionId as UUID, user)
    if (!allowed) {
      return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a session member' })
    }

    const currentSession = await getSession(sessionId as UUID)
    if (!currentSession) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Session not found' })
    }

    const currentSessionCampaign = await prisma.session.findUnique({
      where: { id: sessionId as UUID },
      select: { campaignId: true },
    })

    if (roomId) {
      const room = await getRoom(roomId as UUID)
      if (!room) {
        return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Room not found' })
      }

      await joinRoom({
        sessionId: sessionId as UUID,
        roomId: room.id,
        userId: user.userId as UUID,
        username: user.username,
        state,
      })
    }

    const previousPresence = await getSessionPresence(sessionId as UUID)
    const previous = previousPresence.find((p) => p.userId === (user.userId as UUID))

    const updated = await updatePresenceState({
      sessionId: sessionId as UUID,
      userId: user.userId as UUID,
      username: user.username,
      state,
      ghost: ghostMode as boolean | undefined,
      primaryRoomId: roomId as UUID | undefined,
      previousGroupId: previousGroupId as UUID | undefined,
      privateRoomId: privateRoomId as UUID | undefined,
    })

    await appendSessionAuditEvent({
      sessionId: sessionId as UUID,
      actorUserId: user.userId as UUID,
      actorRole: user.role,
      actionType: 'PRESENCE.STATE_CHANGED',
      targetType: 'USER',
      targetId: user.userId as UUID,
      roomId: updated.primaryRoomId,
      visibilityClass: 'PUBLIC',
      timestamp: updated.lastSeenAt,
      metadata: {
        previousState: previous?.state || PresenceState.OFFLINE,
        newState: updated.state,
        previousGroupId: updated.previousGroupId || null,
        ghostMode: updated.ghost || false,
      },
    })

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
      const event: EventEnvelope = {
        id: crypto.randomUUID() as UUID,
        type: 'PRESENCE:STATE_CHANGED',
        version: 1,
        userId: user.userId as UUID,
        userRole: user.role,
        sessionId: sessionId as UUID,
        roomId: updated.primaryRoomId || null,
        timestamp: updated.lastSeenAt,
        payload: {
          roomId: updated.primaryRoomId || null,
          userId: updated.userId,
          username: updated.username,
          presence: updated.state,
          previousState: previous?.state || PresenceState.OFFLINE,
          newState: updated.state,
          changedAt: updated.lastSeenAt,
          previousGroupId: updated.previousGroupId || null,
        },
      }

      wsManager.broadcastEventToSession(sessionId as UUID, event)

      if ((previous?.ghost || false) !== (updated.ghost || false)) {
        wsManager.broadcastEventToSession(sessionId as UUID, {
          id: crypto.randomUUID() as UUID,
          type: 'PRESENCE:USER_GHOST_MODE_CHANGED',
          version: 1,
          userId: user.userId as UUID,
          userRole: user.role,
          sessionId: sessionId as UUID,
          roomId: updated.primaryRoomId || null,
          timestamp: updated.lastSeenAt,
          payload: {
            userId: updated.userId,
            username: updated.username,
            roomId: updated.primaryRoomId || null,
            ghostMode: updated.ghost || false,
            changedAt: updated.lastSeenAt,
            previousGroupId: updated.previousGroupId || null,
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

    if (eventBroadcaster.isReady() && currentSessionCampaign?.campaignId) {
      await eventBroadcaster.broadcastToCampaignMembers(currentSessionCampaign.campaignId as UUID, {
        id: crypto.randomUUID() as UUID,
        type: 'CAMPAIGN:PARTY_PRESENCE_UPDATED',
        version: 1,
        userId: user.userId as UUID,
        userRole: user.role,
        sessionId: null as unknown as UUID,
        roomId: null,
        timestamp: Date.now(),
        payload: {
          campaignId: currentSessionCampaign.campaignId as UUID,
          sessionId: sessionId as UUID,
          reason: 'PRESENCE_STATE_CHANGED',
          changedAt: Date.now(),
        },
      })
    }

    return res.status(200).json({ presence: updated })
  } catch {
    return internalErrorResponse(res)
  }
})

router.post('/:sessionId/recover', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { sessionId } = req.params

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid sessionId' })
  }

  try {
    const allowed = await canAccessSessionPresence(sessionId as UUID, user)
    if (!allowed) {
      return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a session member' })
    }

    const recovered = await ensurePresenceRecoveredFromSnapshots(sessionId as UUID)
    const snapshotCount = await snapshotSessionPresence(sessionId as UUID)
    const presence = await getSessionPresence(sessionId as UUID)

    await appendSessionAuditEvent({
      sessionId: sessionId as UUID,
      actorUserId: user.userId as UUID,
      actorRole: user.role,
      actionType: 'PRESENCE.RECOVERY_TRIGGERED',
      targetType: 'SESSION',
      targetId: sessionId as UUID,
      visibilityClass: 'SYSTEM',
      metadata: {
        recoveredFromSnapshots: recovered,
        snapshotCount,
        presenceCount: presence.length,
      },
    })

    return res.status(200).json({
      recoveredFromSnapshots: recovered,
      snapshotCount,
      presence,
    })
  } catch {
    return internalErrorResponse(res)
  }
})

export default router
