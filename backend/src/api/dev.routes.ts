/**
 * DEV-only routes — Mock Players
 *
 * Exposed only when NODE_ENV=development.
 * These routes let a single developer populate a session with mock players
 * so DM superpowers (conditions, drag-to-group, environments, whisper,
 * broadcast) can be exercised without real participants.
 *
 * Routes:
 *   GET  /dev/mock-players            — list mock player accounts + tokens for a session
 *   POST /dev/mock-players/join       — join all mocks into a session
 *   POST /dev/mock-players/remove     — remove all mocks from a session
 *   POST /dev/mock-players/reset      — reroll current mock roster for campaign/session
 */

import { Router, Request, Response, NextFunction } from 'express'
import { ErrorCode, isValidUUID, Role } from '@shared'
import {
  listMockPlayers,
  joinMockPlayersToSession,
  removeMockPlayersFromSession,
  getMockPlayerTokens,
  resetDevMockRoster,
  getSessionMockPlayerById,
} from '@/services/dev-mock/players.service'
import {
  getMockDisconnectRealismProfiles,
  getMockSimulationBounds,
  getMockSimulationPlayerCount,
  getMockSimulationStatus,
  stopMockSimulation,
  updateMockSimulationConfig,
} from '@/services/dev-mock/simulation.service'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { getSession } from '@/services/session/core.service'
import { resolveEffectiveSessionRole } from '@/services/session/authz.service'
import { getSessionPresence } from '@/services/room.service'
import { broadcastSessionStatsSnapshot } from '@/services/session/stats.service'
import {
  getMockTakeoverSnapshot,
  startMockTakeover,
  stopMockTakeover,
} from '@/services/dev-mock/takeover.service'
import { logger } from '@/utils/logger'
import type { WebSocketManager } from '@/ws'
import type { UUID } from '@shared'

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

async function broadcastDevMockRosterChange(
  req: Request,
  result: {
    sessionId?: UUID
    removedUsers: Array<{ userId: UUID; username: string; primaryRoomId?: UUID }>
    addedUsers: Array<{
      userId: UUID
      username: string
      roomId?: UUID
      playerName?: string
      avatarUrl?: string
      characterName?: string
      characterClass?: string
      characterSubclass?: string | null
      characterRace?: string
      level?: number
      characterStats?: unknown
    }>
  }
) {
  const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
  if (!result.sessionId || !wsManager) {
    return
  }

  const sid = result.sessionId
  const now = Date.now()

  for (const removed of result.removedUsers) {
    if (!removed.primaryRoomId) {
      continue
    }

    wsManager.broadcastEventToSession(sid, {
      id: crypto.randomUUID() as UUID,
      type: 'ROOM:USER_LEFT',
      version: 1,
      userId: removed.userId,
      userRole: Role.PLAYER,
      sessionId: sid,
      roomId: removed.primaryRoomId,
      timestamp: now,
      payload: {
        roomId: removed.primaryRoomId,
        userId: removed.userId,
        username: removed.username,
        leftAt: now,
        reason: 'dev_mock_reroll',
      },
    })
  }

  for (const added of result.addedUsers) {
    if (!added.roomId) {
      continue
    }

    wsManager.broadcastEventToSession(sid, {
      id: crypto.randomUUID() as UUID,
      type: 'ROOM:USER_JOINED',
      version: 1,
      userId: added.userId,
      userRole: Role.PLAYER,
      sessionId: sid,
      roomId: added.roomId,
      timestamp: now,
      payload: {
        roomId: added.roomId,
        userId: added.userId,
        username: added.username,
        playerName: added.playerName,
        avatarUrl: added.avatarUrl,
        characterName: added.characterName,
        characterClass: added.characterClass,
        characterSubclass: added.characterSubclass,
        characterRace: added.characterRace,
        level: added.level,
        characterStats: added.characterStats,
        joinedAt: now,
        reason: 'dev_mock_reroll',
      },
    })
  }

  const session = await getSession(sid)
  const actorUserId =
    session?.dmId || result.addedUsers[0]?.userId || result.removedUsers[0]?.userId || sid
  const actorUserRole = session?.dmId ? Role.DM : Role.SYSTEM

  await broadcastSessionStatsSnapshot({
    wsManager,
    sessionId: sid,
    actorUserId,
    actorUserRole,
  })
}

