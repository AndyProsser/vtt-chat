import { Router, Request, Response, NextFunction } from 'express'
import { ErrorCode } from '@shared'
import { getPrismaClient } from '@/infra/db'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { getUserProfileById, listCharactersForUser } from '@/repositories/campaign.repository'
import { validateUserAuthState } from '@/services/auth-user-context.service'

const router = Router()

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractTokenFromHeader(req.headers.authorization)
  if (!token) {
    return res
      .status(401)
      .json({ code: ErrorCode.UNAUTHORIZED, message: 'Missing Authorization header' })
  }

  const user = verifyToken(token)
  if (!user) {
    return res
      .status(401)
      .json({ code: ErrorCode.UNAUTHORIZED, message: 'Authentication required' })
  }

  validateUserAuthState(user.userId, user.iat)
    .then((state) => {
      if (!state.ok && state.code === 'INACTIVE_OR_MISSING') {
        return res
          .status(401)
          .json({ code: ErrorCode.UNAUTHORIZED, message: 'Account is inactive or unavailable' })
      }

      if (!state.ok && state.code === 'TOKEN_INVALIDATED') {
        return res
          .status(401)
          .json({ code: ErrorCode.UNAUTHORIZED, message: 'Session is no longer valid' })
      }

      ;(req as any).user = user
      next()
    })
    .catch(() => {
      return res.status(500).json({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to validate authentication state',
      })
    })
}

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const profile = await getUserProfileById(user.userId)

  if (!profile) {
    return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'User not found' })
  }

  return res.status(200).json({
    user: {
      id: profile.id,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      role: profile.role,
      authType: user.authType || 'FULL',
      createdAt: profile.createdAt,
    },
  })
})

router.get('/me/characters', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const characters = await listCharactersForUser(user.userId)
  return res.status(200).json({ characters })
})

router.patch('/me', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { displayName, avatarUrl } = req.body || {}

  if (displayName !== undefined) {
    if (typeof displayName !== 'string') {
      return res
        .status(400)
        .json({
          code: ErrorCode.INVALID_INPUT,
          message: 'displayName must be a string',
          field: 'displayName',
        })
    }
    if (displayName.trim().length > 64) {
      return res
        .status(400)
        .json({
          code: ErrorCode.INVALID_INPUT,
          message: 'displayName must be 64 characters or fewer',
          field: 'displayName',
        })
    }
  }

  if (avatarUrl !== undefined && avatarUrl !== null) {
    if (typeof avatarUrl !== 'string') {
      return res
        .status(400)
        .json({
          code: ErrorCode.INVALID_INPUT,
          message: 'avatarUrl must be a string or null',
          field: 'avatarUrl',
        })
    }
    if (avatarUrl.trim().length > 2_000_000) {
      return res
        .status(400)
        .json({ code: ErrorCode.INVALID_INPUT, message: 'avatarUrl too long', field: 'avatarUrl' })
    }
  }

  const prisma = getPrismaClient()
  const updateData: Record<string, string | null | undefined> = {}

  if (displayName !== undefined) {
    updateData.displayName =
      typeof displayName === 'string' && displayName.trim().length > 0 ? displayName.trim() : null
  }

  if (avatarUrl !== undefined) {
    updateData.avatarUrl =
      typeof avatarUrl === 'string' && avatarUrl.trim().length > 0 ? avatarUrl.trim() : null
  }

  const updated = await prisma.user.update({
    where: { id: user.userId },
    data: updateData,
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
    },
  })

  return res.status(200).json({
    user: {
      id: updated.id,
      username: updated.username,
      displayName: updated.displayName,
      avatarUrl: updated.avatarUrl,
      role: updated.role,
      authType: user.authType || 'FULL',
      createdAt: updated.createdAt,
    },
  })
})

export default router
