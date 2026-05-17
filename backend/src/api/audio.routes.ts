import { randomUUID } from 'node:crypto'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { ErrorCode, Role, type EventEnvelope, type UUID, isValidUUID } from '@shared'
import { extractTokenFromHeader, verifyToken, type TokenPayload } from '@/services/auth.service'
import {
  applyDMOverrideState,
  getSessionAudioState,
  removeDMOverrideState,
  setBroadcastState,
  setRoomEnvironmentState,
  setUserMuteState,
} from '@/services/audio/audio-state'
import { setDmVoiceMode } from '@/services/audio/effects.service'
import eventBroadcaster from '@/ws/event-broadcaster'
import {
  AUDIO_DM_OVERRIDE_TYPES,
  AUDIO_EVENT_TYPES,
  AUDIO_PRESETS,
} from '@/constants/audio.constants'
import { appendSessionAuditEvent } from '@/services/runtime/runtime-streams.service'
import { logger } from '@/utils'
import { resolveEffectiveSessionRole } from '@/services/session/authz.service'

const router = Router()

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
  userRole: Role
  sessionId: UUID
  roomId: UUID | null
  payload: Record<string, unknown>
}): EventEnvelope {
  return {
    id: randomUUID() as UUID,
    type: params.type,
    version: 1,
    userId: params.user.userId as UUID,
    userRole: params.userRole as any,
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
      role: Role
    }
  | {
      ok: false
      status: number
      code: ErrorCode
      message: string
    }
> {
  const authz = await resolveEffectiveSessionRole({
    sessionId,
    userId: user.userId as UUID,
    requireMembershipForDm: true,
  })

  if (!authz.ok) {
    return {
      ok: false,
      status: authz.code === 'SESSION_NOT_FOUND' ? 404 : 403,
      code: authz.code === 'SESSION_NOT_FOUND' ? ErrorCode.NOT_FOUND : ErrorCode.FORBIDDEN,
      message: authz.message,
    }
  }

  return { ok: true, role: authz.role }
}

async function validateDmControl(
  sessionId: UUID,
  user: TokenPayload
): Promise<
  | {
      ok: true
      role: Role
    }
  | {
      ok: false
      status: number
      code: ErrorCode
      message: string
    }
> {
  const authz = await resolveEffectiveSessionRole({
    sessionId,
    userId: user.userId as UUID,
    requireMembershipForDm: true,
  })

  if (!authz.ok) {
    return {
      ok: false,
      status: authz.code === 'SESSION_NOT_FOUND' ? 404 : 403,
      code: authz.code === 'SESSION_NOT_FOUND' ? ErrorCode.NOT_FOUND : ErrorCode.FORBIDDEN,
      message: authz.message,
    }
  }

  if (authz.role !== Role.DM) {
    return {
      ok: false,
      status: 403,
      code: ErrorCode.FORBIDDEN,
      message: 'Session DM required for audio control actions',
    }
  }

  return { ok: true, role: authz.role }
}

function handleGetAudioPresets(_req: Request, res: Response) {
  return res.status(200).json({
    presets: AUDIO_PRESETS,
  })
}

async function handleSetEnvironment(req: Request, res: Response) {
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
    type: AUDIO_EVENT_TYPES.ENVIRONMENT_SET,
    user,
    userRole: authz.role,
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
  await appendSessionAuditEvent({
    sessionId: sessionId as UUID,
    actorUserId: user.userId as UUID,
    actorRole: authz.role,
    actionType: 'AUDIO.ENVIRONMENT_SET',
    targetType: 'ROOM',
    targetId: roomId as UUID,
    roomId: roomId as UUID,
    visibilityClass: 'PUBLIC',
    timestamp: setAt,
    metadata: {
      environmentId: persisted.environmentId,
      environmentName: persisted.environmentName,
    },
  })
  logger.info('audio', 'Environment preset applied', {
    sessionId,
    roomId,
    environmentName,
    actorUserId: user.userId,
  })

  return res.status(200).json({ ok: true, eventId: event.id })
}

async function handleApplyDmOverride(req: Request, res: Response) {
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
    type: AUDIO_EVENT_TYPES.DM_OVERRIDE_APPLIED,
    user,
    userRole: authz.role,
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
  await appendSessionAuditEvent({
    sessionId: sessionId as UUID,
    actorUserId: user.userId as UUID,
    actorRole: authz.role,
    actionType: 'AUDIO.DM_OVERRIDE_APPLIED',
    targetType: 'USER',
    targetId: targetUserId as UUID,
    visibilityClass: 'ROLE_SCOPED',
    timestamp: appliedAt,
    metadata: {
      overrideType: persisted.overrideType,
    },
  })
  logger.info('audio', 'DM audio override applied', {
    sessionId,
    targetUserId,
    overrideType,
    actorUserId: user.userId,
  })

  return res.status(200).json({ ok: true, eventId: event.id })
}

async function handleRemoveDmOverride(req: Request, res: Response) {
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
    type: AUDIO_EVENT_TYPES.DM_OVERRIDE_REMOVED,
    user,
    userRole: authz.role,
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
  await appendSessionAuditEvent({
    sessionId: sessionId as UUID,
    actorUserId: user.userId as UUID,
    actorRole: authz.role,
    actionType: 'AUDIO.DM_OVERRIDE_REMOVED',
    targetType: 'USER',
    targetId: targetUserId as UUID,
    visibilityClass: 'ROLE_SCOPED',
    metadata: {
      overrideType: typeof overrideType === 'string' ? overrideType : 'UNKNOWN',
    },
  })
  logger.info('audio', 'DM audio override removed', {
    sessionId,
    targetUserId,
    overrideType,
    actorUserId: user.userId,
  })

  return res.status(200).json({ ok: true, eventId: event.id })
}

async function handleGetAudioState(req: Request, res: Response) {
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
    environment: latestEnvironment,
    environments: state.environments,
    dmOverrides: state.dmOverrides,
    broadcast: state.broadcast,
    voiceOfGod: state.voiceOfGod,
  })
}