async function resolveTakeoverActorAuthorization(params: {
  sessionId: UUID
  actorUserId: UUID
}): Promise<{ ok: true; role: Role } | { ok: false; status: number; error: string }> {
  const authz = await resolveEffectiveSessionRole({
    sessionId: params.sessionId,
    userId: params.actorUserId,
  })

  if (!authz.ok) {
    return {
      ok: false,
      status: authz.code === 'SESSION_NOT_FOUND' ? 404 : 403,
      error: authz.message,
    }
  }

  if (authz.role === 'SPECTATOR') {
    return {
      ok: false,
      status: 403,
      error: 'Only DM or PLAYER may use mock takeover',
    }
  }

  const presence = await getSessionPresence(params.sessionId)
  const hasPresence = presence.some((entry) => entry.userId === params.actorUserId)
  if (!hasPresence) {
    return {
      ok: false,
      status: 403,
      error: 'Takeover requires active session presence',
    }
  }

  return { ok: true, role: authz.role }
}

/**
 * GET /dev/mock-players?sessionId=<uuid>
 * Returns the mock player roster and, if sessionId is provided, short-lived
 * JWT tokens so you can log in as a mock player in a private browser window.
 */
router.get('/', async (req: Request, res: Response) => {
  const { sessionId } = req.query

  if (sessionId && !isValidUUID(sessionId as string)) {
    return res.status(400).json({ error: 'Invalid sessionId' })
  }

  const mockPlayers = await listMockPlayers()
  const tokens = sessionId ? await getMockPlayerTokens(sessionId as UUID) : undefined

  return res.json({
    mockPlayers: mockPlayers.map((m) => ({
      id: m.id,
      username: m.username,
      displayName: m.displayName,
    })),
    ...(tokens
      ? {
          tokens: tokens.map(({ mock, token }) => ({
            userId: mock.id,
            username: mock.username,
            displayName: mock.displayName,
            token,
          })),
        }
      : {}),
  })
})

/**
 * POST /dev/mock-players/join
 * Body: { sessionId: string }
 * Joins all mock players into the session's current room (greenroom or main).
 */
router.post('/join', async (req: Request, res: Response) => {
  const { sessionId } = req.body

  if (!sessionId || !isValidUUID(sessionId)) {
    return res.status(400).json({ error: 'sessionId is required and must be a valid UUID' })
  }

  await joinMockPlayersToSession(sessionId as UUID)

  const mockPlayers = await listMockPlayers()

  return res.json({
    ok: true,
    message: `Mock players joined session ${sessionId}`,
    availableTemplates: mockPlayers.length,
  })
})

/**
 * POST /dev/mock-players/remove
 * Body: { sessionId: string }
 * Removes all mock players from the session presence and member list.
 */
router.post('/remove', async (req: Request, res: Response) => {
  const { sessionId } = req.body

  if (!sessionId || !isValidUUID(sessionId)) {
    return res.status(400).json({ error: 'sessionId is required and must be a valid UUID' })
  }

  await removeMockPlayersFromSession(sessionId as UUID)

  const mockPlayers = await listMockPlayers()

  return res.json({
    ok: true,
    message: `Mock players removed from session ${sessionId}`,
    availableTemplates: mockPlayers.length,
  })
})

/**
 * POST /dev/mock-players/reset
 * Body: { sessionId?: string, campaignId?: string }
 * Re-rolls the mock roster instantly without restarting backend.
 */
