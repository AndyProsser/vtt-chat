/**
 * Authentication Routes - current (Normalized)
 *
 * This module provides normalized API paths for authentication flows.
 * Migrates from mixed patterns (extension/, player/, spectator/) to unified join/* structure.
 *
 * Reference: docs/operations/API-PATH-CUTOVER-MAP.md
 *
 * New Route Patterns:
 * POST /api/auth/join/guest/player       - Guest player join flow
 * POST /api/auth/join/guest/spectator    - Guest spectator join flow
 * POST /api/auth/join/full/player        - Full account player join flow
 * POST /api/auth/validate/player         - Precheck player invite status
 * POST /api/auth/login                   - Full account login
 * POST /api/auth/upgrade                 - Guest to full account upgrade
 * POST /api/auth/handoff/admin           - Admin token handoff
 * POST /api/auth/handoff/exchange        - Accept admin handoff
 * GET  /api/auth/validate                - Validate token
 * GET  /api/auth/me                      - Get current user
 * POST /api/auth/refresh                 - Refresh JWT token
 *
 * Backward Compatibility:
 * Old routes redirect (302) to current for all new client code.
 * Legacy clients (extension) continue to work via old routes.
 */

import { Router, Request, Response, NextFunction } from 'express'
import {
  createToken,
  verifyPassword,
  verifyToken,
  extractTokenFromHeader,
} from '@/services/auth.service'
import { createRateLimit } from '@/infra/http/rate-limit'
import type { UUID } from '@shared'
import { ErrorCode, isValidUsername } from '@shared'
import { joinCampaignForUser } from '@/repositories/campaign.repository'
import { getPrismaClient } from '@/infra/db'
import { issueHandoffToken, consumeHandoffToken } from '@/services/handoff.service'
import { getHandoffExchangeUser, getUserAuthContext } from '@/services/auth/user-context.service'
import {
  joinGuestSpectatorViaInvite,
  precheckPlayerInviteEmail,
  joinGuestPlayerViaInvite,
  upgradeGuestAccount,
} from '@/services/guest-auth.service'
import {
  completePasswordReset,
  registerFullAccount,
  requestPasswordReset,
  suggestAvailableUsername,
  verifyPasswordResetToken,
} from '@/services/self-service-auth'
import { deriveCampaignJoinRole, normalizePlayerFacingRole } from '@/services/session/authz.service'

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

const isPasswordlessLoginEnabled =
  (process.env.NODE_ENV || '').toLowerCase() === 'development' &&
  ['1', 'true', 'yes', 'on'].includes(
    String(process.env.ENABLE_PASSWORDLESS_LOGIN || '')
      .trim()
      .toLowerCase()
  )

// ============================================================================
// Middleware
// ============================================================================

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = extractTokenFromHeader(req.headers.authorization)
  if (!token) {
    return res.status(401).json({
      code: ErrorCode.UNAUTHORIZED,
      message: 'Missing Authorization header',
    })
  }

  const user = verifyToken(token)
  if (!user) {
    return res.status(401).json({
      code: ErrorCode.UNAUTHORIZED,
      message: 'Invalid or expired token',
    })
  }

  ;(req as any).user = user
  next()
}

// ============================================================================
// POST /api/auth/login - Full Account Login
// ============================================================================

