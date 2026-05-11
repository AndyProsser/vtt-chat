import { DISCONNECT_CASCADE_TIMERS_MS, PresenceState, Role, SessionState } from '@shared'
import type { EventEnvelope, UUID } from '@shared'
import { clearRoomMessages } from '@/services/chat.service'
import { emitSessionBoundarySystemMessage } from '@/services/system-messages.service'
import {
  applySessionStateRoomTransition,
  deletePrivateRoomsForEndedSession,
  getRooms,
  getSessionPresence,
  removePresenceProjection,
  updatePresenceState,
} from '@/services/room.service'
import {
  clearRoomEnvironmentState,
  clearSessionDMOverrideState,
  getSessionAudioState,
} from '@/services/audio-state.service'
import { updateSessionState, getSession, getSessionUsers } from '@/services/session.service'
import { broadcastSessionStatsSnapshot } from '@/services/session-stats.service'
import { logSessionStateChange } from '@/services/session-logs.service'

const SYSTEM_ACTOR_ID = '00000000-0000-4000-8000-000000000000' as UUID
const GHOST_ENTRY_DELAY_MS = DISCONNECT_CASCADE_TIMERS_MS.ghostEntryDelay
const PRESENCE_TTL_REMOVAL_DELAY_MS = DISCONNECT_CASCADE_TIMERS_MS.presenceTtlRemoval
const EVERYONE_LEAVES_AUTOSTOP_DELAY_MS = DISCONNECT_CASCADE_TIMERS_MS.everyoneLeavesAutoStop
const CLEANUP_TRIGGER_DELAY_MS = DISCONNECT_CASCADE_TIMERS_MS.cleanupTriggerDelay

interface CascadeWsAdapter {
  broadcastEventToSession: (sessionId: UUID, event: EventEnvelope, visibleTo?: UUID[]) => void
}

interface DisconnectContext {
  sessionId: UUID
  userId: UUID
  username: string
  userRole: 'DM' | 'PLAYER' | 'SPECTATOR'
  wsManager: CascadeWsAdapter
  isUserConnected: (sessionId: UUID, userId: UUID) => boolean
  isSessionConnected: (sessionId: UUID) => boolean
}

function userKey(sessionId: UUID, userId: UUID): string {
  return `${sessionId}:${userId}`
}

function isGreenRoomName(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ')
  return normalized === 'green room' || normalized === 'green-room'
}

export class SessionDisconnectCascadeService {
  private ghostTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private ttlTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private everyoneLeavesTimers = new Map<UUID, ReturnType<typeof setTimeout>>()
  private cleanupTimers = new Map<UUID, ReturnType<typeof setTimeout>>()

  handleUserConnected(sessionId: UUID, userId: UUID): void {
    this.clearUserTimers(sessionId, userId)
    this.clearEveryoneLeavesTimer(sessionId)
    this.clearCleanupTimer(sessionId)
  }

  async handleUserDisconnected(context: DisconnectContext): Promise<void> {
    const key = userKey(context.sessionId, context.userId)
    this.clearUserTimers(context.sessionId, context.userId)

    const previous = (await getSessionPresence(context.sessionId)).find(
      (entry) => entry.userId === context.userId
    )

    const updated = await updatePresenceState({
      sessionId: context.sessionId,
      userId: context.userId,
      username: context.username,
      state: PresenceState.OFFLINE,
      ghost: false,
      primaryRoomId: previous?.primaryRoomId,
      privateRoomId: previous?.privateRoomId,
      campaignId: previous?.campaignId,
    })

    context.wsManager.broadcastEventToSession(context.sessionId, {
      id: crypto.randomUUID() as UUID,
      type: 'PRESENCE:STATE_CHANGED',
      version: 1,
      userId: context.userId,
      userRole: context.userRole as Role,
      sessionId: context.sessionId,
      roomId: updated.primaryRoomId || null,
      timestamp: updated.lastSeenAt,
      payload: {
        roomId: updated.primaryRoomId || null,
        userId: updated.userId,
        username: updated.username,
        presence: updated.state,
        previousState: previous?.state || PresenceState.ONLINE,
        newState: updated.state,
        changedAt: updated.lastSeenAt,
      },
    })

    if (previous?.ghost) {
      context.wsManager.broadcastEventToSession(context.sessionId, {
        id: crypto.randomUUID() as UUID,
        type: 'PRESENCE:USER_GHOST_MODE_CHANGED',
        version: 1,
        userId: context.userId,
        userRole: context.userRole as Role,
        sessionId: context.sessionId,
        roomId: updated.primaryRoomId || null,
        timestamp: updated.lastSeenAt,
        payload: {
          userId: updated.userId,
          username: updated.username,
          roomId: updated.primaryRoomId || null,
          ghostMode: false,
          changedAt: updated.lastSeenAt,
        },
      })
    }

    this.ghostTimers.set(
      key,
      setTimeout(() => {
        void this.enterGhostMode(context)
      }, GHOST_ENTRY_DELAY_MS)
    )

    if (!context.isSessionConnected(context.sessionId)) {
      this.scheduleEveryoneLeavesAutoStop(context)
    }

    await broadcastSessionStatsSnapshot({
      wsManager: context.wsManager as any,
      sessionId: context.sessionId,
      actorUserId: context.userId,
      actorUserRole: context.userRole as Role,
    })
  }

