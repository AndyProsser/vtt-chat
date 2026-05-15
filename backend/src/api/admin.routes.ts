import { Router, Request, Response } from 'express'
import { errorHandler, adminAuthMiddleware } from '@/infra/http/middleware'
import { getPrismaClient } from '@/infra/db'
import { loadLogRetentionSettings, updateLogRetentionSettings } from '@/infra/telemetry-store'
import {
  buildCampaignExport,
  createRecordingMetadata,
  importCampaignBundle,
  isValidTransferBundle,
  listRecordingMetadata,
} from '@/services/admin-portability.service'
import {
  createAdminUsersCsv,
  getAdminUsersExportRows,
  listAdminUsersForRequest,
  parseAdminUsersExportFormat,
  parseAdminUsersListRequest,
  previewAdminUsersImport,
} from '@/services/admin-users.service'
import {
  applyArchivedMarker,
  isCampaignArchived,
  listAdminCampaignsForRequest,
  parseAdminCampaignsListRequest,
  removeArchivedMarker,
} from '@/services/admin-campaigns.service'
import type { AdminAuthToken } from '@/types'
import type { Prisma } from '@prisma/client'
import { listExternalSystems, updateExternalSystem } from '@/services/integrations.service'
import { randomBytes } from 'node:crypto'
import type { WebSocketManager } from '@/ws'
import { registerAdminAccessRoutes } from './admin-access.routes'
import {
  buildAdminTelemetryDashboardPayload,
  buildAdminTelemetryLogsListPayload,
  buildAdminTelemetryStatusPayload,
  resolveAdminTelemetryLogById,
} from '@/services/admin-telemetry.service'
import {
  buildLogRetentionPatch,
  getRuntimeAdminSettingsState,
  mergeAdminSettingsWithRetention,
  updateRuntimeAdminSettingsFromBody,
} from '@/services/admin-settings.service'
import {
  buildSettingsBackupQueuedPayload,
  buildSettingsOperationsExportPayload,
} from '@/services/admin-settings-backup.service'

const router = Router()
const prisma = getPrismaClient()

type AdminRole = AdminAuthToken['adminRole']

const roleRank: Record<AdminRole, number> = {
  READ_ONLY: 0,
  CAMPAIGN_DM: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
}

function hasRole(actorRole: AdminRole, requiredRole: AdminRole): boolean {
  return roleRank[actorRole] >= roleRank[requiredRole]
}

async function writeAudit(params: {
  actor?: AdminAuthToken
  action: string
  targetType: string
  targetId?: string
  reason?: string
  outcome?: 'SUCCESS' | 'DENIED' | 'FAILED'
  metadata?: Prisma.InputJsonValue
}) {
  await prisma.adminAuditLog.create({
    data: {
      actorUserId: params.actor?.userId,
      actorName: params.actor?.username || 'system',
      actorRole: params.actor?.adminRole,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      reason: params.reason,
      outcome: params.outcome || 'SUCCESS',
      metadata: params.metadata,
    },
  })
}

registerAdminAccessRoutes(router, {
  prisma,
  hasRole,
  writeAudit,
})

// Apply admin auth middleware to all telemetry routes
router.use('/telemetry', adminAuthMiddleware)

router.get('/users', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const actor = req.admin
    if (!actor) {
      res.status(401).json({
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      })
      return
    }

    const request = parseAdminUsersListRequest({
      search: req.query.search,
      role: req.query.role,
      status: req.query.status,
      page: req.query.page,
      pageSize: req.query.pageSize,
    })

    const result = await listAdminUsersForRequest(request)
    res.status(200).json(result)
  } catch (error) {
    errorHandler(error as any, req, res, () => {})
  }
})

