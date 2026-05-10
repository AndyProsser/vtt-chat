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

import { Router, Request, Response } from 'express'
import { isValidUUID, Role } from '@shared'
import {
  listMockPlayers,
  joinMockPlayersToSession,
  removeMockPlayersFromSession,
  getMockPlayerTokens,
  resetDevMockRoster,
} from '@/services/dev-mock-players.service'
import { getSession } from '@/services/session.service'
import { broadcastSessionStatsSnapshot } from '@/services/session-stats.service'
import type { WebSocketManager } from '@/ws'
import type { UUID } from '@shared'

const router = Router()

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

export default router