router.get('/presets', requireAuth, handleGetAudioPresets)
router.get('/catalog/presets', requireAuth, handleGetAudioPresets)

router.post('/environment', requireAuth, handleSetEnvironment)
router.post('/environments/apply', requireAuth, handleSetEnvironment)

router.post('/dm-override/apply', requireAuth, handleApplyDmOverride)
router.post('/overrides/dm/apply', requireAuth, handleApplyDmOverride)

router.post('/dm-override/remove', requireAuth, handleRemoveDmOverride)
router.post('/overrides/dm/remove', requireAuth, handleRemoveDmOverride)

router.get('/state/:sessionId', requireAuth, handleGetAudioState)
router.get('/sessions/:sessionId/state', requireAuth, handleGetAudioState)

async function handleSetBroadcastState(req: Request, res: Response) {
  const user = getAuthUser(req)
  const { sessionId, enabled } = req.body

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid sessionId',
      field: 'sessionId',
    })
  }

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'enabled must be a boolean',
      field: 'enabled',
    })
  }

  const authz = await validateDmControl(sessionId as UUID, user)
  if (!authz.ok) {
    return res.status(authz.status).json({ code: authz.code, message: authz.message })
  }

  const changedAt = Date.now()
  const state = await setBroadcastState({
    sessionId: sessionId as UUID,
    dmId: user.userId as UUID,
    enabled,
    changedAt,
  })

  const event = createEvent({
    type: AUDIO_EVENT_TYPES.BROADCAST_STATE_CHANGED,
    user,
    userRole: authz.role,
    sessionId: sessionId as UUID,
    roomId: null,
    payload: {
      dmId: state.dmId,
      enabled: state.enabled,
      broadcastRoomId: state.broadcastRoomId,
      changedAt: state.changedAt,
    },
  })

  const legacyEvent = createEvent({
    type: 'AUDIO:VOICE_OF_GOD_CHANGED',
    user,
    userRole: authz.role,
    sessionId: sessionId as UUID,
    roomId: null,
    payload: {
      dmId: state.dmId,
      enabled: state.enabled,
      broadcastRoomId: state.broadcastRoomId,
      changedAt: state.changedAt,
    },
  })

  eventBroadcaster.broadcastToSession(sessionId as UUID, event)
  // Compatibility shim for older clients listening to legacy event name.
  eventBroadcaster.broadcastToSession(sessionId as UUID, legacyEvent)

  await appendSessionAuditEvent({
    sessionId: sessionId as UUID,
    actorUserId: user.userId as UUID,
    actorRole: authz.role,
    actionType: 'AUDIO.BROADCAST_STATE_CHANGED',
    targetType: 'SESSION',
    targetId: sessionId as UUID,
    visibilityClass: 'PUBLIC',
    timestamp: changedAt,
    metadata: {
      enabled: state.enabled,
      broadcastRoomId: state.broadcastRoomId,
    },
  })

  logger.info('audio', 'Broadcast voice state changed', {
    sessionId,
    enabled,
    actorUserId: user.userId,
    broadcastRoomId: state.broadcastRoomId,
  })

  return res.status(200).json({
    ok: true,
    broadcast: state,
    // Backward compatibility for older clients.
    voiceOfGod: state,
    eventId: event.id,
  })
}

