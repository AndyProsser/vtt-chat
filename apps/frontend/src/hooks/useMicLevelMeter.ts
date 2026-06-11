import { useEffect, useRef } from 'react'
import type { Room } from 'livekit-client'
import type { UUID } from '@shared'
import type { AudioDeviceState } from '@/types/audio'

interface UseMicLevelMeterParams {
  localAudioTrack: { mediaStreamTrack?: MediaStreamTrack } | null | undefined
  localInputTrack: MediaStreamTrack | null | undefined
  room: Room | null | undefined
  roomId: UUID
  device: Pick<
    AudioDeviceState,
    | 'microphoneOn'
    | 'selectedMicDeviceId'
    | 'pttEnabled'
    | 'autoGainEnabled'
    | 'noiseFilterLevel'
    | 'micGain'
  >
  pttActive: boolean
  settingsOpen: boolean
}

/**
 * Sets up a Web Audio analyser loop that writes mic transmit level into a ref
 * at RAF rate. The ref is intentionally NOT React state — callers must not use
 * it as a render dependency (use it only as a read-only data source for
 * non-React consumers like MicLevelMeter canvas).
 */
export function useMicLevelMeter({
  localAudioTrack,
  localInputTrack,
  room,
  roomId,
  device,
  pttActive,
  settingsOpen,
}: UseMicLevelMeterParams) {
  const localTransmitLevelRef = useRef(0)

  useEffect(() => {
    const localPublications = Array.from(
      room?.localParticipant.audioTrackPublications?.values?.() ?? []
    )
    const publicationFallback = localPublications.find((pub) => pub.track)
    const fallbackTrack = publicationFallback?.track
    const mediaStreamTrack =
      localInputTrack ??
      localAudioTrack?.mediaStreamTrack ??
      (fallbackTrack && 'mediaStreamTrack' in fallbackTrack
        ? (fallbackTrack.mediaStreamTrack as MediaStreamTrack)
        : undefined)

    const startMeterFromTrack = (track: MediaStreamTrack) => {
      const audioContext = new (
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      )()
      const source = audioContext.createMediaStreamSource(new MediaStream([track]))
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.78
      source.connect(analyser)
      void audioContext.resume().catch(() => undefined)

      const waveform = new Uint8Array(analyser.fftSize)
      const spectrum = new Uint8Array(analyser.frequencyBinCount)
      let rafId = 0
      let smoothed = 0

      const sampleLevel = () => {
        analyser.getByteTimeDomainData(waveform)
        analyser.getByteFrequencyData(spectrum)

        let sumSquares = 0
        for (let i = 0; i < waveform.length; i += 1) {
          const normalized = (waveform[i] - 128) / 128
          sumSquares += normalized * normalized
        }

        let peakBand = 0
        for (let i = 0; i < spectrum.length; i += 1) {
          if (spectrum[i] > peakBand) peakBand = spectrum[i]
        }

        const rms = Math.sqrt(sumSquares / waveform.length)
        const spectral = peakBand / 255
        const spectralAssist = rms > 0.02 ? spectral * 0.2 : 0
        const combined = rms * 6.4 + spectralAssist
        const noiseFloor =
          device.noiseFilterLevel === 'high'
            ? 0.09
            : device.noiseFilterLevel === 'medium'
              ? 0.065
              : device.noiseFilterLevel === 'low'
                ? 0.03
                : 0.055
        const autoGainBias = device.autoGainEnabled ? 0.01 : 0
        const adjustedFloor = Math.min(0.2, noiseFloor + autoGainBias)
        const calibrated = Math.max(
          0,
          Math.min(1, (combined - adjustedFloor) / (1 - adjustedFloor))
        )
        smoothed = smoothed * 0.65 + calibrated * 0.35
        localTransmitLevelRef.current = smoothed
        rafId = window.requestAnimationFrame(sampleLevel)
      }

      rafId = window.requestAnimationFrame(sampleLevel)

      return () => {
        window.cancelAnimationFrame(rafId)
        localTransmitLevelRef.current = 0
        source.disconnect()
        analyser.disconnect()
        void audioContext.close()
      }
    }

    if (!mediaStreamTrack) {
      const shouldPreviewWhileMuted = settingsOpen && !device.microphoneOn
      if (device.microphoneOn || shouldPreviewWhileMuted) {
        let cancelled = false
        let cleanupMeter: () => void = () => {}
        let fallbackStream: MediaStream | null = null

        void navigator.mediaDevices
          .getUserMedia({
            audio: {
              deviceId:
                device.selectedMicDeviceId && device.selectedMicDeviceId !== 'default'
                  ? { exact: device.selectedMicDeviceId }
                  : undefined,
              channelCount: 1,
              echoCancellation: device.noiseFilterLevel !== 'low',
              noiseSuppression: device.noiseFilterLevel !== 'low',
              autoGainControl: device.autoGainEnabled,
            },
          })
          .then((stream) => {
            if (cancelled) {
              stream.getTracks().forEach((track) => track.stop())
              return
            }
            fallbackStream = stream
            const fallbackInputTrack = stream.getAudioTracks()[0]
            cleanupMeter = startMeterFromTrack(fallbackInputTrack)
          })
          .catch(() => {
            // Ignore capture failures; meter remains at zero.
          })

        return () => {
          cancelled = true
          cleanupMeter()
          fallbackStream?.getTracks().forEach((track) => track.stop())
        }
      }
      return
    }

    return startMeterFromTrack(mediaStreamTrack)
  }, [
    localAudioTrack,
    localInputTrack,
    room,
    roomId,
    device.microphoneOn,
    device.selectedMicDeviceId,
    device.pttEnabled,
    pttActive,
    device.autoGainEnabled,
    device.noiseFilterLevel,
    device.micGain,
    settingsOpen,
  ])

  return { localTransmitLevelRef }
}