  private async enterGhostMode(context: DisconnectContext): Promise<void> {
    const key = userKey(context.sessionId, context.userId)

    if (context.isUserConnected(context.sessionId, context.userId)) {
      this.clearUserTimers(context.sessionId, context.userId)
      return
    }

    const current = (await getSessionPresence(context.sessionId)).find(
      (entry) => entry.userId === context.userId
    )

    if (!current) {
      this.clearUserTimers(context.sessionId, context.userId)
      return
    }

    const updated = await updatePresenceState({
      sessionId: context.sessionId,
      userId: context.userId,
      username: current.username || context.username,
      state: PresenceState.OFFLINE,
      ghost: true,
      primaryRoomId: current.primaryRoomId,
      privateRoomId: current.privateRoomId,
      campaignId: current.campaignId,
    })

    context.wsManager.broadcastEventToSession(context.sessionId, {
      id: crypto.randomUUID() as UUID,
      type: 'PRESENCE:USER_GHOST_MODE_CHANGED',
      version: 1,
      userId: context.userId,
      userRole: context.userRole as Role,
      sessionId: context.sessionId,
      roomId: updated.primaryRoomId || null,
      timestamp: updated.lastSeenAt,
      payload: {
        userId: updated.userId,
        username: updated.username,
        roomId: updated.primaryRoomId || null,
        ghostMode: true,
        changedAt: updated.lastSeenAt,
      },
    })

    this.ttlTimers.set(
      key,
      setTimeout(() => {
        void this.expirePresenceProjection(context)
      }, PRESENCE_TTL_REMOVAL_DELAY_MS)
    )
  }

  private async expirePresenceProjection(context: DisconnectContext): Promise<void> {
    if (context.isUserConnected(context.sessionId, context.userId)) {
      this.clearUserTimers(context.sessionId, context.userId)
      return
    }

    const current = (await getSessionPresence(context.sessionId)).find(
      (entry) => entry.userId === context.userId
    )
    if (!current) {
      this.clearUserTimers(context.sessionId, context.userId)
      return
    }

    await removePresenceProjection({
      sessionId: context.sessionId,
      userId: context.userId,
    })

    if (current.primaryRoomId) {
      context.wsManager.broadcastEventToSession(context.sessionId, {
        id: crypto.randomUUID() as UUID,
        type: 'ROOM:USER_LEFT',
        version: 1,
        userId: SYSTEM_ACTOR_ID,
        userRole: Role.SYSTEM,
        sessionId: context.sessionId,
        roomId: current.primaryRoomId,
        timestamp: Date.now(),
        payload: {
          roomId: current.primaryRoomId,
          userId: context.userId,
          username: current.username || context.username,
          leftAt: Date.now(),
          reason: 'DISCONNECT',
        },
      })
    }

    this.clearUserTimers(context.sessionId, context.userId)

    await broadcastSessionStatsSnapshot({
      wsManager: context.wsManager as any,
      sessionId: context.sessionId,
      actorUserId: SYSTEM_ACTOR_ID,
      actorUserRole: Role.SYSTEM,
    })

    if (!context.isSessionConnected(context.sessionId)) {
      this.scheduleEveryoneLeavesAutoStop(context)
    }
  }

