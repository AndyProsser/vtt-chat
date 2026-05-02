/**
 * useAudioEngine Hook
 * Manages WebAudio DSP graph and effect application.
 * Follows priority stack from AUDIO-ENGINE.md.
 *
 * Reference: docs/subsystems/AUDIO-ENGINE.md
 */

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useStore } from './useStore'
import type { UUID } from '@shared'

// ============================================================================
// WebAudio Node Types
// ============================================================================

interface ParticipantAudioNode {
  sourceNode: MediaStreamAudioSourceNode | undefined
  trackGainNode: GainNode
  distanceFilterNode: BiquadFilterNode
  effectsSendNode: GainNode
  roomBusGainNode: GainNode
}

interface AudioGraphState {
  audioContext: AudioContext | undefined
  masterGainNode: GainNode | undefined
  masterCompressorNode: DynamicsCompressorNode | undefined
  reverbBusNode: GainNode | undefined
  converterNode: ConvolverNode | undefined
  participantNodes: Map<string, ParticipantAudioNode>
  isInitialized: boolean
}

// ============================================================================
// Hook Implementation
// ============================================================================

export interface UseAudioEngineReturn {
  isReady: boolean
  error?: string
  addTrack: (trackId: string, mediaStream: MediaStream) => void
  removeTrack: (trackId: string) => void
  setLocalGain: (gain: number) => void
  applyEnvironment: (preset: { reverbSend: number; lowpassFreq: number; roomGain: number }) => void
  applyDistance: (preset: {
    lowpassFreq: number
    gainReduction: number
    reverbSend: number
  }) => void
  applyCondition: (effects: Record<string, any>) => void
  applyDMOverride: (trackId: string, override: { gain?: number; muted?: boolean }) => void
  setPTT: (active: boolean) => void
  setPrivateRoomCleanMode: (enabled: boolean) => void
  dispose: () => void
}

