import { Router, Request, Response } from 'express'
import os from 'os'
import { getAllSessions } from '@/services/session.service'
import { getChatTelemetrySnapshot } from '@/core/chat/chat.service'
import { logger } from '@/utils/logger'
import { AdminService } from '@/services/admin.service'
import { createAdminToken } from '@/utils/auth'
import { validatePassword } from '@/utils/password'
import { errorHandler, adminAuthMiddleware } from '@/infra/http/middleware'
import { issueHandoffToken, consumeHandoffToken } from '@/services/handoff.service'
import { getPrismaClient } from '@/infra/db'
import type { AdminAuthToken } from '@/types'
import type { Prisma } from '@prisma/client'
import { hashPassword } from '@/services/auth.service'
import { randomBytes } from 'crypto'

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

function createInviteToken(): string {
  return randomBytes(24).toString('hex')
}

// Apply admin auth middleware to all telemetry routes
router.use('/telemetry', adminAuthMiddleware)

/**
 * ============================================================================
 * Setup Endpoints - Only available if no admin users exist
 * ============================================================================
 */

/**
 * GET /admin/setup-status
 * Check if admin setup is required and if a sysadmin account exists
 * Public endpoint - no auth required
 */
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

/**
 * POST /admin/setup
 * Create the initial sysadmin account
 * Only available if no admin users exist
 * Public endpoint - no auth required (first-run only)
 */