router.post('/login', loginRateLimit, async (req: Request, res: Response) => {
  const username = String(req.body?.username || req.body?.email || '')
    .trim()
    .toLowerCase()
  const password = String(req.body?.password || '')
  const requestedRole = String(req.body?.role || 'PLAYER')
    .trim()
    .toUpperCase()
  const isEmailLogin = username.includes('@')

  if (!username || (!password && !isPasswordlessLoginEnabled)) {
    return res.status(400).json({
      code: 'INVALID_LOGIN_REQUEST',
      message: 'username and password are required',
    })
  }

  if (isEmailLogin && isPasswordlessLoginEnabled) {
    return res.status(400).json({
      code: 'INVALID_LOGIN_REQUEST',
      message: 'DEV testing passwordless login only supports usernames',
    })
  }

  if (!isEmailLogin && !isValidUsername(username)) {
    return res.status(400).json({
      code: 'INVALID_USERNAME',
      message: 'username must be alphanumeric and 3-32 characters',
    })
  }

  const user = await prisma.user.findFirst({
    where: {
      ...(isEmailLogin ? { email: username } : { username }),
      isActive: true,
    },
    select: {
      id: true,
      username: true,
      role: true,
      authType: true,
      password: true,
    },
  })

  if (!user && isPasswordlessLoginEnabled) {
    const fallbackRole = ['DM', 'PLAYER', 'SPECTATOR'].includes(requestedRole)
      ? (requestedRole as 'DM' | 'PLAYER' | 'SPECTATOR')
      : 'PLAYER'

    const created = await prisma.user.create({
      data: {
        username,
        displayName: username,
        authType: 'FULL',
        role: fallbackRole,
      },
      select: {
        id: true,
        username: true,
        role: true,
      },
    })

    const resolvedRole = normalizePlayerFacingRole(created.role)

    return res.status(200).json({
      token: createToken({
        userId: created.id as UUID,
        username: created.username,
        role: resolvedRole,
        authType: 'FULL',
      }),
      user: {
        id: created.id,
        username: created.username,
        role: resolvedRole,
        authType: 'FULL',
      },
    })
  }

  if (!user || user.authType !== 'FULL') {
    return res.status(401).json({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid username or password',
    })
  }

  if (!user.password && !isPasswordlessLoginEnabled) {
    return res.status(401).json({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid username or password',
    })
  }

  if (!isPasswordlessLoginEnabled) {
    const passwordValid = await verifyPassword(password, user.password as string)
    if (!passwordValid) {
      return res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password',
      })
    }
  } else if (password && user.password) {
    const passwordValid = await verifyPassword(password, user.password)
    if (!passwordValid) {
      return res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password',
      })
    }
  }

  const resolvedRole = normalizePlayerFacingRole(user.role)

  return res.status(200).json({
    token: createToken({
      userId: user.id as UUID,
      username: user.username,
      role: resolvedRole,
      authType: 'FULL',
    }),
    user: {
      id: user.id,
      username: user.username,
      role: resolvedRole,
      authType: 'FULL',
    },
  })
})

router.post('/register/username-suggestion', async (req: Request, res: Response) => {
  const displayName = String(req.body?.name || '').trim()
  const requestedUsername = String(req.body?.username || '').trim()

  const username = await suggestAvailableUsername({
    displayName,
    requestedUsername,
  })

  return res.status(200).json({ username })
})

router.post('/register', async (req: Request, res: Response) => {
  const displayName = String(req.body?.name || '').trim()
  const email = String(req.body?.email || '').trim()
  const requestedUsername = String(req.body?.username || '').trim()
  const password = String(req.body?.password || '')

  try {
    const result = await registerFullAccount({
      displayName,
      email,
      requestedUsername,
      password,
    })

    return res.status(201).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'REGISTRATION_FAILED'

    if (message === 'DISPLAY_NAME_REQUIRED') {
      return res.status(400).json({
        code: 'DISPLAY_NAME_REQUIRED',
        message: 'Name is required',
      })
    }
    if (message === 'INVALID_EMAIL') {
      return res.status(400).json({
        code: 'INVALID_EMAIL',
        message: 'A valid email address is required',
      })
    }
    if (message === 'INVALID_PASSWORD') {
      return res.status(400).json({
        code: 'INVALID_PASSWORD',
        message: 'Password does not meet security requirements',
      })
    }
    if (message === 'EMAIL_IN_USE') {
      return res.status(409).json({
        code: 'EMAIL_IN_USE',
        message: 'That email is already registered',
      })
    }

    return res.status(500).json({
      code: 'REGISTRATION_FAILED',
      message: 'Failed to register account',
    })
  }
})

