import type { UUID } from '@shared'
import { getSession, getSessionUsers } from '@/services/session.service'
import { getSessionEventHistory } from '@/services/session-logs.service'

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
