import { PresenceState, Role, SessionState } from '@shared'
import type { UUID } from '@shared'
import { config } from '@/infra/config'
import { listCleanupCandidateSessions } from '@/repositories/session.repository'
import { getRooms, getSessionPresence } from '@/services/room.service'
import { updateSessionState, getSessionUsers } from '@/services/session.service'
import { clearRoomMessages } from '@/services/chat.service'
import { logger } from '@/utils'

function isGreenRoomName(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ')
  return normalized === 'green room' || normalized === 'green-room'
}

async function hasConnectedTableMembers(sessionId: UUID): Promise<boolean> {
  const [members, presence] = await Promise.all([
    getSessionUsers(sessionId),
    getSessionPresence(sessionId),
  ])

  const tableMemberIds = new Set(
    members
      .filter((member) => member.role === Role.DM || member.role === Role.PLAYER)
      .map((member) => member.id)
  )

  if (tableMemberIds.size === 0) {
    return false
  }

  return presence.some(
    (entry) => tableMemberIds.has(entry.userId) && entry.state !== PresenceState.OFFLINE
  )
}

export class SessionCleanupJobService {
  private intervalId: ReturnType<typeof setInterval> | null = null

  start(): void {
    if (this.intervalId !== null) {
      return
    }

    const intervalMs = config.sessionCleanup.jobIntervalMinutes * 60_000
    this.intervalId = setInterval(() => {
      void this.runOnce()
    }, intervalMs)

    logger.info('session-cleanup-job', 'Scheduled cleanup job started', {
      intervalMinutes: config.sessionCleanup.jobIntervalMinutes,
      minCleanupAgeMinutes: config.sessionCleanup.minCleanupAgeMinutes,
    })
  }

  stop(): void {
    if (this.intervalId === null) {
      return
    }

    clearInterval(this.intervalId)
    this.intervalId = null
  }

  async runOnce(): Promise<void> {
    const cutoff = new Date(Date.now() - config.sessionCleanup.minCleanupAgeMinutes * 60_000)
    const candidates = await listCleanupCandidateSessions(cutoff)

    if (candidates.length === 0) {
      return
    }

    for (const candidate of candidates) {
      const sessionId = candidate.id as UUID

      try {
        const tableStillConnected = await hasConnectedTableMembers(sessionId)
        if (tableStillConnected) {
          continue
        }

        const rooms = await getRooms(sessionId)
        const greenRoom = rooms.find((room) => room.type === 'GROUP' && isGreenRoomName(room.name))

        if (greenRoom) {
          await clearRoomMessages(sessionId, greenRoom.id)
        }

        await updateSessionState(sessionId, SessionState.IDLE, candidate.dmId as UUID)

        logger.info('session-cleanup-job', 'Cleaned up session', {
          sessionId,
          previousState: candidate.state,
          updatedAt: candidate.updatedAt,
        })
      } catch (error) {
        logger.warn('session-cleanup-job', 'Failed to clean up session', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
}

export const sessionCleanupJobService = new SessionCleanupJobService()
