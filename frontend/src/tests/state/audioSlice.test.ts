import { beforeEach, describe, expect, it } from 'vitest'
import type { UUID } from '@shared'
import { useStore } from '../../state/store'
import type { DistancePreset, ConditionPreset, AudioDMOverride } from '../../state/audioSlice'

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
    expect(useStore.getState().dmOverrides.get(TEST_USER_ID)?.overrideType).toBe('MUTE')

    const filterOverride: AudioDMOverride = {
      userId: TEST_USER_ID,
      overrideType: 'FILTER',
      parameters: { type: 'highpass', frequency: 1000 },
      appliedAt: Date.now(),
    }

    store.setDMOverride(TEST_USER_ID, filterOverride)
    expect(useStore.getState().dmOverrides.get(TEST_USER_ID)?.overrideType).toBe('FILTER')
    expect(useStore.getState().dmOverrides.get(TEST_USER_ID)?.parameters).toEqual({
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
})
