import { randomBytes } from 'crypto'
import type { Prisma } from '@prisma/client'
import type { Request, Response, Router } from 'express'
import { hashPassword } from '@/services/auth.service'
import { AdminService } from '@/services/admin.service'
import { errorHandler, adminAuthMiddleware } from '@/infra/http/middleware'
import { issueHandoffToken, consumeHandoffToken } from '@/services/handoff.service'
import type { AdminAuthToken } from '@/types'
import { createAdminToken } from '@/utils/auth'
import { validatePassword } from '@/utils/password'
import { logger } from '@/utils/logger'

type AdminRole = AdminAuthToken['adminRole']

interface AdminAccessRouteDeps {
  prisma: {
    user: {
      findUnique: (...args: any[]) => Promise<any>
      findFirst: (...args: any[]) => Promise<any>
      create: (...args: any[]) => Promise<any>
      update: (...args: any[]) => Promise<any>
    }
    adminInvite: {
      create: (...args: any[]) => Promise<any>
      findUnique: (...args: any[]) => Promise<any>
      update: (...args: any[]) => Promise<any>
    }
  }
  hasRole: (actorRole: AdminRole, requiredRole: AdminRole) => boolean
  writeAudit: (params: {
    actor?: AdminAuthToken
    action: string
    targetType: string
    targetId?: string
    reason?: string
    outcome?: 'SUCCESS' | 'DENIED' | 'FAILED'
    metadata?: Prisma.InputJsonValue
  }) => Promise<void>
}

function createInviteToken(): string {
  return randomBytes(24).toString('hex')
}

