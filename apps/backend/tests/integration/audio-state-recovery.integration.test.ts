/**
 * W1: Audio-State Persistence and Recovery Soak
 *
 * Tests that getSessionAudioState correctly assembles durable audio state from
 * the repository layer after each mutation. This validates the persistence
 * contract for audio state across the following scenarios:
 *
 *  - Environment state set and readable from subsequent getSessionAudioState calls
 *  - Multiple room environments accumulate and are all returned
 *  - Environment state can be overwritten (upsert semantics per roomId)
 *  - DM override state persists and is separated from broadcast state
 *  - VOICE_OF_GOD override is correctly reflected in broadcast/voiceOfGod fields
 *  - Removing a DM override is reflected immediately in subsequent state reads
 *  - Removing VOICE_OF_GOD disables broadcast
 *  - State from one session does not appear in another session's state
 *
 * Pass criteria:
 *  - All state reads reflect the exact repository contents at that point in time
 *  - No cross-session leakage of environments or dm overrides
 *  - broadcast.enabled tracks VOICE_OF_GOD upsert/delete lifecycle
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { UUID } from '@shared'
import {
  applyDMOverrideState,
  getServerMuteEnforcementState,
  getSessionAudioState,
  removeDMOverrideState,
  setBroadcastState,
  setRoomEnvironmentState,
  setUserMuteState,
} from '@/services/audio/audio-state'

// In-memory repository store — mirrors repository schema without Prisma
const roomStateRows = new Map<
  string,
  {
    sessionId: string
    roomId: string
    environmentName: string
    environmentId: string
    parameters: unknown
    setBy: string
    setAt: Date
  }
>()

const dmOverrideRows = new Map<
  string,
  {
    sessionId: string
    targetUserId: string
    overrideType: string
    parameters: unknown
    appliedBy: string
    appliedAt: Date
  }
>()

const presenceRows = new Map<
  string,
  {
    userId: string
    sessionId: string
    userMuted?: boolean
  }
>()

function roomKey(sessionId: string, roomId: string) {
  return `${sessionId}::${roomId}`
}

function overrideKey(sessionId: string, targetUserId: string, overrideType: string) {
  return `${sessionId}::${targetUserId}::${overrideType}`
}

function presenceKey(sessionId: string, userId: string) {
  return `${sessionId}::${userId}`
}

// Vitest module mock — must be declared before any imports from the mocked module

import { vi } from 'vitest'

vi.mock('@/repositories/audio.repository', () => ({
  upsertAudioRoomStateRecord: vi.fn(async (params: any) => {
    roomStateRows.set(roomKey(params.sessionId, params.roomId), {
      sessionId: params.sessionId,
      roomId: params.roomId,
      environmentName: params.environmentName,
      environmentId: params.environmentId,
      parameters: params.parameters ?? {},
      setBy: params.setBy,
      setAt: params.setAt,
    })
  }),
  listAudioRoomStateBySession: vi.fn(async (sessionId: string) =>
    Array.from(roomStateRows.values())
      .filter((r) => r.sessionId === sessionId)
      .sort((a, b) => b.setAt.getTime() - a.setAt.getTime())
  ),
  upsertAudioDMOverrideRecord: vi.fn(async (params: any) => {
    dmOverrideRows.set(overrideKey(params.sessionId, params.targetUserId, params.overrideType), {
      sessionId: params.sessionId,
      targetUserId: params.targetUserId,
      overrideType: params.overrideType,
      parameters: params.parameters ?? {},
      appliedBy: params.appliedBy,
      appliedAt: params.appliedAt,
    })
  }),
  removeAudioDMOverrideRecord: vi.fn(async (params: any) => {
    dmOverrideRows.delete(overrideKey(params.sessionId, params.targetUserId, params.overrideType))
  }),
  listAudioDMOverridesBySession: vi.fn(async (sessionId: string) =>
    Array.from(dmOverrideRows.values()).filter((r) => r.sessionId === sessionId)
  ),
}))

vi.mock('@/infra/redis', () => ({
  getRedisClient: vi.fn(async () => ({
    hSet: vi.fn(async (key: string, field: string, value: string) => {
      if (!key.startsWith('presence:session:')) {
        return
      }

      const sessionId = key.replace('presence:session:', '')
      const parsed = JSON.parse(value) as { userMuted?: boolean }
      presenceRows.set(presenceKey(sessionId, field), {
        sessionId,
        userId: field,
        userMuted: parsed.userMuted === true,
      })
    }),
    hGet: vi.fn(async (key: string, field: string) => {
      if (!key.startsWith('presence:session:')) {
        return null
      }

      const sessionId = key.replace('presence:session:', '')
      const row = presenceRows.get(presenceKey(sessionId, field))
      return row ? JSON.stringify(row) : null
    }),
    hGetAll: vi.fn(async () => ({})),
    hDel: vi.fn(async () => 1),
    del: vi.fn(async () => 1),
  })),
}))

const SESSION = '11111111-1111-4111-8111-111111111111' as UUID
const SESSION_2 = '22222222-2222-4222-8222-222222222222' as UUID
const ROOM_A = 'aaaa0000-0000-4000-8000-000000000001' as UUID
const ROOM_B = 'bbbb0000-0000-4000-8000-000000000002' as UUID
const DM_ID = 'dmdmdmdm-0000-4000-8000-000000000003' as UUID
const PLAYER_1 = 'p1p1p1p1-0000-4000-8000-000000000004' as UUID
const PLAYER_2 = 'p2p2p2p2-0000-4000-8000-000000000005' as UUID

describe('audio-state persistence and recovery soak', () => {
  beforeEach(() => {
    roomStateRows.clear()
    dmOverrideRows.clear()
    presenceRows.clear()
  })

  // ----- Environment state persistence -----

  it('environment state is readable from getSessionAudioState after setRoomEnvironmentState', async () => {
    await setRoomEnvironmentState({
      sessionId: SESSION,
      roomId: ROOM_A,
      environmentName: 'tavern',
      environmentId: 'env-tavern',
      parameters: { reverbSend: 0.3 },
      setBy: DM_ID,
      setAt: 1700000001000,
    })

    const state = await getSessionAudioState(SESSION)

    expect(state.sessionId).toBe(SESSION)
    expect(state.environments).toHaveLength(1)
    expect(state.environments[0]).toMatchObject({
      roomId: ROOM_A,
      environmentName: 'tavern',
      environmentId: 'env-tavern',
      parameters: { reverbSend: 0.3 },
      setBy: DM_ID,
      setAt: 1700000001000,
    })
  })

  it('multiple room environments accumulate independently', async () => {
    await setRoomEnvironmentState({
      sessionId: SESSION,
      roomId: ROOM_A,
      environmentName: 'cave',
      environmentId: 'env-cave',
      setBy: DM_ID,
      setAt: 1700000002000,
    })

    await setRoomEnvironmentState({
      sessionId: SESSION,
      roomId: ROOM_B,
      environmentName: 'tavern',
      environmentId: 'env-tavern',
      setBy: DM_ID,
      setAt: 1700000003000,
    })

    const state = await getSessionAudioState(SESSION)

    expect(state.environments).toHaveLength(2)
    const roomIds = state.environments.map((e) => e.roomId)
    expect(roomIds).toContain(ROOM_A)
    expect(roomIds).toContain(ROOM_B)
  })

  it('upsert semantics: setting environment again for same room replaces previous', async () => {
    await setRoomEnvironmentState({
      sessionId: SESSION,
      roomId: ROOM_A,
      environmentName: 'cave',
      environmentId: 'env-cave',
      setBy: DM_ID,
      setAt: 1700000004000,
    })

    await setRoomEnvironmentState({
      sessionId: SESSION,
      roomId: ROOM_A,
      environmentName: 'dungeon',
      environmentId: 'env-dungeon',
      setBy: DM_ID,
      setAt: 1700000005000,
    })

    const state = await getSessionAudioState(SESSION)

    // Still only one entry for ROOM_A
    const roomAEnvs = state.environments.filter((e) => e.roomId === ROOM_A)
    expect(roomAEnvs).toHaveLength(1)
    expect(roomAEnvs[0].environmentName).toBe('dungeon')
    expect(roomAEnvs[0].setAt).toBe(1700000005000)
  })

  // ----- DM override persistence -----

  it('dm override state persists and is returned in dmOverrides array', async () => {
    await applyDMOverrideState({
      sessionId: SESSION,
      targetUserId: PLAYER_1,
      overrideType: 'MUTE',
      parameters: { enabled: true },
      appliedBy: DM_ID,
      appliedAt: 1700000006000,
    })

    const state = await getSessionAudioState(SESSION)

    expect(state.dmOverrides).toHaveLength(1)
    expect(state.dmOverrides[0]).toMatchObject({
      targetUserId: PLAYER_1,
      overrideType: 'MUTE',
      appliedBy: DM_ID,
      appliedAt: 1700000006000,
    })
  })

  it('recovers condition-like override payloads without losing parameters', async () => {
    await applyDMOverrideState({
      sessionId: SESSION,
      targetUserId: PLAYER_1,
      overrideType: 'FILTER',
      parameters: {
        category: 'CONDITION',
        presetId: 'cond-silenced',
        conditionName: 'Silenced',
        mix: 1,
      },
      appliedBy: DM_ID,
      appliedAt: 1700000006050,
    })

    const state = await getSessionAudioState(SESSION)

    expect(state.dmOverrides).toContainEqual({
      targetUserId: PLAYER_1,
      overrideType: 'FILTER',
      parameters: {
        category: 'CONDITION',
        presetId: 'cond-silenced',
        conditionName: 'Silenced',
        mix: 1,
      },
      appliedBy: DM_ID,
      appliedAt: 1700000006050,
    })
  })

  it('recovers distance-like override payloads without losing parameters', async () => {
    await applyDMOverrideState({
      sessionId: SESSION,
      targetUserId: PLAYER_2,
      overrideType: 'GAIN',
      parameters: {
        category: 'DISTANCE',
        presetId: 'distance-far',
        distanceName: 'Far',
        gain: 0.45,
        lowpassFreq: 1200,
      },
      appliedBy: DM_ID,
      appliedAt: 1700000006060,
    })

    const state = await getSessionAudioState(SESSION)

    expect(state.dmOverrides).toContainEqual({
      targetUserId: PLAYER_2,
      overrideType: 'GAIN',
      parameters: {
        category: 'DISTANCE',
        presetId: 'distance-far',
        distanceName: 'Far',
        gain: 0.45,
        lowpassFreq: 1200,
      },
      appliedBy: DM_ID,
      appliedAt: 1700000006060,
    })
  })

  it('multiple dm overrides for different players accumulate', async () => {
    await applyDMOverrideState({
      sessionId: SESSION,
      targetUserId: PLAYER_1,
      overrideType: 'MUTE',
      appliedBy: DM_ID,
      appliedAt: 1700000007000,
    })

    await applyDMOverrideState({
      sessionId: SESSION,
      targetUserId: PLAYER_2,
      overrideType: 'VOLUME',
      parameters: { gain: 0.5 },
      appliedBy: DM_ID,
      appliedAt: 1700000008000,
    })

    const state = await getSessionAudioState(SESSION)

    expect(state.dmOverrides).toHaveLength(2)
    const targets = state.dmOverrides.map((o) => o.targetUserId)
    expect(targets).toContain(PLAYER_1)
    expect(targets).toContain(PLAYER_2)
  })

  it('removing a dm override is immediately reflected in subsequent state reads', async () => {
    await applyDMOverrideState({
      sessionId: SESSION,
      targetUserId: PLAYER_1,
      overrideType: 'MUTE',
      appliedBy: DM_ID,
      appliedAt: 1700000009000,
    })

    await applyDMOverrideState({
      sessionId: SESSION,
      targetUserId: PLAYER_2,
      overrideType: 'MUTE',
      appliedBy: DM_ID,
      appliedAt: 1700000009100,
    })

    // Remove player 1's override
    await removeDMOverrideState({
      sessionId: SESSION,
      targetUserId: PLAYER_1,
      overrideType: 'MUTE',
    })

    const state = await getSessionAudioState(SESSION)

    // Only player 2 should remain
    expect(state.dmOverrides).toHaveLength(1)
    expect(state.dmOverrides[0].targetUserId).toBe(PLAYER_2)
  })

  // ----- Broadcast / VOICE_OF_GOD lifecycle -----

  it('enabling broadcast sets broadcast.enabled and voiceOfGod.enabled', async () => {
    await setBroadcastState({
      sessionId: SESSION,
      dmId: DM_ID,
      enabled: true,
      changedAt: 1700000010000,
    })

    const state = await getSessionAudioState(SESSION)

    expect(state.broadcast.enabled).toBe(true)
    expect(state.broadcast.dmId).toBe(DM_ID)
    expect(state.voiceOfGod.enabled).toBe(true)
    // Broadcast state must not appear in dmOverrides array
    expect(state.dmOverrides.every((o) => o.overrideType !== 'VOICE_OF_GOD')).toBe(true)
  })

  it('disabling broadcast clears broadcast.enabled', async () => {
    await setBroadcastState({
      sessionId: SESSION,
      dmId: DM_ID,
      enabled: true,
      changedAt: 1700000011000,
    })
    await setBroadcastState({
      sessionId: SESSION,
      dmId: DM_ID,
      enabled: false,
      changedAt: 1700000012000,
    })

    const state = await getSessionAudioState(SESSION)

    expect(state.broadcast.enabled).toBe(false)
    expect(state.dmOverrides).toHaveLength(0)
  })

  it('broadcast and dm overrides coexist without interference', async () => {
    await setBroadcastState({
      sessionId: SESSION,
      dmId: DM_ID,
      enabled: true,
      changedAt: 1700000013000,
    })

    await applyDMOverrideState({
      sessionId: SESSION,
      targetUserId: PLAYER_1,
      overrideType: 'MUTE',
      appliedBy: DM_ID,
      appliedAt: 1700000013100,
    })

    const state = await getSessionAudioState(SESSION)

    expect(state.broadcast.enabled).toBe(true)
    expect(state.dmOverrides).toHaveLength(1)
    expect(state.dmOverrides[0].overrideType).toBe('MUTE')
  })

  // ----- Empty state -----

  it('returns empty environments and overrides for a fresh session', async () => {
    const state = await getSessionAudioState(SESSION)

    expect(state.environments).toHaveLength(0)
    expect(state.dmOverrides).toHaveLength(0)
    expect(state.broadcast.enabled).toBe(false)
    expect(state.voiceOfGod.enabled).toBe(false)
  })

  // ----- Cross-session isolation -----

  it('audio state is isolated between sessions', async () => {
    await setRoomEnvironmentState({
      sessionId: SESSION,
      roomId: ROOM_A,
      environmentName: 'cave',
      environmentId: 'env-cave',
      setBy: DM_ID,
      setAt: 1700000014000,
    })

    await applyDMOverrideState({
      sessionId: SESSION_2,
      targetUserId: PLAYER_1,
      overrideType: 'MUTE',
      appliedBy: DM_ID,
      appliedAt: 1700000014100,
    })

    const stateA = await getSessionAudioState(SESSION)
    const stateB = await getSessionAudioState(SESSION_2)

    expect(stateA.environments).toHaveLength(1)
    expect(stateA.dmOverrides).toHaveLength(0)
    expect(stateB.environments).toHaveLength(0)
    expect(stateB.dmOverrides).toHaveLength(1)
  })

  it('mute recovery enforces publish block from dm override state after reconnect', async () => {
    await applyDMOverrideState({
      sessionId: SESSION,
      targetUserId: PLAYER_1,
      overrideType: 'MUTE',
      parameters: { enabled: true },
      appliedBy: DM_ID,
      appliedAt: 1700000015000,
    })

    const muteState = await getServerMuteEnforcementState({
      sessionId: SESSION,
      userId: PLAYER_1,
    })

    expect(muteState).toEqual({
      userMuted: false,
      dmMuted: true,
      silenced: false,
      enforcedMuted: true,
    })
  })

  it('mute recovery enforces publish block from user mute state after reconnect', async () => {
    await setUserMuteState({
      sessionId: SESSION,
      userId: PLAYER_2,
      muted: true,
      mutedAt: 1700000015100,
    })

    const muteState = await getServerMuteEnforcementState({
      sessionId: SESSION,
      userId: PLAYER_2,
    })

    expect(muteState).toEqual({
      userMuted: true,
      dmMuted: false,
      silenced: false,
      enforcedMuted: true,
    })
  })
})