export function useAudioEngine(): UseAudioEngineReturn {
  const graphRef = useRef<AudioGraphState>({
    audioContext: undefined,
    masterGainNode: undefined,
    masterCompressorNode: undefined,
    reverbBusNode: undefined,
    converterNode: undefined,
    participantNodes: new Map(),
    isInitialized: false,
  })

  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string>()

  const {
    device,
    pttActive,
    privateRoomCleanMode,
    dmOverrides,
    currentDistance,
    currentEnvironment,
    currentCondition,
  } = useStore((state) => ({
    device: state.device,
    pttActive: state.pttActive,
    privateRoomCleanMode: state.privateRoomCleanMode,
    dmOverrides: state.dmOverrides,
    currentDistance: state.currentDistance,
    currentEnvironment: state.currentEnvironment,
    currentCondition: state.currentCondition,
  }))

  // =========================================================================
  // Initialization: Build WebAudio Graph
  // =========================================================================

  const initializeAudioGraph = (): boolean => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const graph = graphRef.current

      // Master chain
      const masterGain = audioContext.createGain()
      masterGain.gain.value = device.volumeLevel / 100

      const masterCompressor = audioContext.createDynamicsCompressor()
      masterCompressor.threshold.value = -24
      masterCompressor.knee.value = 30
      masterCompressor.ratio.value = 12
      masterCompressor.attack.value = 0.003
      masterCompressor.release.value = 0.25

      // Reverb bus
      const reverbBus = audioContext.createGain()
      reverbBus.gain.value = 0.3
      const convolver = audioContext.createConvolver()

      // Connect master chain
      reverbBus.connect(convolver)
      convolver.connect(masterGain)
      masterGain.connect(masterCompressor)
      masterCompressor.connect(audioContext.destination)

      // Update graph state
      graph.audioContext = audioContext
      graph.masterGainNode = masterGain
      graph.masterCompressorNode = masterCompressor
      graph.reverbBusNode = reverbBus
      graph.converterNode = convolver
      graph.isInitialized = true

      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`Failed to initialize audio graph: ${message}`)
      return false
    }
  }

  // =========================================================================
  // Participant Track Management
  // =========================================================================

  const addTrack = (trackId: string, mediaStream: MediaStream): void => {
    try {
      const graph = graphRef.current
      if (!graph.audioContext || !graph.masterGainNode || !graph.reverbBusNode) {
        setError('Audio graph not initialized')
        return
      }

      // Create participant nodes
      const sourceNode = graph.audioContext.createMediaStreamSource(mediaStream)
      const trackGain = graph.audioContext.createGain()
      trackGain.gain.value = 1.0

      const distanceFilter = graph.audioContext.createBiquadFilter()
      distanceFilter.type = 'lowpass'
      distanceFilter.frequency.value = 8000

      const effectsSend = graph.audioContext.createGain()
      effectsSend.gain.value = 0.3

      const roomBusGain = graph.audioContext.createGain()
      roomBusGain.gain.value = 1.0

      // Connect participant chain
      sourceNode.connect(trackGain)
      trackGain.connect(distanceFilter)
      distanceFilter.connect(effectsSend)
      distanceFilter.connect(roomBusGain)
      effectsSend.connect(graph.reverbBusNode)
      roomBusGain.connect(graph.masterGainNode)

      // Store nodes
      graph.participantNodes.set(trackId, {
        sourceNode,
        trackGainNode: trackGain,
        distanceFilterNode: distanceFilter,
        effectsSendNode: effectsSend,
        roomBusGainNode: roomBusGain,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`Failed to add track: ${message}`)
    }
  }

  const removeTrack = (trackId: string): void => {
    try {
      const graph = graphRef.current
      const node = graph.participantNodes.get(trackId)

      if (node) {
        node.trackGainNode.disconnect()
        graph.participantNodes.delete(trackId)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`Failed to remove track: ${message}`)
    }
  }

  // =========================================================================
  // Effect Application (Following Priority Stack)
  // =========================================================================

  /**
   * Apply effects in priority order:
   * 1. PTT override (clean voice only)
   * 2. Private room clean mode (all effects disabled)
   * 3. DM override (gain/mute)
   * 4. Condition preset
   * 5. Distance preset
   * 6. Environment preset
   * 7. Voice/IC presets (not directly applied in participant chain)
   */
  const applyEffectStack = (trackId: string): void => {
    try {
      const graph = graphRef.current
      const node = graph.participantNodes.get(trackId)

      if (!node) return

      // Priority 1: PTT Active → clean voice only
      if (pttActive) {
        node.distanceFilterNode.frequency.value = 8000 // Neutral
        node.trackGainNode.gain.value = 1.0
        node.effectsSendNode.gain.value = 0 // No reverb
        return
      }

      // Priority 2: Private Room Clean Mode → disable all effects
      if (privateRoomCleanMode) {
        node.distanceFilterNode.frequency.value = 8000
        node.trackGainNode.gain.value = 1.0
        node.effectsSendNode.gain.value = 0
        return
      }

      // Priority 3: DM Override (gain/mute)
      const dmOverride = dmOverrides?.get(trackId as UUID)
      if (dmOverride) {
        if (dmOverride.overrideType === 'MUTE') {
          node.trackGainNode.gain.value = 0
          return
        }
        if (dmOverride.overrideType === 'GAIN' && dmOverride.parameters?.gain) {
          node.trackGainNode.gain.value = dmOverride.parameters.gain as number
        }
      }

      // Priority 4: Condition Preset (overrides distance)
      if (currentCondition) {
        applyConditionToNode(node, currentCondition.effects)
        return
      }

      // Priority 5: Distance Preset
      if (currentDistance) {
        applyDistanceToNode(node, currentDistance)
      }

      // Priority 6: Environment Preset
      if (currentEnvironment) {
        applyEnvironmentToNode(node, currentEnvironment)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`Error applying effects: ${message}`)
    }
  }

  const applyEnvironment = (preset: {
    reverbSend: number
    lowpassFreq: number
    roomGain: number
  }): void => {
    try {
      graphRef.current.participantNodes.forEach((node) => {
        applyEnvironmentToNode(node, preset)
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`Failed to apply environment: ${message}`)
    }
  }

  const applyEnvironmentToNode = (
    node: ParticipantAudioNode,
    preset: { reverbSend: number; lowpassFreq: number; roomGain: number }
  ): void => {
    node.effectsSendNode.gain.value = preset.reverbSend
    node.distanceFilterNode.frequency.value = preset.lowpassFreq
    node.roomBusGainNode.gain.value = Math.pow(10, preset.roomGain / 20) // dB to linear
  }

  const applyDistance = (preset: {
    lowpassFreq: number
    gainReduction: number
    reverbSend: number
  }): void => {
    try {
      graphRef.current.participantNodes.forEach((node) => {
        applyDistanceToNode(node, preset)
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`Failed to apply distance: ${message}`)
    }
  }

  const applyDistanceToNode = (
    node: ParticipantAudioNode,
    preset: { lowpassFreq: number; gainReduction: number; reverbSend: number }
  ): void => {
    node.distanceFilterNode.frequency.value = preset.lowpassFreq
    node.trackGainNode.gain.value = Math.pow(10, -preset.gainReduction / 20) // dB to linear
    node.effectsSendNode.gain.value = preset.reverbSend
  }

  const applyCondition = (effects: Record<string, any>): void => {
    try {
      graphRef.current.participantNodes.forEach((node) => {
        applyConditionToNode(node, effects)
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`Failed to apply condition: ${message}`)
    }
  }

  const applyConditionToNode = (node: ParticipantAudioNode, effects: Record<string, any>): void => {
    // Conditions can override frequency, gain, mute
    if (effects.lowpassFreq) {
      node.distanceFilterNode.frequency.value = effects.lowpassFreq
    }
    if (effects.gain !== undefined) {
      node.trackGainNode.gain.value = effects.gain
    }
    if (effects.muted) {
      node.trackGainNode.gain.value = 0
    }
  }

  const applyDMOverride = (trackId: string, override: { gain?: number; muted?: boolean }): void => {
    try {
      const node = graphRef.current.participantNodes.get(trackId)
      if (!node) return

      if (override.muted) {
        node.trackGainNode.gain.value = 0
      }
      if (override.gain !== undefined) {
        node.trackGainNode.gain.value = override.gain
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`Failed to apply DM override: ${message}`)
    }
  }

  const setLocalGain = (gain: number): void => {
    try {
      const graph = graphRef.current
      if (graph.masterGainNode) {
        graph.masterGainNode.gain.value = Math.max(0, Math.min(1, gain / 100))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`Failed to set gain: ${message}`)
    }
  }

  const setPTT = (): void => {
    // Update reapplies effects via effect stack
    graphRef.current.participantNodes.forEach((_, trackId) => {
      applyEffectStack(trackId)
    })
  }

  const setPrivateRoomCleanMode = (): void => {
    // Update reapplies effects via effect stack
    graphRef.current.participantNodes.forEach((_, trackId) => {
      applyEffectStack(trackId)
    })
  }

  const dispose = (): void => {
    try {
      const graph = graphRef.current
      graph.participantNodes.forEach((node) => {
        node.trackGainNode.disconnect()
      })
      graph.participantNodes.clear()

      if (graph.audioContext && graph.audioContext.state !== 'closed') {
        graph.audioContext.close()
      }

      graph.isInitialized = false
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`Error disposing audio engine: ${message}`)
    }
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  const ensureAudioGraphInitialized = useEffectEvent(() => {
    if (!isReady && device.enabled) {
      const success = initializeAudioGraph()
      setIsReady(success)
    }
  })

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      ensureAudioGraphInitialized()
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [device.enabled, isReady])

  // Re-apply effects when state changes
  const reapplyCurrentEffects = useEffectEvent(() => {
    if (isReady && graphRef.current.isInitialized) {
      graphRef.current.participantNodes.forEach((_, trackId) => {
        applyEffectStack(trackId)
      })
    }
  })

  useEffect(() => {
    reapplyCurrentEffects()
  }, [
    pttActive,
    privateRoomCleanMode,
    dmOverrides,
    currentDistance,
    currentEnvironment,
    currentCondition,
    isReady,
  ])

  return {
    isReady,
    error,
    addTrack,
    removeTrack,
    setLocalGain,
    applyEnvironment,
    applyDistance,
    applyCondition,
    applyDMOverride,
    setPTT,
    setPrivateRoomCleanMode,
    dispose,
  }
}
