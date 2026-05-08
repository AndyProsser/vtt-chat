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
 */

import { Router, Request, Response } from 'express'
import { isValidUUID } from '@shared'
import {
  MOCK_PLAYERS,
  joinMockPlayersToSession,
  removeMockPlayersFromSession,
  getMockPlayerTokens,
} from '@/services/dev-mock-players.service'
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

  const tokens = sessionId ? getMockPlayerTokens(sessionId as UUID) : undefined

  return res.json({
    mockPlayers: MOCK_PLAYERS.map((m) => ({
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

  return res.json({
    ok: true,
    message: `Mock players joined session ${sessionId}`,
    count: MOCK_PLAYERS.length,
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

  return res.json({
    ok: true,
    message: `Mock players removed from session ${sessionId}`,
    count: MOCK_PLAYERS.length,
  })
})

export default router
