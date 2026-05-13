/**
 * Session Service
 * Handles session CRUD operations and state management.
 * All operations are deterministic and validated against contracts.
 */

import type { UUID, Session, SessionLifecycleState, SessionState, User } from '@shared'
import { randomUUID } from 'crypto'
import { SessionState as SessionStateEnum } from '@shared'
import { createError, ErrorCode, normalizeSessionState, toPublicSessionState } from '@shared'
import {
  createSessionRecord,
  deleteSessionRecord,
  findSessionById,
  listSessionMembers,
  listSessions,
  removeSessionMember,
  updateSessionEndedAtRecord,
  updateSessionMetadataRecord,
  updateSessionStateRecord,
  upsertSessionMember,
} from '@/repositories/session.repository'
import { promoteNextWaitlistedSpectatorForSession } from '@/services/guest-auth.service'
import type { RemoveUserFromSessionResult } from '@/types/session.types'
import { getSessionEventHistory } from '@/services/session-logs.service'

/**
 * Generate a UUID for session creation.
 */
function generateUUID(): UUID {
  return randomUUID() as UUID
}

function toStoredSessionState(state: SessionLifecycleState): SessionState {
  const normalized = normalizeSessionState(state)

  if (!normalized) {
    throw createError(ErrorCode.INVALID_INPUT, {
      message: 'Invalid session state',
      context: { field: 'state' },
    })
  }

  return normalized
}

function mapSessionRecord(session: {
  id: string
  name: string
  dmId: string
  description: string | null
  plannedDurationMinutes: number | null
  cumulativePauseMs: number
  pauseCount: number
  pauseStartedAt?: Date | null
  state: SessionState
  createdAt: Date
  startedAt?: Date | null
  endedAt?: Date | null
}): Session {
  return {
    id: session.id as UUID,
    name: session.name,
    description: session.description ?? undefined,
    plannedDurationMinutes: session.plannedDurationMinutes ?? undefined,
    cumulativePauseMs: session.cumulativePauseMs ?? 0,
    pauseCount: session.pauseCount ?? 0,
    pauseStartedAt: session.pauseStartedAt?.getTime(),
    dmId: session.dmId as UUID,
    state: toPublicSessionState(session.state) ?? session.state,
    createdAt: session.createdAt.getTime(),
    startedAt: session.startedAt?.getTime(),
    endedAt: session.endedAt?.getTime(),
  }
}

export function updateSessionMetadata(
  sessionId: UUID,
  params: { name?: string; description?: string | null; plannedDurationMinutes?: number | null },
  dmId: UUID
): Promise<Session | null> {
  return findSessionById(sessionId).then(async (session) => {
    if (!session) {
      return null
    }

    if (session.dmId !== dmId) {
      throw createError(ErrorCode.FORBIDDEN, {
        message: 'Only DM can update session metadata',
      })
    }

    await updateSessionMetadataRecord({
      sessionId,
      name: params.name,
      description: params.description,
      plannedDurationMinutes: params.plannedDurationMinutes,
    })

    const updated = await findSessionById(sessionId)
    if (!updated) {
      return null
    }

    return mapSessionRecord(updated as any)
  })
}

/**
 * Create a new session
 */
export function createSession(
  name: string,
  dmId: UUID,
  description?: string,
  campaignId?: UUID
): Promise<Session> {
  const sessionId = generateUUID()
  const now = Date.now()

  return createSessionRecord({
    id: sessionId,
    campaignId,
    name,
    description,
    dmId,
    state: SessionStateEnum.IDLE,
    createdAt: new Date(now),
  }).then(() => ({
    id: sessionId,
    name,
    dmId,
    state: 'INACTIVE',
    createdAt: now,
  }))
}

/**
 * Get a session by ID
 */
export async function getSession(sessionId: UUID): Promise<Session | null> {
  const session = await findSessionById(sessionId)
  if (!session) return null

  return mapSessionRecord(session as any)
}

/**
 * Get all sessions.
 */
export async function getAllSessions(): Promise<Session[]> {
  const sessions = await listSessions()
  return sessions.map((session) => mapSessionRecord(session as any))
}

/**
 * Update session state (start, pause, resume, end).
 */
