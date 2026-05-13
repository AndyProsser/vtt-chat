import type { UUID } from '@shared'
import { getSessionMockPlayerById } from '@/services/dev-mock-players.service'

interface MockTakeoverState {
  assumedUserId: UUID
  startedAt: number
}

interface MockTakeoverSnapshot {
  active: boolean
  actorUserId: UUID
  effectiveUserId: UUID
  assumedUserId: UUID | null
  assumedDisplayName: string | null
  startedAt: number | null
  staleRecovered: boolean
}

const takeoverByActor = new Map<string, MockTakeoverState>()

function buildKey(sessionId: UUID, actorUserId: UUID): string {
  return `${sessionId}:${actorUserId}`
}

export function startMockTakeover(params: {
  sessionId: UUID
  actorUserId: UUID
  assumedUserId: UUID
}): MockTakeoverState {
  const key = buildKey(params.sessionId, params.actorUserId)
  const state: MockTakeoverState = {
    assumedUserId: params.assumedUserId,
    startedAt: Date.now(),
  }

  takeoverByActor.set(key, state)
  return state
}

export function stopMockTakeover(params: { sessionId: UUID; actorUserId: UUID }): boolean {
  const key = buildKey(params.sessionId, params.actorUserId)
  return takeoverByActor.delete(key)
}

export function getMockTakeover(params: {
  sessionId: UUID
  actorUserId: UUID
}): MockTakeoverState | null {
  const key = buildKey(params.sessionId, params.actorUserId)
  return takeoverByActor.get(key) || null
}

/**
 * Resolve the requester's effective identity snapshot for a session.
 * If an assumed mock persona no longer exists, stale takeover state is cleared
 * and the caller is projected back to their real identity.
 */
export async function getMockTakeoverSnapshot(params: {
  sessionId: UUID
  actorUserId: UUID
}): Promise<MockTakeoverSnapshot> {
  const inactive = {
    active: false,
    actorUserId: params.actorUserId,
    effectiveUserId: params.actorUserId,
    assumedUserId: null,
    assumedDisplayName: null,
    startedAt: null,
    staleRecovered: false,
  }

  if (process.env.NODE_ENV !== 'development') {
    return inactive
  }

  const takeover = getMockTakeover({
    sessionId: params.sessionId,
    actorUserId: params.actorUserId,
  })

  if (!takeover) {
    return inactive
  }

  const mockPlayer = await getSessionMockPlayerById(params.sessionId, takeover.assumedUserId)
  if (!mockPlayer) {
    stopMockTakeover({
      sessionId: params.sessionId,
      actorUserId: params.actorUserId,
    })

    return {
      ...inactive,
      staleRecovered: true,
    }
  }

  return {
    active: true,
    actorUserId: params.actorUserId,
    effectiveUserId: takeover.assumedUserId,
    assumedUserId: takeover.assumedUserId,
    assumedDisplayName: mockPlayer.displayName || mockPlayer.username,
    startedAt: takeover.startedAt,
    staleRecovered: false,
  }
}

/**
 * Resolve effective chat/write actor for DEV mock takeover.
 * When a real user has an active takeover of a mock player, their writes
 * should appear as the mock player. No-op in production.
 *
 * Returns the original actor's identity unchanged if:
 * - NODE_ENV is not 'development'
 * - No active takeover exists for this actor
 * - The assumed mock player can no longer be found in the session
 */
export async function resolveEffectiveActor(params: {
  sessionId: UUID
  actorUserId: UUID
  actorUsername: string
}): Promise<{ userId: UUID; username: string }> {
  const snapshot = await getMockTakeoverSnapshot({
    sessionId: params.sessionId,
    actorUserId: params.actorUserId,
  })

  if (!snapshot.active || !snapshot.assumedUserId) {
    return { userId: params.actorUserId, username: params.actorUsername }
  }

  return {
    userId: snapshot.assumedUserId,
    username: snapshot.assumedDisplayName || params.actorUsername,
  }
}
