/**
 * W4-Conversation-Authority: Audio continuity across session transitions.
 *
 * Session state transitions (ACTIVE, PAUSED, COOLDOWN) are policy remaps —
 * not transport identity teardowns. Audio state must survive non-teardown
 * transitions. Only IDLE, ENDED, and CLEANUP transitions should clear audio.
 *
 * These tests verify the store-level contract. The WS handler in useWebSocket.ts
 * enforces this by conditionally calling resetSessionAudioState/clearActiveEffects.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { UUID } from '@shared'
import { useStore } from '../../src/state/store'
import type { EnvironmentPreset, DistancePreset } from '@/types/audio'

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as UUID
const ROOM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID
const ROOM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as UUID
const DM_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' as UUID

const ENV_PRESET: EnvironmentPreset = {
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' as UUID,
  name: 'Tavern',
  reverbSend: 0.4,
  lowpassFreq: 6000,
  roomGain: 0.2,
}

const DIST_PRESET: DistancePreset = {
  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' as UUID,
  name: 'Far',
  lowpassFreq: 2000,
  gainReduction: -12,
  reverbSend: 0.8,
}

/** Simulate what the WS ROOM:SESSION_TRANSITION_APPLIED handler does for a given nextState. */
function simulateRoomTransition(nextState: string) {
  const store = useStore.getState()
  if (nextState === 'IDLE' || nextState === 'ENDED' || nextState === 'CLEANUP') {
    store.resetSessionAudioState()
    store.clearActiveEffects()
  }
}

describe('W4 — audio continuity across session state transitions', () => {
  beforeEach(() => {
    useStore.getState().reset()
  })

  describe('resetSessionAudioState', () => {
    it('clears per-session audio presets but preserves roomEnvironmentNames', () => {
      const store = useStore.getState()
      store.setEnvironment(ENV_PRESET)
      store.setDistance(DIST_PRESET)
      store.setRoomEnvironmentName(ROOM_A, 'Tavern')
      store.setRoomEnvironmentName(ROOM_B, 'Cave')

      store.resetSessionAudioState()

      const next = useStore.getState()
      expect(next.currentEnvironment).toBeUndefined()
      expect(next.currentDistance).toBeUndefined()
      expect(next.currentCondition).toBeUndefined()
      expect(next.currentVoicePreset).toBeUndefined()
      expect(next.currentICPreset).toBeUndefined()
      // roomEnvironmentNames is campaign-persistent — must not be cleared by reset
      expect(next.roomEnvironmentNames[ROOM_A]).toBe('Tavern')
      expect(next.roomEnvironmentNames[ROOM_B]).toBe('Cave')
    })
  })

  describe('non-teardown transitions preserve audio state', () => {
    const PRESERVE_STATES = ['ACTIVE', 'PAUSED', 'COOLDOWN']

    for (const nextState of PRESERVE_STATES) {
      it(`${nextState} transition does not reset audio state`, () => {
        const store = useStore.getState()
        store.setEnvironment(ENV_PRESET)
        store.setDistance(DIST_PRESET)
        store.setRoomEnvironmentName(ROOM_A, 'Tavern')

        simulateRoomTransition(nextState)

        const after = useStore.getState()
        expect(after.currentEnvironment).toEqual(ENV_PRESET)
        expect(after.currentDistance).toEqual(DIST_PRESET)
        expect(after.roomEnvironmentNames[ROOM_A]).toBe('Tavern')
      })
    }
  })

  describe('teardown transitions clear audio state', () => {
    const TEARDOWN_STATES = ['IDLE', 'ENDED', 'CLEANUP']

    for (const nextState of TEARDOWN_STATES) {
      it(`${nextState} transition resets audio state`, () => {
        const store = useStore.getState()
        store.setEnvironment(ENV_PRESET)
        store.setDistance(DIST_PRESET)

        simulateRoomTransition(nextState)

        const after = useStore.getState()
        expect(after.currentEnvironment).toBeUndefined()
        expect(after.currentDistance).toBeUndefined()
      })
    }
  })

  describe('clearActiveEffects', () => {
    it('empties activeEffects without touching audio presets', () => {
      const store = useStore.getState()
      store.setEnvironment(ENV_PRESET)

      // activeEffects has no direct setter exposed in tests; verify clearActiveEffects is a no-op on presets
      store.clearActiveEffects()

      expect(useStore.getState().currentEnvironment).toEqual(ENV_PRESET)
    })
  })

  describe('PAUSED → ACTIVE resume preserves audio', () => {
    it('audio state set before PAUSED survives both transitions', () => {
      const store = useStore.getState()
      store.setEnvironment(ENV_PRESET)
      store.setRoomEnvironmentName(ROOM_A, 'Tavern')

      // ACTIVE → PAUSED
      simulateRoomTransition('PAUSED')
      expect(useStore.getState().currentEnvironment).toEqual(ENV_PRESET)
      expect(useStore.getState().roomEnvironmentNames[ROOM_A]).toBe('Tavern')

      // PAUSED → ACTIVE (resume)
      simulateRoomTransition('ACTIVE')
      expect(useStore.getState().currentEnvironment).toEqual(ENV_PRESET)
      expect(useStore.getState().roomEnvironmentNames[ROOM_A]).toBe('Tavern')
    })
  })

  describe('ACTIVE → COOLDOWN preserves audio', () => {
    it('audio state survives the cooldown transition', () => {
      const store = useStore.getState()
      store.setEnvironment(ENV_PRESET)
      store.setRoomEnvironmentName(ROOM_B, 'Cave')

      simulateRoomTransition('COOLDOWN')

      expect(useStore.getState().currentEnvironment).toEqual(ENV_PRESET)
      expect(useStore.getState().roomEnvironmentNames[ROOM_B]).toBe('Cave')
    })
  })

  describe('COOLDOWN → ENDED clears audio', () => {
    it('audio state is cleared when transitioning to ENDED', () => {
      const store = useStore.getState()
      store.setEnvironment(ENV_PRESET)

      simulateRoomTransition('COOLDOWN')
      expect(useStore.getState().currentEnvironment).toEqual(ENV_PRESET)

      simulateRoomTransition('ENDED')
      expect(useStore.getState().currentEnvironment).toBeUndefined()
    })
  })
})