router.post('/broadcast', requireAuth, async (req: Request, res: Response) => {
  return handleSetBroadcastState(req, res)
})

router.post('/broadcast/state', requireAuth, async (req: Request, res: Response) => {
  return handleSetBroadcastState(req, res)
})

router.post('/voice-of-god', requireAuth, async (req: Request, res: Response) => {
  return handleSetBroadcastState(req, res)
})

async function handleSetUserMute(req: Request, res: Response) {
  const user = getAuthUser(req)
  const { sessionId, muted } = req.body

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid sessionId',
      field: 'sessionId',
    })
  }

  if (typeof muted !== 'boolean') {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'muted must be a boolean',
      field: 'muted',
    })
  }

  const authz = await validateSessionAccess(sessionId as UUID, user)
  if (!authz.ok) {
    return res.status(authz.status).json({ code: authz.code, message: authz.message })
  }

  if (!muted) {
    await removeDMOverrideState({
      sessionId: sessionId as UUID,
      targetUserId: user.userId as UUID,
      overrideType: AUDIO_DM_OVERRIDE_TYPES.MUTE,
    })

    const removedAt = Date.now()
    const overrideRemovedEvent = createEvent({
      type: AUDIO_EVENT_TYPES.DM_OVERRIDE_REMOVED,
      user,
      userRole: authz.role,
      sessionId: sessionId as UUID,
      roomId: null,
      payload: {
        targetUserId: user.userId as UUID,
        dmId: user.userId as UUID,
        overrideType: AUDIO_DM_OVERRIDE_TYPES.MUTE,
        removedAt,
      },
    })

    eventBroadcaster.broadcastToSession(sessionId as UUID, overrideRemovedEvent)
  }

  const mutedAt = Date.now()
  const state = await setUserMuteState({
    sessionId: sessionId as UUID,
    userId: user.userId as UUID,
    muted,
    mutedAt,
  })

  const eventType = muted ? 'AUDIO:USER_MUTED' : 'AUDIO:USER_UNMUTED'
  const event = createEvent({
    type: eventType as any,
    user,
    userRole: authz.role,
    sessionId: sessionId as UUID,
    roomId: null,
    payload: {
      userId: state.userId,
      userMuted: state.userMuted,
      mutedAt: state.mutedAt,
    },
  })

  eventBroadcaster.broadcastToSession(sessionId as UUID, event)

  await appendSessionAuditEvent({
    sessionId: sessionId as UUID,
    actorUserId: user.userId as UUID,
    actorRole: authz.role,
    actionType: muted ? 'AUDIO.USER_MUTED' : 'AUDIO.USER_UNMUTED',
    targetType: 'USER',
    targetId: state.userId,
    visibilityClass: 'ROLE_SCOPED',
    timestamp: state.mutedAt,
    metadata: {
      userMuted: state.userMuted,
    },
  })

  logger.info('audio', `User ${muted ? 'muted' : 'unmuted'} themselves`, {
    sessionId,
    userId: user.userId,
    muted,
  })

  return res.status(200).json({
    ok: true,
    userMuted: state.userMuted,
    eventId: event.id,
  })
}