  private scheduleEveryoneLeavesAutoStop(context: DisconnectContext): void {
    this.clearEveryoneLeavesTimer(context.sessionId)

    this.everyoneLeavesTimers.set(
      context.sessionId,
      setTimeout(() => {
        void this.autoStopSessionForNoConnections(context)
      }, EVERYONE_LEAVES_AUTOSTOP_DELAY_MS)
    )
  }

  private async autoStopSessionForNoConnections(context: DisconnectContext): Promise<void> {
    if (context.isSessionConnected(context.sessionId)) {
      this.clearEveryoneLeavesTimer(context.sessionId)
      return
    }

    const previousSession = await getSession(context.sessionId)
    if (!previousSession) {
      this.clearEveryoneLeavesTimer(context.sessionId)
      return
    }

    if (
      previousSession.state !== SessionState.ACTIVE &&
      previousSession.state !== SessionState.PAUSED
    ) {
      this.clearEveryoneLeavesTimer(context.sessionId)
      return
    }

    const users = await getSessionUsers(context.sessionId)
    const session = await updateSessionState(
      context.sessionId,
      SessionState.ENDED,
      previousSession.dmId
    )

    if (!session) {
      this.clearEveryoneLeavesTimer(context.sessionId)
      return
    }

    const transition = await applySessionStateRoomTransition({
      sessionId: session.id,
      dmId: session.dmId,
      nextState: SessionState.ENDED,
      users: users.map((member) => ({ id: member.id, username: member.username })),
    })

    const audioStateBeforeReset = await getSessionAudioState(session.id)
    await clearSessionDMOverrideState(session.id)
    await clearRoomEnvironmentState({
      sessionId: session.id,
      roomId: transition.greenRoomId,
    })
    await deletePrivateRoomsForEndedSession(session.id)

    context.wsManager.broadcastEventToSession(session.id, {
      id: crypto.randomUUID() as UUID,
      type: 'ROOM:SESSION_TRANSITION_APPLIED',
      version: 1,
      userId: SYSTEM_ACTOR_ID,
      userRole: Role.SYSTEM,
      sessionId: session.id,
      roomId: transition.targetRoomId,
      timestamp: Date.now(),
      payload: {
        previousState: previousSession.state,
        nextState: SessionState.ENDED,
        movedUsers: transition.movedUsers,
        targetState: transition.targetState,
        mainRoom: {
          id: transition.mainRoomId,
          name: transition.mainRoomName,
          roomType: 'MAIN',
        },
        greenRoom: {
          id: transition.greenRoomId,
          name: transition.greenRoomName,
          roomType: 'GROUP',
        },
        targetRoomId: transition.targetRoomId,
        targetRoomName: transition.targetRoomName,
        users: users.map((member) => ({ userId: member.id, username: member.username })),
      },
    })

    for (const override of audioStateBeforeReset.dmOverrides) {
      context.wsManager.broadcastEventToSession(session.id, {
        id: crypto.randomUUID() as UUID,
        type: 'AUDIO:DM_OVERRIDE_REMOVED',
        version: 1,
        userId: SYSTEM_ACTOR_ID,
        userRole: Role.SYSTEM,
        sessionId: session.id,
        roomId: null,
        timestamp: Date.now(),
        payload: {
          targetUserId: override.targetUserId,
          dmId: session.dmId,
          overrideType: override.overrideType,
          removedAt: Date.now(),
        },
      })
    }

    if (audioStateBeforeReset.broadcast.enabled) {
      context.wsManager.broadcastEventToSession(session.id, {
        id: crypto.randomUUID() as UUID,
        type: 'AUDIO:BROADCAST_STATE_CHANGED',
        version: 1,
        userId: SYSTEM_ACTOR_ID,
        userRole: Role.SYSTEM,
        sessionId: session.id,
        roomId: null,
        timestamp: Date.now(),
        payload: {
          dmId: session.dmId,
          enabled: false,
          broadcastRoomId: audioStateBeforeReset.broadcast.broadcastRoomId,
          changedAt: Date.now(),
        },
      })
    }

    await emitSessionBoundarySystemMessage({
      sessionId: session.id,
      roomId: transition.mainRoomId,
      sessionName: session.name,
      boundaryType: 'SESSION_ENDED',
      dmId: previousSession.dmId,
      dmUsername: users.find((member) => member.id === previousSession.dmId)?.username || 'System',
      wsManager: context.wsManager as any,
    })

    await logSessionStateChange(
      session.id,
      previousSession.dmId,
      users.find((member) => member.id === previousSession.dmId)?.username || 'System',
      previousSession.state,
      SessionState.ENDED
    )

    await broadcastSessionStatsSnapshot({
      wsManager: context.wsManager as any,
      sessionId: session.id,
      actorUserId: SYSTEM_ACTOR_ID,
      actorUserRole: Role.SYSTEM,
    })

    this.clearEveryoneLeavesTimer(context.sessionId)
    this.scheduleCleanupTrigger(context)
  }