router.post('/password-reset/request', async (req: Request, res: Response) => {
  const identifier = String(req.body?.identifier || '').trim()
  const appBaseUrl =
    String(process.env.FRONTEND_URL || '').trim() || String(req.headers.origin || '').trim()

  try {
    const result = await requestPasswordReset({
      identifier,
      appBaseUrl,
      isDevelopment: (process.env.NODE_ENV || '').toLowerCase() === 'development',
    })

    if (!result.accountFound) {
      return res.status(404).json({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'No account matched that username or email',
        accountFound: false,
      })
    }

    return res.status(200).json({
      accountFound: true,
      delivery: result.delivery,
      resetToken: result.resetToken,
      email: result.email,
      message:
        result.delivery === 'passwordless'
          ? 'DEV testing skipped email verification and opened password reset directly.'
          : 'Password reset email sent.',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PASSWORD_RESET_REQUEST_FAILED'

    if (message === 'IDENTIFIER_REQUIRED') {
      return res.status(400).json({
        code: 'IDENTIFIER_REQUIRED',
        message: 'Username or email is required',
      })
    }
    if (message === 'PASSWORD_RESET_EMAIL_NOT_CONFIGURED') {
      return res.status(500).json({
        code: 'PASSWORD_RESET_EMAIL_NOT_CONFIGURED',
        message: 'Password reset email delivery is not configured',
      })
    }

    return res.status(500).json({
      code: 'PASSWORD_RESET_REQUEST_FAILED',
      message: 'Failed to start password reset',
    })
  }
})

router.post('/password-reset/verify', async (req: Request, res: Response) => {
  const token = String(req.body?.token || '').trim()

  if (!token) {
    return res.status(400).json({
      code: 'RESET_TOKEN_REQUIRED',
      message: 'Reset token is required',
    })
  }

  const result = await verifyPasswordResetToken(token)
  if (!result.valid) {
    return res.status(400).json({
      code: 'INVALID_RESET_TOKEN',
      message: 'Password reset link is invalid or expired',
    })
  }

  return res.status(200).json(result)
})

router.post('/password-reset/complete', async (req: Request, res: Response) => {
  const token = String(req.body?.token || '').trim()
  const password = String(req.body?.password || '')

  if (!token || !password) {
    return res.status(400).json({
      code: 'INVALID_PASSWORD_RESET_REQUEST',
      message: 'Reset token and password are required',
    })
  }

  try {
    await completePasswordReset({ token, password })
    return res.status(200).json({
      message: 'Password reset complete',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PASSWORD_RESET_FAILED'

    if (message === 'INVALID_PASSWORD') {
      return res.status(400).json({
        code: 'INVALID_PASSWORD',
        message: 'Password does not meet security requirements',
      })
    }
    if (message === 'INVALID_RESET_TOKEN') {
      return res.status(400).json({
        code: 'INVALID_RESET_TOKEN',
        message: 'Password reset link is invalid or expired',
      })
    }

    return res.status(500).json({
      code: 'PASSWORD_RESET_FAILED',
      message: 'Failed to reset password',
    })
  }
})

// ============================================================================
// POST /api/auth/refresh - Refresh JWT Token
// ============================================================================

router.post('/refresh', tokenRefreshRateLimit, authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user
  const newToken = createToken({
    userId: user.userId as UUID,
    username: user.username,
    role: user.role,
    authType: user.authType,
  })

  return res.status(200).json({
    token: newToken,
  })
})

// ============================================================================
// GET /api/auth/validate - Validate Token
// ============================================================================

router.get('/validate', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user

  return res.status(200).json({
    valid: true,
    user: {
      id: user.userId,
      username: user.username,
      role: user.role,
      authType: user.authType,
    },
  })
})

// ============================================================================
// GET /api/auth/me - Get Current User
// ============================================================================

router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  const user = (req as any).user

  try {
    const context = await getUserAuthContext(user.userId as UUID)

    if (!context) {
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      })
    }

    return res.status(200).json({
      id: user.userId,
      username: user.username,
      role: user.role,
      authType: user.authType,
      adminRole: context.adminRole,
      hasAdminAccess: context.hasAdminAccess,
      isFullAccount: user.authType === 'FULL',
      requiresUpgradeForAdmin: context.requiresUpgradeForAdmin,
      email: context.email,
    })
  } catch {
    return res.status(500).json({
      code: 'FAILED_TO_GET_USER',
      message: 'Failed to retrieve user information',
    })
  }
})