router.post('/reset', async (req: Request, res: Response) => {
  const { sessionId, campaignId, requestedCount, newPlayerCount } = req.body || {}

  if (!sessionId && !campaignId) {
    return res.status(400).json({
      error: 'Provide at least one of sessionId or campaignId',
    })
  }

  if (sessionId && !isValidUUID(sessionId)) {
    return res.status(400).json({ error: 'sessionId must be a valid UUID' })
  }

  if (campaignId && !isValidUUID(campaignId)) {
    return res.status(400).json({ error: 'campaignId must be a valid UUID' })
  }

  const result = await resetDevMockRoster({
    sessionId: sessionId as UUID | undefined,
    campaignId: campaignId as UUID | undefined,
    requestedCount:
      typeof requestedCount === 'number'
        ? requestedCount
        : typeof newPlayerCount === 'number'
          ? newPlayerCount
          : undefined,
  })

  // Broadcast WS events so all clients update without a page refresh
  await broadcastDevMockRosterChange(req, result)

  return res.json({
    ok: true,
    rerolledCount: result.count,
    requestedCount:
      typeof requestedCount === 'number'
        ? requestedCount
        : typeof newPlayerCount === 'number'
          ? newPlayerCount
          : undefined,
    sessionId: result.sessionId,
    campaignId: result.campaignId,
  })
})

router.get('/simulation/status/:sessionId', requireAuth, async (req: Request, res: Response) => {
  const { sessionId } = req.params

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({ error: 'Invalid sessionId' })
  }

  try {
    const status = await getMockSimulationStatus(sessionId as UUID)
    const bounds = getMockSimulationBounds()
    const disconnectProfiles = getMockDisconnectRealismProfiles()

    return res.json({
      ...status,
      bounds,
      disconnectProfiles,
    })
  } catch (error) {
    logger.error(
      'dev-mock-routes',
      `Failed to fetch simulation status for session ${sessionId}`,
      error
    )

    return res.status(503).json({
      code: ErrorCode.SERVICE_UNAVAILABLE,
      error: 'Mock simulation status temporarily unavailable',
    })
  }
})

router.post('/simulation/settings', requireAuth, async (req: Request, res: Response) => {
  const { sessionId, config } = req.body || {}

  if (!sessionId || !isValidUUID(sessionId)) {
    return res.status(400).json({ error: 'sessionId is required and must be a valid UUID' })
  }

  const requestedConfig =
    config && typeof config === 'object'
      ? (config as {
          speakingSimulatorEnabled?: boolean
          chatSimulatorEnabled?: boolean
          disconnectSimulatorEnabled?: boolean
          playerCount?: number
          disconnectRealismProfile?: 'SHORT_BLIPS' | 'BALANCED' | 'NETWORK_CHURN'
          disconnectChancePerTick?: number
          ghostMinDurationMs?: number
          ghostMaxDurationMs?: number
        })
      : {}

  const updated = await updateMockSimulationConfig({
    sessionId: sessionId as UUID,
    config: requestedConfig,
  })

  return res.json({
    ok: true,
    sessionId,
    config: updated,
  })
})

router.post('/reroll', requireAuth, async (req: Request, res: Response) => {
  const { sessionId, newPlayerCount } = req.body || {}

  if (!sessionId || !isValidUUID(sessionId)) {
    return res.status(400).json({ error: 'sessionId is required and must be a valid UUID' })
  }

  const result = await resetDevMockRoster({
    sessionId: sessionId as UUID,
    requestedCount: typeof newPlayerCount === 'number' ? newPlayerCount : undefined,
  })

  // Keep session roster UIs live in DEV without requiring full page rehydration.
  await broadcastDevMockRosterChange(req, result)

  if (typeof newPlayerCount === 'number') {
    await updateMockSimulationConfig({
      sessionId: sessionId as UUID,
      config: { playerCount: newPlayerCount },
    })
  }

  return res.json({
    ok: true,
    sessionId,
    rerolledCount: result.count,
    playerCount: getMockSimulationPlayerCount(sessionId as UUID),
  })
})

