import { Router, Request, Response } from 'express'
import os from 'node:os'
import { getAllSessions } from '@/services/session/core.service'
import { getChatTelemetrySnapshot } from '@/services/chat.service'
import { logger } from '@/utils/logger'
import { errorHandler, adminAuthMiddleware } from '@/infra/http/middleware'
import { getPrismaClient } from '@/infra/db'
import {
  findDiagnosticEventById,
  findTelemetryEventById,
  loadDiagnosticEvents,
  loadLogRetentionSettings,
  loadTelemetryEvents,
  persistDiagnosticEvents,
  updateLogRetentionSettings,
} from '@/infra/telemetry-store'
import {
  buildCampaignExport,
  createOperationalExportArtifact,
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
import { buildAdminTelemetryStatusPayload } from '@/services/admin-telemetry.service'

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

const runtimeSettingsDefaults = {
  primaryRegion: 'us-east-1',
  maintenanceMode: 'off',
  chatPipelineEnabled: true,
  audioOverridesEnabled: true,
  logRetentionDays: 30,
  telemetryRetentionDays: 30,
  telemetryMaxFileSizeMb: 10,
  telemetryMaxFiles: 7,
  diagnosticRetentionDays: 14,
  diagnosticMaxFileSizeMb: 10,
  diagnosticMaxFiles: 7,
  backupWindow: '02:00 UTC',
}

let runtimeSettingsState = {
  ...runtimeSettingsDefaults,
  updatedAt: new Date().toISOString(),
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

    res.status(200).json({
      settings: {
        ...runtimeSettingsState,
        telemetryRetentionDays: retention.telemetryRetentionDays,
        telemetryMaxFileSizeMb: retention.telemetryMaxFileSizeMb,
        telemetryMaxFiles: retention.telemetryMaxFiles,
        diagnosticRetentionDays: retention.diagnosticRetentionDays,
        diagnosticMaxFileSizeMb: retention.diagnosticMaxFileSizeMb,
        diagnosticMaxFiles: retention.diagnosticMaxFiles,
      },
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

    const body = req.body || {}

    runtimeSettingsState = {
      ...runtimeSettingsState,
      primaryRegion:
        typeof body.primaryRegion === 'string' && body.primaryRegion.trim()
          ? body.primaryRegion.trim()
          : runtimeSettingsState.primaryRegion,
      maintenanceMode:
        body.maintenanceMode === 'off' ||
        body.maintenanceMode === 'read-only' ||
        body.maintenanceMode === 'full'
          ? body.maintenanceMode
          : runtimeSettingsState.maintenanceMode,
      chatPipelineEnabled:
        typeof body.chatPipelineEnabled === 'boolean'
          ? body.chatPipelineEnabled
          : runtimeSettingsState.chatPipelineEnabled,
      audioOverridesEnabled:
        typeof body.audioOverridesEnabled === 'boolean'
          ? body.audioOverridesEnabled
          : runtimeSettingsState.audioOverridesEnabled,
      logRetentionDays:
        typeof body.logRetentionDays === 'number' && body.logRetentionDays >= 1
          ? Math.round(body.logRetentionDays)
          : runtimeSettingsState.logRetentionDays,
      backupWindow:
        typeof body.backupWindow === 'string' && body.backupWindow.trim()
          ? body.backupWindow.trim()
          : runtimeSettingsState.backupWindow,
      updatedAt: new Date().toISOString(),
    }

    const retention = await updateLogRetentionSettings({
      telemetryRetentionDays: body.telemetryRetentionDays,
      telemetryMaxFileSizeMb: body.telemetryMaxFileSizeMb,
      telemetryMaxFiles: body.telemetryMaxFiles,
      diagnosticRetentionDays: body.diagnosticRetentionDays,
      diagnosticMaxFileSizeMb: body.diagnosticMaxFileSizeMb,
      diagnosticMaxFiles: body.diagnosticMaxFiles,
    })

    const mergedSettings = {
      ...runtimeSettingsState,
      telemetryRetentionDays: retention.telemetryRetentionDays,
      telemetryMaxFileSizeMb: retention.telemetryMaxFileSizeMb,
      telemetryMaxFiles: retention.telemetryMaxFiles,
      diagnosticRetentionDays: retention.diagnosticRetentionDays,
      diagnosticMaxFileSizeMb: retention.diagnosticMaxFileSizeMb,
      diagnosticMaxFiles: retention.diagnosticMaxFiles,
    }

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

    const now = new Date().toISOString()

    await writeAudit({
      actor,
      action: 'SETTINGS_BACKUP_TRIGGER',
      targetType: 'ADMIN_SETTINGS',
      metadata: {
        triggeredAt: now,
      },
    })

    res.status(200).json({
      message: 'Backup queued successfully',
      queuedAt: now,
    })
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

    const [telemetry, diagnostics, auditLog] = await Promise.all([
      loadTelemetryEvents(),
      loadDiagnosticEvents(),
      prisma.adminAuditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 250,
        select: {
          id: true,
          actorUserId: true,
          actorName: true,
          actorRole: true,
          action: true,
          targetType: true,
          targetId: true,
          outcome: true,
          reason: true,
          metadata: true,
          createdAt: true,
        },
      }),
    ])

    const exported = await createOperationalExportArtifact(
      prisma,
      actor.userId,
      runtimeSettingsState,
      telemetry.map((entry) => ({ ...entry })),
      diagnostics.map((entry) => ({ ...entry })),
      auditLog.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      })) as Array<Record<string, unknown>>
    )

    await writeAudit({
      actor,
      action: 'SETTINGS_OPERATIONS_EXPORT',
      targetType: 'ADMIN_SETTINGS',
      metadata: {
        artifactId: exported.artifactId,
        telemetryCount: telemetry.length,
        diagnosticCount: diagnostics.length,
        auditCount: auditLog.length,
      },
    })

    res.status(200).json({
      message: 'Operations export created successfully',
      artifactId: exported.artifactId,
      bundle: exported.bundle,
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

function parseTimeRange(value: string | undefined): number {
  switch (value) {
    case '1h':
      return 60 * 60 * 1000
    case '7d':
      return 7 * 24 * 60 * 60 * 1000
    default:
      return 24 * 60 * 60 * 1000
  }
}

router.get('/telemetry/dashboard', async (_req: Request, res: Response) => {
  const sessions = await getAllSessions()
  const wsManager = _req.app.locals.wsManager as { getConnectionCount?: () => number } | undefined
  const chat = await getChatTelemetrySnapshot()
  const memory = process.memoryUsage()
  const activeSessions = sessions.filter((s) => s.state === 'ACTIVE').length
  const memoryUsedMb = Math.round(memory.heapUsed / 1024 / 1024)
  const memoryTotalMb = Math.max(1, Math.round(memory.heapTotal / 1024 / 1024))
  const storageUsagePercent = Math.min(99, Math.round((memoryUsedMb / memoryTotalMb) * 100))

  const recentErrors = logger
    .getHistory()
    .filter((entry) => entry.level === 'ERROR')
    .filter(
      (entry) => Date.now() - new Date(entry.timestamp).getTime() <= 24 * 60 * 60 * 1000
    ).length

  const telemetryEvents = await loadTelemetryEvents()
  const clientTelemetryLastHour = telemetryEvents.filter(
    (entry) => Date.now() - new Date(entry.timestamp).getTime() <= 60 * 60 * 1000
  )

  const topClientEvents = Object.entries(
    clientTelemetryLastHour.reduce(
      (acc, entry) => {
        const eventName = String(entry.message || 'unknown')
        acc[eventName] = (acc[eventName] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([event, count]) => ({ event, count }))

  const [totalUsers, suspendedUsers, activeCampaigns, recentModerationActions] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: false } }),
    prisma.campaign.count(),
    prisma.adminAuditLog.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        action: { in: ['USER_SUSPEND', 'USER_RESTORE', 'USER_FORCE_LOGOUT', 'USER_PROMOTE'] },
      },
    }),
  ])

  res.status(200).json({
    activeUsers: wsManager?.getConnectionCount?.() ?? 0,
    activeRooms: activeSessions,
    recentErrors,
    systemLoadPercent: Math.min(100, Math.round((os.loadavg()[0] / 4) * 100)),
    messageThroughputPerMinute: chat.messagesLastMinute,
    storageUsagePercent,
    totalUsers,
    suspendedUsers,
    activeCampaigns,
    recentModerationActions,
    clientTelemetryEventsLastHour: clientTelemetryLastHour.length,
    topClientEvents,
  })
})

