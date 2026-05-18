import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  upsertAudioRoomStateRecord: vi.fn(),
  listAudioRoomStateBySession: vi.fn(),
  upsertAudioDMOverrideRecord: vi.fn(),
  removeAudioDMOverrideRecord: vi.fn(),
  removeAudioDMOverridesBySession: vi.fn(),
  removeAudioRoomStateRecord: vi.fn(),
  listAudioDMOverridesBySession: vi.fn(),
  getRedisClient: vi.fn(),
  redis: {
    hSet: vi.fn(),
    hDel: vi.fn(),
    hGetAll: vi.fn(),
    del: vi.fn(),
  },
}))

vi.mock('@/repositories/audio.repository', () => ({
  upsertAudioRoomStateRecord: mocks.upsertAudioRoomStateRecord,
  listAudioRoomStateBySession: mocks.listAudioRoomStateBySession,
  upsertAudioDMOverrideRecord: mocks.upsertAudioDMOverrideRecord,
  removeAudioDMOverrideRecord: mocks.removeAudioDMOverrideRecord,
  removeAudioDMOverridesBySession: mocks.removeAudioDMOverridesBySession,
  removeAudioRoomStateRecord: mocks.removeAudioRoomStateRecord,
  listAudioDMOverridesBySession: mocks.listAudioDMOverridesBySession,
}))

vi.mock('@/infra/redis', () => ({
  getRedisClient: mocks.getRedisClient,
}))

import {
  applyDMOverrideState,
  clearRoomEnvironmentState,
  clearSessionDMOverrideState,
  getSessionAudioState,
  removeDMOverrideState,
  setBroadcastState,
  setRoomEnvironmentState,
} from '@/services/audio/audio-state'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const ROOM_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'