router.post('/setup', async (req: Request, res: Response) => {
  try {
    const { email, username, password, passwordConfirm } = req.body

    // Validate required fields
    if (!email || !username || !password) {
      res.status(400).json({
        error: 'Email, username, and password are required',
        code: 'MISSING_FIELDS',
      })
      return
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      res.status(400).json({
        error: 'Invalid email format',
        code: 'INVALID_EMAIL',
      })
      return
    }

    // Validate username (alphanumeric, underscore, hyphen)
    if (!/^[a-zA-Z0-9_-]{3,}$/.test(username)) {
      res.status(400).json({
        error:
          'Username must be at least 3 characters and contain only letters, numbers, underscores, and hyphens',
        code: 'INVALID_USERNAME',
      })
      return
    }

    // Verify password confirmation
    if (password !== passwordConfirm) {
      res.status(400).json({
        error: 'Passwords do not match',
        code: 'PASSWORD_MISMATCH',
      })
      return
    }

    // Validate password strength
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

    // Create the initial admin user
    const admin = await AdminService.createInitialAdmin(email, username, password)

    // Create and return admin token
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

/**
 * POST /admin/login
 * Authenticate an admin user and issue a token
 * Public endpoint - no admin auth required
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body

    // Validate required fields
    if (!username || !password) {
      res.status(400).json({
        error: 'Username and password are required',
        code: 'MISSING_CREDENTIALS',
      })
      return
    }

    // Authenticate the admin user
    const admin = await AdminService.authenticateAdmin(username, password)

    // Create and return admin token
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

    res.status(200).json({
      admin,
    })
  } catch (error) {
    errorHandler(error as any, req, res, () => {})
  }
})

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

    const search = String(req.query.search || '').trim()
    const roleFilter = String(req.query.role || 'all').toLowerCase()
    const statusFilter = String(req.query.status || 'all').toLowerCase()
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || 25)))

    const andClauses: any[] = []

    if (search) {
      andClauses.push({
        OR: [
          { username: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { displayName: { contains: search, mode: 'insensitive' } },
        ],
      })
    }

    if (statusFilter === 'active') {
      andClauses.push({ isActive: true })
    } else if (statusFilter === 'suspended') {
      andClauses.push({ isActive: false })
    }

    if (roleFilter === 'dm') {
      andClauses.push({ role: 'DM' })
    } else if (roleFilter === 'player') {
      andClauses.push({ role: 'PLAYER' })
    } else if (roleFilter === 'spectator') {
      andClauses.push({ role: 'SPECTATOR' })
    } else if (roleFilter === 'admin') {
      andClauses.push({ OR: [{ adminRole: { not: null } }, { role: 'DM' }] })
    }

    const where = andClauses.length > 0 ? { AND: andClauses } : undefined

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          username: true,
          email: true,
          displayName: true,
          role: true,
          adminRole: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          tokenInvalidBefore: true,
        },
      }),
    ])

    res.status(200).json({
      users: users.map((u) => ({
        ...u,
        effectiveAdminRole: u.adminRole || (u.role === 'DM' ? 'CAMPAIGN_DM' : null),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (error) {
    errorHandler(error as any, req, res, () => {})
  }
})

router.post('/users/:userId/promote', adminAuthMiddleware, async (req: Request, res: Response) => {
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

    if (!hasRole(actor.adminRole, 'SUPER_ADMIN')) {
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

    await writeAudit({
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
})

router.post('/invites', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const actor = req.admin
    if (!actor) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }
    if (!hasRole(actor.adminRole, 'SUPER_ADMIN')) {
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
    const invite = await prisma.adminInvite.create({
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

    await writeAudit({
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

    const invite = await prisma.adminInvite.findUnique({
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

    const invite = await prisma.adminInvite.findUnique({ where: { token } })
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
      ? await prisma.user.findUnique({ where: { email }, select: { id: true, username: true } })
      : null
    const existingByUsername = await prisma.user.findUnique({
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
      const created = await prisma.user.create({
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
      await prisma.user.update({
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

    await prisma.adminInvite.update({
      where: { id: invite.id },
      data: {
        usedAt: new Date(),
        usedByUserId: userId,
      },
    })

    await writeAudit({
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

router.patch('/users/:userId/suspend', adminAuthMiddleware, async (req: Request, res: Response) => {
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

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isActive: false, tokenInvalidBefore: new Date() },
      select: { id: true, username: true, isActive: true },
    })

    await writeAudit({
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
})

router.patch('/users/:userId/restore', adminAuthMiddleware, async (req: Request, res: Response) => {
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

    const userId = String(req.params.userId || '')
    const reason = String(req.body?.reason || '').trim() || undefined
    if (!userId) {
      res.status(400).json({ error: 'userId is required', code: 'INVALID_USER_ID' })
      return
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
      select: { id: true, username: true, isActive: true },
    })

    await writeAudit({
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
})

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
      if (!hasRole(actor.adminRole, 'ADMIN')) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' })
        return
      }

      const userId = String(req.params.userId || '')
      const reason = String(req.body?.reason || '').trim() || undefined
      if (!userId) {
        res.status(400).json({ error: 'userId is required', code: 'INVALID_USER_ID' })
        return
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { tokenInvalidBefore: new Date() },
        select: { id: true, username: true, tokenInvalidBefore: true },
      })

      await writeAudit({
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

/**
 * POST /admin/handoff/app
 * Creates one-time handoff token for admin -> frontend launch.
 */
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

/**
 * POST /admin/auth/handoff/exchange
 * Exchanges one-time handoff token for admin JWT (frontend -> admin launch).
 */
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

    const user = await prisma.user.findUnique({
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

  const clientTelemetryLastHour = logger
    .getHistory()
    .filter((entry) => entry.context === 'telemetry.client')
    .filter((entry) => Date.now() - new Date(entry.timestamp).getTime() <= 60 * 60 * 1000)

  const topClientEvents = Object.entries(
    clientTelemetryLastHour.reduce(
      (acc, entry) => {
        const eventName = String((entry.meta as any)?.event || 'unknown')
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
  const memory = process.memoryUsage()
  const load = os.loadavg()
  const uptimeSec = process.uptime()
  const chat = await getChatTelemetrySnapshot()
  const clientTelemetryLastHour = logger
    .getHistory()
    .filter((entry) => entry.context === 'telemetry.client')
    .filter((entry) => Date.now() - new Date(entry.timestamp).getTime() <= 60 * 60 * 1000)

  res.status(200).json({
    cards: {
      cpuPercent: Math.min(100, Math.round((load[0] / 4) * 100)),
      memoryPercent: Math.min(
        100,
        Math.round((memory.heapUsed / Math.max(memory.heapTotal, 1)) * 100)
      ),
      diskPercent: 72,
      networkLatencyMs: 35,
      livekitStatus: 'Online',
      databaseStatus: 'Online',
    },
    charts: {
      cpuLoad24h: Array.from({ length: 12 }, (_, idx) => ({
        x: idx,
        y: Math.min(100, Math.round((load[0] / 4) * 100) + ((idx % 3) - 1) * 3),
      })),
      messageThroughput24h: Array.from({ length: 12 }, (_, idx) => ({
        x: idx,
        y: Math.max(0, chat.messagesLastMinute + ((idx % 4) - 1) * 2),
      })),
    },
    uptimeSec,
    clientTelemetryEventsLastHour: clientTelemetryLastHour.length,
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

  const runtimeLogs = logger
    .getHistory()
    .filter((entry) => new Date(entry.timestamp).getTime() >= minTs)
    .filter((entry) => (severity && severity !== 'ALL' ? entry.level === severity : true))
    .filter((entry) =>
      source && source !== 'all' ? entry.context.toLowerCase().includes(source) : true
    )
    .filter((entry) => {
      if (!userId) return true
      return JSON.stringify(entry.meta || {})
        .toLowerCase()
        .includes(userId.toLowerCase())
    })
    .map((entry) => ({
      timestamp: entry.timestamp,
      severity: entry.level,
      source: entry.context,
      message: entry.message,
      details: entry.meta,
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

  const filtered = [...runtimeLogs, ...auditLogs]

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
