import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { authMiddleware } from '@/infra/http/middleware'
import { logger } from '@/utils/logger'

const router = Router()
const prisma = new PrismaClient()

// ============================================================================
// Session Export & Backup
// ============================================================================

/**
 * GET /api/export/campaigns/:campaignId
 * Export campaign data as JSON file
 *
 * Returns: JSON with campaign, sessions, rooms, messages, notes, metadata
 */
router.get('/campaigns/:campaignId', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    const campaignId = req.params.campaignId as string

    // Verify user has access (is DM of this session)
    const session = await prisma.session.findUnique({
      where: { id: campaignId },
    })

    if (!session) {
      res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND' })
      return
    }

    if (session.dm !== req.user.username) {
      res.status(403).json({ error: 'Only DM can export campaign', code: 'FORBIDDEN' })
      return
    }

    // Gather all campaign data
    const [rooms, messages, metadata, notes, members] = await Promise.all([
      prisma.room.findMany({
        where: { sessionId: campaignId },
        include: { members: true, conditions: true, environment: true },
      }),
      prisma.message.findMany({
        where: { sessionId: campaignId },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.metadata.findMany({
        where: { sessionId: campaignId },
        include: { tags: true },
      }),
      prisma.note.findMany({
        where: { sessionId: campaignId },
        include: { tags: true },
      }),
      prisma.sessionMember.findMany({
        where: { sessionId: campaignId },
        include: { user: true, room: true },
      }),
    ])

    const exportData = {
      campaign: {
        id: session.id,
        name: session.name,
        description: session.description,
        dm: session.dm,
        createdAt: session.createdAt,
        endedAt: session.endedAt,
        isArchived: session.isArchived,
      },
      rooms,
      messages,
      metadata,
      notes,
      members: members.map((m) => ({
        userId: m.userId,
        username: m.user.username,
        role: m.user.role,
        joinedAt: m.joinedAt,
      })),
      exportedAt: new Date().toISOString(),
    }

    logger.info('export', 'Campaign exported', { campaignId, userId: req.user.userId })

    res.status(200)
      .type('application/json')
      .attachment(`campaign_${campaignId}_${Date.now()}.json`)
      .send(JSON.stringify(exportData, null, 2))
  } catch (error) {
    throw error
  }
})

/**
 * POST /api/export/campaigns/:campaignId/logs
 * Export session chat logs as plain text or CSV
 * Query: { format? } - json, csv, txt (default: json)
 */
router.get('/campaigns/:campaignId/logs', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    const campaignId = req.params.campaignId as string
    const format = (req.query.format as string) || 'json'

    // Verify access
    const session = await prisma.session.findUnique({
      where: { id: campaignId },
    })

    if (!session) {
      res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND' })
      return
    }

    if (session.dm !== req.user.username) {
      res.status(403).json({ error: 'Only DM can export logs', code: 'FORBIDDEN' })
      return
    }

    // Get all messages
    const messages = await prisma.message.findMany({
      where: { sessionId: campaignId },
      orderBy: { createdAt: 'asc' },
      include: {
        room: { select: { name: true } },
        author: { select: { username: true } },
      },
    })

    if (format === 'csv') {
      // CSV format
      const csv = [
        'Timestamp,Room,Author,Type,Content',
        ...messages.map(
          (m) =>
            `"${m.createdAt.toISOString()}","${m.room.name}","${m.author.username}","${m.type}","${m.content
              .replace(/"/g, '""')
              .slice(0, 200)}"`
        ),
      ].join('\n')

      res.status(200)
        .type('text/csv')
        .attachment(`campaign_${campaignId}_logs.csv`)
        .send(csv)
    } else if (format === 'txt') {
      // Plain text format
      const txt = messages
        .map(
          (m) =>
            `[${m.createdAt.toLocaleString()}] ${m.room.name}/${m.author.username}: ${m.content}`
        )
        .join('\n')

      res.status(200)
        .type('text/plain')
        .attachment(`campaign_${campaignId}_logs.txt`)
        .send(txt)
    } else {
      // JSON format (default)
      res.status(200)
        .type('application/json')
        .attachment(`campaign_${campaignId}_logs.json`)
        .send(JSON.stringify({ campaignId, messages, exportedAt: new Date() }, null, 2))
    }

    logger.info('export', 'Campaign logs exported', { campaignId, format })
  } catch (error) {
    throw error
  }
})

export default router
