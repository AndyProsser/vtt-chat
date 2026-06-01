/**
 * Journal API routes — session-level journal operations
 *
 * Journals are session-specific notes:
 * - GET /api/journals/:sessionId — Retrieve journal for a session
 * - POST/PUT /api/journals/:sessionId — Create or update journal for a session
 */

import { Router, Request, Response, NextFunction } from 'express'
import { isValidUUID, ErrorCode, NoteVisibility } from '@shared'
import type { UUID } from '@shared'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { getSession } from '@/services/session/core.service'
import { resolveEffectiveSessionRole } from '@/services/session/authz.service'
import {
  getSessionJournal,
  createOrUpdateSessionJournal,
  getBulkJournalStatus,
} from '@/services/journals.service'
import { getPrismaClient } from '@/infra/db'
import { logger } from '@/utils/logger'

const router = Router()
const prisma = getPrismaClient()

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
 * POST /api/journals/status
 * Get recap/hashtag status for multiple sessions in a single call.
 * Only returns hasJournal, hasContent, and hashtags — not the full content.
 *
 * Request body: { campaignId: string, sessionIds: string[] }
 * Response:     { statuses: Record<sessionId, { hasJournal, hasContent, hashtags }> }
 */
router.post('/status', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId, sessionIds } = req.body

  if (!isValidUUID(campaignId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId' })
  }

  if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'sessionIds must be a non-empty array' })
  }

  if (sessionIds.length > 200) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'sessionIds may not exceed 200 entries' })
  }

  for (const id of sessionIds) {
    if (!isValidUUID(id)) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: `Invalid sessionId: ${id}` })
    }
  }

  // Verify the user is a member of the campaign
  const membership = await prisma.campaignMembership.findUnique({
    where: { campaignId_userId: { campaignId, userId: user.userId } },
    select: { role: true },
  })

  if (!membership) {
    return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a member of this campaign' })
  }

  // Restrict to sessions that actually belong to this campaign (prevents cross-campaign probing)
  const validSessions = await prisma.session.findMany({
    where: { id: { in: sessionIds }, campaignId },
    select: { id: true },
  })
  const validIds = validSessions.map((s) => s.id) as UUID[]

  try {
    const statuses = await getBulkJournalStatus(validIds)
    return res.status(200).json({ statuses })
  } catch (error) {
    logger.error('journals.routes', 'Error fetching bulk journal status', error as Error)
    return res.status(500).json({ code: ErrorCode.INTERNAL_ERROR, message: 'Server error' })
  }
})

/**
 * GET /api/journals/:sessionId
 * Retrieve the journal for a specific session.
 * Returns null if no journal has been created yet.
 */
router.get('/:sessionId', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { sessionId } = req.params

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_SESSION, message: 'Invalid sessionId' })
  }

  // Verify session exists
  const session = await getSession(sessionId as UUID)
  if (!session) {
    return res.status(404).json({ code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found' })
  }

  // Verify user has access to this session
  const authz = await resolveEffectiveSessionRole({
    sessionId: sessionId as UUID,
    userId: user.userId as UUID,
  })
  if (!authz.ok) {
    return res.status(authz.code === 'SESSION_NOT_FOUND' ? 404 : 403).json({
      code: authz.code === 'SESSION_NOT_FOUND' ? ErrorCode.SESSION_NOT_FOUND : ErrorCode.FORBIDDEN,
      message: authz.message,
    })
  }

  try {
    const journal = await getSessionJournal(sessionId as UUID)
    return res.status(200).json({ journal })
  } catch (error) {
    logger.error('journals.routes', 'Error retrieving journal', error as Error)
    return res.status(500).json({ code: ErrorCode.INTERNAL_ERROR, message: 'Server error' })
  }
})

/**
 * POST /api/journals/:sessionId
 * Create or update the journal for a specific session.
 *
 * Request body:
 * {
 *   title: string,
 *   content: string,
 *   markdown: string (optional, same as content),
 *   tags: string[] (optional, _journal tag is always added)
 * }
 */
router.post('/:sessionId', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { sessionId } = req.params
  const { title, content, markdown, tags } = req.body

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_SESSION, message: 'Invalid sessionId' })
  }

  // Validate required fields
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid journal title' })
  }

  const journalContent = markdown ?? content
  if (!journalContent || typeof journalContent !== 'string') {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid journal content',
    })
  }

  // Verify session exists
  const session = await getSession(sessionId as UUID)
  if (!session) {
    return res.status(404).json({ code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found' })
  }

  // Verify user is DM (only DM can write journals)
  const authz = await resolveEffectiveSessionRole({
    sessionId: sessionId as UUID,
    userId: user.userId as UUID,
  })
  if (!authz.ok) {
    return res.status(authz.code === 'SESSION_NOT_FOUND' ? 404 : 403).json({
      code: authz.code === 'SESSION_NOT_FOUND' ? ErrorCode.SESSION_NOT_FOUND : ErrorCode.FORBIDDEN,
      message: authz.message,
    })
  }

  if (authz.role !== 'DM') {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message: 'Only the DM may write journal entries',
    })
  }

  try {
    const journal = await createOrUpdateSessionJournal({
      sessionId: sessionId as UUID,
      title,
      content: journalContent,
      authorId: user.userId as UUID,
      authorUsername: user.username as string,
      tags: Array.isArray(tags) ? tags : [],
    })

    return res.status(200).json({ journal })
  } catch (error) {
    logger.error('journals.routes', 'Error creating/updating journal', error as Error)
    return res.status(500).json({ code: ErrorCode.INTERNAL_ERROR, message: 'Server error' })
  }
})

export default router
