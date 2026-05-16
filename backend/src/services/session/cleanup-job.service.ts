import { PresenceState, Role, SessionState } from '@shared'
import type { UUID } from '@shared'
import { config } from '@/infra/config'
import {
  listCleanupCandidateSessions,
  listCooldownSessionsWithCampaign,
  listEndedSessionsWithCampaign,
  campaignHasActiveSessions,
  listEndedSessionIdsByCampaign,
} from '@/repositories/session.repository'
import { getRooms, getSessionPresence } from '@/services/room.service'
import { updateSessionState, getSessionUsers } from '@/services/session/core.service'
import { clearRoomMessages } from '@/services/chat.service'
import { STANDALONE_SESSION_COOLDOWN_MS } from '@/constants/session.constants'
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

/**
 * Purges greenroom chat messages for a session.
 * This is safe to call more than once — calling on an already-purged session is a no-op.
 */
async function purgeGreenroomChat(sessionId: UUID): Promise<void> {
  const rooms = await getRooms(sessionId)
  const greenRoom = rooms.find((room) => room.type === 'GROUP' && isGreenRoomName(room.name))

  if (greenRoom) {
    const purged = await clearRoomMessages(sessionId, greenRoom.id)
    logger.info('session-cleanup-job', 'Purged greenroom chat', {
      sessionId,
      greenRoomId: greenRoom.id,
      messagesPurged: purged,
    })
  }
}

/**
 * Transitions a session from COOLDOWN to ENDED once the cooldown timer expires.
 * Uses the session's own dmId for authorization — the job acts on behalf of the DM.
 */
async function transitionCooldownToEnded(session: {
  id: string
  dmId: string
  name: string
}): Promise<void> {
  await updateSessionState(session.id as UUID, SessionState.ENDED, session.dmId as UUID)

  logger.info('session-cleanup-job', 'Transitioned session COOLDOWN → ENDED (cooldown expired)', {
    sessionId: session.id,
    sessionName: session.name,
  })
}

/**
 * Transitions a session from ENDED to CLEANUP and purges its greenroom chat.
 * Uses the session's own dmId for authorization — the job acts on behalf of the DM.
 */
async function transitionToCleanup(session: {
  id: string
  dmId: string
  name: string
}): Promise<void> {
  await updateSessionState(session.id as UUID, SessionState.CLEANUP, session.dmId as UUID)
  await purgeGreenroomChat(session.id as UUID)

  logger.info('session-cleanup-job', 'Transitioned session ENDED → CLEANUP', {
    sessionId: session.id,
    sessionName: session.name,
  })
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
    await this.phaseCooldownToEnded()
    await this.phaseEndedToCleanup()
    await this.phaseCleanupArchiveLock()
  }

  /**
   * Phase 0: COOLDOWN → ENDED
   *
   * Scans all COOLDOWN sessions. For each:
   *  1. Checks whether the post-session cooldown timer has expired (now >= endedAt + cooldownMs).
   *  2. Transitions the session to ENDED if the timer has elapsed.
   *
   * No WS broadcast is emitted — the SESSION:ENDED event is authoritative only after the
   * timer expires; clients that poll or reconnect will see the new ENDED state.
   */
  private async phaseCooldownToEnded(): Promise<void> {
    const cooldownSessions = await listCooldownSessionsWithCampaign()

    if (cooldownSessions.length === 0) {
      return
    }

    const now = Date.now()

    for (const session of cooldownSessions) {
      const sessionId = session.id as UUID

      try {
        const cooldownMs =
          session.campaign?.postSessionChatEnabled === false
            ? 0
            : (session.campaign?.postSessionChatDurationMs ?? STANDALONE_SESSION_COOLDOWN_MS)

        const cooldownStartedAtMs = session.endedAt?.getTime() ?? 0
        const cooldownExpiresAt = cooldownStartedAtMs + cooldownMs

        if (now < cooldownExpiresAt) {
          // Timer still running — check back later.
          continue
        }

        await transitionCooldownToEnded(session)
      } catch (error) {
        logger.warn(
          'session-cleanup-job',
          'Error processing COOLDOWN session in phaseCooldownToEnded',
          {
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          }
        )
      }
    }
  }

  /**
   * Phase 1: ENDED → CLEANUP
   *
   * Scans all ENDED sessions (cooldown has already expired). For each:
   *  1. Verifies all DM/PLAYER table members are disconnected.
   *  2. For campaign sessions: checks whether this is the final session
   *     (no siblings in ACTIVE or PAUSED state). If final, batch-transitions
   *     ALL ENDED sessions for that campaign to CLEANUP simultaneously.
   *  3. For standalone sessions (no campaignId): transitions directly.
   *
   * Greenroom chat is purged for every session that transitions.
   * No WS broadcast is emitted because all users are disconnected by definition.
   */
  private async phaseEndedToCleanup(): Promise<void> {
    const endedSessions = await listEndedSessionsWithCampaign()

    if (endedSessions.length === 0) {
      return
    }

    // Track which campaignIds we've already batch-processed so we don't double-transition.
    const processedCampaigns = new Set<string>()

    for (const session of endedSessions) {
      const sessionId = session.id as UUID

      try {
        // --- 1. Check all table members are disconnected ---
        // ENDED means the cooldown window has already expired (handled in phaseCooldownToEnded).
        // We only need to wait for all participants to disconnect before archiving.
        const tableStillConnected = await hasConnectedTableMembers(sessionId)
        if (tableStillConnected) {
          continue
        }

        // --- 2. Campaign vs standalone ---
        if (session.campaignId) {
          const campaignId = session.campaignId

          // Skip if we already handled this campaign in this job run.
          if (processedCampaigns.has(campaignId)) {
            continue
          }

          // Check for any ACTIVE or PAUSED siblings in the campaign.
          const hasActive = await campaignHasActiveSessions(campaignId)
          if (hasActive) {
            // Campaign still running — don't transition.
            continue
          }

          // Final session detected. Batch-transition ALL ENDED sessions for this campaign.
          const allEndedForCampaign = await listEndedSessionIdsByCampaign(campaignId)

          for (const sibling of allEndedForCampaign) {
            try {
              await transitionToCleanup(sibling)
            } catch (err) {
              logger.warn(
                'session-cleanup-job',
                'Failed to transition sibling session to CLEANUP',
                {
                  sessionId: sibling.id,
                  campaignId,
                  error: err instanceof Error ? err.message : String(err),
                }
              )
            }
          }

          processedCampaigns.add(campaignId)
        } else {
          // Standalone session — transition directly.
          await transitionToCleanup(session)
        }
      } catch (error) {
        logger.warn(
          'session-cleanup-job',
          'Error processing ENDED session in phaseEndedToCleanup',
          {
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          }
        )
      }
    }
  }

  /**
   * Phase 2: CLEANUP archive lock verification.
   *
   * CLEANUP is terminal for archived sessions. This phase only belt-and-suspenders
   * verifies the greenroom has been purged for aged cleanup sessions and leaves
   * the session archived in CLEANUP.
   */
  private async phaseCleanupArchiveLock(): Promise<void> {
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

        await purgeGreenroomChat(sessionId)

        logger.info('session-cleanup-job', 'Verified archived cleanup session', {
          sessionId,
          state: candidate.state,
          updatedAt: candidate.updatedAt,
        })
      } catch (error) {
        logger.warn('session-cleanup-job', 'Failed cleanup archive verification', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
}

export const sessionCleanupJobService = new SessionCleanupJobService()