router.get('/users/export', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const actor = req.admin
    if (!actor) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }
    if (!hasRole(actor.adminRole, 'ADMIN')) {
      res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
      return
    }

    const format = parseAdminUsersExportFormat(req.query.format)
    const rows = await getAdminUsersExportRows()

    await writeAudit({
      actor,
      action: 'EXPORT_USERS',
      targetType: 'user',
      outcome: 'SUCCESS',
      metadata: { count: rows.length, format },
    })

    if (format === 'csv') {
      const csv = createAdminUsersCsv(rows)
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', 'attachment; filename="users-export.csv"')
      res.status(200).send(csv)
    } else {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', 'attachment; filename="users-export.json"')
      res
        .status(200)
        .json({ exportedAt: new Date().toISOString(), count: rows.length, users: rows })
    }
  } catch (error) {
    errorHandler(error as any, req, res, () => {})
  }
})

router.post('/users/import/preview', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const actor = req.admin
    if (!actor) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }
    if (!hasRole(actor.adminRole, 'SUPER_ADMIN')) {
      res
        .status(403)
        .json({ error: 'Insufficient permissions — Super Admin required', code: 'FORBIDDEN' })
      return
    }

    const result = await previewAdminUsersImport({ body: req.body })
    if (!result.ok) {
      res.status(400).json({ error: result.message, code: result.code })
      return
    }

    res.status(200).json(result.data)
  } catch (error) {
    errorHandler(error as any, req, res, () => {})
  }
})

router.get('/campaigns', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const actor = req.admin
    if (!actor) {
      res.status(401).json({
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      })
      return
    }

    const request = parseAdminCampaignsListRequest({
      search: req.query.search,
      status: req.query.status,
      page: req.query.page,
      pageSize: req.query.pageSize,
    })

    const result = await listAdminCampaignsForRequest(request)
    res.status(200).json(result)
  } catch (error) {
    errorHandler(error as any, req, res, () => {})
  }
})

router.get(
  '/campaigns/:campaignId/rooms',
  adminAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const actor = req.admin
      if (!actor) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
        return
      }

      const campaignId = String(req.params.campaignId || '').trim()
      const requestedSessionId = String(req.query.sessionId || '').trim() || null

      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: {
          id: true,
          name: true,
          currentDmId: true,
        },
      })

      if (!campaign) {
        res.status(404).json({ error: 'Campaign not found', code: 'NOT_FOUND' })
        return
      }

      if (actor.adminRole === 'CAMPAIGN_DM' && actor.userId !== campaign.currentDmId) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      const session = requestedSessionId
        ? await prisma.session.findFirst({
            where: {
              id: requestedSessionId,
              campaignId,
            },
            select: {
              id: true,
              name: true,
              state: true,
              updatedAt: true,
            },
          })
        : await prisma.session.findFirst({
            where: {
              campaignId,
            },
            orderBy: { updatedAt: 'desc' },
            select: {
              id: true,
              name: true,
              state: true,
              updatedAt: true,
            },
          })

      if (!session) {
        res.status(200).json({
          campaign,
          session: null,
          rooms: [],
        })
        return
      }

      const [rooms, roomPresenceCounts] = await Promise.all([
        prisma.room.findMany({
          where: {
            sessionId: session.id,
          },
          orderBy: [{ type: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            type: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.presenceSnapshot.groupBy({
          by: ['primaryRoomId'],
          where: {
            sessionId: session.id,
            primaryRoomId: { not: null },
            state: { not: 'OFFLINE' },
          },
          _count: {
            _all: true,
          },
        }),
      ])

      const sessionMembers = await prisma.sessionMember.findMany({
        where: { sessionId: session.id },
        orderBy: [{ role: 'asc' }, { username: 'asc' }],
        select: {
          userId: true,
          username: true,
          role: true,
        },
      })

      const presenceRows = await prisma.presenceSnapshot.findMany({
        where: { sessionId: session.id },
        select: {
          userId: true,
          primaryRoomId: true,
          state: true,
        },
      })

      const presenceByUser = new Map(
        presenceRows.map((row) => [
          row.userId,
          { primaryRoomId: row.primaryRoomId, state: row.state },
        ])
      )

      const roomOccupancy = new Map<string, number>()
      roomPresenceCounts.forEach((entry) => {
        if (entry.primaryRoomId) {
          roomOccupancy.set(entry.primaryRoomId, entry._count._all)
        }
      })

      res.status(200).json({
        campaign,
        session,
        rooms: rooms.map((room) => ({
          ...room,
          occupantCount: roomOccupancy.get(room.id) || 0,
        })),
        members: sessionMembers.map((member) => {
          const presence = presenceByUser.get(member.userId)
          return {
            userId: member.userId,
            username: member.username,
            role: member.role,
            primaryRoomId: presence?.primaryRoomId || null,
            presenceState: presence?.state || 'OFFLINE',
          }
        }),
      })
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  }
)

router.post(
  '/campaigns/:campaignId/sessions/:sessionId/end',
  adminAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const actor = req.admin
      if (!actor) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
        return
      }

      if (!hasRole(actor.adminRole, 'CAMPAIGN_DM')) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      const campaignId = String(req.params.campaignId || '').trim()
      const sessionId = String(req.params.sessionId || '').trim()
      const reason = String(req.body?.reason || '').trim() || undefined

      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, currentDmId: true, name: true },
      })

      if (!campaign) {
        res.status(404).json({ error: 'Campaign not found', code: 'NOT_FOUND' })
        return
      }

      if (actor.adminRole === 'CAMPAIGN_DM' && actor.userId !== campaign.currentDmId) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      const existingSession = await prisma.session.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          campaignId: true,
          name: true,
          state: true,
          endedAt: true,
        },
      })

      if (!existingSession || existingSession.campaignId !== campaign.id) {
        res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND' })
        return
      }

      if (existingSession.state === 'ENDED') {
        res.status(200).json({
          message: 'Session is already ended',
          session: existingSession,
        })
        return
      }

      const updatedSession = await prisma.session.update({
        where: { id: existingSession.id },
        data: {
          state: 'ENDED',
          endedAt: new Date(),
        },
        select: {
          id: true,
          name: true,
          state: true,
          endedAt: true,
          updatedAt: true,
          campaignId: true,
        },
      })

      await writeAudit({
        actor,
        action: 'SESSION_FORCE_END',
        targetType: 'SESSION',
        targetId: updatedSession.id,
        reason,
        metadata: {
          campaignId: campaign.id,
          campaignName: campaign.name,
          sessionName: updatedSession.name,
          previousState: existingSession.state,
          nextState: updatedSession.state,
        },
      })

      res.status(200).json({
        message: 'Session ended successfully',
        session: updatedSession,
      })
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  }
)

