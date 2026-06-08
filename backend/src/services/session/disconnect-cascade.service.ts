import { DISCONNECT_CASCADE_TIMERS_MS, PresenceState, Role, SessionState } from '@shared'
import type { EventEnvelope, UUID } from '@shared'
import { emitSessionBoundarySystemMessage } from '@/services/system-messages.service'
import {
  applySessionStateRoomTransition,
  deletePrivateRoomsForEndedSession,
  getSessionPresence,
  removePresenceProjection,
  updatePresenceState,
} from '@/services/room.service'
import {
  clearRoomEnvironmentState,
  clearSessionDMOverrideState,
  getSessionAudioState,
} from '@/services/audio/audio-state'
import { setUserMuteState } from '@/services/audio/effects.service'
import { updateSessionState, getSession, getSessionUsers } from '@/services/session/core.service'
import { broadcastSessionStatsSnapshot } from '@/services/session/stats.service'
import { logSessionStateChange } from '@/services/session/logs.service'

const SYSTEM_ACTOR_ID = '00000000-0000-4000-8000-000000000000' as UUID
const GHOST_ENTRY_DELAY_MS = DISCONNECT_CASCADE_TIMERS_MS.ghostEntryDelay
const PRESENCE_TTL_REMOVAL_DELAY_MS = DISCONNECT_CASCADE_TIMERS_MS.presenceTtlRemoval
const EVERYONE_LEAVES_AUTOSTOP_DELAY_MS = DISCONNECT_CASCADE_TIMERS_MS.everyoneLeavesAutoStop

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

function getBoundaryRoomIds(mainRoomId: UUID, greenRoomId: UUID): UUID[] {
  return Array.from(new Set([mainRoomId, greenRoomId]))
}

export class SessionDisconnectCascadeService {
  private ghostTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private ttlTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private everyoneLeavesTimers = new Map<UUID, ReturnType<typeof setTimeout>>()

  handleUserConnected(sessionId: UUID, userId: UUID): void {
    this.clearUserTimers(sessionId, userId)
    this.clearEveryoneLeavesTimer(sessionId)
  }

  /** Cancel pending ghost/TTL timers for a user who voluntarily left the session. */
  cancelUserTimers(sessionId: UUID, userId: UUID): void {
    this.clearUserTimers(sessionId, userId)
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
        previousGroupId: updated.previousGroupId || null,
      },
    })

    // Mark the disconnected player as muted in Redis so that when they
    // reconnect (but before they go live), all clients see the correct state.
    // When the player clicks Go Live, /api/audio/unmute clears this.
    try {
      const mutedAt = updated.lastSeenAt
      await setUserMuteState({
        sessionId: context.sessionId,
        userId: context.userId,
        muted: true,
        mutedAt,
      })
      context.wsManager.broadcastEventToSession(context.sessionId, {
        id: crypto.randomUUID() as UUID,
        type: 'AUDIO:MUTE_STATE_CHANGED' as any,
        version: 1,
        userId: context.userId,
        userRole: context.userRole as Role,
        sessionId: context.sessionId,
        roomId: null,
        timestamp: mutedAt,
        payload: { userId: context.userId, muted: true, mutedAt },
      })
    } catch {
      // Non-critical: mute state will self-correct when the player goes live
    }

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
          previousGroupId: updated.previousGroupId || null,
        },
      })
    }

    this.ghostTimers.set(
      key,
      setTimeout(() => {
        void this.enterGhostMode(context)
      }, GHOST_ENTRY_DELAY_MS)
    )

    await this.scheduleNoConnectionsLifecycleAction(context)

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
        previousGroupId: updated.previousGroupId || null,
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

    context.wsManager.broadcastEventToSession(context.sessionId, {
      id: crypto.randomUUID() as UUID,
      type: 'SESSION:MEMBER_LEFT',
      version: 1,
      userId: SYSTEM_ACTOR_ID,
      userRole: Role.SYSTEM,
      sessionId: context.sessionId,
      roomId: current.primaryRoomId || null,
      timestamp: Date.now(),
      payload: {
        userId: context.userId,
        username: current.username || context.username,
        leftAt: Date.now(),
        reason: 'GHOST_EXPIRED',
      },
    })

    this.clearUserTimers(context.sessionId, context.userId)

    await removePresenceProjection({
      sessionId: context.sessionId,
      userId: context.userId,
    })

    await broadcastSessionStatsSnapshot({
      wsManager: context.wsManager as any,
      sessionId: context.sessionId,
      actorUserId: SYSTEM_ACTOR_ID,
      actorUserRole: Role.SYSTEM,
    })

    if (!context.isSessionConnected(context.sessionId)) {
      await this.scheduleNoConnectionsLifecycleAction(context)
    }
  }

  private async scheduleNoConnectionsLifecycleAction(context: DisconnectContext): Promise<void> {
    const session = await getSession(context.sessionId)
    if (!session) {
      this.clearEveryoneLeavesTimer(context.sessionId)
      return
    }

    if (session.state === SessionState.ACTIVE || session.state === SessionState.PAUSED) {
      this.scheduleEveryoneLeavesAutoStop(context)
      return
    }
    // ENDED/IDLE cleanup transitions are driven by the cleanup job so reconnect/refresh
    // churn cannot force immediate state changes.
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
      SessionState.COOLDOWN,
      previousSession.dmId
    )

    if (!session) {
      this.clearEveryoneLeavesTimer(context.sessionId)
      return
    }

    const transition = await applySessionStateRoomTransition({
      sessionId: session.id,
      dmId: session.dmId,
      nextState: SessionState.COOLDOWN,
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
        nextState: SessionState.COOLDOWN,
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
        users: transition.users.map((member) => ({
          userId: member.id,
          username: member.username,
          roomId: member.roomId,
          roomName: member.roomName,
          previousGroupId: member.previousGroupId || null,
        })),
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
      roomIds: getBoundaryRoomIds(transition.mainRoomId, transition.greenRoomId),
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

    this.ghostTimers.clear()
    this.ttlTimers.clear()
    this.everyoneLeavesTimers.clear()
  }
}

export const sessionDisconnectCascadeService = new SessionDisconnectCascadeService()
