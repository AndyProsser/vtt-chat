import { PresenceState, Role, SessionState } from '@shared'
import type { UUID, EventEnvelope } from '@shared'
import { config } from '@/infra/config'
import {
  listCleanupCandidateSessions,
  listCooldownSessionsWithCampaign,
  listEndedSessionsWithCampaign,
  campaignHasActiveSessions,
  listEndedSessionIdsByCampaign,
} from '@/repositories/session.repository'
import {
  getRooms,
  getSessionPresence,
  applySessionStateRoomTransition,
} from '@/services/room.service'
import { updateSessionState, getSessionUsers } from '@/services/session/core.service'
import { clearRoomMessages } from '@/services/chat.service'
import {
  disableMockSimulationForSessionExit,
  purgeMockSimulationSessionState,
} from '@/services/dev-mock/simulation.service'
import {
  SESSION_COOLDOWN_EXTENSION_MAX_MS,
  SESSION_COOLDOWN_EXTENSION_MIN_MS,
  STANDALONE_SESSION_COOLDOWN_MS,
} from '@/constants/session.constants'
import { logger, isGreenRoomName } from '@/utils'
import crypto from 'node:crypto'

interface WsAdapter {
  broadcastEventToSession: (sessionId: UUID, event: EventEnvelope) => void
}

const LIFECYCLE_FALLBACK_POLL_INTERVAL_MS = 60_000
const SYSTEM_ACTOR_ID = '00000000-0000-4000-8000-000000000000' as UUID

function getSessionCooldownDurationMs(session: {
  campaign: {
    postSessionChatEnabled: boolean
    postSessionChatDurationMs: number
  } | null
}): number {
  return session.campaign?.postSessionChatDurationMs == null
    ? STANDALONE_SESSION_COOLDOWN_MS
    : Math.max(
        SESSION_COOLDOWN_EXTENSION_MIN_MS,
        Math.min(SESSION_COOLDOWN_EXTENSION_MAX_MS, session.campaign.postSessionChatDurationMs)
      )
}

function getCooldownExpiryAtMs(
  session: {
    endedAt: Date | null
    campaign: {
      postSessionChatEnabled: boolean
      postSessionChatDurationMs: number
    } | null
  },
  now: number
): number {
  const cooldownStartedAtMs = session.endedAt?.getTime() ?? now
  return cooldownStartedAtMs + getSessionCooldownDurationMs(session)
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

async function getLatestTableMemberLastSeenAt(sessionId: UUID): Promise<number | null> {
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
    return null
  }

  let latestSeenAt: number | null = null
  for (const entry of presence) {
    if (!tableMemberIds.has(entry.userId)) {
      continue
    }

    if (typeof entry.lastSeenAt === 'number' && Number.isFinite(entry.lastSeenAt)) {
      latestSeenAt =
        latestSeenAt === null ? entry.lastSeenAt : Math.max(latestSeenAt, entry.lastSeenAt)
    }
  }

  return latestSeenAt
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
  await disableMockSimulationForSessionExit(session.id as UUID)

  logger.info('session-cleanup-job', 'Transitioned session COOLDOWN → ENDED (cooldown expired)', {
    sessionId: session.id,
    sessionName: session.name,
  })
}

/**
 * Transitions a session from ENDED to CLEANUP and purges its greenroom chat.
 * Broadcasts ROOM:SESSION_TRANSITION_APPLIED so reconnecting clients know everyone is OFFLINE.
 * Uses the session's own dmId for authorization — the job acts on behalf of the DM.
 */
