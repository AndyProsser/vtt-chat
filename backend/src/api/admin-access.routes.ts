import type { Request, Response, Router } from 'express'
import { AdminService } from '@/services/admin.service'
import { errorHandler, adminAuthMiddleware } from '@/infra/http/middleware'
import type { AdminAuthToken } from '@/types'
import {
  banAdminUserPayload,
  createAdminInvitePayload,
  createInitialAdminSetupPayload,
  exchangeAdminHandoffPayload,
  forceLogoutAdminUserPayload,
  getAdminSetupStatusPayload,
  issueAppHandoffPayload,
  loginAdminPayload,
  redeemAdminInvitePayload,
  restoreAdminUserPayload,
  suspendAdminUserPayload,
  unbanAdminUserPayload,
  validateAdminInvitePayload,
  type AdminAuditWriteInput,
} from '@/services/admin/admin-access.service'
import { logger } from '@/utils/logger'

type AdminRole = AdminAuthToken['adminRole']

interface AdminAccessRouteDeps {
  hasRole: (actorRole: AdminRole, requiredRole: AdminRole) => boolean
  writeAudit: (params: AdminAuditWriteInput) => Promise<void>
}

export function registerAdminAccessRoutes(router: Router, deps: AdminAccessRouteDeps): void {
  router.get('/setup-status', async (_req: Request, res: Response) => {
    try {
      const result = await getAdminSetupStatusPayload()
      res.status(result.status).json(result.body)
    } catch (error) {
      logger.error('admin', 'Failed to check admin setup status', error)
      res.status(500).json({
        error: 'Failed to check setup status',
        code: 'SETUP_STATUS_CHECK_FAILED',
      })
    }
  })

  router.post('/setup', async (req: Request, res: Response) => {
    try {
      const result = await createInitialAdminSetupPayload({
        body: (req.body || {}) as Record<string, unknown>,
      })
      res.status(result.status).json(result.body)
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  })

  router.post('/login', async (req: Request, res: Response) => {
    try {
      const result = await loginAdminPayload({
        body: (req.body || {}) as Record<string, unknown>,
      })
      res.status(result.status).json(result.body)
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  })

  router.get('/me', adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const admin = await AdminService.getAdminById(req.admin!.userId)
      if (!admin) {
        res.status(404).json({
          error: 'Admin account not found',
          code: 'NOT_FOUND',
        })
        return
      }

      res.status(200).json({ admin })
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  })

  router.post(
    '/users/:userId/promote',
    adminAuthMiddleware,
    async (req: Request, res: Response) => {
      try {
        const actor = req.admin
        if (!actor) {
          res.status(401).json({
            error: 'Unauthorized',
            code: 'UNAUTHORIZED',
          })
          return
        }

        const userId = String(req.params.userId || '')
        const { adminRole } = req.body as {
          adminRole?: 'SUPER_ADMIN' | 'ADMIN' | 'CAMPAIGN_DM' | 'READ_ONLY'
        }

        if (!deps.hasRole(actor.adminRole, 'SUPER_ADMIN')) {
          res.status(403).json({
            error: 'Only super admins can change admin roles',
            code: 'FORBIDDEN',
          })
          return
        }

        if (!adminRole) {
          res.status(400).json({
            error: 'adminRole is required',
            code: 'MISSING_ADMIN_ROLE',
          })
          return
        }

        const promoted = await AdminService.promoteUserAdminRole({
          actorUserId: actor.userId,
          targetUserId: userId,
          adminRole,
        })

        logger.info('admin', 'User admin role updated', {
          actorUserId: actor.userId,
          actorRole: actor.adminRole,
          targetUserId: promoted.id,
          targetUsername: promoted.username,
          adminRole: promoted.adminRole,
        })

        await deps.writeAudit({
          actor,
          action: 'USER_PROMOTE',
          targetType: 'USER',
          targetId: promoted.id,
          metadata: {
            adminRole: promoted.adminRole,
            targetUsername: promoted.username,
          },
        })

        res.status(200).json({
          message: 'Admin role updated successfully',
          user: promoted,
        })
      } catch (error) {
        errorHandler(error as any, req, res, () => {})
      }
    }
  )

  router.post('/invites', adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const actor = req.admin
      if (!actor) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
        return
      }
      if (!deps.hasRole(actor.adminRole, 'SUPER_ADMIN')) {
        res.status(403).json({ error: 'Only super admins can create invites', code: 'FORBIDDEN' })
        return
      }
      const publicBase = `${req.protocol}://${req.get('host') || 'localhost:3000'}`
      const result = await createAdminInvitePayload({
        actor,
        body: (req.body || {}) as Record<string, unknown>,
        publicBase,
      })

      if (result.audit) {
        await deps.writeAudit(result.audit)
      }

      res.status(result.status).json(result.body)
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  })

  router.get('/invites/validate', async (req: Request, res: Response) => {
    try {
      const result = await validateAdminInvitePayload({
        token: String(req.query.token || ''),
      })
      res.status(result.status).json(result.body)
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  })

  router.post('/invites/redeem', async (req: Request, res: Response) => {
    try {
      const result = await redeemAdminInvitePayload({
        body: (req.body || {}) as Record<string, unknown>,
      })

      if (result.audit) {
        await deps.writeAudit(result.audit)
      }

      res.status(result.status).json(result.body)
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  })

  router.patch(
    '/users/:userId/suspend',
    adminAuthMiddleware,
    async (req: Request, res: Response) => {
      try {
        const actor = req.admin
        if (!actor) {
          res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
          return
        }
        if (!deps.hasRole(actor.adminRole, 'ADMIN')) {
          res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
          return
        }

        const result = await suspendAdminUserPayload({
          actor,
          userId: String(req.params.userId || ''),
          reason: String(req.body?.reason || '').trim() || undefined,
        })

        if (result.audit) {
          await deps.writeAudit(result.audit)
        }

        res.status(result.status).json(result.body)
      } catch (error) {
        errorHandler(error as any, req, res, () => {})
      }
    }
  )

  router.patch(
    '/users/:userId/restore',
    adminAuthMiddleware,
    async (req: Request, res: Response) => {
      try {
        const actor = req.admin
        if (!actor) {
          res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
          return
        }
        if (!deps.hasRole(actor.adminRole, 'ADMIN')) {
          res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
          return
        }

        const result = await restoreAdminUserPayload({
          actor,
          userId: String(req.params.userId || ''),
          reason: String(req.body?.reason || '').trim() || undefined,
        })

        if (result.audit) {
          await deps.writeAudit(result.audit)
        }

        res.status(result.status).json(result.body)
      } catch (error) {
        errorHandler(error as any, req, res, () => {})
      }
    }
  )

  router.post(
    '/users/:userId/force-logout',
    adminAuthMiddleware,
    async (req: Request, res: Response) => {
      try {
        const actor = req.admin
        if (!actor) {
          res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
          return
        }
        if (!deps.hasRole(actor.adminRole, 'ADMIN')) {
          res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
          return
        }

        const result = await forceLogoutAdminUserPayload({
          actor,
          userId: String(req.params.userId || ''),
          reason: String(req.body?.reason || '').trim() || undefined,
        })

        if (result.audit) {
          await deps.writeAudit(result.audit)
        }

        res.status(result.status).json(result.body)
      } catch (error) {
        errorHandler(error as any, req, res, () => {})
      }
    }
  )

  router.post('/users/:userId/ban', adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const actor = req.admin
      if (!actor) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
        return
      }
      if (!deps.hasRole(actor.adminRole, 'ADMIN')) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      const result = await banAdminUserPayload({
        actor,
        userId: String(req.params.userId || ''),
        reason: String(req.body?.reason || '').trim() || undefined,
      })

      if (result.audit) {
        await deps.writeAudit(result.audit)
      }

      res.status(result.status).json(result.body)
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  })

  router.post('/users/:userId/unban', adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const actor = req.admin
      if (!actor) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
        return
      }
      if (!deps.hasRole(actor.adminRole, 'ADMIN')) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      const result = await unbanAdminUserPayload({
        actor,
        userId: String(req.params.userId || ''),
        reason: String(req.body?.reason || '').trim() || undefined,
      })

      if (result.audit) {
        await deps.writeAudit(result.audit)
      }

      res.status(result.status).json(result.body)
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  })

  router.post('/handoff/app', adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const actor = req.admin
      if (!actor) {
        res.status(401).json({
          error: 'Unauthorized',
          code: 'UNAUTHORIZED',
        })
        return
      }

      const result = issueAppHandoffPayload({
        actor,
      })

      res.status(result.status).json(result.body)
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  })

  router.post('/auth/handoff/exchange', async (req: Request, res: Response) => {
    try {
      const result = await exchangeAdminHandoffPayload({
        handoffToken: String(req.body?.handoffToken || ''),
      })

      res.status(result.status).json(result.body)
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  })
}