// ============================================================================
// POST /api/auth/join/guest/player - Guest Player Join
// ============================================================================

router.post('/join/guest/player', async (req: Request, res: Response) => {
  const inviteCode = String(req.body?.inviteCode || '').trim()
  const email = String(req.body?.email || '').trim()
  const displayName = String(req.body?.displayName || '').trim()

  if (!inviteCode || !email || !displayName) {
    return res.status(400).json({
      code: 'INVALID_GUEST_PLAYER_JOIN_REQUEST',
      message: 'inviteCode, email, and displayName are required',
    })
  }

  const characterInput = req.body?.character
  const character =
    characterInput && typeof characterInput === 'object'
      ? {
          name: String((characterInput as { name?: unknown }).name || '').trim(),
          race: String((characterInput as { race?: unknown }).race || '').trim() || undefined,
          class: String((characterInput as { class?: unknown }).class || '').trim() || undefined,
          level:
            typeof (characterInput as { level?: unknown }).level === 'number'
              ? ((characterInput as { level: number }).level as number)
              : null,
          avatarUrl:
            String((characterInput as { avatarUrl?: unknown }).avatarUrl || '').trim() || undefined,
        }
      : undefined

  try {
    const result = await joinGuestPlayerViaInvite({
      inviteCode,
      email,
      displayName,
      character: character?.name ? character : undefined,
    })

    return res.status(200).json(result)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'INVITE_EXPIRED') {
        return res.status(404).json({
          code: 'INVITE_EXPIRED',
          message: 'Invite code is invalid',
        })
      }
      if (error.message === 'FULL_ACCOUNT_EXISTS') {
        return res.status(409).json({
          code: 'FULL_ACCOUNT_EXISTS',
          message: 'A full account already exists for this email. Use standard sign in.',
        })
      }
    }

    return res.status(500).json({
      code: 'PLAYER_JOIN_FAILED',
      message: 'Failed to join as player',
    })
  }
})

// ============================================================================
// POST /api/auth/join/guest/spectator - Guest Spectator Join
// ============================================================================

router.post('/join/guest/spectator', async (req: Request, res: Response) => {
  const spectatorInviteCode = String(req.body?.spectatorInviteCode || '').trim()
  const email = String(req.body?.email || '').trim()
  const displayName = String(req.body?.displayName || '').trim()

  if (!spectatorInviteCode || !email || !displayName) {
    return res.status(400).json({
      code: 'INVALID_GUEST_SPECTATOR_JOIN_REQUEST',
      message: 'spectatorInviteCode, email, and displayName are required',
    })
  }

  try {
    const result = await joinGuestSpectatorViaInvite({
      spectatorInviteCode,
      email,
      displayName,
    })

    return res.status(200).json(result)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'INVITE_EXPIRED') {
        return res.status(404).json({
          code: 'INVITE_EXPIRED',
          message: 'Spectator invite code is invalid',
        })
      }
      if (error.message === 'SPECTATORS_DISABLED') {
        return res.status(403).json({
          code: 'SPECTATORS_DISABLED',
          message: 'Spectators are not enabled for this campaign',
        })
      }
      if (error.message === 'FULL_ACCOUNT_REQUIRED') {
        return res.status(403).json({
          code: 'FULL_ACCOUNT_REQUIRED',
          message: 'This campaign only allows full-account spectators',
        })
      }
      if (error.message === 'SPECTATOR_CAPACITY_REACHED') {
        return res.status(409).json({
          code: 'SPECTATOR_CAPACITY_REACHED',
          message: 'Spectator capacity reached and waitlist is disabled',
        })
      }
    }

    return res.status(500).json({
      code: 'SPECTATOR_JOIN_FAILED',
      message: 'Failed to join spectator session',
    })
  }
})