export function registerAdminAccessRoutes(router: Router, deps: AdminAccessRouteDeps): void {
  router.get('/setup-status', async (_req: Request, res: Response) => {
    try {
      const adminExists = await AdminService.adminUsersExist()
      res.status(200).json({
        setupRequired: !adminExists,
        adminExists,
      })
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
      const { email, username, password, passwordConfirm } = req.body

      if (!email || !username || !password) {
        res.status(400).json({
          error: 'Email, username, and password are required',
          code: 'MISSING_FIELDS',
        })
        return
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        res.status(400).json({
          error: 'Invalid email format',
          code: 'INVALID_EMAIL',
        })
        return
      }

      if (!/^[a-zA-Z0-9_-]{3,}$/.test(username)) {
        res.status(400).json({
          error:
            'Username must be at least 3 characters and contain only letters, numbers, underscores, and hyphens',
          code: 'INVALID_USERNAME',
        })
        return
      }

      if (password !== passwordConfirm) {
        res.status(400).json({
          error: 'Passwords do not match',
          code: 'PASSWORD_MISMATCH',
        })
        return
      }

      const passwordValidation = validatePassword(password)
      if (!passwordValidation.isValid) {
        res.status(400).json({
          error: 'Password does not meet security requirements',
          code: 'INVALID_PASSWORD',
          feedback: passwordValidation.feedback,
          suggestions: passwordValidation.suggestions,
        })
        return
      }

      const admin = await AdminService.createInitialAdmin(email, username, password)
      const token = createAdminToken(admin.id, admin.username, 'SUPER_ADMIN')

      logger.info('admin', 'Initial admin user created', {
        adminId: admin.id,
        username: admin.username,
        email: admin.email,
      })

      res.status(201).json({
        message: 'Admin account created successfully',
        admin: {
          id: admin.id,
          username: admin.username,
          email: admin.email,
        },
        token,
      })
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  })

  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body

      if (!username || !password) {
        res.status(400).json({
          error: 'Username and password are required',
          code: 'MISSING_CREDENTIALS',
        })
        return
      }

      const admin = await AdminService.authenticateAdmin(username, password)
      const token = createAdminToken(admin.id, admin.username, admin.adminRole)

      logger.info('admin', 'Admin login successful', {
        adminId: admin.id,
        username: admin.username,
      })

      res.status(200).json({
        message: 'Login successful',
        admin: {
          id: admin.id,
          username: admin.username,
          email: admin.email,
          adminRole: admin.adminRole,
        },
        token,
      })
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

      const email = String(req.body?.email || '')
        .trim()
        .toLowerCase()
      const adminRole = String(req.body?.adminRole || 'ADMIN') as AdminRole
      const expiresInHoursRaw = Number(req.body?.expiresInHours || 72)
      const expiresInHours = Math.max(1, Math.min(24 * 14, expiresInHoursRaw))

      if (!['ADMIN', 'CAMPAIGN_DM', 'READ_ONLY'].includes(adminRole)) {
        res.status(400).json({
          error: 'Invalid adminRole for invite',
          code: 'INVALID_ADMIN_ROLE',
        })
        return
      }

      const token = createInviteToken()
      const invite = await deps.prisma.adminInvite.create({
        data: {
          token,
          invitedRole: adminRole,
          email: email || null,
          invitedByUserId: actor.userId,
          expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
        },
        select: {
          token: true,
          invitedRole: true,
          email: true,
          expiresAt: true,
        },
      })

      await deps.writeAudit({
        actor,
        action: 'ADMIN_INVITE_CREATE',
        targetType: 'ADMIN_INVITE',
        targetId: token,
        metadata: {
          invitedRole: invite.invitedRole,
          email: invite.email,
          expiresAt: invite.expiresAt,
        },
      })

      const publicBase = `${req.protocol}://${req.get('host') || 'localhost:3000'}`
      res.status(201).json({
        inviteToken: invite.token,
        invitedRole: invite.invitedRole,
        email: invite.email,
        expiresAt: invite.expiresAt,
        inviteUrl: `${publicBase}/admin/onboard?invite=${invite.token}`,
      })
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  })

  router.get('/invites/validate', async (req: Request, res: Response) => {
    try {
      const token = String(req.query.token || '').trim()
      if (!token) {
        res.status(400).json({ error: 'token is required', code: 'MISSING_TOKEN' })
        return
      }

      const invite = await deps.prisma.adminInvite.findUnique({
        where: { token },
        select: {
          token: true,
          invitedRole: true,
          email: true,
          expiresAt: true,
          usedAt: true,
        },
      })

      if (!invite) {
        res.status(404).json({ error: 'Invite not found', code: 'INVITE_NOT_FOUND' })
        return
      }

      if (invite.usedAt) {
        res.status(410).json({ error: 'Invite already used', code: 'INVITE_USED' })
        return
      }

      if (invite.expiresAt.getTime() < Date.now()) {
        res.status(410).json({ error: 'Invite has expired', code: 'INVITE_EXPIRED' })
        return
      }

      res.status(200).json({
        valid: true,
        invitedRole: invite.invitedRole,
        email: invite.email,
        expiresAt: invite.expiresAt,
      })
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  })

  router.post('/invites/redeem', async (req: Request, res: Response) => {
    try {
      const token = String(req.body?.token || '').trim()
      const username = String(req.body?.username || '').trim()
      const email = String(req.body?.email || '')
        .trim()
        .toLowerCase()
      const password = String(req.body?.password || '')
      const passwordConfirm = String(req.body?.passwordConfirm || '')

      if (!token || !username || !password || !passwordConfirm) {
        res.status(400).json({
          error: 'token, username, password, and passwordConfirm are required',
          code: 'MISSING_FIELDS',
        })
        return
      }

      if (password !== passwordConfirm) {
        res.status(400).json({
          error: 'Passwords do not match',
          code: 'PASSWORD_MISMATCH',
        })
        return
      }

      const passwordValidation = validatePassword(password)
      if (!passwordValidation.isValid) {
        res.status(400).json({
          error: 'Password does not meet security requirements',
          code: 'INVALID_PASSWORD',
          feedback: passwordValidation.feedback,
          suggestions: passwordValidation.suggestions,
        })
        return
      }

      const invite = await deps.prisma.adminInvite.findUnique({ where: { token } })
      if (!invite) {
        res.status(404).json({ error: 'Invite not found', code: 'INVITE_NOT_FOUND' })
        return
      }
      if (invite.usedAt) {
        res.status(410).json({ error: 'Invite already used', code: 'INVITE_USED' })
        return
      }
      if (invite.expiresAt.getTime() < Date.now()) {
        res.status(410).json({ error: 'Invite has expired', code: 'INVITE_EXPIRED' })
        return
      }
      if (invite.email && invite.email.toLowerCase() !== email) {
        res.status(400).json({
          error: 'Invite is restricted to a different email',
          code: 'INVITE_EMAIL_MISMATCH',
        })
        return
      }

      const passwordHash = await hashPassword(password)

      const existingByEmail = email
        ? await deps.prisma.user.findUnique({
            where: { email },
            select: { id: true, username: true },
          })
        : null
      const existingByUsername = await deps.prisma.user.findUnique({
        where: { username },
        select: { id: true, username: true, email: true },
      })

      if (existingByEmail && existingByUsername && existingByEmail.id !== existingByUsername.id) {
        res.status(409).json({
          error: 'Email and username belong to different accounts',
          code: 'IDENTITY_CONFLICT',
        })
        return
      }

      let userId = existingByEmail?.id || existingByUsername?.id
      if (!userId) {
        const created = await deps.prisma.user.create({
          data: {
            username,
            email: email || null,
            displayName: username,
            password: passwordHash,
            role: 'PLAYER',
            adminRole: invite.invitedRole,
            isActive: true,
          },
          select: { id: true },
        })
        userId = created.id
      } else {
        await deps.prisma.user.update({
          where: { id: userId },
          data: {
            username,
            email: email || null,
            password: passwordHash,
            adminRole: invite.invitedRole,
            isActive: true,
          },
        })
      }

      await deps.prisma.adminInvite.update({
        where: { id: invite.id },
        data: {
          usedAt: new Date(),
          usedByUserId: userId,
        },
      })

      await deps.writeAudit({
        action: 'ADMIN_INVITE_REDEEM',
        targetType: 'ADMIN_INVITE',
        targetId: invite.id,
        metadata: {
          userId,
          username,
          invitedRole: invite.invitedRole,
        },
      })

      const adminToken = createAdminToken(userId, username, invite.invitedRole)
      res.status(200).json({
        message: 'Invite redeemed successfully',
        token: adminToken,
        admin: {
          id: userId,
          username,
          email,
          adminRole: invite.invitedRole,
        },
      })
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

        const userId = String(req.params.userId || '')
        const reason = String(req.body?.reason || '').trim() || undefined
        if (!userId) {
          res.status(400).json({ error: 'userId is required', code: 'INVALID_USER_ID' })
          return
        }
        if (userId === actor.userId) {
          res.status(400).json({
            error: 'You cannot suspend your own account',
            code: 'SELF_ACTION_NOT_ALLOWED',
          })
          return
        }

        const updated = await deps.prisma.user.update({
          where: { id: userId },
          data: { isActive: false, tokenInvalidBefore: new Date() },
          select: { id: true, username: true, isActive: true },
        })

        await deps.writeAudit({
          actor,
          action: 'USER_SUSPEND',
          targetType: 'USER',
          targetId: updated.id,
          reason,
          metadata: { targetUsername: updated.username },
        })

        res.status(200).json({
          message: 'User suspended successfully',
          user: updated,
        })
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

        const userId = String(req.params.userId || '')
        const reason = String(req.body?.reason || '').trim() || undefined
        if (!userId) {
          res.status(400).json({ error: 'userId is required', code: 'INVALID_USER_ID' })
          return
        }

        const updated = await deps.prisma.user.update({
          where: { id: userId },
          data: { isActive: true },
          select: { id: true, username: true, isActive: true },
        })

        await deps.writeAudit({
          actor,
          action: 'USER_RESTORE',
          targetType: 'USER',
          targetId: updated.id,
          reason,
          metadata: { targetUsername: updated.username },
        })

        res.status(200).json({
          message: 'User restored successfully',
          user: updated,
        })
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

        const userId = String(req.params.userId || '')
        const reason = String(req.body?.reason || '').trim() || undefined
        if (!userId) {
          res.status(400).json({ error: 'userId is required', code: 'INVALID_USER_ID' })
          return
        }

        const updated = await deps.prisma.user.update({
          where: { id: userId },
          data: { tokenInvalidBefore: new Date() },
          select: { id: true, username: true, tokenInvalidBefore: true },
        })

        await deps.writeAudit({
          actor,
          action: 'USER_FORCE_LOGOUT',
          targetType: 'USER',
          targetId: updated.id,
          reason,
          metadata: {
            targetUsername: updated.username,
            tokenInvalidBefore: updated.tokenInvalidBefore,
          },
        })

        res.status(200).json({
          message: 'User sessions invalidated successfully',
          user: updated,
        })
      } catch (error) {
        errorHandler(error as any, req, res, () => {})
      }
    }
  )

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

      const { handoffToken, expiresInSec } = issueHandoffToken({
        userId: actor.userId,
        username: actor.username,
        target: 'app',
      })

      res.status(200).json({
        handoffToken,
        expiresInSec,
        redirectUrl: `/launch?handoff=${handoffToken}`,
      })
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  })

  router.post('/auth/handoff/exchange', async (req: Request, res: Response) => {
    try {
      const handoffToken = String(req.body?.handoffToken || '').trim()
      if (!handoffToken) {
        res.status(400).json({
          error: 'handoffToken is required',
          code: 'MISSING_HANDOFF_TOKEN',
        })
        return
      }

      const consumed = consumeHandoffToken(handoffToken, 'admin')
      if (!consumed) {
        res.status(401).json({
          error: 'Handoff token is invalid, expired, or already used',
          code: 'INVALID_HANDOFF_TOKEN',
        })
        return
      }

      const user = await deps.prisma.user.findUnique({
        where: { id: consumed.userId },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          adminRole: true,
          password: true,
          isActive: true,
        },
      })

      if (!user || !user.isActive) {
        res.status(403).json({
          error: 'Account is unavailable for admin access',
          code: 'ACCOUNT_NOT_ALLOWED',
        })
        return
      }

      const effectiveAdminRole = user.adminRole || (user.role === 'DM' ? 'CAMPAIGN_DM' : null)
      if (!effectiveAdminRole) {
        res.status(403).json({
          error: 'User does not have admin access',
          code: 'ADMIN_ACCESS_REQUIRED',
        })
        return
      }

      if (!user.password) {
        res.status(403).json({
          error: 'Upgrade to a full account before accessing admin',
          code: 'GUEST_UPGRADE_REQUIRED',
        })
        return
      }

      const token = createAdminToken(user.id, user.username, effectiveAdminRole)

      res.status(200).json({
        token,
        admin: {
          id: user.id,
          username: user.username,
          email: user.email || '',
          adminRole: effectiveAdminRole,
        },
      })
    } catch (error) {
      errorHandler(error as any, req, res, () => {})
    }
  })
}