router.get('/telemetry/status', async (_req: Request, res: Response) => {
  const payload = await buildAdminTelemetryStatusPayload()
  res.status(200).json(payload)
})

router.get('/telemetry/logs/:logId', async (req: Request, res: Response) => {
  const logId = String(req.params.logId || '').trim()

  if (!logId) {
    res.status(400).json({ error: 'logId is required', code: 'INVALID_LOG_ID' })
    return
  }

  if (logId.startsWith('diagnostic-')) {
    const diagnosticId = logId.slice('diagnostic-'.length)
    const row = await findDiagnosticEventById(diagnosticId)

    if (!row) {
      res.status(404).json({ error: 'Log entry not found', code: 'NOT_FOUND' })
      return
    }

    res.status(200).json({
      log: {
        id: `diagnostic-${row.id}`,
        timestamp: row.timestamp,
        severity: row.severity,
        source: row.source,
        message: row.message,
        details: row.details,
      },
    })
    return
  }

  if (logId.startsWith('audit-')) {
    const auditId = logId.slice('audit-'.length)
    const row = await prisma.adminAuditLog.findUnique({ where: { id: auditId } })

    if (!row) {
      res.status(404).json({ error: 'Log entry not found', code: 'NOT_FOUND' })
      return
    }

    res.status(200).json({
      log: {
        id: `audit-${row.id}`,
        timestamp: row.createdAt.toISOString(),
        severity: row.outcome === 'FAILED' || row.outcome === 'DENIED' ? 'WARN' : 'INFO',
        source: 'admin-audit',
        message: `${row.action} ${row.outcome}`,
        details: {
          actorUserId: row.actorUserId,
          actorName: row.actorName,
          actorRole: row.actorRole,
          targetType: row.targetType,
          targetId: row.targetId,
          reason: row.reason,
          metadata: row.metadata,
        },
      },
    })
    return
  }

  if (logId.startsWith('telemetry-')) {
    const telemetryId = logId.slice('telemetry-'.length)
    const row = await findTelemetryEventById(telemetryId)

    if (!row) {
      res.status(404).json({ error: 'Log entry not found', code: 'NOT_FOUND' })
      return
    }

    res.status(200).json({
      log: {
        id: `telemetry-${row.id}`,
        timestamp: row.timestamp,
        severity: row.severity,
        source: row.source,
        message: row.message,
        details: row.details,
      },
    })
    return
  }

  res.status(400).json({
    error: 'This log source does not support durable drill-down',
    code: 'DRILLDOWN_NOT_SUPPORTED',
  })
})

