import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  upsertAudioRoomStateRecord: vi.fn(),
  listAudioRoomStateBySession: vi.fn(),
  upsertAudioDMOverrideRecord: vi.fn(),
  removeAudioDMOverrideRecord: vi.fn(),
  listAudioDMOverridesBySession: vi.fn(),
}))

vi.mock('@/repositories/audio.repository', () => ({
  upsertAudioRoomStateRecord: mocks.upsertAudioRoomStateRecord,
  listAudioRoomStateBySession: mocks.listAudioRoomStateBySession,
  upsertAudioDMOverrideRecord: mocks.upsertAudioDMOverrideRecord,
  removeAudioDMOverrideRecord: mocks.removeAudioDMOverrideRecord,
  listAudioDMOverridesBySession: mocks.listAudioDMOverridesBySession,
}))

import {
  applyDMOverrideState,
  getSessionAudioState,
  removeDMOverrideState,
  setRoomEnvironmentState,
} from '@/services/audio-state.service'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const ROOM_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'

describe('audio-state service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
  })

  it('hydrates persisted session audio state', async () => {
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
})