router.post(
  '/campaigns/:campaignId/archive',
  adminAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const actor = req.admin
      if (!actor) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
        return
      }

      if (!hasRole(actor.adminRole, 'CAMPAIGN_DM')) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      const campaignId = String(req.params.campaignId || '').trim()
      const reason = String(req.body?.reason || '').trim() || undefined

      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: {
          id: true,
          name: true,
          description: true,
          currentDmId: true,
        },
      })

      if (!campaign) {
        res.status(404).json({ error: 'Campaign not found', code: 'NOT_FOUND' })
        return
      }

      if (actor.adminRole === 'CAMPAIGN_DM' && actor.userId !== campaign.currentDmId) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      if (isCampaignArchived(campaign.description)) {
        res.status(200).json({
          message: 'Campaign is already archived',
          campaign: {
            ...campaign,
            isArchived: true,
          },
        })
        return
      }

      const [updatedCampaign, endedSessions] = await Promise.all([
        prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            description: applyArchivedMarker(campaign.description),
          },
          select: {
            id: true,
            name: true,
            description: true,
            currentDmId: true,
            updatedAt: true,
          },
        }),
        prisma.session.updateMany({
          where: {
            campaignId: campaign.id,
            state: { not: 'ENDED' },
          },
          data: {
            state: 'ENDED',
            endedAt: new Date(),
          },
        }),
      ])

      await writeAudit({
        actor,
        action: 'CAMPAIGN_ARCHIVE',
        targetType: 'CAMPAIGN',
        targetId: campaign.id,
        reason,
        metadata: {
          campaignName: campaign.name,
          endedSessionsCount: endedSessions.count,
        },
      })

      res.status(200).json({
        message: 'Campaign archived successfully',
        campaign: {
          ...updatedCampaign,
          isArchived: true,
        },
        endedSessionsCount: endedSessions.count,
      })
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  }
)

