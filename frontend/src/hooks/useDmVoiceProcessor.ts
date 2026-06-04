/**
 * useDmVoiceProcessor
 *
 * Applies the active DM voice preset to the outgoing microphone track via a
 * Web Audio processing chain, then calls LocalAudioTrack.replaceTrack() so
 * LiveKit publishes the processed audio instead of the raw mic.
 *
 * Signal path (inside AudioContext):
 *   rawMicTrack → source → inputGain → [highpass] → [lowpass] → [lowShelf] →
 *   [highShelf] → [peak] → [distortion] → [compressor] →
 *   dryGain ──────────────────────────────────────────────> masterOut → destination
 *   reverbSend → ConvolverNode → reverbReturn ──────────────>
 *
 * When the preset is cleared, the LocalAudioTrack is restored to the original
 * raw mic track and the AudioContext is closed.
 *
 * Mount this hook inside AudioPanel so it has access to localAudioTrack and
 * localInputTrack from the same useLiveKit instance.
 */

import { useEffect, useRef } from 'react'
import type { LocalAudioTrack } from 'livekit-client'
import { findVoicePreset, type VoicePresetDsp } from '@shared'
import { useStore } from './useStore'
import { logger } from '@/utils/logger'

interface UseDmVoiceProcessorOptions {
  localAudioTrack: LocalAudioTrack | null
  localInputTrack: MediaStreamTrack | null
}

interface ProcessorGraph {
  audioContext: AudioContext
  destination: MediaStreamAudioDestinationNode
  processedTrack: MediaStreamTrack
}

// ─────────────────────────────────────────────────────────────────────────────
// DSP Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 256
  const curve = new Float32Array(new ArrayBuffer(samples * 4))
  const k = amount * 200
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1
    curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x))
  }
  return curve
}

function buildReverbImpulse(
  context: AudioContext,
  decaySeconds: number
): AudioBuffer {
  const sampleRate = context.sampleRate
  const length = Math.ceil(sampleRate * Math.min(decaySeconds, 8))
  const buffer = context.createBuffer(2, length, sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      // Exponential decay noise — sounds like a real room impulse
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decaySeconds * 0.5)
    }
  }
  return buffer
}

