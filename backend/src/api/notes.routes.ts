import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { authMiddleware } from '@/infra/http/middleware'
import { NoteService } from '@/core/notes/notes.service'
import { logger } from '@/utils/logger'

const router = Router()
const prisma = new PrismaClient()
const noteService = new NoteService(prisma)

// ============================================================================
// Notes Management
// ============================================================================

/**
 * GET /api/notes/campaigns/:campaignId
 * List notes in campaign
 * Query: { limit?, offset? }
 */
router.get('/campaigns/:campaignId', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    const campaignId = req.params.campaignId as string

    const notes = await noteService.getSessionNotes(campaignId, req.user.userId, 50, 0)

    res.status(200).json({ notes })
  } catch (error) {
    throw error
  }
})

/**
 * POST /api/notes/campaigns/:campaignId
 * Create new note
 * Body: { title, content, visibility?, tags? }
 */
router.post('/campaigns/:campaignId', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    const campaignId = req.params.campaignId as string
    const { title, content, visibility, tags } = req.body

    const note = await noteService.createNote(
      campaignId,
      req.user.userId,
      title,
      content,
      visibility || 'DM_ONLY',
      tags || []
    )

    res.status(201).json({ note })
  } catch (error) {
    throw error
  }
})

/**
 * PUT /api/notes/:noteId
 * Update note
 * Body: { title?, content?, visibility? }
 */
router.put('/:noteId', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    const campaignId = req.query.campaignId as string | undefined
    const noteId = req.params.noteId as string
    const { title, content, visibility } = req.body

    if (!campaignId) {
      res.status(400).json({ error: 'campaignId required in query', code: 'INVALID_INPUT' })
      return
    }

    const note = await noteService.updateNote(
      campaignId,
      noteId,
      req.user.userId,
      title,
      content,
      visibility
    )

    res.status(200).json({ note })
  } catch (error) {
    throw error
  }
})

/**
 * DELETE /api/notes/:noteId
 * Delete note
 */
router.delete('/:noteId', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    const campaignId = req.query.campaignId as string | undefined
    const noteId = req.params.noteId as string

    if (!campaignId) {
      res.status(400).json({ error: 'campaignId required in query', code: 'INVALID_INPUT' })
      return
    }

    await noteService.deleteNote(campaignId, noteId, req.user.userId)

    res.status(200).json({ message: 'Note deleted' })
  } catch (error) {
    throw error
  }
})

export default router
