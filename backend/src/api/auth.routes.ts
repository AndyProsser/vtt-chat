/**
 * Authentication Routes
 * POST /auth/login - Login with username (for testing: always succeeds)
 * POST /auth/refresh - Refresh JWT token
 * GET /auth/validate - Validate token
 * GET /auth/me - Get current user info
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
import { getExternalSystem, isExternalSystemAuthAllowed } from '@/services/integrations.service'
import { getHandoffExchangeUser, getUserAuthContext } from '@/services/auth-user-context.service'
import {
  joinGuestSpectatorViaInvite,
  getExtensionPreflight,
  precheckPlayerInviteEmail,
  joinGuestPlayerViaInvite,
  loginGuestViaExtension,
  upgradeGuestAccount,
} from '@/services/guest-auth.service'
import { deriveCampaignJoinRole, normalizePlayerFacingRole } from '@/services/session-authz.service'

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

router.post('/extension/guest-login', async (req: Request, res: Response) => {
  const externalSystem = String(req.body?.externalSystem || '')
    .trim()
    .toLowerCase()

  if (!externalSystem) {
    return res.status(400).json({
      code: 'MISSING_EXTERNAL_SYSTEM',
      message: 'externalSystem is required',
    })
  }

  const system = getExternalSystem(externalSystem)
  if (!system || !isExternalSystemAuthAllowed(externalSystem)) {
    return res.status(403).json({
      code: 'INTEGRATION_NOT_AUTHORIZED',
      message: `This platform has not enabled ${system?.displayName || externalSystem} integration.`,
    })
  }

  const inviteCode = String(req.body?.inviteCode || '').trim()
  const externalUserId = String(req.body?.externalUserId || '').trim()
  const email = String(req.body?.email || '').trim()

  if (!inviteCode || !externalUserId || !email) {
    return res.status(400).json({
      code: 'INVALID_GUEST_AUTH_REQUEST',
      message: 'inviteCode, externalUserId, and email are required',
    })
  }

  try {
    const result = await loginGuestViaExtension({
      inviteCode,
      externalSystem,
      externalUserId,
      email,
      displayName: typeof req.body?.displayName === 'string' ? req.body.displayName : undefined,
      avatarUrl: typeof req.body?.avatarUrl === 'string' ? req.body.avatarUrl : undefined,
      character:
        req.body?.character && typeof req.body.character === 'object'
          ? req.body.character
          : undefined,
      campaignPacket:
        req.body?.campaignPacket && typeof req.body.campaignPacket === 'object'
          ? req.body.campaignPacket
          : undefined,
    })

    return res.status(200).json(result)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'INVITE_EXPIRED') {
        return res.status(403).json({ code: 'INVITE_EXPIRED', message: 'Invite code is invalid' })
      }
      if (error.message === 'CAMPAIGN_PACKET_REQUIRED') {
        return res.status(400).json({
          code: 'CAMPAIGN_PACKET_REQUIRED',
          message: 'campaignPacket is required for first-time campaign bootstrap',
        })
      }
      if (error.message === 'CAMPAIGN_LINK_MISMATCH') {
        return res.status(409).json({
          code: 'CAMPAIGN_LINK_MISMATCH',
          message: 'Supplied campaign packet does not match the linked external campaign',
        })
      }
      if (error.message === 'FULL_ACCOUNT_EXISTS') {
        return res.status(409).json({
          code: 'FULL_ACCOUNT_EXISTS',
          message: 'A full account already exists for this email. Use standard authentication.',
        })
      }
    }

    return res.status(500).json({
      code: 'GUEST_AUTH_FAILED',
      message: 'Guest authentication failed',
    })
  }
})

router.post('/extension/preflight', async (req: Request, res: Response) => {
  const externalSystem = String(req.body?.externalSystem || '')
    .trim()
    .toLowerCase()
  const email = String(req.body?.email || '').trim()
  const inviteCode = String(req.body?.inviteCode || '').trim()

  if (!externalSystem) {
    return res.status(400).json({
      code: 'MISSING_EXTERNAL_SYSTEM',
      message: 'externalSystem is required',
    })
  }

  if (!email || !inviteCode) {
    return res.status(400).json({
      code: 'INVALID_PREFLIGHT_REQUEST',
      message: 'email and inviteCode are required',
    })
  }

  const system = getExternalSystem(externalSystem)
  if (!system || !isExternalSystemAuthAllowed(externalSystem)) {
    return res.status(403).json({
      code: 'INTEGRATION_NOT_AUTHORIZED',
      message: `This platform has not enabled ${system?.displayName || externalSystem} integration.`,
    })
  }

  const authHeaderToken = extractTokenFromHeader(req.headers.authorization)
  const currentUser = authHeaderToken ? verifyToken(authHeaderToken) : null

  try {
    const result = await getExtensionPreflight({
      email,
      externalSystem,
      externalUserId:
        typeof req.body?.externalUserId === 'string' ? req.body.externalUserId : undefined,
      inviteCode,
      currentUser,
    })

    return res.status(200).json(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'INVITE_EXPIRED') {
      return res.status(404).json({
        code: 'INVITE_EXPIRED',
        message: 'Invite code is invalid',
      })
    }

    return res.status(500).json({
      code: 'PREFLIGHT_FAILED',
      message: 'Failed to evaluate extension preflight',
    })
  }
})

router.post('/spectator/guest-join', async (req: Request, res: Response) => {
  const spectatorInviteCode = String(req.body?.spectatorInviteCode || '').trim()
  const email = String(req.body?.email || '').trim()
  const displayName = String(req.body?.displayName || '').trim()

  if (!spectatorInviteCode || !email || !displayName) {
    return res.status(400).json({
      code: 'INVALID_SPECTATOR_JOIN_REQUEST',
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

router.post('/player/guest-join', async (req: Request, res: Response) => {
  const inviteCode = String(req.body?.inviteCode || '').trim()
  const email = String(req.body?.email || '').trim()
  const displayName = String(req.body?.displayName || '').trim()

  if (!inviteCode || !email || !displayName) {
    return res.status(400).json({
      code: 'INVALID_PLAYER_JOIN_REQUEST',
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

router.post('/player/full-join', async (req: Request, res: Response) => {
  const inviteCode = String(req.body?.inviteCode || '')
    .trim()
    .toUpperCase()
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase()
  const password = String(req.body?.password || '')

  if (!inviteCode || !email || !password) {
    return res.status(400).json({
      code: 'INVALID_PLAYER_FULL_JOIN_REQUEST',
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

router.post('/player/precheck', async (req: Request, res: Response) => {
  const inviteCode = String(req.body?.inviteCode || '').trim()
  const email = String(req.body?.email || '').trim()

  if (!inviteCode || !email) {
    return res.status(400).json({
      code: 'INVALID_PLAYER_PRECHECK_REQUEST',
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
      code: 'PLAYER_PRECHECK_FAILED',
      message: 'Failed to precheck player invite',
    })
  }
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

  getUserAuthContext(payload.userId)
    .then((user) => {
      if (!user || !user.isActive) {
        res.status(401).json({
          code: ErrorCode.UNAUTHORIZED,
          message: 'Account is inactive or unavailable',
        })
        return
      }

      if (user.tokenInvalidBefore) {
        const issuedAtMs = (payload.iat || 0) * 1000
        if (issuedAtMs < user.tokenInvalidBefore.getTime()) {
          res.status(401).json({
            code: ErrorCode.UNAUTHORIZED,
            message: 'Session is no longer valid',
          })
          return
        }
      }

      // Attach to request for downstream handlers
      ;(req as any).user = payload
      next()
    })
    .catch(() => {
      res.status(500).json({
        code: 'AUTH_CONTEXT_LOOKUP_FAILED',
        message: 'Failed to validate authentication context',
      })
    })
}

/**
 * POST /api/auth/login
 * Login with username and explicit access mode.
 * Restricted to existing FULL accounts only.
 * Returns JWT token.
 */
