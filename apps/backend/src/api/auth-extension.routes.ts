/**
 * Extension Auth & Device Credential Routes
 *
 * Mounted at /api/auth alongside auth-join.routes.ts. Covers the browser
 * extension's auth surface (separate repository — see
 * docs/extension/EXTENSION-INTEGRATION.md): preflight + guest-login, plus
 * device credential issuance/exchange/management (docs/CONTRACTS.md,
 * "Extension Device Credential Contract").
 *
 * POST   /extension/preflight              - Pre-flight account status check
 * POST   /extension/guest-login            - Guest auth: create or resume guest session
 * POST   /extension/credential/exchange    - Exchange a device credential for a fresh JWT (rotates it)
 * GET    /extension/credentials            - List the caller's active device credentials
 * DELETE /extension/credentials/:credentialId - Revoke a device credential
 */

import { Router, Request, Response, NextFunction } from 'express'
import { verifyToken, extractTokenFromHeader } from '@/services/auth.service'
import { createRateLimit } from '@/infra/http/rate-limit'
import { ErrorCode } from '@shared'
import { getExternalSystem, isExternalSystemAuthAllowed } from '@/services/integrations.service'
import { getUserAuthContext } from '@/services/auth/user-context.service'
import { getExtensionPreflight, loginGuestViaExtension } from '@/services/guest-auth'
import {
  exchangeDeviceCredential,
  issueDeviceCredential,
  listDeviceCredentials,
  revokeDeviceCredential,
} from '@/services/auth/device-credential.service'
import { DEVICE_CREDENTIAL_EXCHANGE_RATE_LIMIT } from '@/constants/auth.constants'

const router = Router()

const credentialExchangeRateLimit = createRateLimit({
  ...DEVICE_CREDENTIAL_EXCHANGE_RATE_LIMIT,
  keyGenerator: (req) => String(req.body?.deviceId || req.ip),
  message: 'Too many credential exchange attempts. Please slow down.',
})

/**
 * Extract and verify the bearer token, attaching the decoded payload to
 * the request. Used by the credential list/revoke endpoints.
 */
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
  const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim() : ''

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

    // Device credential issuance is opt-in: only when the extension sends a
    // stable deviceId (see docs/CONTRACTS.md "Extension Device Credential Contract").
    // Older extension builds that don't send one simply don't get the field.
    let deviceCredential: string | undefined
    if (deviceId) {
      const issued = await issueDeviceCredential({ userId: result.user.id, deviceId })
      deviceCredential = issued.credential
    }

    return res.status(200).json({
      ...result,
      ...(deviceCredential ? { deviceCredential } : {}),
    })
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

router.post(
  '/extension/credential/exchange',
  credentialExchangeRateLimit,
  async (req: Request, res: Response) => {
    const credential = String(req.body?.credential || '').trim()
    const deviceId = String(req.body?.deviceId || '').trim()

    if (!credential || !deviceId) {
      return res.status(400).json({
        code: 'MISSING_CREDENTIAL_FIELDS',
        message: 'credential and deviceId are required',
      })
    }

    try {
      const result = await exchangeDeviceCredential({ credential, deviceId })
      return res.status(200).json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'CREDENTIAL_INVALID'

      if (message === 'CREDENTIAL_EXPIRED_GUEST') {
        return res.status(401).json({
          code: 'CREDENTIAL_EXPIRED_GUEST',
          message: 'Device credential expired. Please re-enter your invite code.',
        })
      }
      if (message === 'CREDENTIAL_EXPIRED_FULL') {
        return res.status(401).json({
          code: 'CREDENTIAL_EXPIRED_FULL',
          message: 'Device credential expired. Please sign in again.',
        })
      }

      return res.status(401).json({
        code: 'CREDENTIAL_INVALID',
        message: 'Device credential is invalid or has been revoked',
      })
    }
  }
)

router.get('/extension/credentials', authMiddleware, async (req: Request, res: Response) => {
  const user = (req as any).user

  try {
    const credentials = await listDeviceCredentials(user.userId)
    return res.status(200).json({ credentials })
  } catch {
    return res.status(500).json({
      code: 'CREDENTIAL_LIST_FAILED',
      message: 'Failed to list device credentials',
    })
  }
})

router.delete(
  '/extension/credentials/:credentialId',
  authMiddleware,
  async (req: Request, res: Response) => {
    const user = (req as any).user
    const { credentialId } = req.params

    try {
      const context = await getUserAuthContext(user.userId)
      await revokeDeviceCredential({
        credentialId,
        requestingUserId: user.userId,
        isAdmin: Boolean(context?.hasAdminAccess),
      })

      return res.status(204).send()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'CREDENTIAL_REVOKE_FAILED'

      if (message === 'CREDENTIAL_NOT_FOUND') {
        return res.status(404).json({
          code: 'CREDENTIAL_NOT_FOUND',
          message: 'Device credential not found',
        })
      }
      if (message === 'NOT_CREDENTIAL_OWNER') {
        return res.status(403).json({
          code: 'NOT_CREDENTIAL_OWNER',
          message: 'You do not have permission to revoke this credential',
        })
      }

      return res.status(500).json({
        code: 'CREDENTIAL_REVOKE_FAILED',
        message: 'Failed to revoke device credential',
      })
    }
  }
)

export default router