async function transitionToCleanup(
  session: {
    id: string
    dmId: string
    name: string
  },
  wsManager?: WsAdapter
): Promise<void> {
  await updateSessionState(session.id as UUID, SessionState.CLEANUP, session.dmId as UUID)
  await disableMockSimulationForSessionExit(session.id as UUID)
  await purgeMockSimulationSessionState(session.id as UUID)
  await purgeGreenroomChat(session.id as UUID)

  // If wsManager available, apply room transitions and broadcast event
  // so reconnecting clients see CLEANUP state with everyone OFFLINE in greenroom
  if (wsManager) {
    const sessionId = session.id as UUID
    const transition = await applySessionStateRoomTransition({
      sessionId,
      dmId: session.dmId as UUID,
      nextState: SessionState.CLEANUP,
      users: await getSessionUsers(sessionId).then((users) =>
        users.map((u) => ({ id: u.id, username: u.username }))
      ),
    })

    wsManager.broadcastEventToSession(sessionId, {
      id: crypto.randomUUID() as UUID,
      type: 'ROOM:SESSION_TRANSITION_APPLIED',
      version: 1,
      userId: SYSTEM_ACTOR_ID,
      userRole: Role.SYSTEM,
      sessionId,
      roomId: transition.targetRoomId,
      timestamp: Date.now(),
      payload: {
        previousState: SessionState.ENDED,
        nextState: SessionState.CLEANUP,
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
  }

  logger.info('session-cleanup-job', 'Transitioned session ENDED → CLEANUP', {
    sessionId: session.id,
    sessionName: session.name,
    wsEventBroadcast: Boolean(wsManager),
  })
}

export class SessionCleanupJobService {
  private lifecycleTimeoutId: ReturnType<typeof setTimeout> | null = null
  private lifecycleNextRunAtMs: number | null = null
  private archiveIntervalId: ReturnType<typeof setInterval> | null = null
  private lifecycleWorkerRunning = false
  private archiveWorkerRunning = false
  private wsManager: WsAdapter | null = null

  setWebSocketManager(wsManager: WsAdapter): void {
    this.wsManager = wsManager
  }

  start(): void {
    if (this.archiveIntervalId !== null) {
      return
    }

    const intervalMs = config.sessionCleanup.jobIntervalMinutes * 60_000
    this.archiveIntervalId = setInterval(() => {
      void this.runArchiveWorkerOnce()
    }, intervalMs)

    logger.info('session-cleanup-job', 'Scheduled archive verification worker started', {
      intervalMinutes: config.sessionCleanup.jobIntervalMinutes,
      minCleanupAgeMinutes: config.sessionCleanup.minCleanupAgeMinutes,
    })

    void this.refreshLifecycleScheduler('bootstrap')
  }

  stop(): void {
    this.clearLifecycleScheduler('stopped')

    if (this.archiveIntervalId !== null) {
      clearInterval(this.archiveIntervalId)
      this.archiveIntervalId = null
    }
  }

  async runOnce(): Promise<void> {
    await this.runLifecycleSweepOnce()
    await this.runArchiveWorkerOnce()
  }

  notifyLifecycleTrigger(reason: 'COOLDOWN_STARTED' | 'SESSION_ENDED'): void {
    void this.refreshLifecycleScheduler(reason)
  }

  private async refreshLifecycleScheduler(reason: string): Promise<void> {
    await this.runLifecycleSweepOnce()
    await this.scheduleNextLifecycleSweep(reason)
  }

  private async handleLifecycleTick(): Promise<void> {
    this.lifecycleTimeoutId = null
    this.lifecycleNextRunAtMs = null

    await this.runLifecycleSweepOnce()

    await this.scheduleNextLifecycleSweep('tick')
  }

  private async scheduleNextLifecycleSweep(reason: string): Promise<void> {
    const nextDelayMs = await this.getNextLifecycleDelayMs()
    if (nextDelayMs === null) {
      this.clearLifecycleScheduler(reason === 'tick' ? 'drained' : 'idle')
      return
    }

    const nextRunAtMs = Date.now() + nextDelayMs
    if (
      this.lifecycleTimeoutId !== null &&
      this.lifecycleNextRunAtMs !== null &&
      this.lifecycleNextRunAtMs <= nextRunAtMs
    ) {
      return
    }

    if (this.lifecycleTimeoutId !== null) {
      clearTimeout(this.lifecycleTimeoutId)
    }

    this.lifecycleNextRunAtMs = nextRunAtMs
    this.lifecycleTimeoutId = setTimeout(() => {
      void this.handleLifecycleTick()
    }, nextDelayMs)

    logger.info('session-cleanup-job', 'Scheduled on-demand lifecycle cleanup sweep', {
      reason,
      nextDelayMs,
      nextRunAtMs,
      endedDisconnectGraceMs: config.sessionCleanup.endedDisconnectGraceMs,
    })
  }

  private clearLifecycleScheduler(reason: 'idle' | 'drained' | 'stopped'): void {
    if (this.lifecycleTimeoutId === null) {
      return
    }

    clearTimeout(this.lifecycleTimeoutId)
    this.lifecycleTimeoutId = null
    this.lifecycleNextRunAtMs = null

    logger.info('session-cleanup-job', 'Stopped on-demand lifecycle cleanup scheduler', {
      reason,
    })
  }

  private async getNextLifecycleDelayMs(): Promise<number | null> {
    const [cooldownSessions, endedSessions] = await Promise.all([
      listCooldownSessionsWithCampaign(),
      listEndedSessionsWithCampaign(),
    ])

    if (cooldownSessions.length === 0 && endedSessions.length === 0) {
      return null
    }

    const now = Date.now()
    let nearestKnownDeadlineMs = Number.POSITIVE_INFINITY
    let hasUnknownDeadline = false
    const campaignActiveSessionCache = new Map<string, boolean>()

    for (const session of cooldownSessions) {
      nearestKnownDeadlineMs = Math.min(nearestKnownDeadlineMs, getCooldownExpiryAtMs(session, now))
    }

    for (const session of endedSessions) {
      const sessionId = session.id as UUID
      const tableStillConnected = await hasConnectedTableMembers(sessionId)
      if (tableStillConnected) {
        hasUnknownDeadline = true
        continue
      }

      if (session.campaignId) {
        let hasActiveSiblings = campaignActiveSessionCache.get(session.campaignId)
        if (hasActiveSiblings === undefined) {
          hasActiveSiblings = await campaignHasActiveSessions(session.campaignId)
          campaignActiveSessionCache.set(session.campaignId, hasActiveSiblings)
        }

        if (hasActiveSiblings) {
          hasUnknownDeadline = true
          continue
        }
      }

      const latestSeenAt = await getLatestTableMemberLastSeenAt(sessionId)
      const fallbackSeenAt = session.endedAt?.getTime() ?? now
      nearestKnownDeadlineMs = Math.min(
        nearestKnownDeadlineMs,
        (latestSeenAt ?? fallbackSeenAt) + config.sessionCleanup.endedDisconnectGraceMs
      )
    }

    if (Number.isFinite(nearestKnownDeadlineMs)) {
      return Math.max(0, nearestKnownDeadlineMs - now)
    }

    return hasUnknownDeadline ? LIFECYCLE_FALLBACK_POLL_INTERVAL_MS : null
  }

  private async runLifecycleSweepOnce(): Promise<void> {
    await this.runLifecycleWorkerOnce()
  }

  async runLifecycleWorkerOnce(): Promise<void> {
    if (this.lifecycleWorkerRunning) {
      return
    }

    this.lifecycleWorkerRunning = true
    try {
      await this.phaseCooldownToEnded()
      await this.phaseEndedToCleanup()
    } finally {
      this.lifecycleWorkerRunning = false
    }
  }

  async runArchiveWorkerOnce(): Promise<void> {
    if (this.archiveWorkerRunning) {
      return
    }

    this.archiveWorkerRunning = true
    try {
      await this.phaseCleanupArchiveLock()
    } finally {
      this.archiveWorkerRunning = false
    }
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
        const cooldownExpiresAt = getCooldownExpiryAtMs(session, now)

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
        const now = Date.now()

        // --- 1. Check all table members are disconnected ---
        // ENDED means the cooldown window has already expired (handled in phaseCooldownToEnded).
        // We only need to wait for all participants to disconnect before archiving.
        const tableStillConnected = await hasConnectedTableMembers(sessionId)
        if (tableStillConnected) {
          continue
        }

        // --- 1b. Enforce disconnect grace to avoid refresh races ---
        const latestSeenAt = await getLatestTableMemberLastSeenAt(sessionId)
        const fallbackSeenAt = session.endedAt?.getTime() ?? now
        const disconnectedSinceMs = now - (latestSeenAt ?? fallbackSeenAt)

        if (disconnectedSinceMs < config.sessionCleanup.endedDisconnectGraceMs) {
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
              await transitionToCleanup(sibling, this.wsManager ?? undefined)
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
          await transitionToCleanup(session, this.wsManager ?? undefined)
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
