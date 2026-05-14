import { PresenceState, Role } from '@shared'
import type { EventEnvelope, UUID } from '@shared'
import { getSessionPresence } from '@/services/room.service'
import { getSession, getSessionUsers } from '@/services/session/core.service'
import { SESSION_EVENT_TYPES } from '@/constants/session-events.constants'
import type { WebSocketManager } from '@/ws'

export interface SessionStatsSnapshot {
  connectedPlayersWithDm: number
  connectedPlayers: number
  connectedSpectators: number
  connectedTotal: number
  updatedAt: number
}

function isConnectedPresence(state: PresenceState): boolean {
  return state !== PresenceState.OFFLINE
}

export async function getSessionStatsSnapshot(sessionId: UUID): Promise<SessionStatsSnapshot> {
  const [session, sessionUsers, presence] = await Promise.all([
    getSession(sessionId),
    getSessionUsers(sessionId),
    getSessionPresence(sessionId),
  ])

  const connectedUserIds = new Set(
    presence.filter((entry) => isConnectedPresence(entry.state)).map((entry) => entry.userId)
  )

  const roleByUserId = new Map(sessionUsers.map((entry) => [entry.id as UUID, entry.role]))
  const dmId = session?.dmId

  let connectedPlayers = 0
  let connectedSpectators = 0
  let dmConnected = false

  for (const userId of connectedUserIds) {
    if (dmId && userId === dmId) {
      dmConnected = true
      continue
    }

    const role = roleByUserId.get(userId)
    if (role === Role.SPECTATOR) {
      connectedSpectators += 1
      continue
    }

    // Treat unknown/non-spectator participants as players for resilience.
    connectedPlayers += 1
  }

  const connectedPlayersWithDm = connectedPlayers + (dmConnected ? 1 : 0)

  return {
    connectedPlayersWithDm,
    connectedPlayers,
    connectedSpectators,
    connectedTotal: connectedPlayersWithDm + connectedSpectators,
    updatedAt: Date.now(),
  }
}

export async function broadcastSessionStatsSnapshot(params: {
  wsManager: WebSocketManager
  sessionId: UUID
  actorUserId: UUID
  actorUserRole: Role
}): Promise<void> {
  const snapshot = await getSessionStatsSnapshot(params.sessionId)

  const event: EventEnvelope = {
    id: crypto.randomUUID() as UUID,
    type: SESSION_EVENT_TYPES.STATS_UPDATED,
    version: 1,
    userId: params.actorUserId,
    userRole: params.actorUserRole,
    sessionId: params.sessionId,
    roomId: null,
    timestamp: snapshot.updatedAt,
    payload: snapshot,
  }

  params.wsManager.broadcastEventToSession(params.sessionId, event)
}