router.post('/disconnect-all', requireAuth, async (req: Request, res: Response) => {
  const { sessionId } = req.body || {}

  if (!sessionId || !isValidUUID(sessionId)) {
    return res.status(400).json({ error: 'sessionId is required and must be a valid UUID' })
  }

  await stopMockSimulation(sessionId as UUID)
  await removeMockPlayersFromSession(sessionId as UUID)

  return res.json({
    ok: true,
    sessionId,
    removed: true,
  })
})

router.get('/takeover/status/:sessionId', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { sessionId } = req.params

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({ error: 'Invalid sessionId' })
  }

  const session = await getSession(sessionId as UUID)
  if (!session) {
    return res.status(404).json({ error: 'Session not found' })
  }

  const actorAuthz = await resolveTakeoverActorAuthorization({
    sessionId: sessionId as UUID,
    actorUserId: user.userId as UUID,
  })
  if (!actorAuthz.ok) {
    return res.status(actorAuthz.status).json({ error: actorAuthz.error })
  }

  const snapshot = await getMockTakeoverSnapshot({
    sessionId: sessionId as UUID,
    actorUserId: user.userId as UUID,
  })

  return res.json({
    sessionId,
    active: snapshot.active,
    actorUserId: snapshot.actorUserId,
    effectiveUserId: snapshot.effectiveUserId,
    assumedUserId: snapshot.assumedUserId,
    assumedDisplayName: snapshot.assumedDisplayName,
    startedAt: snapshot.startedAt,
    staleRecovered: snapshot.staleRecovered,
  })
})

router.post('/takeover/start', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { sessionId, targetUserId } = req.body || {}

  if (!sessionId || !isValidUUID(sessionId)) {
    return res.status(400).json({ error: 'sessionId is required and must be a valid UUID' })
  }

  if (!targetUserId || !isValidUUID(targetUserId)) {
    return res.status(400).json({ error: 'targetUserId is required and must be a valid UUID' })
  }

  const session = await getSession(sessionId as UUID)
  if (!session) {
    return res.status(404).json({ error: 'Session not found' })
  }

  const actorAuthz = await resolveTakeoverActorAuthorization({
    sessionId: sessionId as UUID,
    actorUserId: user.userId as UUID,
  })
  if (!actorAuthz.ok) {
    return res.status(actorAuthz.status).json({ error: actorAuthz.error })
  }

  const mockPlayer = await getSessionMockPlayerById(sessionId as UUID, targetUserId as UUID)
  if (!mockPlayer) {
    return res.status(400).json({ error: 'Target user is not an eligible mock player' })
  }

  const takeover = startMockTakeover({
    sessionId: sessionId as UUID,
    actorUserId: user.userId as UUID,
    assumedUserId: targetUserId as UUID,
  })

  return res.json({
    ok: true,
    sessionId,
    actorUserId: user.userId,
    assumedUserId: takeover.assumedUserId,
    startedAt: takeover.startedAt,
    assumedDisplayName: mockPlayer.displayName,
  })
})

router.post('/takeover/stop', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { sessionId } = req.body || {}

  if (!sessionId || !isValidUUID(sessionId)) {
    return res.status(400).json({ error: 'sessionId is required and must be a valid UUID' })
  }

  const session = await getSession(sessionId as UUID)
  if (!session) {
    return res.status(404).json({ error: 'Session not found' })
  }

  const actorAuthz = await resolveTakeoverActorAuthorization({
    sessionId: sessionId as UUID,
    actorUserId: user.userId as UUID,
  })
  if (!actorAuthz.ok) {
    return res.status(actorAuthz.status).json({ error: actorAuthz.error })
  }

  const removed = stopMockTakeover({
    sessionId: sessionId as UUID,
    actorUserId: user.userId as UUID,
  })

  return res.json({
    ok: true,
    sessionId,
    actorUserId: user.userId,
    cleared: removed,
  })
})

export default router