// ============================================================================
// POST /api/auth/join/full/player - Full Account Player Join
// ============================================================================

router.post('/join/full/player', async (req: Request, res: Response) => {
  const inviteCode = String(req.body?.inviteCode || '')
    .trim()
    .toUpperCase()
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase()
  const password = String(req.body?.password || '')

  if (!inviteCode || !email || !password) {
    return res.status(400).json({
      code: 'INVALID_FULL_PLAYER_JOIN_REQUEST',
      message: 'inviteCode, email, and password are required',
    })
  }

  const campaign = await prisma.campaign.findFirst({
    where: {
      inviteCode,
      inviteActive: true,
    },
    select: {
      id: true,
      inviteCode: true,
    },
  })

  if (!campaign) {
    return res.status(404).json({
      code: 'INVITE_EXPIRED',
      message: 'Invite code is invalid',
    })
  }

  const user = await prisma.user.findFirst({
    where: {
      email,
    },
    select: {
      id: true,
      username: true,
      role: true,
      authType: true,
      password: true,
      isActive: true,
    },
  })

  if (!user || user.authType !== 'FULL') {
    return res.status(403).json({
      code: 'FULL_ACCOUNT_REQUIRED',
      message: 'A full account is required to sign in and join with this email',
    })
  }

  if (!user.isActive) {
    return res.status(403).json({
      code: 'ACCOUNT_DEACTIVATED',
      message: 'Account is inactive',
    })
  }

  if (!user.password) {
    return res.status(403).json({
      code: 'PASSWORD_NOT_SET',
      message: 'Account does not have a password set',
    })
  }

  const passwordValid = await verifyPassword(password, user.password)
  if (!passwordValid) {
    return res.status(401).json({
      code: 'INVALID_CREDENTIALS',
      message: 'Incorrect email or password',
    })
  }

  const joined = await joinCampaignForUser({
    campaignId: campaign.id,
    userId: user.id,
    inviteCode: campaign.inviteCode,
    role: deriveCampaignJoinRole(user.role),
  })

  if (!joined) {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message: 'Invalid invite code',
    })
  }

  const resolvedRole = normalizePlayerFacingRole(user.role)

  return res.status(200).json({
    token: createToken({
      userId: user.id as UUID,
      username: user.username,
      role: resolvedRole,
      authType: 'FULL',
    }),
    user: {
      id: user.id,
      username: user.username,
      role: resolvedRole,
      authType: 'FULL',
    },
    campaignId: campaign.id,
  })
})

// ============================================================================
// POST /api/auth/validate/player - Precheck Player Invite Status
// ============================================================================

router.post('/validate/player', async (req: Request, res: Response) => {
  const inviteCode = String(req.body?.inviteCode || '').trim()
  const email = String(req.body?.email || '').trim()

  if (!inviteCode || !email) {
    return res.status(400).json({
      code: 'INVALID_PLAYER_VALIDATE_REQUEST',
      message: 'inviteCode and email are required',
    })
  }

  try {
    const result = await precheckPlayerInviteEmail({ inviteCode, email })
    return res.status(200).json(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'INVITE_EXPIRED') {
      return res.status(404).json({
        code: 'INVITE_EXPIRED',
        message: 'Invite code is invalid',
      })
    }

    return res.status(500).json({
      code: 'PLAYER_VALIDATE_FAILED',
      message: 'Failed to validate player invite',
    })
  }
})

// ============================================================================
// POST /api/auth/upgrade - Guest to Full Account Upgrade
// ============================================================================

