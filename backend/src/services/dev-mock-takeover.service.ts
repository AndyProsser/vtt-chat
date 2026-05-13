import type { UUID } from '@shared'

interface MockTakeoverState {
  assumedUserId: UUID
  startedAt: number
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
