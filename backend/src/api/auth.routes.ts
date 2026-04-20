/**
 * Authentication Routes
 * POST /auth/login - Login with username (for testing: always succeeds)
 * POST /auth/refresh - Refresh JWT token
 * GET /auth/validate - Validate token
 * GET /auth/me - Get current user info
 */

import { Router, Request, Response, NextFunction } from 'express'
import { createToken, verifyToken, extractTokenFromHeader } from '@/services/auth.service'
import { createRateLimit } from '@/infra/http/rate-limit'
import type { UUID } from '@shared'
import { ErrorCode, isValidUsername } from '@shared'
import { upsertUserAccount } from '@/repositories/campaign.repository'
import { getPrismaClient } from '@/infra/db'
import { issueHandoffToken, consumeHandoffToken } from '@/services/handoff.service'

const router = Router()
const prisma = getPrismaClient()

const loginRateLimit = createRateLimit({
  windowMs: 5 * 60 * 1000,
  maxRequests: 10,
  message: 'Too many login attempts. Please try again later.',
})

const tokenRefreshRateLimit = createRateLimit({
  windowMs: 60 * 1000,
  maxRequests: 60,
  message: 'Too many token refresh attempts. Please slow down.',
})

/**
 * Middleware: Extract and verify token from Authorization header
 */
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = extractTokenFromHeader(req.headers.authorization)
  if (!token) {
    return res.status(401).json({
      code: ErrorCode.UNAUTHORIZED,
      message: 'Missing or invalid Authorization header',
    })
  }

  const payload = verifyToken(token)
  if (!payload) {
    return res.status(401).json({
      code: ErrorCode.TOKEN_EXPIRED,
      message: 'Token is invalid or expired',
    })
  }

  // Attach to request for downstream handlers
  ;(req as any).user = payload

  next()
}

async function getUserAuthContext(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      role: true,
      adminRole: true,
      isActive: true,
      password: true,
      displayName: true,
      avatarUrl: true,
      email: true,
    },
  })

  if (!user) {
    return null
  }

  const isFullAccount = Boolean(user.password)
  const hasAdminAccess = Boolean(user.adminRole) || user.role === 'DM'

  return {
    ...user,
    isFullAccount,
    hasAdminAccess,
    requiresUpgradeForAdmin: !isFullAccount,
  }
}

/**
 * POST /api/auth/login
 * Login with username and optional role.
 * Stage 1: No password validation, just accept username.
 * Returns JWT token.
 */
router.post('/login', loginRateLimit, async (req: Request, res: Response) => {
  const { username, role, displayName, avatarUrl } = req.body

  // Validate input
  if (!username || !isValidUsername(username)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid username',
      field: 'username',
    })
  }

  if (!role || !['DM', 'PLAYER', 'SPECTATOR'].includes(role)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid role',
      field: 'role',
    })
  }

  const persistedUser = await upsertUserAccount({
    username,
    role: role as 'DM' | 'PLAYER' | 'SPECTATOR',
    displayName: typeof displayName === 'string' ? displayName : undefined,
    avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : undefined,
  })

  const userId = persistedUser.id as UUID
  const token = createToken({
    userId,
    username: persistedUser.username,
    role: role as 'DM' | 'PLAYER' | 'SPECTATOR',
  })

  res.status(200).json({
    token,
    user: {
      id: userId,
      username: persistedUser.username,
      displayName: persistedUser.displayName,
      avatarUrl: persistedUser.avatarUrl,
      role: persistedUser.role,
    },
  })
})

/**
 * POST /api/auth/refresh
 * Refresh an expired token.
 * Requires valid current token in Authorization header.
 */
router.post('/refresh', tokenRefreshRateLimit, authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user
  if (!user) {
    return res.status(401).json({
      code: ErrorCode.UNAUTHORIZED,
      message: 'User not attached to request',
    })
  }

  const newToken = createToken({
    userId: user.userId,
    username: user.username,
    role: user.role,
    sessionId: user.sessionId,
  })

  res.status(200).json({
    token: newToken,
  })
})