export function updateSessionState(
  sessionId: UUID,
  newState: SessionLifecycleState,
  dmId: UUID
): Promise<Session | null> {
  return findSessionById(sessionId).then(async (session) => {
    if (!session) return null

    const requestedState = toStoredSessionState(newState)
    const currentState = session.state as SessionState

    // DM-only check
    if (session.dmId !== dmId) {
      throw createError(ErrorCode.FORBIDDEN, {
        message: 'Only DM can change session state',
      })
    }

    // Validate state transition
    const validTransitions: Record<SessionState, SessionState[]> = {
      [SessionStateEnum.IDLE]: [SessionStateEnum.ACTIVE, SessionStateEnum.CLEANUP],
      [SessionStateEnum.ACTIVE]: [SessionStateEnum.PAUSED, SessionStateEnum.ENDED],
      [SessionStateEnum.PAUSED]: [SessionStateEnum.ACTIVE, SessionStateEnum.ENDED],
      [SessionStateEnum.ENDED]: [SessionStateEnum.IDLE, SessionStateEnum.CLEANUP],
      [SessionStateEnum.CLEANUP]: [SessionStateEnum.IDLE],
    }

    const allowedTransitions = validTransitions[currentState]
    if (!allowedTransitions.includes(requestedState)) {
      throw createError(ErrorCode.INVALID_STATE_TRANSITION, {
        context: {
          currentState: toPublicSessionState(currentState) ?? currentState,
          requestedState: toPublicSessionState(requestedState) ?? requestedState,
          allowedTransitions,
        },
      })
    }

    const now = Date.now()
    const startedAt =
      requestedState === SessionStateEnum.ACTIVE && !session.startedAt
        ? new Date(now)
        : session.startedAt || undefined
    const endedAt =
      requestedState === SessionStateEnum.ENDED ? new Date(now) : session.endedAt || undefined

    // Pause stats tracking
    let cumulativePauseMs = session.cumulativePauseMs ?? 0
    let pauseCount = session.pauseCount ?? 0
    let pauseStartedAt: Date | null | undefined = session.pauseStartedAt ?? undefined

    // When transitioning to PAUSED: increment pauseCount and record pause start
    if (requestedState === SessionStateEnum.PAUSED) {
      pauseCount += 1
      pauseStartedAt = new Date(now)
    }
    // When transitioning from PAUSED to ACTIVE: calculate pause duration
    else if (
      currentState === SessionStateEnum.PAUSED &&
      requestedState === SessionStateEnum.ACTIVE &&
      pauseStartedAt
    ) {
      cumulativePauseMs += now - pauseStartedAt.getTime()
      pauseStartedAt = null
    }
    // When transitioning to ENDED: finalize any pending pause
    else if (
      requestedState === SessionStateEnum.ENDED &&
      currentState === SessionStateEnum.PAUSED &&
      pauseStartedAt
    ) {
      cumulativePauseMs += now - pauseStartedAt.getTime()
      pauseStartedAt = null
    }

    await updateSessionStateRecord({
      sessionId,
      newState: requestedState,
      startedAt,
      endedAt,
      cumulativePauseMs,
      pauseCount,
      pauseStartedAt,
    })

    const updated = await findSessionById(sessionId)
    if (!updated) return null

    return mapSessionRecord(updated as any)
  })
}

export function extendSessionCooldown(
  sessionId: UUID,
  extensionMs: number,
  dmId: UUID
): Promise<Session | null> {
  return findSessionById(sessionId).then(async (session) => {
    if (!session) return null

    if (session.dmId !== dmId) {
      throw createError(ErrorCode.FORBIDDEN, {
        message: 'Only DM can extend cooldown',
      })
    }

    if (session.state !== SessionStateEnum.ENDED) {
      throw createError(ErrorCode.INVALID_STATE_TRANSITION, {
        message: 'Cooldown can only be extended while session is ENDED',
      })
    }

    if (!Number.isFinite(extensionMs) || extensionMs <= 0) {
      throw createError(ErrorCode.INVALID_INPUT, {
        message: 'extensionMs must be a positive number',
        context: { field: 'extensionMs' },
      })
    }

    const baseEndedAtMs = session.endedAt?.getTime() ?? Date.now()
    const nextEndedAt = new Date(baseEndedAtMs + Math.round(extensionMs))

    await updateSessionEndedAtRecord({
      sessionId,
      endedAt: nextEndedAt,
    })

    const updated = await findSessionById(sessionId)
    if (!updated) return null

    return mapSessionRecord(updated as any)
  })
}

