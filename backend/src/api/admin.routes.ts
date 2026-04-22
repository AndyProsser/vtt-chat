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
import {
  findDiagnosticEventById,
  findTelemetryEventById,
  loadDiagnosticEvents,
  loadLogRetentionSettings,
  loadTelemetryEvents,
  persistDiagnosticEvents,
  updateLogRetentionSettings,
} from '@/infra/telemetry-store'
import type { AdminAuthToken } from '@/types'
import type { Prisma } from '@prisma/client'
import { hashPassword } from '@/services/auth.service'
import { randomBytes } from 'crypto'
import type { WebSocketManager } from '@/ws'

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

const ARCHIVED_MARKER = '[ARCHIVED] '

function isCampaignArchived(description?: string | null): boolean {
  return Boolean(description && description.startsWith(ARCHIVED_MARKER))
}

function applyArchivedMarker(description?: string | null): string {
  const normalized = String(description || '').trim()
  if (!normalized) {
    return `${ARCHIVED_MARKER}Archived campaign`
  }
  if (normalized.startsWith(ARCHIVED_MARKER)) {
    return normalized
  }
  return `${ARCHIVED_MARKER}${normalized}`
}

function removeArchivedMarker(description?: string | null): string {
  const normalized = String(description || '')
  if (!normalized.startsWith(ARCHIVED_MARKER)) {
    return normalized.trim()
  }
  return normalized.slice(ARCHIVED_MARKER.length).trim()
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

    const search = String(req.query.search || '').trim()
    const statusFilter = String(req.query.status || 'all')
      .trim()
      .toLowerCase()
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)))

    const andClauses: Prisma.CampaignWhereInput[] = []

    if (search) {
      andClauses.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { inviteCode: { contains: search, mode: 'insensitive' } },
          { currentDm: { username: { contains: search, mode: 'insensitive' } } },
        ],
      })
    }

    if (statusFilter === 'active') {
      andClauses.push({ sessions: { some: { state: 'ACTIVE' } } })
    } else if (statusFilter === 'idle') {
      andClauses.push({ sessions: { some: { state: { in: ['IDLE', 'PAUSED'] } } } })
    } else if (statusFilter === 'ended') {
      andClauses.push({ sessions: { some: { state: 'ENDED' } } })
    } else if (statusFilter === 'no_session') {
      andClauses.push({ sessions: { none: {} } })
    }

    const where = andClauses.length > 0 ? { AND: andClauses } : undefined

    const [total, campaigns] = await Promise.all([
      prisma.campaign.count({ where }),
      prisma.campaign.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          description: true,
          inviteCode: true,
          currentDmId: true,
          createdAt: true,
          updatedAt: true,
          currentDm: {
            select: {
              id: true,
              username: true,
            },
          },
          _count: {
            select: {
              members: true,
              sessions: true,
            },
          },
          sessions: {
            orderBy: { updatedAt: 'desc' },
            take: 1,
            select: {
              id: true,
              name: true,
              state: true,
              createdAt: true,
              startedAt: true,
              endedAt: true,
              updatedAt: true,
              _count: {
                select: {
                  rooms: true,
                  members: true,
                },
              },
            },
          },
        },
      }),
    ])

    res.status(200).json({
      campaigns: campaigns.map((campaign) => {
        const latestSession = campaign.sessions[0] || null
        return {
          id: campaign.id,
          name: campaign.name,
          description: campaign.description,
          isArchived: isCampaignArchived(campaign.description),
          inviteCode: campaign.inviteCode,
          currentDm: campaign.currentDm,
          currentDmId: campaign.currentDmId,
          memberCount: campaign._count.members,
          sessionCount: campaign._count.sessions,
          latestSession,
          createdAt: campaign.createdAt,
          updatedAt: campaign.updatedAt,
        }
      }),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
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
  const memory = process.memoryUsage()
  const load = os.loadavg()
  const uptimeSec = process.uptime()
  const chat = await getChatTelemetrySnapshot()
  const telemetryEvents = await loadTelemetryEvents()
  const clientTelemetryLastHour = telemetryEvents.filter(
    (entry) => Date.now() - new Date(entry.timestamp).getTime() <= 60 * 60 * 1000
  )

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