/**
 * GET /api/auth/validate
 * Check if the current token is valid.
 */
router.get('/validate', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user

  res.status(200).json({
    valid: true,
    user: {
      id: user.userId,
      username: user.username,
      role: user.role,
      sessionId: user.sessionId || null,
    },
  })
})

/**
 * GET /api/auth/me
 * Get current user info from token.
 */
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user

  getUserAuthContext(user.userId)
    .then((dbUser) => {
      if (!dbUser) {
        res.status(404).json({
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        })
        return
      }

      res.status(200).json({
        id: dbUser.id,
        username: dbUser.username,
        role: dbUser.role,
        sessionId: user.sessionId || null,
        adminRole: dbUser.adminRole,
        hasAdminAccess: dbUser.hasAdminAccess,
        isFullAccount: dbUser.isFullAccount,
        requiresUpgradeForAdmin: dbUser.requiresUpgradeForAdmin,
      })
    })
    .catch(() => {
      res.status(500).json({
        code: 'ME_LOOKUP_FAILED',
        message: 'Failed to load current user profile',
      })
    })
})

/**
 * POST /api/auth/handoff/admin
 * Creates a short-lived one-time handoff token for frontend -> admin launch.
 */
router.post('/handoff/admin', authMiddleware, async (req: Request, res: Response) => {
  const user = (req as any).user
  const context = await getUserAuthContext(user.userId)

  if (!context) {
    res.status(404).json({
      code: 'USER_NOT_FOUND',
      message: 'User not found',
    })
    return
  }

  if (!context.isActive) {
    res.status(403).json({
      code: 'ACCOUNT_DEACTIVATED',
      message: 'Account is deactivated',
    })
    return
  }

  if (!context.hasAdminAccess) {
    res.status(403).json({
      code: 'ADMIN_ACCESS_REQUIRED',
      message: 'User does not have admin access',
    })
    return
  }

  if (!context.isFullAccount) {
    res.status(403).json({
      code: 'GUEST_UPGRADE_REQUIRED',
      message: 'Upgrade to a full account before accessing admin',
    })
    return
  }

  const { handoffToken, expiresInSec } = issueHandoffToken({
    userId: context.id,
    username: context.username,
    target: 'admin',
  })

  res.status(200).json({
    handoffToken,
    expiresInSec,
    redirectUrl: `/admin/launch?handoff=${handoffToken}`,
  })
})

/**
 * POST /api/auth/handoff/exchange
 * Exchanges one-time handoff token for a user JWT (admin -> frontend launch).
 */
router.post('/handoff/exchange', async (req: Request, res: Response) => {
  const handoffToken = String(req.body?.handoffToken || '').trim()
  if (!handoffToken) {
    res.status(400).json({
      code: 'MISSING_HANDOFF_TOKEN',
      message: 'handoffToken is required',
    })
    return
  }

  const consumed = consumeHandoffToken(handoffToken, 'app')
  if (!consumed) {
    res.status(401).json({
      code: 'INVALID_HANDOFF_TOKEN',
      message: 'Handoff token is invalid, expired, or already used',
    })
    return
  }

  const user = await prisma.user.findUnique({
    where: { id: consumed.userId },
    select: {
      id: true,
      username: true,
      role: true,
      displayName: true,
      avatarUrl: true,
      isActive: true,
      adminRole: true,
      password: true,
    },
  })

  if (!user || !user.isActive) {
    res.status(403).json({
      code: 'ACCOUNT_NOT_ALLOWED',
      message: 'Account is unavailable for handoff',
    })
    return
  }

  if (!['DM', 'PLAYER', 'SPECTATOR'].includes(user.role)) {
    res.status(403).json({
      code: 'INVALID_ROLE',
      message: 'Unsupported role for frontend authentication',
    })
    return
  }

  const token = createToken({
    userId: user.id as UUID,
    username: user.username,
    role: user.role as 'DM' | 'PLAYER' | 'SPECTATOR',
  })

  res.status(200).json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      adminRole: user.adminRole,
      isFullAccount: Boolean(user.password),
    },
  })
})

export default router
