import { Router, Request, Response, NextFunction } from 'express'
import { ErrorCode, isValidUUID } from '@shared'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import {
  getSessionMetadataSnapshot,
  getSessionMetadataTimeline,
  listMetadataTemplates,
} from '@/services/metadata.service'

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

router.get('/templates', requireAuth, (_req: Request, res: Response) => {
  return res.status(200).json({ templates: listMetadataTemplates() })
})

router.get('/:sessionId', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { sessionId } = req.params

  if (!isValidUUID(sessionId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_SESSION, message: 'Invalid sessionId', field: 'sessionId' })
  }

  const result = await getSessionMetadataSnapshot({
    sessionId,
    user: {
      userId: user.userId,
    },
  })

  if (!result.ok) {
    if (result.code === 'SESSION_NOT_FOUND') {
      return res
        .status(404)
        .json({ code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found' })
    }

    if (result.code === 'FORBIDDEN') {
      return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a session member' })
    }

    return res.status(500).json({ code: ErrorCode.INTERNAL_ERROR, message: 'Metadata unavailable' })
  }

  return res.status(200).json({ snapshot: result.snapshot })
})

router.get('/:sessionId/timeline', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { sessionId } = req.params

  if (!isValidUUID(sessionId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_SESSION, message: 'Invalid sessionId', field: 'sessionId' })
  }

  const limitRaw = Number(req.query.limit)
  const offsetRaw = Number(req.query.offset)
  const limit = Number.isFinite(limitRaw) ? limitRaw : undefined
  const offset = Number.isFinite(offsetRaw) ? offsetRaw : undefined

  const result = await getSessionMetadataTimeline({
    sessionId,
    user: {
      userId: user.userId,
    },
    limit,
    offset,
  })

  if (!result.ok) {
    if (result.code === 'SESSION_NOT_FOUND') {
      return res
        .status(404)
        .json({ code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found' })
    }

    if (result.code === 'FORBIDDEN') {
      return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a session member' })
    }

    return res.status(500).json({ code: ErrorCode.INTERNAL_ERROR, message: 'Metadata unavailable' })
  }

  return res.status(200).json({
    timeline: result.timeline,
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  })
})

export default router
