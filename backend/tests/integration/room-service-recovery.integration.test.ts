import { beforeEach, describe, expect, it, vi } from 'vitest'

const redisState = {
  hashes: new Map<string, Map<string, string>>(),
  sets: new Map<string, Set<string>>(),
  sorted: new Map<string, Map<string, number>>(),
}

const roomRows = new Map<string, any>()
const snapshotRows = new Map<string, any>()

function hMap(key: string): Map<string, string> {
  const existing = redisState.hashes.get(key)
  if (existing) return existing
  const next = new Map<string, string>()
  redisState.hashes.set(key, next)
  return next
}

function sSet(key: string): Set<string> {
  const existing = redisState.sets.get(key)
  if (existing) return existing
  const next = new Set<string>()
  redisState.sets.set(key, next)
  return next
}

function zMap(key: string): Map<string, number> {
  const existing = redisState.sorted.get(key)
  if (existing) return existing
  const next = new Map<string, number>()
  redisState.sorted.set(key, next)
  return next
}

const redisMock = {
  hSet: vi.fn(async (key: string, field: string, value: string) => {
    hMap(key).set(field, value)
  }),
  hGet: vi.fn(async (key: string, field: string) => hMap(key).get(field) ?? null),
  hLen: vi.fn(async (key: string) => hMap(key).size),
  hGetAll: vi.fn(async (key: string) => {
    const out: Record<string, string> = {}
    for (const [k, v] of hMap(key).entries()) {
      out[k] = v
    }
    return out
  }),
  sAdd: vi.fn(async (key: string, member: string) => {
    sSet(key).add(member)
  }),
  sRem: vi.fn(async (key: string, member: string) => {
    sSet(key).delete(member)
  }),
  sMembers: vi.fn(async (key: string) => Array.from(sSet(key).values())),
  zAdd: vi.fn(async (key: string, data: { score: number; value: string }) => {
    zMap(key).set(data.value, data.score)
  }),
}

vi.mock('@/infra/redis', () => ({
  getRedisClient: vi.fn(async () => redisMock),
}))

vi.mock('@/repositories/session.repository', () => ({
  findSessionById: vi.fn(async () => null),
  listSessionsByCampaign: vi.fn(async () => []),
}))

vi.mock('@/repositories/room.repository', () => ({
  createRoomRecord: vi.fn(async (params: any) => {
    roomRows.set(params.id, {
      ...params,
      updatedAt: params.createdAt,
    })
  }),
  findRoomById: vi.fn(async (roomId: string) => roomRows.get(roomId) ?? null),
  listRoomsBySession: vi.fn(async (sessionId: string) =>
    Array.from(roomRows.values()).filter((row) => row.sessionId === sessionId)
  ),
  upsertPresenceSnapshotRecord: vi.fn(async (params: any) => {
    snapshotRows.set(`${params.sessionId}:${params.userId}`, {
      ...params,
      createdAt: params.lastSeenAt,
      updatedAt: params.lastSeenAt,
    })
  }),
  listPresenceSnapshotsBySession: vi.fn(async (sessionId: string) =>
    Array.from(snapshotRows.values()).filter((row) => row.sessionId === sessionId)
  ),
}))

import {
  applySessionStateRoomTransition,
  endWhisperBubbleForSession,
  ensurePresenceRecoveredFromSnapshots,
  getRoomMemberIds,
  getSessionPresence,
  updatePresenceState,
} from '@/services/room.service'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const DM_ID = '22222222-2222-4222-8222-222222222222'
const USER_A = '33333333-3333-4333-8333-333333333333'
const USER_B = '44444444-4444-4444-8444-444444444444'
const MAIN_ROOM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const GROUP_ROOM_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const WHISPER_ROOM_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function seedRoom(params: {
  id: string
  sessionId: string
  name: string
  type: 'MAIN' | 'GROUP' | 'PRIVATE'
  createdBy: string
}): void {
  const now = new Date()
  roomRows.set(params.id, {
    ...params,
    createdAt: now,
    updatedAt: now,
  })
}