describe('audio-state service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRedisClient.mockResolvedValue(mocks.redis)
    mocks.redis.hGetAll.mockResolvedValue({})
  })

  it('persists and returns environment state payload', async () => {
    const result = await setRoomEnvironmentState({
      sessionId: SESSION_ID as any,
      roomId: ROOM_ID as any,
      environmentName: 'tavern',
      environmentId: 'env-tavern',
      parameters: { reverbSend: 0.25 },
      setBy: USER_ID as any,
      setAt: 1700000000000,
    })

    expect(mocks.upsertAudioRoomStateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        environmentName: 'tavern',
      })
    )

    expect(result).toEqual({
      roomId: ROOM_ID,
      environmentName: 'tavern',
      environmentId: 'env-tavern',
      parameters: { reverbSend: 0.25 },
      setBy: USER_ID,
      setAt: 1700000000000,
    })

    expect(mocks.redis.hSet).toHaveBeenCalledWith(
      `audio:session:${SESSION_ID}:environments`,
      ROOM_ID,
      expect.any(String)
    )
  })

  it('persists and returns dm override state payload', async () => {
    const result = await applyDMOverrideState({
      sessionId: SESSION_ID as any,
      targetUserId: USER_ID as any,
      overrideType: 'MUTE',
      parameters: { enabled: true },
      appliedBy: USER_ID as any,
      appliedAt: 1700000000100,
    })

    expect(mocks.upsertAudioDMOverrideRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        targetUserId: USER_ID,
        overrideType: 'MUTE',
      })
    )

    expect(result).toEqual({
      targetUserId: USER_ID,
      overrideType: 'MUTE',
      parameters: { enabled: true },
      appliedBy: USER_ID,
      appliedAt: 1700000000100,
    })

    expect(mocks.redis.hSet).toHaveBeenCalledWith(
      `audio:session:${SESSION_ID}:overrides`,
      `${USER_ID}:MUTE`,
      expect.any(String)
    )
  })

  it('removes an existing dm override', async () => {
    await removeDMOverrideState({
      sessionId: SESSION_ID as any,
      targetUserId: USER_ID as any,
      overrideType: 'MUTE',
    })

    expect(mocks.removeAudioDMOverrideRecord).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      targetUserId: USER_ID,
      overrideType: 'MUTE',
    })

    expect(mocks.redis.hDel).toHaveBeenCalledWith(
      `audio:session:${SESSION_ID}:overrides`,
      `${USER_ID}:MUTE`
    )
  })

  it('clears all dm overrides in a session', async () => {
    await clearSessionDMOverrideState(SESSION_ID as any)
    expect(mocks.removeAudioDMOverridesBySession).toHaveBeenCalledWith(SESSION_ID)
    expect(mocks.redis.del).toHaveBeenCalledWith(`audio:session:${SESSION_ID}:overrides`)
  })

  it('clears environment state for a specific room', async () => {
    await clearRoomEnvironmentState({
      sessionId: SESSION_ID as any,
      roomId: ROOM_ID as any,
    })

    expect(mocks.removeAudioRoomStateRecord).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
    })

    expect(mocks.redis.hDel).toHaveBeenCalledWith(
      `audio:session:${SESSION_ID}:environments`,
      ROOM_ID
    )
  })

  it('hydrates persisted session audio state', async () => {
    mocks.redis.hGetAll.mockResolvedValueOnce({}).mockResolvedValueOnce({})

    mocks.listAudioRoomStateBySession.mockResolvedValue([
      {
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        environmentName: 'forest',
        environmentId: 'env-forest',
        parameters: { reverbSend: 0.1 },
        setBy: USER_ID,
        setAt: new Date(1700000000200),
      },
    ])

    mocks.listAudioDMOverridesBySession.mockResolvedValue([
      {
        sessionId: SESSION_ID,
        targetUserId: USER_ID,
        overrideType: 'GAIN',
        parameters: ['invalid-array-shape'],
        appliedBy: USER_ID,
        appliedAt: new Date(1700000000300),
      },
    ])

    const state = await getSessionAudioState(SESSION_ID as any)

    expect(state.sessionId).toBe(SESSION_ID)
    expect(state.environments[0]).toEqual({
      roomId: ROOM_ID,
      environmentName: 'forest',
      environmentId: 'env-forest',
      parameters: { reverbSend: 0.1 },
      setBy: USER_ID,
      setAt: 1700000000200,
    })

    expect(state.dmOverrides[0]).toEqual({
      targetUserId: USER_ID,
      overrideType: 'GAIN',
      parameters: {},
      appliedBy: USER_ID,
      appliedAt: 1700000000300,
    })
  })

  it('hydrates from Redis projection before database fallback', async () => {
    mocks.redis.hGetAll
      .mockResolvedValueOnce({
        [ROOM_ID]: JSON.stringify({
          roomId: ROOM_ID,
          environmentName: 'cave',
          environmentId: 'env-cave',
          parameters: { lowpass: 0.2 },
          setBy: USER_ID,
          setAt: 1700000010000,
        }),
      })
      .mockResolvedValueOnce({
        [`${USER_ID}:MUTE`]: JSON.stringify({
          targetUserId: USER_ID,
          overrideType: 'MUTE',
          parameters: { enabled: true },
          appliedBy: USER_ID,
          appliedAt: 1700000011000,
        }),
      })

    const state = await getSessionAudioState(SESSION_ID as any)

    expect(mocks.listAudioRoomStateBySession).not.toHaveBeenCalled()
    expect(mocks.listAudioDMOverridesBySession).not.toHaveBeenCalled()
    expect(state.environments).toEqual([
      {
        roomId: ROOM_ID,
        environmentName: 'cave',
        environmentId: 'env-cave',
        parameters: { lowpass: 0.2 },
        setBy: USER_ID,
        setAt: 1700000010000,
      },
    ])
    expect(state.dmOverrides).toEqual([
      {
        targetUserId: USER_ID,
        overrideType: 'MUTE',
        parameters: { enabled: true },
        appliedBy: USER_ID,
        appliedAt: 1700000011000,
      },
    ])
  })

  it('mirrors broadcast state toggle into Redis override projection', async () => {
    await setBroadcastState({
      sessionId: SESSION_ID as any,
      dmId: USER_ID as any,
      enabled: true,
      changedAt: 1700000012000,
    })

    expect(mocks.upsertAudioDMOverrideRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        targetUserId: USER_ID,
        overrideType: 'VOICE_OF_GOD',
      })
    )

    expect(mocks.redis.hSet).toHaveBeenCalledWith(
      `audio:session:${SESSION_ID}:overrides`,
      `${USER_ID}:VOICE_OF_GOD`,
      expect.any(String)
    )

    await setBroadcastState({
      sessionId: SESSION_ID as any,
      dmId: USER_ID as any,
      enabled: false,
      changedAt: 1700000013000,
    })

    expect(mocks.removeAudioDMOverrideRecord).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      targetUserId: USER_ID,
      overrideType: 'VOICE_OF_GOD',
    })

    expect(mocks.redis.hDel).toHaveBeenCalledWith(
      `audio:session:${SESSION_ID}:overrides`,
      `${USER_ID}:VOICE_OF_GOD`
    )
  })
})
