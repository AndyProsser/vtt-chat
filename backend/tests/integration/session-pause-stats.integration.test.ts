import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionState, type UUID } from '@shared'

const repo = vi.hoisted(() => {
  type SessionRow = {
    id: string
    campaignId: string | null
    name: string
    description: string | null
    plannedDurationMinutes: number | null
    cumulativePauseMs: number
    pauseCount: number
    pauseStartedAt: Date | null
    dmId: string
    state: 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'CLEANUP'
    createdAt: Date
    startedAt: Date | null
    endedAt: Date | null
  }

  const sessions = new Map<string, SessionRow>()

  return {
    sessions,
    createSessionRecord: vi.fn(async (params: any) => {
      sessions.set(params.id, {
        id: params.id,
        campaignId: params.campaignId ?? null,
        name: params.name,
        description: params.description ?? null,
        plannedDurationMinutes: params.plannedDurationMinutes ?? null,
        cumulativePauseMs: 0,
        pauseCount: 0,
        pauseStartedAt: null,
        dmId: params.dmId,
        state: params.state,
        createdAt: params.createdAt,
        startedAt: null,
        endedAt: null,
      })
    }),
    findSessionById: vi.fn(async (sessionId: string) => {
      const row = sessions.get(sessionId)
      return row ? { ...row } : null
    }),
    updateSessionStateRecord: vi.fn(async (params: any) => {
      const current = sessions.get(params.sessionId)
      if (!current) return

      sessions.set(params.sessionId, {
        ...current,
        state: params.newState,
        startedAt: params.startedAt ?? current.startedAt,
        endedAt: params.endedAt ?? current.endedAt,
        cumulativePauseMs: params.cumulativePauseMs ?? current.cumulativePauseMs,
        pauseCount: params.pauseCount ?? current.pauseCount,
        pauseStartedAt:
          params.pauseStartedAt === undefined
            ? current.pauseStartedAt
            : (params.pauseStartedAt ?? null),
      })
    }),
    updateSessionEndedAtRecord: vi.fn(),
    updateSessionMetadataRecord: vi.fn(),
    listSessionMembers: vi.fn(async () => []),
    listSessions: vi.fn(async () => []),
    removeSessionMember: vi.fn(async () => false),
    upsertSessionMember: vi.fn(async () => undefined),
    deleteSessionRecord: vi.fn(async () => undefined),
  }
})

vi.mock('@/repositories/session.repository', () => ({
  createSessionRecord: repo.createSessionRecord,
  deleteSessionRecord: repo.deleteSessionRecord,
  findSessionById: repo.findSessionById,
  listSessionMembers: repo.listSessionMembers,
  listSessions: repo.listSessions,
  removeSessionMember: repo.removeSessionMember,
  updateSessionEndedAtRecord: repo.updateSessionEndedAtRecord,
  updateSessionMetadataRecord: repo.updateSessionMetadataRecord,
  updateSessionStateRecord: repo.updateSessionStateRecord,
  upsertSessionMember: repo.upsertSessionMember,
}))

import { createSession, updateSessionState } from '@/services/session/core.service'

const asUuid = (value: string) => value as UUID
const DM_ID = asUuid('22222222-2222-4222-8222-222222222222')

describe('Session Pause Stats Persistence', () => {
  let sessionId: UUID

  beforeEach(async () => {
    vi.clearAllMocks()
    repo.sessions.clear()

    const session = await createSession('Test Session', DM_ID)
    sessionId = session.id
  })

  it('should track pause count and cumulative pause time across transitions', async () => {
    let updated = await updateSessionState(sessionId, SessionState.ACTIVE, DM_ID)
    expect(updated).not.toBeNull()
    expect(updated?.state).toBe('ACTIVE')
    expect(updated?.pauseCount).toBe(0)
    expect(updated?.cumulativePauseMs).toBe(0)

    await new Promise((resolve) => setTimeout(resolve, 50))
    updated = await updateSessionState(sessionId, SessionState.PAUSED, DM_ID)
    expect(updated).not.toBeNull()
    expect(updated?.state).toBe('PAUSED')
    expect(updated?.pauseCount).toBe(1)
    expect(updated?.cumulativePauseMs).toBe(0)
    const firstPausedAt = updated?.pauseStartedAt
    expect(firstPausedAt).toBeDefined()

    await new Promise((resolve) => setTimeout(resolve, 50))

    updated = await updateSessionState(sessionId, SessionState.ACTIVE, DM_ID)
    expect(updated).not.toBeNull()
    expect(updated?.state).toBe('ACTIVE')
    expect(updated?.pauseCount).toBe(1)
    expect(updated?.cumulativePauseMs).toBeGreaterThanOrEqual(40)
    expect(updated?.pauseStartedAt).toBeUndefined()

    const firstPauseDuration = updated?.cumulativePauseMs ?? 0

    await new Promise((resolve) => setTimeout(resolve, 30))
    updated = await updateSessionState(sessionId, SessionState.PAUSED, DM_ID)
    expect(updated?.state).toBe('PAUSED')
    expect(updated?.pauseCount).toBe(2)
    expect(updated?.cumulativePauseMs).toBe(firstPauseDuration)

    await new Promise((resolve) => setTimeout(resolve, 40))

    updated = await updateSessionState(sessionId, SessionState.ACTIVE, DM_ID)
    expect(updated?.state).toBe('ACTIVE')
    expect(updated?.pauseCount).toBe(2)
    expect(updated?.cumulativePauseMs).toBeGreaterThan(firstPauseDuration)
    expect(updated?.pauseStartedAt).toBeUndefined()
  })

  it('should finalize pause time when ending from PAUSED state', async () => {
    await updateSessionState(sessionId, SessionState.ACTIVE, DM_ID)
    await new Promise((resolve) => setTimeout(resolve, 30))

    await updateSessionState(sessionId, SessionState.PAUSED, DM_ID)
    await new Promise((resolve) => setTimeout(resolve, 50))

    const ended = await updateSessionState(sessionId, SessionState.ENDED, DM_ID)
    expect(ended?.state).toBe('ENDED')
    expect(ended?.pauseCount).toBe(1)
    expect(ended?.cumulativePauseMs).toBeGreaterThanOrEqual(40)
    expect(ended?.pauseStartedAt).toBeUndefined()
  })

  it('should persist pause stats in service-backed storage', async () => {
    const sess1 = await createSession('Persist Test', DM_ID)
    await updateSessionState(sess1.id, SessionState.ACTIVE, DM_ID)
    await new Promise((resolve) => setTimeout(resolve, 30))
    await updateSessionState(sess1.id, SessionState.PAUSED, DM_ID)
    await new Promise((resolve) => setTimeout(resolve, 50))
    const updated = await updateSessionState(sess1.id, SessionState.ACTIVE, DM_ID)

    const pauseCountBeforeRefresh = updated?.pauseCount ?? 0
    const cumulativePauseMsBeforeRefresh = updated?.cumulativePauseMs ?? 0

    expect(pauseCountBeforeRefresh).toBeGreaterThanOrEqual(1)
    expect(cumulativePauseMsBeforeRefresh).toBeGreaterThanOrEqual(40)
  })
})