router.post(
  '/campaigns/:campaignId/restore',
  adminAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const actor = req.admin
      if (!actor) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
        return
      }

      if (!hasRole(actor.adminRole, 'CAMPAIGN_DM')) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      const campaignId = String(req.params.campaignId || '').trim()
      const reason = String(req.body?.reason || '').trim() || undefined

      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: {
          id: true,
          name: true,
          description: true,
          currentDmId: true,
        },
      })

      if (!campaign) {
        res.status(404).json({ error: 'Campaign not found', code: 'NOT_FOUND' })
        return
      }

      if (actor.adminRole === 'CAMPAIGN_DM' && actor.userId !== campaign.currentDmId) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      if (!isCampaignArchived(campaign.description)) {
        res.status(200).json({
          message: 'Campaign is not archived',
          campaign: {
            ...campaign,
            isArchived: false,
          },
        })
        return
      }

      const updatedCampaign = await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          description: removeArchivedMarker(campaign.description),
        },
        select: {
          id: true,
          name: true,
          description: true,
          currentDmId: true,
          updatedAt: true,
        },
      })

      await writeAudit({
        actor,
        action: 'CAMPAIGN_RESTORE',
        targetType: 'CAMPAIGN',
        targetId: campaign.id,
        reason,
        metadata: {
          campaignName: campaign.name,
        },
      })

      res.status(200).json({
        message: 'Campaign restored successfully',
        campaign: {
          ...updatedCampaign,
          isArchived: false,
        },
      })
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  }
)

router.get(
  '/campaigns/:campaignId/export',
  adminAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const actor = req.admin
      if (!actor) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
        return
      }

      if (!hasRole(actor.adminRole, 'CAMPAIGN_DM')) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      const campaignId = String(req.params.campaignId || '').trim()

      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: {
          id: true,
          name: true,
          currentDmId: true,
        },
      })

      if (!campaign) {
        res.status(404).json({ error: 'Campaign not found', code: 'NOT_FOUND' })
        return
      }

      if (actor.adminRole === 'CAMPAIGN_DM' && actor.userId !== campaign.currentDmId) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      const exported = await buildCampaignExport(prisma, campaign.id, actor.userId)
      if (!exported) {
        res.status(404).json({ error: 'Campaign not found', code: 'NOT_FOUND' })
        return
      }

      await writeAudit({
        actor,
        action: 'CAMPAIGN_EXPORT',
        targetType: 'CAMPAIGN',
        targetId: campaign.id,
        metadata: {
          artifactId: exported.artifactId,
          ...exported.counts,
        },
      })

      res.status(200).json({
        message: 'Campaign export created successfully',
        artifactId: exported.artifactId,
        counts: exported.counts,
        bundle: exported.bundle,
      })
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  }
)

router.post('/campaigns/import', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const actor = req.admin
    if (!actor) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    if (!hasRole(actor.adminRole, 'CAMPAIGN_DM')) {
      res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
      return
    }

    const bundle = req.body?.bundle ?? req.body
    const name = String(req.body?.name || '').trim() || undefined

    if (!isValidTransferBundle(bundle)) {
      res.status(400).json({
        error: 'Invalid campaign transfer bundle',
        code: 'INVALID_TRANSFER_BUNDLE',
      })
      return
    }

    const imported = await importCampaignBundle(prisma, actor.userId, bundle, name)

    if (!imported) {
      res.status(400).json({
        error: 'Invalid campaign transfer bundle',
        code: 'INVALID_TRANSFER_BUNDLE',
      })
      return
    }

    await writeAudit({
      actor,
      action: 'CAMPAIGN_IMPORT',
      targetType: 'CAMPAIGN',
      targetId: imported.campaign.id,
      metadata: {
        artifactId: imported.artifactId,
        importedCampaignName: imported.campaign.name,
        ...imported.counts,
      },
    })

    res.status(201).json({
      message: 'Campaign imported successfully',
      artifactId: imported.artifactId,
      counts: imported.counts,
      campaign: imported.campaign,
    })
  } catch (error) {
    errorHandler(error as any, req, res, () => {})
  }
})

