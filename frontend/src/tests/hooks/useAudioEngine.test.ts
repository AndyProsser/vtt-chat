import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUseStore, setStoreState, getStoreState } = vi.hoisted(() => {
  type StoreState = {
    device: { enabled: boolean; volumeLevel: number }
    pttActive: boolean
    privateRoomCleanMode: boolean
    dmOverrides: Map<string, { overrideType: string; parameters?: { gain?: number } }>
    currentDistance?: { lowpassFreq: number; gainReduction: number; reverbSend: number }
    currentEnvironment?: { reverbSend: number; lowpassFreq: number; roomGain: number }
    currentCondition?: { effects: Record<string, any> }
  }

  let state: StoreState = {
    device: { enabled: false, volumeLevel: 80 },
    pttActive: false,
    privateRoomCleanMode: false,
    dmOverrides: new Map(),
    currentDistance: undefined,
    currentEnvironment: undefined,
    currentCondition: undefined,
  }

  return {
    mockUseStore: vi.fn((selector: (s: StoreState) => unknown) => selector(state)),
    setStoreState: (next: Partial<StoreState>) => {
      state = {
        ...state,
        ...next,
      }
    },
    getStoreState: () => state,
  }
})

vi.mock('../../hooks/useStore', () => ({
  useStore: (selector: (state: ReturnType<typeof getStoreState>) => unknown) =>
    mockUseStore(selector),
}))

type MockParam = { value: number }
type MockNode = {
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

type MockGainNode = MockNode & { gain: MockParam }
type MockBiquadNode = MockNode & { type: string; frequency: MockParam }
type MockCompressorNode = MockNode & {
  threshold: MockParam
  knee: MockParam
  ratio: MockParam
  attack: MockParam
  release: MockParam
}

const audioContextInstances: MockAudioContext[] = []

function makeNode(): MockNode {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
}

function makeGainNode(): MockGainNode {
  return {
    ...makeNode(),
    gain: { value: 1 },
  }
}

function makeBiquadNode(): MockBiquadNode {
  return {
    ...makeNode(),
    type: 'lowpass',
    frequency: { value: 0 },
  }
}

function makeCompressorNode(): MockCompressorNode {
  return {
    ...makeNode(),
    threshold: { value: 0 },
    knee: { value: 0 },
    ratio: { value: 0 },
    attack: { value: 0 },
    release: { value: 0 },
  }
}

class MockAudioContext {
  state: 'running' | 'closed' = 'running'
  destination = {}

  gainNodes: MockGainNode[] = []
  biquadNodes: MockBiquadNode[] = []
  mediaSources: MockNode[] = []

  close = vi.fn(() => {
    this.state = 'closed'
    return Promise.resolve()
  })

  constructor() {
    audioContextInstances.push(this)
  }

  createGain() {
    const node = makeGainNode()
    this.gainNodes.push(node)
    return node
  }

  createDynamicsCompressor() {
    return makeCompressorNode()
  }

  createConvolver() {
    return makeNode()
  }

  createBiquadFilter() {
    const node = makeBiquadNode()
    this.biquadNodes.push(node)
    return node
  }

  createMediaStreamSource(stream: MediaStream) {
    void stream
    const node = makeNode()
    this.mediaSources.push(node)
    return node
  }
}

describe('useAudioEngine', () => {
  beforeEach(() => {
    audioContextInstances.length = 0
    setStoreState({
      device: { enabled: false, volumeLevel: 80 },
      pttActive: false,
      privateRoomCleanMode: false,
      dmOverrides: new Map(),
      currentDistance: undefined,
      currentEnvironment: undefined,
      currentCondition: undefined,
    })
    mockUseStore.mockClear()
    ;(window as any).AudioContext = MockAudioContext
    ;(window as any).webkitAudioContext = undefined
  })

  it('initializes DSP graph only after explicit user activation', async () => {
    const { useAudioEngine } = await import('../../hooks/useAudioEngine')

    const { result, rerender } = renderHook(() => useAudioEngine())

    expect(result.current.isReady).toBe(false)
    expect(audioContextInstances).toHaveLength(0)

    setStoreState({ device: { enabled: true, volumeLevel: 80 } })
    rerender()

    await waitFor(() => {
      expect(result.current.isReady).toBe(true)
      expect(audioContextInstances).toHaveLength(1)
    })
  })

  it('applies environment and condition changes from store state', async () => {
    const { useAudioEngine } = await import('../../hooks/useAudioEngine')

    setStoreState({ device: { enabled: true, volumeLevel: 80 } })
    const { result, rerender } = renderHook(() => useAudioEngine())

    await waitFor(() => {
      expect(result.current.isReady).toBe(true)
    })

    result.current.addTrack('track-1', {} as MediaStream)

    const context = audioContextInstances[0]
    const participantTrackGain = context.gainNodes[2]
    const participantEffectsSend = context.gainNodes[3]
    const participantRoomBus = context.gainNodes[4]
    const participantFilter = context.biquadNodes[0]

    setStoreState({
      currentEnvironment: {
        reverbSend: 0.65,
        lowpassFreq: 3200,
        roomGain: -6,
      },
    })
    rerender()

    await waitFor(() => {
      expect(participantEffectsSend.gain.value).toBeCloseTo(0.65)
      expect(participantFilter.frequency.value).toBe(3200)
      expect(participantRoomBus.gain.value).toBeCloseTo(Math.pow(10, -6 / 20))
    })

    setStoreState({
      currentCondition: {
        effects: {
          lowpassFreq: 900,
          gain: 0.4,
          muted: true,
        },
      },
    })
    rerender()

    await waitFor(() => {
      expect(participantFilter.frequency.value).toBe(900)
      expect(participantTrackGain.gain.value).toBe(0)
    })
  })

  it('cleans up media tracks and audio nodes on explicit disposal', async () => {
    const { useAudioEngine } = await import('../../hooks/useAudioEngine')

    setStoreState({ device: { enabled: true, volumeLevel: 80 } })
    const { result } = renderHook(() => useAudioEngine())

    await waitFor(() => {
      expect(result.current.isReady).toBe(true)
    })

    result.current.addTrack('track-remove', {} as MediaStream)
    const context = audioContextInstances[0]
    const removableTrackGain = context.gainNodes[2]
    result.current.removeTrack('track-remove')
    expect(removableTrackGain.disconnect).toHaveBeenCalledTimes(1)

    result.current.addTrack('track-dispose', {} as MediaStream)
    const disposableTrackGain = context.gainNodes[5]

    result.current.dispose()

    expect(disposableTrackGain.disconnect).toHaveBeenCalledTimes(1)
    expect(context.close).toHaveBeenCalledTimes(1)
  })
})
