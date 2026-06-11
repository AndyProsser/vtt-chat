import { Router, Request, Response } from 'express'
import { errorHandler, adminAuthMiddleware } from '@/infra/http/middleware'
import { loadLogRetentionSettings, updateLogRetentionSettings } from '@/infra/telemetry-store'
import type { AdminAuthToken } from '@/types'
import { writeAdminAudit } from '@/services/admin/admin-access.service'
import {
  archiveAdminCampaign,
  authorizeAdminIntegrationSystem,
  blockAdminIntegrationSystem,
  buildAdminTelemetryDashboardPayload,
  buildAdminTelemetryLogsListPayload,
  buildAdminTelemetryStatusPayload,
  buildLogRetentionPatch,
  applyAdminSettingsRestorePayload,
  buildSettingsBackupQueuedPayload,
  buildSettingsOperationsExportPayload,
  createAdminCampaignRecordingPayload,
  createAdminUsersCsv,
  endAdminCampaignSession,
  getAdminCampaignExportPayload,
  getAdminCampaignRecordingsPayload,
  getAdminCampaignRoomsPayload,
  getAdminUsersExportRows,
  getRuntimeAdminSettingsState,
  importAdminCampaignBundlePayload,
  listAdminCampaignsForRequest,
  listAdminIntegrationSystemsPayload,
  listAdminUsersForRequest,
  mergeAdminSettingsWithRetention,
  moveAdminCampaignPlayerPayload,
  parseAdminCampaignsListRequest,
  parseAdminUsersExportFormat,
  parseAdminUsersListRequest,
  previewAdminUsersImport,
  resolveAdminTelemetryLogById,
  restoreAdminCampaign,
  updateAdminIntegrationSystem,
  updateRuntimeAdminSettingsFromBody,
} from '@/services/admin.service'
import { randomBytes } from 'node:crypto'
import type { WebSocketManager } from '@/ws'
import { registerAdminAccessRoutes } from './admin-access.routes'

const router = Router()

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

