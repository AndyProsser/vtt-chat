import { beforeEach, describe, expect, it } from 'vitest'
import type { UUID } from '@shared'
import { useStore } from '../../src/state/store'
import type { DistancePreset, ConditionPreset, AudioDMOverride } from '@/types/audio'
import { getUserDMOverride } from '@/utils/audioOverrides'

const TEST_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID
const TEST_PRESET_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as UUID

const mockDistancePreset: DistancePreset = {
  id: TEST_PRESET_ID,
  name: 'Near',
  lowpassFreq: 8000,
  gainReduction: -3,
  reverbSend: 0.2,
}

const mockConditionPreset: ConditionPreset = {
  id: TEST_PRESET_ID,
  name: 'Silenced',
  effects: {
    lowpass: { frequency: 500 },
  },
}

describe('audioSlice', () => {
  beforeEach(() => {
    useStore.getState().reset()
  })

  it('sets and clears distance preset', () => {
    const store = useStore.getState()
    expect(store.currentDistance).toBeUndefined()

    store.setDistance(mockDistancePreset)
    expect(useStore.getState().currentDistance).toEqual(mockDistancePreset)

    store.clearDistance()
    expect(useStore.getState().currentDistance).toBeUndefined()
  })

  it('sets and clears condition preset', () => {
    const store = useStore.getState()
    expect(store.currentCondition).toBeUndefined()

    store.setCondition(mockConditionPreset)
    expect(useStore.getState().currentCondition).toEqual(mockConditionPreset)

    store.clearCondition()
    expect(useStore.getState().currentCondition).toBeUndefined()
  })

  it('keeps distance and condition independent', () => {
    const store = useStore.getState()
    store.setDistance(mockDistancePreset)
    store.setCondition(mockConditionPreset)

    const state = useStore.getState()
    expect(state.currentDistance?.name).toBe('Near')
    expect(state.currentCondition?.name).toBe('Silenced')
  })

  it('sets, replaces, and removes DM overrides', () => {
    const store = useStore.getState()

    const muteOverride: AudioDMOverride = {
      userId: TEST_USER_ID,
      overrideType: 'MUTE',
      appliedAt: Date.now(),
    }

    store.setDMOverride(TEST_USER_ID, muteOverride)
    expect(
      getUserDMOverride(useStore.getState().dmOverrides, TEST_USER_ID, 'MUTE')?.overrideType
    ).toBe('MUTE')

    const filterOverride: AudioDMOverride = {
      userId: TEST_USER_ID,
      overrideType: 'FILTER',
      parameters: { type: 'highpass', frequency: 1000 },
      appliedAt: Date.now(),
    }

    store.setDMOverride(TEST_USER_ID, filterOverride)
    expect(
      getUserDMOverride(useStore.getState().dmOverrides, TEST_USER_ID, 'FILTER')?.overrideType
    ).toBe('FILTER')
    expect(
      getUserDMOverride(useStore.getState().dmOverrides, TEST_USER_ID, 'FILTER')?.parameters
    ).toEqual({
      type: 'highpass',
      frequency: 1000,
    })

    store.setDMOverride(TEST_USER_ID, null)
    expect(useStore.getState().dmOverrides.has(TEST_USER_ID)).toBe(false)
  })

  it('does not clear presets when removing DM override', () => {
    const store = useStore.getState()
    store.setDistance(mockDistancePreset)
    store.setCondition(mockConditionPreset)
    store.setDMOverride(TEST_USER_ID, {
      userId: TEST_USER_ID,
      overrideType: 'MUTE',
      appliedAt: Date.now(),
    })

    store.setDMOverride(TEST_USER_ID, null)

    const state = useStore.getState()
    expect(state.currentDistance).toEqual(mockDistancePreset)
    expect(state.currentCondition).toEqual(mockConditionPreset)
    expect(state.dmOverrides.size).toBe(0)
  })

  it('replaceDMOverrides replaces entire DM override map', () => {
    const store = useStore.getState()
    store.setDMOverride(TEST_USER_ID, {
      userId: TEST_USER_ID,
      overrideType: 'MUTE',
      appliedAt: 1,
    })
    expect(useStore.getState().dmOverrides.size).toBe(1)

    const user2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbba' as UUID
    useStore.getState().replaceDMOverrides([{ userId: user2, overrideType: 'GAIN', appliedAt: 2 }])

    const after = useStore.getState().dmOverrides
    expect(after.has(TEST_USER_ID)).toBe(false)
    expect(getUserDMOverride(after, user2, 'GAIN')?.overrideType).toBe('GAIN')
  })

  it('resetSessionAudioState clears presets but preserves roomEnvironmentNames', () => {
    const store = useStore.getState()
    const ROOM_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as UUID
    store.setDistance(mockDistancePreset)
    store.setCondition(mockConditionPreset)
    store.setRoomEnvironmentName(ROOM_ID, 'Tavern')
    expect(useStore.getState().roomEnvironmentNames[ROOM_ID]).toBe('Tavern')

    useStore.getState().resetSessionAudioState()

    const after = useStore.getState()
    expect(after.currentDistance).toBeUndefined()
    expect(after.currentCondition).toBeUndefined()
    expect(after.roomEnvironmentNames[ROOM_ID]).toBe('Tavern')
  })

  // ── WS Event Handlers — handleEnvironmentSet ───────────────────────────────

  describe('handleEnvironmentSet', () => {
    const SESSION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' as UUID
    const ROOM_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' as UUID
    const DM_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff' as UUID
    const ENV_ID = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1' as UUID
    const NOW = 1700000000000

    function makeEnvEvent(roomId: UUID, parameters?: Record<string, number>) {
      return {
        id: '00000000-0000-4000-8000-000000000000' as UUID,
        type: 'AUDIO:ENVIRONMENT_SET',
        version: 1 as const,
        userId: DM_ID,
        userRole: 'DM' as any,
        sessionId: SESSION_ID,
        roomId,
        timestamp: NOW,
        payload: {
          environmentId: ENV_ID,
          environmentName: 'Tavern',
          roomId,
          setBy: DM_ID,
          setAt: NOW,
          ...(parameters ? { parameters } : {}),
        },
      }
    }

    it('updates roomEnvironmentNames for the room', () => {
      useStore.getState().handleEnvironmentSet(makeEnvEvent(ROOM_ID))
      expect(useStore.getState().roomEnvironmentNames[ROOM_ID]).toBe('Tavern')
    })

    // currentEnvironment is gated on the event room being the local user's
    // connected (primary) room, and its DSP is resolved from the shared
    // environment catalog — the WS payload `parameters` are intentionally NOT
    // trusted for projection (see handleEnvironmentSet in audioPresetsSlice).
    function connectUserToRoom(roomId: UUID) {
      useStore.getState().setCurrentUser({ id: DM_ID, username: 'dm', role: 'DM' as any })
      useStore.getState().upsertSessionPresenceOnJoin({
        sessionId: SESSION_ID,
        userId: DM_ID,
        username: 'dm',
        roomId,
        joinedAt: NOW,
      })
    }

    it('does not set currentEnvironment when the event room is not the connected room', () => {
      const OTHER_ROOM = '11111111-1111-4111-8111-111111111111' as UUID
      connectUserToRoom(OTHER_ROOM)

      // Even with parameters present, a non-connected room must not project.
      useStore
        .getState()
        .handleEnvironmentSet(makeEnvEvent(ROOM_ID, { reverbSend: 0.5, lowpassFreq: 5000 }))

      expect(useStore.getState().currentEnvironment).toBeUndefined()
    })

    it('does not set currentEnvironment when there is no connected user', () => {
      useStore.getState().handleEnvironmentSet(makeEnvEvent(ROOM_ID))
      expect(useStore.getState().currentEnvironment).toBeUndefined()
    })

    it('sets currentEnvironment from the catalog when the event room is the connected room', () => {
      connectUserToRoom(ROOM_ID)

      // Payload parameters are deliberately bogus to prove they are ignored in
      // favour of the catalog Tavern DSP.
      useStore
        .getState()
        .handleEnvironmentSet(makeEnvEvent(ROOM_ID, { reverbSend: 0.99, lowpassFreq: 100 }))

      const env = useStore.getState().currentEnvironment
      expect(env).toBeDefined()
      expect(env?.name).toBe('Tavern')
      // Catalog Tavern DSP — not the payload values.
      expect(env?.reverbSend).toBe(0.18)
      expect(env?.lowpassFreq).toBe(6500)
      expect(env?.roomGain).toBe(0)
    })

    it('updates roomEnvironmentNames even when parameters are present', () => {
      const event = makeEnvEvent(ROOM_ID, { reverbSend: 0.4, lowpassFreq: 3000, roomGain: 0 })
      useStore.getState().handleEnvironmentSet(event)
      expect(useStore.getState().roomEnvironmentNames[ROOM_ID]).toBe('Tavern')
    })
  })

  // ── WS Event Handlers — handleDMOverrideApplied / Removed ─────────────────

  describe('handleDMOverrideApplied', () => {
    const SESSION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' as UUID
    const DM_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff' as UUID
    const NOW = 1700000000000

    function makeOverrideEvent(
      targetUserId: UUID,
      overrideType: string,
      parameters?: Record<string, any>
    ) {
      return {
        id: '00000000-0000-4000-8000-000000000000' as UUID,
        type: 'AUDIO:DM_OVERRIDE_APPLIED',
        version: 1 as const,
        userId: DM_ID,
        userRole: 'DM' as any,
        sessionId: SESSION_ID,
        roomId: null as any,
        timestamp: NOW,
        payload: {
          targetUserId,
          dmId: DM_ID,
          overrideType,
          appliedAt: NOW,
          ...(parameters ? { parameters } : {}),
        },
      }
    }

    it('adds a DM override to the map', () => {
      useStore.getState().handleDMOverrideApplied(makeOverrideEvent(TEST_USER_ID, 'MUTE'))
      expect(
        getUserDMOverride(useStore.getState().dmOverrides, TEST_USER_ID, 'MUTE')?.overrideType
      ).toBe('MUTE')
    })

    it('stores parameters when present', () => {
      const params = { type: 'drunk', intensity: 0.8 }
      useStore
        .getState()
        .handleDMOverrideApplied(makeOverrideEvent(TEST_USER_ID, 'CONDITION', params))
      expect(
        getUserDMOverride(useStore.getState().dmOverrides, TEST_USER_ID, 'CONDITION')?.parameters
      ).toEqual(params)
    })

    it('keeps multiple override types for the same user', () => {
      useStore.getState().handleDMOverrideApplied(makeOverrideEvent(TEST_USER_ID, 'MUTE'))
      useStore.getState().handleDMOverrideApplied(makeOverrideEvent(TEST_USER_ID, 'FILTER'))
      expect(
        getUserDMOverride(useStore.getState().dmOverrides, TEST_USER_ID, 'MUTE')?.overrideType
      ).toBe('MUTE')
      expect(
        getUserDMOverride(useStore.getState().dmOverrides, TEST_USER_ID, 'FILTER')?.overrideType
      ).toBe('FILTER')
    })
  })

  describe('handleDMOverrideRemoved', () => {
    const SESSION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' as UUID
    const DM_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff' as UUID
    const NOW = 1700000000000

    it('removes the override for the target user', () => {
      useStore.getState().setDMOverride(TEST_USER_ID, {
        userId: TEST_USER_ID,
        overrideType: 'MUTE',
        appliedAt: NOW,
      })

      useStore.getState().handleDMOverrideRemoved({
        id: '00000000-0000-4000-8000-000000000000' as UUID,
        type: 'AUDIO:DM_OVERRIDE_REMOVED',
        version: 1,
        userId: DM_ID,
        userRole: 'DM' as any,
        sessionId: SESSION_ID,
        roomId: null as any,
        timestamp: NOW,
        payload: { targetUserId: TEST_USER_ID, dmId: DM_ID, overrideType: 'MUTE', removedAt: NOW },
      })

      expect(useStore.getState().dmOverrides.has(TEST_USER_ID)).toBe(false)
    })

    it('is a no-op when no override exists for user', () => {
      const before = useStore.getState().dmOverrides.size

      useStore.getState().handleDMOverrideRemoved({
        id: '00000000-0000-4000-8000-000000000000' as UUID,
        type: 'AUDIO:DM_OVERRIDE_REMOVED',
        version: 1,
        userId: DM_ID,
        userRole: 'DM' as any,
        sessionId: SESSION_ID,
        roomId: null as any,
        timestamp: NOW,
        payload: { targetUserId: TEST_USER_ID, dmId: DM_ID, overrideType: 'MUTE', removedAt: NOW },
      })

      expect(useStore.getState().dmOverrides.size).toBe(before)
    })
  })

  // ── WS Event Handlers — handleBroadcastStateChanged ───────────────────────

  describe('handleBroadcastStateChanged', () => {
    const SESSION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' as UUID
    const DM_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff' as UUID
    const NOW = 1700000000000

    function makeBroadcastEvent(enabled: boolean, broadcastRoomId?: string) {
      return {
        id: '00000000-0000-4000-8000-000000000000' as UUID,
        type: 'AUDIO:BROADCAST_STATE_CHANGED',
        version: 1 as const,
        userId: DM_ID,
        userRole: 'DM' as any,
        sessionId: SESSION_ID,
        roomId: null as any,
        timestamp: NOW,
        payload: { dmId: DM_ID, enabled, broadcastRoomId, changedAt: NOW },
      }
    }

    it('enables broadcast mode and records room and DM', () => {
      const ROOM_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
      useStore.getState().handleBroadcastStateChanged(makeBroadcastEvent(true, ROOM_ID))
      const state = useStore.getState()
      expect(state.broadcastModeEnabled).toBe(true)
      expect(state.broadcastRoomId).toBe(ROOM_ID)
      expect(state.broadcastDmId).toBe(DM_ID)
      expect(state.broadcastChangedAt).toBe(NOW)
    })

    it('disables broadcast mode', () => {
      useStore.getState().handleBroadcastStateChanged(makeBroadcastEvent(true, 'some-room'))
      useStore.getState().handleBroadcastStateChanged(makeBroadcastEvent(false))
      expect(useStore.getState().broadcastModeEnabled).toBe(false)
      expect(useStore.getState().broadcastRoomId).toBeUndefined()
    })

    it('falls back to event timestamp when changedAt is absent', () => {
      const event = {
        id: '00000000-0000-4000-8000-000000000000' as UUID,
        type: 'AUDIO:BROADCAST_STATE_CHANGED',
        version: 1 as const,
        userId: DM_ID,
        userRole: 'DM' as any,
        sessionId: SESSION_ID,
        roomId: null as any,
        timestamp: NOW + 5_000,
        payload: { dmId: DM_ID, enabled: true },
      }
      useStore.getState().handleBroadcastStateChanged(event)
      expect(useStore.getState().broadcastChangedAt).toBe(NOW + 5_000)
    })
  })
})
