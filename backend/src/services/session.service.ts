/**
 * Session Service
 * Handles session CRUD operations and state management.
 * All operations are deterministic and validated against contracts.
 */

import type { UUID, Session, SessionState, User } from '@shared'
import { randomUUID } from 'crypto'
import { SessionState as SessionStateEnum } from '@shared'
import { createError, ErrorCode } from '@shared'
import {
  createSessionRecord,
  deleteSessionRecord,
  findSessionById,
  listSessionMembers,
  listSessions,
  removeSessionMember,
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
    state: SessionStateEnum.IDLE,
    createdAt: now,
  }))
}

/**
 * Get a session by ID
 */
export async function getSession(sessionId: UUID): Promise<Session | null> {
  const session = await findSessionById(sessionId)
  if (!session) return null

  return {
    id: session.id as UUID,
    name: session.name,
    dmId: session.dmId as UUID,
    state: session.state as SessionState,
    createdAt: session.createdAt.getTime(),
    startedAt: session.startedAt?.getTime(),
    endedAt: session.endedAt?.getTime(),
  }
}

/**
 * Get all sessions.
 */
export async function getAllSessions(): Promise<Session[]> {
  const sessions = await listSessions()
  return sessions.map((session) => ({
    id: session.id as UUID,
    name: session.name,
    dmId: session.dmId as UUID,
    state: session.state as SessionState,
    createdAt: session.createdAt.getTime(),
    startedAt: session.startedAt?.getTime(),
    endedAt: session.endedAt?.getTime(),
  }))
}

/**
 * Update session state (start, pause, resume, end).
 */
export function updateSessionState(
  sessionId: UUID,
  newState: SessionState,
  dmId: UUID
): Promise<Session | null> {
  return findSessionById(sessionId).then(async (session) => {
    if (!session) return null

    // DM-only check
    if (session.dmId !== dmId) {
      throw createError(ErrorCode.FORBIDDEN, {
        message: 'Only DM can change session state',
      })
    }

    // Validate state transition
    const validTransitions: Record<SessionState, SessionState[]> = {
      [SessionStateEnum.IDLE]: [SessionStateEnum.ACTIVE],
      [SessionStateEnum.ACTIVE]: [SessionStateEnum.PAUSED, SessionStateEnum.ENDED],
      [SessionStateEnum.PAUSED]: [SessionStateEnum.ACTIVE, SessionStateEnum.ENDED],
      [SessionStateEnum.ENDED]: [], // No transitions from ENDED
    }

    const allowedTransitions = validTransitions[session.state as SessionState]
    if (!allowedTransitions.includes(newState)) {
      throw createError(ErrorCode.INVALID_STATE_TRANSITION, {
        context: {
          currentState: session.state,
          requestedState: newState,
          allowedTransitions,
        },
      })
    }

    const now = Date.now()
    const startedAt =
      newState === SessionStateEnum.ACTIVE && !session.startedAt
        ? new Date(now)
        : session.startedAt || undefined
    const endedAt =
      newState === SessionStateEnum.ENDED ? new Date(now) : session.endedAt || undefined

    await updateSessionStateRecord({
      sessionId,
      newState,
      startedAt,
      endedAt,
    })

    const updated = await findSessionById(sessionId)
    if (!updated) return null

    return {
      id: updated.id as UUID,
      name: updated.name,
      dmId: updated.dmId as UUID,
      state: updated.state as SessionState,
      createdAt: updated.createdAt.getTime(),
      startedAt: updated.startedAt?.getTime(),
      endedAt: updated.endedAt?.getTime(),
    }
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