router.get(
  '/campaigns/:campaignId/recordings',
  adminAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const actor = req.admin
      if (!actor) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
        return
      }

      if (!hasRole(actor.adminRole, 'CAMPAIGN_DM')) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      const campaignId = String(req.params.campaignId || '').trim()

      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, name: true, currentDmId: true },
      })

      if (!campaign) {
        res.status(404).json({ error: 'Campaign not found', code: 'NOT_FOUND' })
        return
      }

      if (actor.adminRole === 'CAMPAIGN_DM' && actor.userId !== campaign.currentDmId) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      const recordings = await listRecordingMetadata(prisma, campaign.id)

      res.status(200).json({
        campaign,
        recordings: recordings.map((recording) => ({
          ...recording,
          startedAt: recording.startedAt?.toISOString() || null,
          endedAt: recording.endedAt?.toISOString() || null,
          createdAt: recording.createdAt.toISOString(),
          updatedAt: recording.updatedAt.toISOString(),
        })),
      })
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  }
)

router.post(
  '/campaigns/:campaignId/recordings',
  adminAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const actor = req.admin
      if (!actor) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
        return
      }

      if (!hasRole(actor.adminRole, 'CAMPAIGN_DM')) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      const campaignId = String(req.params.campaignId || '').trim()
      const title = String(req.body?.title || '').trim()
      const sessionId = String(req.body?.sessionId || '').trim() || null
      const roomId = String(req.body?.roomId || '').trim() || null
      const storageKey = String(req.body?.storageKey || '').trim() || null
      const sourceUrl = String(req.body?.sourceUrl || '').trim() || null
      const journalSummary = String(req.body?.journalSummary || '').trim() || null
      const startedAt = String(req.body?.startedAt || '').trim() || null
      const endedAt = String(req.body?.endedAt || '').trim() || null
      const durationValue = Number(req.body?.durationSeconds)
      const durationSeconds =
        Number.isFinite(durationValue) && durationValue >= 0 ? Math.round(durationValue) : null
      const metadata =
        req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : null

      if (!title) {
        res.status(400).json({
          error: 'title is required',
          code: 'MISSING_TITLE',
          field: 'title',
        })
        return
      }

      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, name: true, currentDmId: true },
      })

      if (!campaign) {
        res.status(404).json({ error: 'Campaign not found', code: 'NOT_FOUND' })
        return
      }

      if (actor.adminRole === 'CAMPAIGN_DM' && actor.userId !== campaign.currentDmId) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      if (sessionId) {
        const session = await prisma.session.findFirst({
          where: { id: sessionId, campaignId: campaign.id },
          select: { id: true },
        })

        if (!session) {
          res.status(400).json({
            error: 'sessionId must belong to the selected campaign',
            code: 'INVALID_SESSION',
            field: 'sessionId',
          })
          return
        }
      }

      if (roomId) {
        const room = await prisma.room.findFirst({
          where: {
            id: roomId,
            ...(sessionId ? { sessionId } : { session: { campaignId: campaign.id } }),
          },
          select: { id: true },
        })

        if (!room) {
          res.status(400).json({
            error: 'roomId must belong to the selected campaign/session',
            code: 'INVALID_ROOM',
            field: 'roomId',
          })
          return
        }
      }

      const recording = await createRecordingMetadata(prisma, {
        campaignId: campaign.id,
        sessionId,
        roomId,
        title,
        storageKey,
        sourceUrl,
        durationSeconds,
        startedAt,
        endedAt,
        journalSummary,
        metadata: metadata as Prisma.InputJsonValue | null,
      })

      await writeAudit({
        actor,
        action: 'RECORDING_METADATA_CREATE',
        targetType: 'CAMPAIGN',
        targetId: campaign.id,
        metadata: {
          recordingId: recording.id,
          title: recording.title,
          sessionId: recording.sessionId,
          roomId: recording.roomId,
        },
      })

      res.status(201).json({
        message: 'Recording metadata saved successfully',
        recording: {
          ...recording,
          startedAt: recording.startedAt?.toISOString() || null,
          endedAt: recording.endedAt?.toISOString() || null,
          createdAt: recording.createdAt.toISOString(),
          updatedAt: recording.updatedAt.toISOString(),
        },
      })
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  }
)

