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
} from '@/services/dev-mock-players.service'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { getSession } from '@/services/session.service'
import { broadcastSessionStatsSnapshot } from '@/services/session-stats.service'
import {
  getMockTakeover,
  startMockTakeover,
  stopMockTakeover,
} from '@/services/dev-mock-takeover.service'
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
  const { sessionId, campaignId } = req.body || {}

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
  })

  // Broadcast WS events so all clients update without a page refresh
  const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
  if (result.sessionId && wsManager) {
    const sid = result.sessionId
    const now = Date.now()

    for (const removed of result.removedUsers) {
      if (removed.primaryRoomId) {
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
    }

    for (const added of result.addedUsers) {
      if (added.roomId) {
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
            joinedAt: now,
            reason: 'dev_mock_reroll',
          },
        })
      }
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

  return res.json({
    ok: true,
    rerolledCount: result.count,
    sessionId: result.sessionId,
    campaignId: result.campaignId,
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

  const takeover = getMockTakeover({
    sessionId: sessionId as UUID,
    actorUserId: user.userId as UUID,
  })

  return res.json({
    sessionId,
    active: Boolean(takeover),
    assumedUserId: takeover?.assumedUserId || null,
    startedAt: takeover?.startedAt || null,
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
