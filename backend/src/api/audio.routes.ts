import { randomUUID } from 'crypto'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { ErrorCode, type EventEnvelope, type UUID, isValidUUID } from '@shared'
import { extractTokenFromHeader, verifyToken, type TokenPayload } from '@/services/auth.service'
import { getSession, isUserInSession } from '@/services/session.service'
import {
  applyDMOverrideState,
  getSessionAudioState,
  removeDMOverrideState,
  setRoomEnvironmentState,
} from '@/services/audio-state.service'
import eventBroadcaster from '@/services/event-broadcaster.service'
import { logger } from '@/utils'

const router = Router()

type AudioPreset = {
  id: string
  name: string
  category: 'VOICE' | 'DISTANCE' | 'ENVIRONMENT' | 'CONDITION' | 'IC'
}

const AUDIO_PRESETS: AudioPreset[] = [
  { id: 'voice-narrator', name: 'Narrator', category: 'VOICE' },
  { id: 'voice-whisper', name: 'Whisper', category: 'VOICE' },
  { id: 'distance-near', name: 'Near', category: 'DISTANCE' },
  { id: 'distance-far', name: 'Far', category: 'DISTANCE' },
  { id: 'env-tavern', name: 'Tavern', category: 'ENVIRONMENT' },
  { id: 'env-cave', name: 'Cave', category: 'ENVIRONMENT' },
  { id: 'cond-silenced', name: 'Silenced', category: 'CONDITION' },
  { id: 'ic-goblin', name: 'Goblin', category: 'IC' },
]

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractTokenFromHeader(req.headers.authorization)
  if (!token) {
    return res.status(401).json({
      code: ErrorCode.UNAUTHORIZED,
      message: 'Missing or invalid Authorization header',
    })
  }

  const user = verifyToken(token)
  if (!user) {
    return res.status(401).json({
      code: ErrorCode.UNAUTHORIZED,
      message: 'Authentication required',
    })
  }

  ;(req as any).user = user
  next()
}

function getAuthUser(req: Request): TokenPayload {
  return (req as any).user as TokenPayload
}

function createEvent(params: {
  type: EventEnvelope['type']
  user: TokenPayload
  sessionId: UUID
  roomId: UUID | null
  payload: Record<string, unknown>
}): EventEnvelope {
  return {
    id: randomUUID() as UUID,
    type: params.type,
    version: 1,
    userId: params.user.userId as UUID,
    userRole: params.user.role as any,
    sessionId: params.sessionId,
    roomId: params.roomId,
    timestamp: Date.now(),
    payload: params.payload,
  }
}

async function validateSessionAccess(
  sessionId: UUID,
  user: TokenPayload
): Promise<
  | {
      ok: true
    }
  | {
      ok: false
      status: number
      code: ErrorCode
      message: string
    }
> {
  const session = await getSession(sessionId)
  if (!session) {
    return {
      ok: false,
      status: 404,
      code: ErrorCode.NOT_FOUND,
      message: 'Session not found',
    }
  }

  const inSession = await isUserInSession(sessionId, user.userId as UUID)
  if (!inSession) {
    return {
      ok: false,
      status: 403,
      code: ErrorCode.FORBIDDEN,
      message: 'User is not in this session',
    }
  }

  return { ok: true }
}

async function validateDmControl(
  sessionId: UUID,
  user: TokenPayload
): Promise<
  | {
      ok: true
    }
  | {
      ok: false
      status: number
      code: ErrorCode
      message: string
    }
> {
  const session = await getSession(sessionId)
  if (!session) {
    return {
      ok: false,
      status: 404,
      code: ErrorCode.NOT_FOUND,
      message: 'Session not found',
    }
  }

  if (user.role !== 'DM' || session.dmId !== (user.userId as UUID)) {
    return {
      ok: false,
      status: 403,
      code: ErrorCode.FORBIDDEN,
      message: 'DM role required for audio control actions',
    }
  }

  const inSession = await isUserInSession(sessionId, user.userId as UUID)
  if (!inSession) {
    return {
      ok: false,
      status: 403,
      code: ErrorCode.FORBIDDEN,
      message: 'User is not in this session',
    }
  }

  return { ok: true }
}

router.get('/presets', requireAuth, (_req: Request, res: Response) => {
  return res.status(200).json({
    presets: AUDIO_PRESETS,
  })
})