router.post(
  '/campaigns/:campaignId/sessions/:sessionId/rooms/:roomId/move-player',
  adminAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const actor = req.admin
      if (!actor) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
        return
      }

      if (!hasRole(actor.adminRole, 'CAMPAIGN_DM')) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      const campaignId = String(req.params.campaignId || '').trim()
      const sessionId = String(req.params.sessionId || '').trim()
      const roomId = String(req.params.roomId || '').trim()
      const targetUserId = String(req.body?.targetUserId || '').trim()
      const reason = String(req.body?.reason || '').trim() || undefined

      if (!targetUserId) {
        res.status(400).json({ error: 'targetUserId is required', code: 'MISSING_TARGET_USER' })
        return
      }

      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, name: true, currentDmId: true },
      })

      if (!campaign) {
        res.status(404).json({ error: 'Campaign not found', code: 'NOT_FOUND' })
        return
      }

      if (actor.adminRole === 'CAMPAIGN_DM' && actor.userId !== campaign.currentDmId) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          campaignId: true,
          name: true,
        },
      })

      if (!session || session.campaignId !== campaign.id) {
        res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND' })
        return
      }

      const room = await prisma.room.findUnique({
        where: { id: roomId },
        select: {
          id: true,
          sessionId: true,
          name: true,
        },
      })

      if (!room || room.sessionId !== session.id) {
        res.status(404).json({ error: 'Room not found', code: 'NOT_FOUND' })
        return
      }

      const sessionMember = await prisma.sessionMember.findUnique({
        where: {
          sessionId_userId: {
            sessionId: session.id,
            userId: targetUserId,
          },
        },
        select: {
          userId: true,
          username: true,
          role: true,
        },
      })

      if (!sessionMember) {
        res.status(404).json({ error: 'Target user not in session', code: 'NOT_FOUND' })
        return
      }

      const previousPresence = await prisma.presenceSnapshot.findUnique({
        where: {
          sessionId_userId: {
            sessionId: session.id,
            userId: targetUserId,
          },
        },
        select: {
          primaryRoomId: true,
        },
      })

      await prisma.presenceSnapshot.upsert({
        where: {
          sessionId_userId: {
            sessionId: session.id,
            userId: targetUserId,
          },
        },
        create: {
          sessionId: session.id,
          campaignId: campaign.id,
          userId: targetUserId,
          username: sessionMember.username,
          primaryRoomId: room.id,
          state: 'ONLINE',
          lastSeenAt: new Date(),
        },
        update: {
          username: sessionMember.username,
          campaignId: campaign.id,
          primaryRoomId: room.id,
          state: 'ONLINE',
          lastSeenAt: new Date(),
        },
      })

      const wsManager = req.app.locals.wsManager as WebSocketManager | undefined
      if (wsManager) {
        const timestamp = Date.now()

        if (previousPresence?.primaryRoomId && previousPresence.primaryRoomId !== room.id) {
          wsManager.broadcastEventToSession(
            session.id as any,
            {
              id: randomBytes(16).toString('hex'),
              type: 'ROOM:USER_LEFT',
              version: 1,
              userId: actor.userId,
              userRole: 'SYSTEM',
              sessionId: session.id,
              roomId: previousPresence.primaryRoomId,
              timestamp,
              payload: {
                roomId: previousPresence.primaryRoomId,
                userId: sessionMember.userId,
                username: sessionMember.username,
                leftAt: timestamp,
                reason: 'ADMIN_MOVE',
                movedBy: actor.userId,
              },
            } as any
          )
        }

        wsManager.broadcastEventToSession(
          session.id as any,
          {
            id: randomBytes(16).toString('hex'),
            type: 'ROOM:USER_JOINED',
            version: 1,
            userId: actor.userId,
            userRole: 'SYSTEM',
            sessionId: session.id,
            roomId: room.id,
            timestamp,
            payload: {
              roomId: room.id,
              userId: sessionMember.userId,
              username: sessionMember.username,
              joinedAt: timestamp,
              movedBy: actor.userId,
            },
          } as any
        )
      }

      await writeAudit({
        actor,
        action: 'ROOM_MOVE_PLAYER',
        targetType: 'SESSION',
        targetId: session.id,
        reason,
        metadata: {
          campaignId: campaign.id,
          campaignName: campaign.name,
          sessionName: session.name,
          targetUserId: sessionMember.userId,
          targetUsername: sessionMember.username,
          previousRoomId: previousPresence?.primaryRoomId || null,
          newRoomId: room.id,
          newRoomName: room.name,
        },
      })

      res.status(200).json({
        message: 'Player moved successfully',
        movedBy: actor.userId,
        targetUserId: sessionMember.userId,
        targetUsername: sessionMember.username,
        movedFromRoomId: previousPresence?.primaryRoomId || null,
        movedToRoomId: room.id,
      })
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  }
)

