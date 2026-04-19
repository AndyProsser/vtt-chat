import { Router, Request, Response, NextFunction } from 'express'
import { ErrorCode } from '@shared'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { getUserProfileById, listCharactersForUser } from '@/repositories/campaign.repository'

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

  ;(req as any).user = user
  next()
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