router.post('/environment', requireAuth, async (req: Request, res: Response) => {
  const user = getAuthUser(req)
  const { sessionId, roomId, environmentName, parameters } = req.body

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid sessionId',
      field: 'sessionId',
    })
  }

  if (!isValidUUID(roomId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid roomId',
      field: 'roomId',
    })
  }

  if (typeof environmentName !== 'string' || environmentName.trim().length === 0) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'environmentName is required',
      field: 'environmentName',
    })
  }

  const authz = await validateDmControl(sessionId as UUID, user)
  if (!authz.ok) {
    return res.status(authz.status).json({ code: authz.code, message: authz.message })
  }

  const setAt = Date.now()
  const persisted = await setRoomEnvironmentState({
    sessionId: sessionId as UUID,
    roomId: roomId as UUID,
    environmentName,
    environmentId: `env-${environmentName}`,
    parameters: typeof parameters === 'object' && parameters ? parameters : {},
    setBy: user.userId as UUID,
    setAt,
  })

  const event = createEvent({
    type: 'AUDIO:ENVIRONMENT_SET',
    user,
    sessionId: sessionId as UUID,
    roomId: roomId as UUID,
    payload: {
      environmentId: persisted.environmentId,
      environmentName: persisted.environmentName,
      roomId: persisted.roomId,
      setBy: persisted.setBy,
      setAt: persisted.setAt,
      parameters: persisted.parameters,
    },
  })

  eventBroadcaster.broadcastToSession(sessionId as UUID, event)
  logger.info('audio', 'Environment preset applied', {
    sessionId,
    roomId,
    environmentName,
    actorUserId: user.userId,
  })

  return res.status(200).json({ ok: true, eventId: event.id })
})

router.post('/dm-override/apply', requireAuth, async (req: Request, res: Response) => {
  const user = getAuthUser(req)
  const { sessionId, targetUserId, overrideType, parameters } = req.body

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid sessionId',
      field: 'sessionId',
    })
  }

  if (!isValidUUID(targetUserId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid targetUserId',
      field: 'targetUserId',
    })
  }

  if (typeof overrideType !== 'string' || overrideType.trim().length === 0) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'overrideType is required',
      field: 'overrideType',
    })
  }

  const authz = await validateDmControl(sessionId as UUID, user)
  if (!authz.ok) {
    return res.status(authz.status).json({ code: authz.code, message: authz.message })
  }

  const appliedAt = Date.now()
  const persisted = await applyDMOverrideState({
    sessionId: sessionId as UUID,
    targetUserId: targetUserId as UUID,
    overrideType,
    parameters: typeof parameters === 'object' && parameters ? parameters : {},
    appliedBy: user.userId as UUID,
    appliedAt,
  })

  const event = createEvent({
    type: 'AUDIO:DM_OVERRIDE_APPLIED',
    user,
    sessionId: sessionId as UUID,
    roomId: null,
    payload: {
      targetUserId: persisted.targetUserId,
      dmId: persisted.appliedBy,
      overrideType: persisted.overrideType,
      parameters: persisted.parameters,
      appliedAt: persisted.appliedAt,
    },
  })

  eventBroadcaster.broadcastToSession(sessionId as UUID, event)
  logger.info('audio', 'DM audio override applied', {
    sessionId,
    targetUserId,
    overrideType,
    actorUserId: user.userId,
  })

  return res.status(200).json({ ok: true, eventId: event.id })
})

router.post('/dm-override/remove', requireAuth, async (req: Request, res: Response) => {
  const user = getAuthUser(req)
  const { sessionId, targetUserId, overrideType } = req.body

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid sessionId',
      field: 'sessionId',
    })
  }

  if (!isValidUUID(targetUserId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid targetUserId',
      field: 'targetUserId',
    })
  }

  const authz = await validateDmControl(sessionId as UUID, user)
  if (!authz.ok) {
    return res.status(authz.status).json({ code: authz.code, message: authz.message })
  }

  await removeDMOverrideState({
    sessionId: sessionId as UUID,
    targetUserId: targetUserId as UUID,
    overrideType: typeof overrideType === 'string' ? overrideType : 'UNKNOWN',
  })

  const event = createEvent({
    type: 'AUDIO:DM_OVERRIDE_REMOVED',
    user,
    sessionId: sessionId as UUID,
    roomId: null,
    payload: {
      targetUserId,
      dmId: user.userId,
      overrideType: typeof overrideType === 'string' ? overrideType : 'UNKNOWN',
      removedAt: Date.now(),
    },
  })

  eventBroadcaster.broadcastToSession(sessionId as UUID, event)
  logger.info('audio', 'DM audio override removed', {
    sessionId,
    targetUserId,
    overrideType,
    actorUserId: user.userId,
  })

  return res.status(200).json({ ok: true, eventId: event.id })
})

router.get('/state/:sessionId', requireAuth, async (req: Request, res: Response) => {
  const user = getAuthUser(req)
  const { sessionId } = req.params

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid sessionId',
      field: 'sessionId',
    })
  }

  const authz = await validateSessionAccess(sessionId as UUID, user)
  if (!authz.ok) {
    return res.status(authz.status).json({ code: authz.code, message: authz.message })
  }

  const state = await getSessionAudioState(sessionId as UUID)
  const latestEnvironment = state.environments[0] || null

  return res.status(200).json({
    sessionId: state.sessionId,
    // Backward-compatible field retained for older callers.
    environment: latestEnvironment,
    environments: state.environments,
    dmOverrides: state.dmOverrides,
  })
})

export default router
