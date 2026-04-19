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

const router = Router()

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

  res.status(200).json({
    id: user.userId,
    username: user.username,
    role: user.role,
    sessionId: user.sessionId || null,
  })
})

export default router