/**
 * Add a user to a session
 */
export async function addUserToSession(sessionId: UUID, user: User): Promise<boolean> {
  const session = await findSessionById(sessionId)
  if (!session) return false

  await upsertSessionMember({
    sessionId,
    userId: user.id,
    username: user.username,
    role: user.role,
  })
  return true
}

/**
 * Remove a user from a session
 */
export type { RemoveUserFromSessionResult } from '@/types/session.types'

export async function removeUserFromSession(
  sessionId: UUID,
  userId: UUID
): Promise<RemoveUserFromSessionResult> {
  const existingMembers = await listSessionMembers(sessionId)
  const removedMember = existingMembers.find((member) => member.userId === userId)

  if (!removedMember) {
    return {
      removed: false,
      promotedSpectator: { promoted: false },
    }
  }

  const removed = await removeSessionMember({ sessionId, userId })
  if (!removed) {
    return {
      removed: false,
      promotedSpectator: { promoted: false },
    }
  }

  const promotedSpectator =
    removedMember.role === 'SPECTATOR'
      ? await promoteNextWaitlistedSpectatorForSession(sessionId)
      : { promoted: false as const }

  return {
    removed,
    promotedSpectator,
  }
}

/**
 * Get all users in a session
 */
export async function getSessionUsers(sessionId: UUID): Promise<User[]> {
  const members = await listSessionMembers(sessionId)
  return members.map((member) => ({
    id: member.userId as UUID,
    username: member.username,
    role: member.role as User['role'],
    createdAt: member.joinedAt.getTime(),
  }))
}

/**
 * Check if user is in session
 */
export async function isUserInSession(sessionId: UUID, userId: UUID): Promise<boolean> {
  const members = await listSessionMembers(sessionId)
  return members.some((member) => member.userId === userId)
}

/**
 * Delete a session (DM-only).
 */
export async function deleteSession(sessionId: UUID, dmId: UUID): Promise<boolean> {
  const session = await findSessionById(sessionId)
  if (!session) return false

  if (session.dmId !== dmId) {
    throw createError(ErrorCode.FORBIDDEN, {
      message: 'Only DM can delete session',
    })
  }

  await deleteSessionRecord(sessionId)
  return true
}

type Requester = {
  userId: string
  role: string
}

function canAccessSessionData(params: {
  requester: Requester
  dmId: UUID
  users: Array<{ id: UUID }>
}): boolean {
  return (
    params.requester.role === 'DM' ||
    params.dmId === (params.requester.userId as UUID) ||
    params.users.some((user) => user.id === params.requester.userId)
  )
}

export async function listSessionUsersForRequester(params: {
  sessionId: UUID
  requester: Requester
}): Promise<
  | { ok: true; users: Array<{ id: UUID; username: string; role: string }> }
  | { ok: false; code: 'SESSION_NOT_FOUND' | 'FORBIDDEN'; message: string }
> {
  const session = await getSession(params.sessionId)
  if (!session) {
    return { ok: false, code: 'SESSION_NOT_FOUND', message: 'Session not found' }
  }

  const users = await getSessionUsers(params.sessionId)
  if (!canAccessSessionData({ requester: params.requester, dmId: session.dmId, users })) {
    return { ok: false, code: 'FORBIDDEN', message: 'Not a session member' }
  }

  return {
    ok: true,
    users: users.map((user) => ({
      id: user.id,
      username: user.username,
      role: user.role,
    })),
  }
}

export async function listSessionLogsForRequester(params: {
  sessionId: UUID
  requester: Requester
  limit: number
  offset: number
}): Promise<
  | { ok: true; logs: Awaited<ReturnType<typeof getSessionEventHistory>> }
  | { ok: false; code: 'SESSION_NOT_FOUND' | 'FORBIDDEN'; message: string }
> {
  const session = await getSession(params.sessionId)
  if (!session) {
    return { ok: false, code: 'SESSION_NOT_FOUND', message: 'Session not found' }
  }

  const users = await getSessionUsers(params.sessionId)
  if (!canAccessSessionData({ requester: params.requester, dmId: session.dmId, users })) {
    return { ok: false, code: 'FORBIDDEN', message: 'Not authorized to view session logs' }
  }

  const logs = await getSessionEventHistory(params.sessionId, params.limit, params.offset)
  return { ok: true, logs }
}
