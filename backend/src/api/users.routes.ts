import { Router, Request, Response, NextFunction } from 'express'
import { ErrorCode } from '@shared'
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

export default router
