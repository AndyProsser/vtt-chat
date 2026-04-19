import { describe, expect, it } from 'vitest'
import { useStore } from '../../state/store'

describe('store system wiring', () => {
  it('exposes expected top-level slices and actions', () => {
    const state = useStore.getState()

    expect(state).toHaveProperty('sessions')
    expect(state).toHaveProperty('messages')
    expect(state).toHaveProperty('rooms')
    expect(state).toHaveProperty('device')

    expect(typeof state.setCurrentUser).toBe('function')
    expect(typeof state.replaceSessionTopology).toBe('function')
    expect(typeof state.handleMessageSent).toBe('function')
    expect(typeof state.initializeAudio).toBe('function')
  })
})