router.get('/settings', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const actor = req.admin
    if (!actor) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    const retention = await loadLogRetentionSettings()
    const mergedSettings = mergeAdminSettingsWithRetention(
      getRuntimeAdminSettingsState(),
      retention
    )

    res.status(200).json({
      settings: mergedSettings,
    })
  } catch (error) {
    errorHandler(error as any, req, res, () => {})
  }
})

router.put('/settings', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const actor = req.admin
    if (!actor) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    if (!hasRole(actor.adminRole, 'ADMIN')) {
      res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
      return
    }

    const body = (req.body || {}) as Record<string, unknown>

    const runtimeSettingsState = updateRuntimeAdminSettingsFromBody(body)

    const retention = await updateLogRetentionSettings(buildLogRetentionPatch(body))

    const mergedSettings = mergeAdminSettingsWithRetention(runtimeSettingsState, retention)

    await writeAudit({
      actor,
      action: 'SETTINGS_UPDATE',
      targetType: 'ADMIN_SETTINGS',
      metadata: mergedSettings,
    })

    res.status(200).json({
      message: 'Settings updated successfully',
      settings: mergedSettings,
    })
  } catch (error) {
    errorHandler(error as any, req, res, () => {})
  }
})

router.post('/settings/backup', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const actor = req.admin
    if (!actor) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    if (!hasRole(actor.adminRole, 'ADMIN')) {
      res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
      return
    }

    const payload = buildSettingsBackupQueuedPayload()

    await writeAudit({
      actor,
      action: 'SETTINGS_BACKUP_TRIGGER',
      targetType: 'ADMIN_SETTINGS',
      metadata: payload.auditMetadata,
    })

    res.status(200).json({ message: payload.message, queuedAt: payload.queuedAt })
  } catch (error) {
    errorHandler(error as any, req, res, () => {})
  }
})

router.get('/settings/backup/export', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const actor = req.admin
    if (!actor) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    if (!hasRole(actor.adminRole, 'ADMIN')) {
      res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
      return
    }

    const payload = await buildSettingsOperationsExportPayload(actor.userId)

    await writeAudit({
      actor,
      action: 'SETTINGS_OPERATIONS_EXPORT',
      targetType: 'ADMIN_SETTINGS',
      metadata: payload.auditMetadata,
    })

    res.status(200).json({
      message: payload.message,
      artifactId: payload.artifactId,
      bundle: payload.bundle,
    })
  } catch (error) {
    errorHandler(error as any, req, res, () => {})
  }
})

router.get('/integrations/systems', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const actor = req.admin
    if (!actor) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    res.status(200).json({
      systems: listExternalSystems().map((system) => ({
        ...system,
        metrics: {
          linkedUsers: 0,
          requests24h: 0,
          lastSeenAt: null,
        },
      })),
    })
  } catch (error) {
    errorHandler(error as any, req, res, () => {})
  }
})