registerAdminAccessRoutes(router, {
  hasRole,
  writeAudit: writeAdminAudit,
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

    await writeAdminAudit({
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

      const result = await getAdminCampaignRoomsPayload({
        actor,
        campaignId,
        requestedSessionId,
      })

      res.status(result.status).json(result.body)
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

      const result = await endAdminCampaignSession({
        actor,
        campaignId,
        sessionId,
        reason,
      })

      if (result.audit) {
        await writeAdminAudit({
          actor,
          action: result.audit.action,
          targetType: result.audit.targetType,
          targetId: result.audit.targetId,
          reason: result.audit.reason,
          metadata: result.audit.metadata,
        })
      }

      res.status(result.status).json(result.body)
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

      const result = await archiveAdminCampaign({
        actor,
        campaignId,
        reason,
      })

      if (result.audit) {
        await writeAdminAudit({
          actor,
          action: result.audit.action,
          targetType: result.audit.targetType,
          targetId: result.audit.targetId,
          reason: result.audit.reason,
          metadata: result.audit.metadata,
        })
      }

      res.status(result.status).json(result.body)
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

      const result = await restoreAdminCampaign({
        actor,
        campaignId,
        reason,
      })

      if (result.audit) {
        await writeAdminAudit({
          actor,
          action: result.audit.action,
          targetType: result.audit.targetType,
          targetId: result.audit.targetId,
          reason: result.audit.reason,
          metadata: result.audit.metadata,
        })
      }

      res.status(result.status).json(result.body)
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

      const result = await getAdminCampaignExportPayload({ actor, campaignId })

      if (result.audit) {
        await writeAdminAudit({
          actor,
          action: result.audit.action,
          targetType: result.audit.targetType,
          targetId: result.audit.targetId,
          metadata: result.audit.metadata,
        })
      }

      res.status(result.status).json(result.body)
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

    const result = await importAdminCampaignBundlePayload({
      actor,
      body: (req.body || {}) as Record<string, unknown>,
    })

    if (result.audit) {
      await writeAdminAudit({
        actor,
        action: result.audit.action,
        targetType: result.audit.targetType,
        targetId: result.audit.targetId,
        metadata: result.audit.metadata,
      })
    }

    res.status(result.status).json(result.body)
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

      const result = await getAdminCampaignRecordingsPayload({ actor, campaignId })
      res.status(result.status).json(result.body)
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

      const result = await createAdminCampaignRecordingPayload({
        actor,
        campaignId,
        body: (req.body || {}) as Record<string, unknown>,
      })

      if (result.audit) {
        await writeAdminAudit({
          actor,
          action: result.audit.action,
          targetType: result.audit.targetType,
          targetId: result.audit.targetId,
          metadata: result.audit.metadata,
        })
      }

      res.status(result.status).json(result.body)
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

      const result = await moveAdminCampaignPlayerPayload({
        actor,
        campaignId,
        sessionId,
        roomId,
        targetUserId,
        reason,
      })

      if (result.status !== 200 || !result.event) {
        res.status(result.status).json(result.body)
        return
      }

      const wsManager = req.app.locals.wsManager as WebSocketManager | undefined
      if (wsManager) {
        const timestamp = Date.now()
        const event = result.event

        if (event.previousRoomId && event.previousRoomId !== event.roomId) {
          wsManager.broadcastEventToSession(
            event.sessionId as any,
            {
              id: randomBytes(16).toString('hex'),
              type: 'ROOM:USER_LEFT',
              version: 1,
              userId: event.actorUserId,
              userRole: 'SYSTEM',
              sessionId: event.sessionId,
              roomId: event.previousRoomId,
              timestamp,
              payload: {
                roomId: event.previousRoomId,
                userId: event.targetUserId,
                username: event.targetUsername,
                leftAt: timestamp,
                reason: 'ADMIN_MOVE',
                movedBy: event.actorUserId,
              },
            } as any
          )
        }

        wsManager.broadcastEventToSession(
          event.sessionId as any,
          {
            id: randomBytes(16).toString('hex'),
            type: 'ROOM:USER_JOINED',
            version: 1,
            userId: event.actorUserId,
            userRole: 'SYSTEM',
            sessionId: event.sessionId,
            roomId: event.roomId,
            timestamp,
            payload: {
              roomId: event.roomId,
              userId: event.targetUserId,
              username: event.targetUsername,
              joinedAt: timestamp,
              movedBy: event.actorUserId,
            },
          } as any
        )
      }

      if (result.audit) {
        await writeAdminAudit({
          actor,
          action: result.audit.action,
          targetType: result.audit.targetType,
          targetId: result.audit.targetId,
          reason: result.audit.reason,
          metadata: result.audit.metadata,
        })
      }

      res.status(result.status).json(result.body)
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

    await writeAdminAudit({
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

    await writeAdminAudit({
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

    await writeAdminAudit({
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

router.post(
  '/settings/backup/restore',
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

      const result = applyAdminSettingsRestorePayload({ bundle: req.body?.bundle ?? req.body })

      if (result.status === 200) {
        await writeAdminAudit({
          actor,
          action: 'SETTINGS_RESTORE',
          targetType: 'ADMIN_SETTINGS',
          metadata: { restoredAt: (result.body as Record<string, unknown>).restoredAt },
        })
      }

      res.status(result.status).json(result.body)
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  }
)

router.get('/integrations/systems', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const actor = req.admin
    if (!actor) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    res.status(200).json(listAdminIntegrationSystemsPayload())
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

      const result = authorizeAdminIntegrationSystem(String(req.params.system || ''))

      if (!result.ok) {
        res.status(404).json({ error: result.message, code: result.code })
        return
      }

      await writeAdminAudit({
        actor,
        action: result.audit.action,
        targetType: result.audit.targetType,
        targetId: result.audit.targetId,
        metadata: result.audit.metadata,
      })

      res.status(200).json({
        message: result.message,
        system: result.system,
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

      const result = blockAdminIntegrationSystem(String(req.params.system || ''))

      if (!result.ok) {
        res.status(404).json({ error: result.message, code: result.code })
        return
      }

      await writeAdminAudit({
        actor,
        action: result.audit.action,
        targetType: result.audit.targetType,
        targetId: result.audit.targetId,
        metadata: result.audit.metadata,
      })

      res.status(200).json({
        message: result.message,
        system: result.system,
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

      const result = updateAdminIntegrationSystem({
        system: String(req.params.system || ''),
        body: (req.body || {}) as Record<string, unknown>,
      })

      if (!result.ok) {
        res.status(404).json({ error: result.message, code: result.code })
        return
      }

      await writeAdminAudit({
        actor,
        action: result.audit.action,
        targetType: result.audit.targetType,
        targetId: result.audit.targetId,
        metadata: result.audit.metadata,
      })

      res.status(200).json({
        message: result.message,
        system: result.system,
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