router.post('/upgrade', authMiddleware, async (req: Request, res: Response) => {
  const user = (req as any).user
  const password = String(req.body?.password || '')

  if (!password) {
    return res.status(400).json({
      code: 'MISSING_PASSWORD',
      message: 'password is required',
    })
  }

  try {
    const result = await upgradeGuestAccount({
      userId: user.userId as UUID,
      password,
    })

    const newToken = createToken({
      userId: result.user.id as UUID,
      username: result.user.username,
      role: result.user.role,
      authType: 'FULL',
    })

    return res.status(200).json({
      token: newToken,
      user: {
        id: result.user.id,
        username: result.user.username,
        role: result.user.role,
        authType: 'FULL',
      },
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'NOT_GUEST_ACCOUNT') {
        return res.status(409).json({
          code: 'NOT_GUEST_ACCOUNT',
          message: 'Only guest accounts can be upgraded',
        })
      }
      if (error.message === 'ACCOUNT_ALREADY_UPGRADED') {
        return res.status(409).json({
          code: 'ACCOUNT_ALREADY_UPGRADED',
          message: 'Account is already a full account',
        })
      }
    }

    return res.status(500).json({
      code: 'UPGRADE_FAILED',
      message: 'Failed to upgrade account',
    })
  }
})

// ============================================================================
// POST /api/auth/handoff/admin - Admin Token Handoff
// ============================================================================

router.post('/handoff/admin', authMiddleware, async (req: Request, res: Response) => {
  const user = (req as any).user
  const context = await getUserAuthContext(user.userId as UUID)

  if (!context) {
    return res.status(404).json({
      code: 'USER_NOT_FOUND',
      message: 'User not found',
    })
  }

  if (!context.isActive) {
    return res.status(403).json({
      code: 'ACCOUNT_DEACTIVATED',
      message: 'Account is deactivated',
    })
  }

  if (!context.hasAdminAccess) {
    return res.status(403).json({
      code: 'ADMIN_ACCESS_REQUIRED',
      message: 'User does not have admin access',
    })
  }

  if (!context.isFullAccount) {
    return res.status(403).json({
      code: 'GUEST_UPGRADE_REQUIRED',
      message: 'Upgrade to a full account before accessing admin',
    })
  }

  const { handoffToken, expiresInSec } = issueHandoffToken({
    userId: context.id,
    username: context.username,
    target: 'admin',
  })

  return res.status(200).json({
    handoffToken,
    expiresInSec,
    redirectUrl: `/admin/launch?handoff=${handoffToken}`,
  })
})

// ============================================================================
// POST /api/auth/handoff/exchange - Accept Admin Handoff
// ============================================================================

router.post('/handoff/exchange', async (req: Request, res: Response) => {
  const handoffToken = String(req.body?.handoffToken || '').trim()

  if (!handoffToken) {
    return res.status(400).json({
      code: 'MISSING_HANDOFF_TOKEN',
      message: 'handoffToken is required',
    })
  }

  const consumed = consumeHandoffToken(handoffToken, 'app')
  if (!consumed) {
    return res.status(401).json({
      code: 'INVALID_HANDOFF_TOKEN',
      message: 'Handoff token is invalid, expired, or already used',
    })
  }

  const handoffUser = await getHandoffExchangeUser(consumed.userId)

  if (!handoffUser || !handoffUser.isActive) {
    return res.status(403).json({
      code: 'ACCOUNT_NOT_ALLOWED',
      message: 'Account is unavailable for handoff',
    })
  }

  if (!['DM', 'PLAYER', 'SPECTATOR'].includes(handoffUser.role)) {
    return res.status(403).json({
      code: 'INVALID_ROLE',
      message: 'Unsupported role for frontend authentication',
    })
  }

  const token = createToken({
    userId: handoffUser.id as UUID,
    username: handoffUser.username,
    role: handoffUser.role as 'DM' | 'PLAYER' | 'SPECTATOR',
    authType: handoffUser.authType,
  })

  return res.status(200).json({
    token,
    user: {
      id: handoffUser.id,
      username: handoffUser.username,
      displayName: handoffUser.displayName,
      avatarUrl: handoffUser.avatarUrl,
      role: handoffUser.role,
      authType: handoffUser.authType,
    },
  })
})

export default router