describe('room service recovery integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    redisState.hashes.clear()
    redisState.sets.clear()
    redisState.sorted.clear()
    roomRows.clear()
    snapshotRows.clear()
  })

  it('recovers presence from DB snapshots when redis hash is empty', async () => {
    await updatePresenceState({
      sessionId: SESSION_ID as any,
      userId: USER_A as any,
      username: 'alice',
      state: 'ONLINE' as any,
      primaryRoomId: '55555555-5555-4555-8555-555555555555' as any,
    })

    redisState.hashes.clear()
    redisState.sets.clear()

    const recovered = await ensurePresenceRecoveredFromSnapshots(SESSION_ID as any)
    expect(recovered).toBe(true)

    const presence = await getSessionPresence(SESSION_ID as any)
    expect(presence).toHaveLength(1)
    expect(presence[0].userId).toBe(USER_A)
    expect(presence[0].state).toBe('OFFLINE')
    expect(presence[0].primaryRoomId).toBe('55555555-5555-4555-8555-555555555555')
  })

  it('keeps transition sequencing stable under repeated state flips', async () => {
    const users = [
      { id: USER_A as any, username: 'alice' },
      { id: USER_B as any, username: 'bob' },
    ]

    const toActive = await applySessionStateRoomTransition({
      sessionId: SESSION_ID as any,
      dmId: DM_ID as any,
      nextState: 'ACTIVE' as any,
      users,
    })

    const toPaused = await applySessionStateRoomTransition({
      sessionId: SESSION_ID as any,
      dmId: DM_ID as any,
      nextState: 'PAUSED' as any,
      users,
    })

    const backToActive = await applySessionStateRoomTransition({
      sessionId: SESSION_ID as any,
      dmId: DM_ID as any,
      nextState: 'ACTIVE' as any,
      users,
    })

    expect(toActive.movedUsers).toBe(2)
    expect(toPaused.movedUsers).toBe(2)
    expect(backToActive.movedUsers).toBe(2)

    const finalPresence = await getSessionPresence(SESSION_ID as any)
    for (const user of finalPresence) {
      expect(user.state).toBe('ONLINE')
      expect(user.primaryRoomId).toBe(backToActive.mainRoomId)
    }

    const mainRoomMembers = await getRoomMemberIds(
      SESSION_ID as any,
      backToActive.mainRoomId as any
    )
    const greenRoomMembers = await getRoomMemberIds(
      SESSION_ID as any,
      backToActive.greenRoomId as any
    )

    expect(mainRoomMembers.sort()).toEqual([USER_A, USER_B].sort())
    expect(greenRoomMembers).toEqual([])
  })

  it('restores whisper participants to stored privateRoomId when it is still valid', async () => {
    seedRoom({
      id: MAIN_ROOM_ID,
      sessionId: SESSION_ID,
      name: 'Main Room',
      type: 'MAIN',
      createdBy: DM_ID,
    })
    seedRoom({
      id: GROUP_ROOM_ID,
      sessionId: SESSION_ID,
      name: 'Scouts',
      type: 'GROUP',
      createdBy: DM_ID,
    })
    seedRoom({
      id: WHISPER_ROOM_ID,
      sessionId: SESSION_ID,
      name: 'Whisper',
      type: 'PRIVATE',
      createdBy: DM_ID,
    })

    await updatePresenceState({
      sessionId: SESSION_ID as any,
      userId: USER_A as any,
      username: 'alice',
      state: 'ONLINE' as any,
      primaryRoomId: WHISPER_ROOM_ID as any,
      privateRoomId: GROUP_ROOM_ID as any,
    })

    const moved = await endWhisperBubbleForSession({
      sessionId: SESSION_ID as any,
      whisperRoomId: WHISPER_ROOM_ID as any,
      fallbackRoomId: MAIN_ROOM_ID as any,
    })

    expect(moved).toEqual([
      {
        userId: USER_A,
        username: 'alice',
        fromRoomId: WHISPER_ROOM_ID,
        toRoomId: GROUP_ROOM_ID,
      },
    ])

    const presence = await getSessionPresence(SESSION_ID as any)
    expect(presence[0]?.primaryRoomId).toBe(GROUP_ROOM_ID)
    expect(presence[0]?.privateRoomId).toBeUndefined()
  })

  it('falls back to MAIN when stored privateRoomId is no longer valid', async () => {
    seedRoom({
      id: MAIN_ROOM_ID,
      sessionId: SESSION_ID,
      name: 'Main Room',
      type: 'MAIN',
      createdBy: DM_ID,
    })
    seedRoom({
      id: WHISPER_ROOM_ID,
      sessionId: SESSION_ID,
      name: 'Whisper',
      type: 'PRIVATE',
      createdBy: DM_ID,
    })

    await updatePresenceState({
      sessionId: SESSION_ID as any,
      userId: USER_B as any,
      username: 'bob',
      state: 'ONLINE' as any,
      primaryRoomId: WHISPER_ROOM_ID as any,
      privateRoomId: GROUP_ROOM_ID as any,
    })

    const moved = await endWhisperBubbleForSession({
      sessionId: SESSION_ID as any,
      whisperRoomId: WHISPER_ROOM_ID as any,
      fallbackRoomId: MAIN_ROOM_ID as any,
    })

    expect(moved).toEqual([
      {
        userId: USER_B,
        username: 'bob',
        fromRoomId: WHISPER_ROOM_ID,
        toRoomId: MAIN_ROOM_ID,
      },
    ])

    const presence = await getSessionPresence(SESSION_ID as any)
    expect(presence[0]?.primaryRoomId).toBe(MAIN_ROOM_ID)
    expect(presence[0]?.privateRoomId).toBeUndefined()
  })
})