router.get('/telemetry/logs', async (req: Request, res: Response) => {
  const timeRange = parseTimeRange(req.query.timeRange as string | undefined)
  const severity = (req.query.severity as string | undefined)?.toUpperCase()
  const source = (req.query.source as string | undefined)?.toLowerCase()
  const userId = (req.query.userId as string | undefined)?.trim()
  const roomId = (req.query.roomId as string | undefined)?.trim()
  const page = Math.max(1, Number(req.query.page || 1))
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || 25)))
  const sortByRaw = (req.query.sortBy as string | undefined) || 'timestamp'
  const sortDirRaw = ((req.query.sortDir as string | undefined) || 'desc').toLowerCase()

  const sortBy: 'timestamp' | 'severity' | 'source' | 'message' = [
    'timestamp',
    'severity',
    'source',
    'message',
  ].includes(sortByRaw)
    ? (sortByRaw as 'timestamp' | 'severity' | 'source' | 'message')
    : 'timestamp'
  const sortDir: 'asc' | 'desc' = sortDirRaw === 'asc' ? 'asc' : 'desc'

  const now = Date.now()
  const minTs = now - timeRange

  const severityRank: Record<string, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  }

  const runtimeHistory = logger.getHistory().map((entry) => ({
    timestamp: entry.timestamp,
    severity: entry.level,
    source: entry.context,
    message: entry.message,
    details: (entry.meta || {}) as Record<string, unknown>,
  }))

  await persistDiagnosticEvents(runtimeHistory)

  const runtimeLogs = (await loadDiagnosticEvents())
    .filter((entry) => new Date(entry.timestamp).getTime() >= minTs)
    .filter((entry) => (severity && severity !== 'ALL' ? entry.severity === severity : true))
    .filter((entry) =>
      source && source !== 'all' ? entry.source.toLowerCase().includes(source) : true
    )
    .filter((entry) => {
      if (!userId) return true
      return JSON.stringify(entry.details || {})
        .toLowerCase()
        .includes(userId.toLowerCase())
    })
    .filter((entry) => {
      if (!roomId) return true
      return JSON.stringify(entry.details || {})
        .toLowerCase()
        .includes(roomId.toLowerCase())
    })
    .map((entry) => ({
      id: `diagnostic-${entry.id}`,
      timestamp: entry.timestamp,
      severity: entry.severity,
      source: entry.source,
      message: entry.message,
      details: entry.details,
    }))

  const auditRows = await prisma.adminAuditLog.findMany({
    where: {
      createdAt: { gte: new Date(minTs) },
    },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  })

  const auditLogs = auditRows
    .map((row) => ({
      id: `audit-${row.id}`,
      timestamp: row.createdAt.toISOString(),
      severity: row.outcome === 'FAILED' || row.outcome === 'DENIED' ? 'WARN' : 'INFO',
      source: 'admin-audit',
      message: `${row.action} ${row.outcome}`,
      details: {
        actorUserId: row.actorUserId,
        actorName: row.actorName,
        actorRole: row.actorRole,
        targetType: row.targetType,
        targetId: row.targetId,
        reason: row.reason,
        metadata: row.metadata,
      },
    }))
    .filter((entry) => (severity && severity !== 'ALL' ? entry.severity === severity : true))
    .filter((entry) =>
      source && source !== 'all' ? entry.source.toLowerCase().includes(source) : true
    )
    .filter((entry) => {
      if (!userId) return true
      return JSON.stringify(entry.details || {})
        .toLowerCase()
        .includes(userId.toLowerCase())
    })
    .filter((entry) => {
      if (!roomId) return true
      return JSON.stringify(entry.details || {})
        .toLowerCase()
        .includes(roomId.toLowerCase())
    })

  const telemetryLogs = (await loadTelemetryEvents())
    .filter((entry) => new Date(entry.timestamp).getTime() >= minTs)
    .map((entry) => ({
      id: `telemetry-${entry.id}`,
      timestamp: entry.timestamp,
      severity: entry.severity,
      source: entry.source,
      message: entry.message,
      details: entry.details,
    }))
    .filter((entry) => (severity && severity !== 'ALL' ? entry.severity === severity : true))
    .filter((entry) =>
      source && source !== 'all' ? entry.source.toLowerCase().includes(source) : true
    )
    .filter((entry) => {
      if (!userId) return true
      return JSON.stringify(entry.details || {})
        .toLowerCase()
        .includes(userId.toLowerCase())
    })
    .filter((entry) => {
      if (!roomId) return true
      return JSON.stringify(entry.details || {})
        .toLowerCase()
        .includes(roomId.toLowerCase())
    })

  const filtered = [...runtimeLogs, ...auditLogs, ...telemetryLogs]

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortBy === 'timestamp') {
      cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    } else if (sortBy === 'severity') {
      cmp = (severityRank[a.severity] ?? 0) - (severityRank[b.severity] ?? 0)
    } else if (sortBy === 'source') {
      cmp = a.source.localeCompare(b.source)
    } else {
      cmp = a.message.localeCompare(b.message)
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const total = sorted.length
  const start = (page - 1) * pageSize
  const logs = sorted.slice(start, start + pageSize)

  res.status(200).json({
    logs,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    sortBy,
    sortDir,
  })
})

export default router