router.post('/login', loginRateLimit, async (req: Request, res: Response) => {
  const { username, role, accessMode, displayName, avatarUrl } = req.body

  // Validate input
  if (!username || !isValidUsername(username)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid username',
      field: 'username',
    })
  }

  const normalizedAccessMode = String(accessMode || 'USER')
    .trim()
    .toUpperCase()
  if (!['USER', 'CAMPAIGN'].includes(normalizedAccessMode)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid accessMode',
      field: 'accessMode',
    })
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      username,
      isActive: true,
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      role: true,
      authType: true,
    },
  })

  if (!existingUser) {
    return res.status(403).json({
      code: 'LOGIN_DISABLED',
      message: 'Direct registration/sign-in is disabled. Use your campaign invite URL to access.',
    })
  }

  if (existingUser.authType !== 'FULL') {
    return res.status(403).json({
      code: 'GUEST_INVITE_REQUIRED',
      message: 'Guest accounts must use campaign invite flows and cannot sign in from this page.',
    })
  }

  const compatibilityRole =
    typeof role === 'string' && ['DM', 'PLAYER', 'SPECTATOR'].includes(role)
      ? (role as 'DM' | 'PLAYER' | 'SPECTATOR')
      : (existingUser.role as 'DM' | 'PLAYER' | 'SPECTATOR')

  const userId = existingUser.id as UUID
  const token = createToken({
    userId,
    username: existingUser.username,
    role: compatibilityRole,
    accessMode: normalizedAccessMode as 'USER' | 'CAMPAIGN',
    authType: 'FULL',
  })

  res.status(200).json({
    token,
    accessMode: normalizedAccessMode,
    user: {
      id: userId,
      username: existingUser.username,
      displayName: existingUser.displayName,
      avatarUrl: existingUser.avatarUrl,
      role: existingUser.role,
      accessMode: normalizedAccessMode,
      authType: 'FULL',
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
    accessMode: user.accessMode || 'CAMPAIGN',
    authType: user.authType || 'FULL',
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
      accessMode: user.accessMode || 'CAMPAIGN',
      authType: user.authType || 'FULL',
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
        accessMode: user.accessMode || 'CAMPAIGN',
        sessionId: user.sessionId || null,
        email: dbUser.email,
        authType: dbUser.authType,
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

  const user = await getHandoffExchangeUser(consumed.userId)

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
    authType: user.authType,
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
      authType: user.authType,
      isFullAccount: user.authType === 'FULL',
    },
  })
})

router.post('/upgrade', authMiddleware, async (req: Request, res: Response) => {
  const user = (req as any).user
  const password = String(req.body?.password || '')

  if (!password) {
    return res.status(400).json({
      code: 'INVALID_PASSWORD',
      message: 'password is required',
    })
  }

  if ((user.authType || 'FULL') !== 'GUEST') {
    return res.status(403).json({
      code: 'ACCOUNT_ALREADY_FULL',
      message: 'Only guest accounts can be upgraded',
    })
  }

  try {
    const result = await upgradeGuestAccount({
      userId: user.userId,
      password,
    })

    return res.status(200).json(result)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'INVALID_PASSWORD') {
        return res.status(400).json({
          code: 'INVALID_PASSWORD',
          message: 'Password does not meet security requirements',
        })
      }
      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        })
      }
      if (error.message === 'ACCOUNT_ALREADY_FULL') {
        return res.status(403).json({
          code: 'ACCOUNT_ALREADY_FULL',
          message: 'Account is already a full account',
        })
      }
    }

    return res.status(500).json({
      code: 'ACCOUNT_UPGRADE_FAILED',
      message: 'Failed to upgrade account',
    })
  }
})

export default router
