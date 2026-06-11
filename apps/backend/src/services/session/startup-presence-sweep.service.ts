import crypto from 'node:crypto'
import { PresenceState, Role, SessionState } from '@shared'
import type { EventEnvelope, UUID } from '@shared'
import { logger } from '@/utils'
import { getSessionPresence, removePresenceProjection } from '@/services/room.service'
import { getAllSessions, getSessionUsers } from '@/services/session/core.service'
import { sessionDisconnectCascadeService } from '@/services/session/disconnect-cascade.service'

const SYSTEM_ACTOR_ID = '00000000-0000-4000-8000-000000000000' as UUID

/**
 * The set of session states that can hold active presence entries.
 * IDLE/ENDED/CLEANUP sessions should have no presence to sweep.
 */
const LIVE_STATES = new Set<SessionState>([
  SessionState.ACTIVE,
  SessionState.PAUSED,
  SessionState.COOLDOWN,
])

interface WsAdapter {
  broadcastEventToSession: (sessionId: UUID, event: EventEnvelope, visibleTo?: UUID[]) => void
}

/**
 * Sweep stale presence entries left in Redis after a server restart.
 *
 * On a hard restart (SIGKILL, container kill) the in-memory disconnect-cascade timers are
 * lost. Any presence entry that was OFFLINE before the restart never had its TTL timer fire,
 * so it sits in Redis indefinitely. Entries that were ONLINE when the server died need the
 * normal 50-second reconnect window before being evicted.
 *
 * Call once from bootstrap after the WS server is listening.
 */
export async function sweepStalePresenceOnStartup(wsManager: WsAdapter): Promise<void> {
  const allSessions = await getAllSessions()
  const liveSessions = allSessions.filter((s) => LIVE_STATES.has(s.state as SessionState))

  if (liveSessions.length === 0) {
    logger.info('startup-presence-sweep', 'No live sessions — skipping stale presence sweep')
    return
  }

  let removedCount = 0
  let cascadeCount = 0

  for (const session of liveSessions) {
    const sessionId = session.id as UUID

    const [presence, users] = await Promise.all([
      getSessionPresence(sessionId),
      getSessionUsers(sessionId),
    ])

    if (presence.length === 0) continue

    const roleByUserId = new Map(
      users.map((u) => [u.id as UUID, u.role as 'DM' | 'PLAYER' | 'SPECTATOR'])
    )

    for (const entry of presence) {
      if (entry.state === PresenceState.OFFLINE) {
        // Already offline before the server died — remove immediately, no reconnect window needed.
        wsManager.broadcastEventToSession(sessionId, {
          id: crypto.randomUUID() as UUID,
          type: 'SESSION:MEMBER_LEFT',
          version: 1,
          userId: SYSTEM_ACTOR_ID,
          userRole: Role.SYSTEM,
          sessionId,
          roomId: entry.primaryRoomId || null,
          timestamp: Date.now(),
          payload: {
            userId: entry.userId,
            username: entry.username,
            leftAt: Date.now(),
            reason: 'GHOST_EXPIRED',
          },
        })

        await removePresenceProjection({ sessionId, userId: entry.userId })
        removedCount++
      } else {
        // Was connected when the server died — start the normal cascade so the client has
        // the standard 50-second window to reconnect before being evicted.
        await sessionDisconnectCascadeService.handleUserDisconnected({
          sessionId,
          userId: entry.userId,
          username: entry.username,
          userRole: roleByUserId.get(entry.userId) ?? 'PLAYER',
          wsManager,
          isUserConnected: () => false,
          isSessionConnected: () => false,
        })
        cascadeCount++
      }
    }
  }

  logger.info('startup-presence-sweep', 'Stale presence sweep complete', {
    sessionsChecked: liveSessions.length,
    removedImmediately: removedCount,
    cascadeScheduled: cascadeCount,
  })
}