  private scheduleCleanupTrigger(context: DisconnectContext): void {
    this.clearCleanupTimer(context.sessionId)

    this.cleanupTimers.set(
      context.sessionId,
      setTimeout(() => {
        void this.runCleanupTrigger(context)
      }, CLEANUP_TRIGGER_DELAY_MS)
    )
  }

  private async runCleanupTrigger(context: DisconnectContext): Promise<void> {
    if (context.isSessionConnected(context.sessionId)) {
      this.clearCleanupTimer(context.sessionId)
      return
    }

    const session = await getSession(context.sessionId)
    if (!session) {
      this.clearCleanupTimer(context.sessionId)
      return
    }

    if (session.state !== SessionState.ENDED && session.state !== SessionState.IDLE) {
      this.clearCleanupTimer(context.sessionId)
      return
    }

    const rooms = await getRooms(context.sessionId)
    const greenRoom = rooms.find((room) => room.type === 'GROUP' && isGreenRoomName(room.name))

    if (greenRoom) {
      await clearRoomMessages(context.sessionId, greenRoom.id)
      context.wsManager.broadcastEventToSession(context.sessionId, {
        id: crypto.randomUUID() as UUID,
        type: 'CHAT:ROOM_CONTEXT_CLEARED',
        version: 1,
        userId: SYSTEM_ACTOR_ID,
        userRole: Role.SYSTEM,
        sessionId: context.sessionId,
        roomId: greenRoom.id,
        timestamp: Date.now(),
        payload: {
          roomId: greenRoom.id,
          reason: 'SESSION_CLEANUP_TRIGGERED',
        },
      })
    }

    this.clearCleanupTimer(context.sessionId)
  }

  private clearUserTimers(sessionId: UUID, userId: UUID): void {
    const key = userKey(sessionId, userId)

    const ghostTimer = this.ghostTimers.get(key)
    if (ghostTimer) {
      clearTimeout(ghostTimer)
      this.ghostTimers.delete(key)
    }

    const ttlTimer = this.ttlTimers.get(key)
    if (ttlTimer) {
      clearTimeout(ttlTimer)
      this.ttlTimers.delete(key)
    }
  }

  private clearEveryoneLeavesTimer(sessionId: UUID): void {
    const timer = this.everyoneLeavesTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.everyoneLeavesTimers.delete(sessionId)
    }
  }

  private clearCleanupTimer(sessionId: UUID): void {
    const timer = this.cleanupTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.cleanupTimers.delete(sessionId)
    }
  }

  dispose(): void {
    for (const timer of this.ghostTimers.values()) {
      clearTimeout(timer)
    }
    for (const timer of this.ttlTimers.values()) {
      clearTimeout(timer)
    }
    for (const timer of this.everyoneLeavesTimers.values()) {
      clearTimeout(timer)
    }
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer)
    }

    this.ghostTimers.clear()
    this.ttlTimers.clear()
    this.everyoneLeavesTimers.clear()
    this.cleanupTimers.clear()
  }
}

export const sessionDisconnectCascadeService = new SessionDisconnectCascadeService()