router.post('/mute', requireAuth, async (req: Request, res: Response) => {
  return handleSetUserMute(req, res)
})

router.post('/unmute', requireAuth, async (req: Request, res: Response) => {
  return handleSetUserMute(req, res)
})

async function handleSetDmVoiceMode(req: Request, res: Response) {
  const user = getAuthUser(req)
  const { sessionId, voiceMode, targetGroupId, backgroundVolume } = req.body

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid sessionId',
      field: 'sessionId',
    })
  }

  if (voiceMode !== 'TARGET_GROUP' && voiceMode !== 'BROADCAST') {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'voiceMode must be TARGET_GROUP or BROADCAST',
      field: 'voiceMode',
    })
  }

  if (voiceMode === 'TARGET_GROUP' && targetGroupId !== undefined && !isValidUUID(targetGroupId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid targetGroupId',
      field: 'targetGroupId',
    })
  }

  if (
    backgroundVolume !== undefined &&
    (typeof backgroundVolume !== 'number' || backgroundVolume < 0 || backgroundVolume > 1)
  ) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'backgroundVolume must be a number between 0 and 1',
      field: 'backgroundVolume',
    })
  }

  const authz = await validateDmControl(sessionId as UUID, user)
  if (!authz.ok) {
    return res.status(authz.status).json({ code: authz.code, message: authz.message })
  }

  const changedAt = Date.now()
  const state = await setDmVoiceMode({
    sessionId: sessionId as UUID,
    dmId: user.userId as UUID,
    voiceMode,
    targetGroupId: targetGroupId as UUID | undefined,
    backgroundVolume: typeof backgroundVolume === 'number' ? backgroundVolume : undefined,
    changedAt,
  })

  const event = createEvent({
    type: 'AUDIO:DM_VOICE_MODE_CHANGED',
    user,
    userRole: authz.role,
    sessionId: sessionId as UUID,
    roomId: (targetGroupId as UUID | undefined) ?? null,
    payload: {
      dmId: state.dmId,
      voiceMode: state.voiceMode,
      targetGroupId: state.targetGroupId,
      backgroundVolume: state.backgroundVolume,
      changedAt: state.changedAt,
    },
  })

  eventBroadcaster.broadcastToSession(sessionId as UUID, event)

  await appendSessionAuditEvent({
    sessionId: sessionId as UUID,
    actorUserId: user.userId as UUID,
    actorRole: authz.role,
    actionType: 'AUDIO.DM_VOICE_MODE_CHANGED',
    targetType: 'USER',
    targetId: state.dmId,
    roomId: state.targetGroupId || undefined,
    visibilityClass: 'PUBLIC',
    timestamp: state.changedAt,
    metadata: {
      voiceMode: state.voiceMode,
      targetGroupId: state.targetGroupId,
      backgroundVolume: state.backgroundVolume,
    },
  })

  logger.info('audio', 'DM voice mode changed', {
    sessionId,
    dmId: user.userId,
    voiceMode,
    backgroundVolume: state.backgroundVolume,
  })

  return res.status(200).json({
    ok: true,
    voiceMode: state.voiceMode,
    targetGroupId: state.targetGroupId,
    backgroundVolume: state.backgroundVolume,
    eventId: event.id,
  })
}

router.post('/voice-mode', requireAuth, async (req: Request, res: Response) => {
  return handleSetDmVoiceMode(req, res)
})

export default router