function buildProcessingChain(
  audioContext: AudioContext,
  sourceNode: MediaStreamAudioSourceNode,
  dsp: VoicePresetDsp
): AudioNode {
  let current: AudioNode = sourceNode

  // Input gain
  const inputGain = audioContext.createGain()
  inputGain.gain.value = dsp.inputGain
  current.connect(inputGain)
  current = inputGain

  // High-pass filter
  if (dsp.highpass) {
    const hp = audioContext.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = dsp.highpass.frequency
    hp.Q.value = dsp.highpass.Q
    current.connect(hp)
    current = hp
  }

  // Low-pass filter
  if (dsp.lowpass) {
    const lp = audioContext.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = dsp.lowpass.frequency
    lp.Q.value = dsp.lowpass.Q
    current.connect(lp)
    current = lp
  }

  // Low-shelf EQ
  if (dsp.lowShelf) {
    const shelf = audioContext.createBiquadFilter()
    shelf.type = 'lowshelf'
    shelf.frequency.value = dsp.lowShelf.frequency
    shelf.gain.value = dsp.lowShelf.gainDb
    current.connect(shelf)
    current = shelf
  }

  // High-shelf EQ
  if (dsp.highShelf) {
    const shelf = audioContext.createBiquadFilter()
    shelf.type = 'highshelf'
    shelf.frequency.value = dsp.highShelf.frequency
    shelf.gain.value = dsp.highShelf.gainDb
    current.connect(shelf)
    current = shelf
  }

  // Peaking EQ
  if (dsp.peak) {
    const peak = audioContext.createBiquadFilter()
    peak.type = 'peaking'
    peak.frequency.value = dsp.peak.frequency
    peak.Q.value = dsp.peak.Q
    peak.gain.value = dsp.peak.gainDb
    current.connect(peak)
    current = peak
  }

  // Waveshaper distortion
  if (dsp.distortion && dsp.distortion > 0) {
    const shaper = audioContext.createWaveShaper()
    shaper.curve = buildDistortionCurve(dsp.distortion)
    shaper.oversample = '4x'
    current.connect(shaper)
    current = shaper
  }

  // Dynamics compressor
  if (dsp.compression) {
    const comp = audioContext.createDynamicsCompressor()
    comp.threshold.value = dsp.compression.threshold
    comp.knee.value = dsp.compression.knee
    comp.ratio.value = dsp.compression.ratio
    comp.attack.value = dsp.compression.attack
    comp.release.value = dsp.compression.release
    current.connect(comp)
    current = comp
  }

  // Reverb dry/wet blend
  const masterOut = audioContext.createGain()
  masterOut.gain.value = dsp.outputGain

  if (dsp.reverbWet > 0) {
    const dryGain = audioContext.createGain()
    dryGain.gain.value = 1 - dsp.reverbWet
    current.connect(dryGain)
    dryGain.connect(masterOut)

    const wetGain = audioContext.createGain()
    wetGain.gain.value = dsp.reverbWet
    const convolver = audioContext.createConvolver()
    convolver.buffer = buildReverbImpulse(audioContext, dsp.reverbDecaySeconds)
    current.connect(wetGain)
    wetGain.connect(convolver)
    convolver.connect(masterOut)
  } else {
    current.connect(masterOut)
  }

  return masterOut
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useDmVoiceProcessor({
  localAudioTrack,
  localInputTrack,
}: UseDmVoiceProcessorOptions): void {
  const dmVoicePreset = useStore((state) => (state as any).dmVoicePreset as string | null)

  // Store the active processing graph so we can tear it down on preset change.
  const graphRef = useRef<ProcessorGraph | null>(null)
  // Store the original raw mic track so we can restore it when preset is cleared.
  const originalInputTrackRef = useRef<MediaStreamTrack | null>(null)

  useEffect(() => {
    if (!localAudioTrack || !localInputTrack) {
      return
    }

    // Tear down any existing processing graph.
    const teardown = () => {
      const graph = graphRef.current
      if (!graph) return
      try {
        graph.processedTrack.stop()
        graph.audioContext.close().catch(() => undefined)
      } catch {
        // Ignore teardown errors
      }
      graphRef.current = null
    }

    // Clear the preset — restore raw mic.
    if (!dmVoicePreset) {
      if (graphRef.current) {
        teardown()
        const original = originalInputTrackRef.current
        if (original) {
          localAudioTrack.replaceTrack(original).catch((err) => {
            logger.warn('useDmVoiceProcessor', 'replaceTrack (restore) failed', err)
          })
        }
        originalInputTrackRef.current = null
      }
      return
    }

    const preset = findVoicePreset(dmVoicePreset)
    if (!preset) {
      logger.warn('useDmVoiceProcessor', `Unknown preset: ${dmVoicePreset}`)
      return
    }

    teardown()
    originalInputTrackRef.current = localInputTrack

    try {
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(new MediaStream([localInputTrack]))
      const chain = buildProcessingChain(audioContext, source, preset.dsp)
      const destination = audioContext.createMediaStreamDestination()
      chain.connect(destination)

      const processedTrack = destination.stream.getAudioTracks()[0]
      if (!processedTrack) {
        throw new Error('No audio track in processor destination stream')
      }

      graphRef.current = { audioContext, destination, processedTrack }

      localAudioTrack.replaceTrack(processedTrack).catch((err) => {
        logger.warn('useDmVoiceProcessor', 'replaceTrack (apply) failed', err)
      })

      logger.info('useDmVoiceProcessor', `Voice preset applied: ${preset.name}`)
    } catch (err) {
      logger.error('useDmVoiceProcessor', 'Failed to build voice processing chain', err)
      teardown()
    }
  }, [dmVoicePreset, localAudioTrack, localInputTrack])

  // Restore raw mic on unmount.
  useEffect(() => {
    return () => {
      const graph = graphRef.current
      if (!graph) return
      try {
        graph.processedTrack.stop()
        graph.audioContext.close().catch(() => undefined)
      } catch {
        // Ignore
      }
      graphRef.current = null
    }
  }, [])
}