router.post(
  '/integrations/systems/:system/authorize',
  adminAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const actor = req.admin
      if (!actor) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
        return
      }

      if (!hasRole(actor.adminRole, 'ADMIN')) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      const result = updateExternalSystem(String(req.params.system || ''), {
        authorizationState: 'AUTHORIZED',
      })

      if (!result) {
        res.status(404).json({ error: 'External system not found', code: 'NOT_FOUND' })
        return
      }

      await writeAudit({
        actor,
        action: 'INTEGRATION_SYSTEM_AUTHORIZE',
        targetType: 'EXTERNAL_SYSTEM',
        targetId: result.next.system,
        metadata: {
          previousState: result.previous.authorizationState,
          nextState: result.next.authorizationState,
          allowedScopes: result.next.allowedScopes,
        },
      })

      res.status(200).json({
        message: 'External system authorized',
        system: result.next,
      })
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  }
)

router.post(
  '/integrations/systems/:system/block',
  adminAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const actor = req.admin
      if (!actor) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
        return
      }

      if (!hasRole(actor.adminRole, 'ADMIN')) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      const result = updateExternalSystem(String(req.params.system || ''), {
        authorizationState: 'BLOCKED',
      })

      if (!result) {
        res.status(404).json({ error: 'External system not found', code: 'NOT_FOUND' })
        return
      }

      await writeAudit({
        actor,
        action: 'INTEGRATION_SYSTEM_BLOCK',
        targetType: 'EXTERNAL_SYSTEM',
        targetId: result.next.system,
        metadata: {
          previousState: result.previous.authorizationState,
          nextState: result.next.authorizationState,
          allowedScopes: result.next.allowedScopes,
        },
      })

      res.status(200).json({
        message: 'External system blocked',
        system: result.next,
      })
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  }
)

router.patch(
  '/integrations/systems/:system',
  adminAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const actor = req.admin
      if (!actor) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
        return
      }

      if (!hasRole(actor.adminRole, 'ADMIN')) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      const state = String(req.body?.authorizationState || '')
        .trim()
        .toUpperCase()
      const authorizationState =
        state === 'AUTHORIZED' || state === 'LOG_ONLY' || state === 'BLOCKED' ? state : undefined

      const result = updateExternalSystem(String(req.params.system || ''), {
        authorizationState,
        displayName: req.body?.displayName,
        notes: req.body?.notes,
        allowedScopes: req.body?.allowedScopes,
      })

      if (!result) {
        res.status(404).json({ error: 'External system not found', code: 'NOT_FOUND' })
        return
      }

      await writeAudit({
        actor,
        action: 'INTEGRATION_SYSTEM_UPDATE',
        targetType: 'EXTERNAL_SYSTEM',
        targetId: result.next.system,
        metadata: {
          previousState: result.previous.authorizationState,
          nextState: result.next.authorizationState,
          previousScopes: result.previous.allowedScopes,
          nextScopes: result.next.allowedScopes,
          previousDisplayName: result.previous.displayName,
          nextDisplayName: result.next.displayName,
        },
      })

      res.status(200).json({
        message: 'External system updated',
        system: result.next,
      })
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  }
)

/**
 * ============================================================================
 * Telemetry Endpoints - Requires admin authentication
 * ============================================================================
 */

router.get('/telemetry/dashboard', async (_req: Request, res: Response) => {
  const wsManager = _req.app.locals.wsManager as { getConnectionCount?: () => number } | undefined
  const payload = await buildAdminTelemetryDashboardPayload({
    activeUsers: wsManager?.getConnectionCount?.() ?? 0,
  })
  res.status(200).json(payload)
})

router.get('/telemetry/status', async (_req: Request, res: Response) => {
  const payload = await buildAdminTelemetryStatusPayload()
  res.status(200).json(payload)
})

router.get('/telemetry/logs/:logId', async (req: Request, res: Response) => {
  const result = await resolveAdminTelemetryLogById(String(req.params.logId || ''))
  res.status(result.status).json(result.body)
})

router.get('/telemetry/logs', async (req: Request, res: Response) => {
  const payload = await buildAdminTelemetryLogsListPayload({
    query: req.query as Record<string, unknown>,
  })
  res.status(200).json(payload)
})

export default router
