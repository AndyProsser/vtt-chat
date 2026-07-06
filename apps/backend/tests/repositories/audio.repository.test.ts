import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  upsertRoom: vi.fn(),
  findManyRoom: vi.fn(),
  upsertOverride: vi.fn(),
  deleteManyOverride: vi.fn(),
  findManyOverride: vi.fn(),
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    audioRoomState: {
      upsert: mocks.upsertRoom,
      findMany: mocks.findManyRoom,
    },
    audioDMOverride: {
      upsert: mocks.upsertOverride,
      deleteMany: mocks.deleteManyOverride,
      findMany: mocks.findManyOverride,
    },
  }),
}))

import {
  listAudioDMOverridesBySession,
  listAudioRoomStateBySession,
  removeAudioDMOverrideRecord,
  upsertAudioDMOverrideRecord,
  upsertAudioRoomStateRecord,
} from '@/repositories/audio.repository'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const ROOM_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'

describe('audio repository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upserts room state record with expected composite key', async () => {
    await upsertAudioRoomStateRecord({
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      environmentName: 'tavern',
      environmentId: 'env-tavern',
      parameters: { level: 1 },
      setBy: USER_ID,
      setAt: new Date(1700000000000),
    })

    expect(mocks.upsertRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId_roomId: {
            sessionId: SESSION_ID,
            roomId: ROOM_ID,
          },
        },
      })
    )
  })

  it('lists room states mapped to service shape', async () => {
    mocks.findManyRoom.mockResolvedValue([
      {
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        environmentName: 'forest',
        environmentId: 'env-forest',
        parameters: { reverbSend: 0.2 },
        setBy: USER_ID,
        setAt: new Date(1700000000100),
      },
    ])

    const rows = await listAudioRoomStateBySession(SESSION_ID)

    expect(rows).toEqual([
      {
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        environmentName: 'forest',
        environmentId: 'env-forest',
        parameters: { reverbSend: 0.2 },
        setBy: USER_ID,
        setAt: new Date(1700000000100),
      },
    ])
    expect(mocks.findManyRoom).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID },
      orderBy: [{ setAt: 'desc' }],
    })
  })

  it('upserts and removes dm override records', async () => {
    await upsertAudioDMOverrideRecord({
      sessionId: SESSION_ID,
      targetUserId: USER_ID,
      overrideType: 'MUTE',
      parameters: { enabled: true },
      appliedBy: USER_ID,
      appliedAt: new Date(1700000000200),
    })

    expect(mocks.upsertOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId_targetUserId_overrideType: {
            sessionId: SESSION_ID,
            targetUserId: USER_ID,
            overrideType: 'MUTE',
          },
        },
      })
    )

    mocks.deleteManyOverride.mockResolvedValue({ count: 1 })

    const removedCount = await removeAudioDMOverrideRecord({
      sessionId: SESSION_ID,
      targetUserId: USER_ID,
      overrideType: 'MUTE',
    })

    expect(removedCount).toBe(1)

    expect(mocks.deleteManyOverride).toHaveBeenCalledWith({
      where: {
        sessionId: SESSION_ID,
        targetUserId: USER_ID,
        overrideType: 'MUTE',
      },
    })
  })

  it('lists dm override records mapped to service shape', async () => {
    mocks.findManyOverride.mockResolvedValue([
      {
        sessionId: SESSION_ID,
        targetUserId: USER_ID,
        overrideType: 'GAIN',
        parameters: { gain: 0.5 },
        appliedBy: USER_ID,
        appliedAt: new Date(1700000000300),
      },
    ])

    const rows = await listAudioDMOverridesBySession(SESSION_ID)

    expect(rows).toEqual([
      {
        sessionId: SESSION_ID,
        targetUserId: USER_ID,
        overrideType: 'GAIN',
        parameters: { gain: 0.5 },
        appliedBy: USER_ID,
        appliedAt: new Date(1700000000300),
      },
    ])

    expect(mocks.findManyOverride).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID },
      orderBy: [{ appliedAt: 'desc' }],
    })
  })
})
