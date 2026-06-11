import { randomUUID } from 'crypto'
import { getPrismaClient } from '@/infra/db'
import { getPlatformStatus } from '@/services/guest-auth'
import type { PlatformStatus } from '@/types/guest-auth.types'
import { logger } from '@/utils'
import eventBroadcaster from '@/ws/event-broadcaster'
import { PresenceState, Role, SessionState } from '@shared'
import type { CampaignLobbyStatsUpdatedPayload, UUID } from '@shared'

const prisma = getPrismaClient()

const RUNTIME_SESSION_STATES = [
  SessionState.ACTIVE,
  SessionState.PAUSED,
  SessionState.COOLDOWN,
] as const

const ENDED_SESSION_STATES = [SessionState.ENDED, SessionState.CLEANUP] as const

export async function getLobbyStatsSnapshot(
  platformStatus?: Pick<PlatformStatus, 'activeSessions' | 'peakConcurrentUsers24h'>
): Promise<CampaignLobbyStatsUpdatedPayload> {
  const [resolvedPlatformStatus, runtimeSessions, endedSessions] = await Promise.all([
    platformStatus ? Promise.resolve(platformStatus) : getPlatformStatus(),
    prisma.session
      .findMany({
        where: {
          state: { in: [...RUNTIME_SESSION_STATES] },
          campaignId: { not: null },
        },
        select: {
          campaignId: true,
          dmId: true,
          state: true,
          members: {
            select: {
              userId: true,
              role: true,
            },
          },
          presence: {
            where: {
              state: PresenceState.ONLINE,
            },
            select: {
              userId: true,
            },
          },
        },
      })
      .catch(() => [])
      .then((value) => value ?? []),
    prisma.session
      .findMany({
        where: {
          state: { in: [...ENDED_SESSION_STATES] },
          startedAt: { not: null },
          endedAt: { not: null },
        },
        select: {
          startedAt: true,
          endedAt: true,
        },
      })
      .catch(() => [])
      .then((value) => value ?? []),
  ])

  const activeCampaignIds = new Set<UUID>()
  const pausedCampaignIds = new Set<UUID>()
  let connectedPlayersAndDms = 0
  let connectedSpectators = 0

  for (const session of runtimeSessions) {
    if (session.campaignId && session.state === SessionState.ACTIVE) {
      activeCampaignIds.add(session.campaignId as UUID)
    }
    if (session.campaignId && session.state === SessionState.PAUSED) {
      pausedCampaignIds.add(session.campaignId as UUID)
    }

    const roleByUserId = new Map(
      session.members.map((member) => [member.userId as UUID, member.role])
    )
    roleByUserId.set(session.dmId as UUID, Role.DM)

    for (const presence of session.presence) {
      const role = roleByUserId.get(presence.userId as UUID)
      if (role === Role.SPECTATOR) {
        connectedSpectators += 1
      } else if (role === Role.DM || role === Role.PLAYER) {
        connectedPlayersAndDms += 1
      }
    }
  }

  let totalEndedSessionDurationMs = 0
  for (const session of endedSessions) {
    const startedAtMs = session.startedAt ? new Date(session.startedAt).getTime() : 0
    const endedAtMs = session.endedAt ? new Date(session.endedAt).getTime() : 0
    totalEndedSessionDurationMs += Math.max(0, endedAtMs - startedAtMs)
  }

  return {
    activeSessions: Math.max(0, Math.floor(resolvedPlatformStatus.activeSessions || 0)),
    connectedPlayersAndDms,
    connectedSpectators,
    peakConcurrentUsers24h: Math.max(
      0,
      Math.floor(resolvedPlatformStatus.peakConcurrentUsers24h || 0)
    ),
    activeCampaigns: activeCampaignIds.size,
    pausedCampaigns: pausedCampaignIds.size,
    totalEndedSessionDurationMs,
    averageEndedSessionDurationMs:
      endedSessions.length > 0 ? Math.round(totalEndedSessionDurationMs / endedSessions.length) : 0,
  }
}

export async function broadcastLobbyStatsUpdated(userId: UUID, userRole: Role): Promise<void> {
  try {
    if (!eventBroadcaster.isReady()) {
      return
    }

    const payload = await getLobbyStatsSnapshot()
    eventBroadcaster.sendToAllAuthenticated({
      id: randomUUID() as UUID,
      type: 'CAMPAIGN:LOBBY_STATS_UPDATED',
      version: 1,
      userId,
      userRole,
      sessionId: null as unknown as UUID,
      roomId: null,
      timestamp: Date.now(),
      payload,
    })
  } catch (error) {
    logger.warn('lobby.stats', 'Failed to broadcast lobby stats update', {
      userId,
      userRole,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
