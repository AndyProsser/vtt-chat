/**
 * AudioPanel
 * Audio and LiveKit integration surface.
 *
 * Composes useLiveKit + useAudioEngine into a single mounted component so that:
 *  - Remote tracks from LiveKit are piped into the WebAudio DSP graph.
 *  - Local mic publishing is gated on explicit user action (browser permission prompt
 *    is deferred until the user clicks "Go Live").
 *  - DM overrides, environment presets, and PTT state flow from the Zustand store
 *    into the audio engine automatically (handled inside useAudioEngine).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ConnectionState } from 'livekit-client'
import { Role } from '@shared'
import { buildLiveKitConnectionKey, useLiveKit } from '../../hooks/useLiveKit'
import { useAudioEngine } from '../../hooks/useAudioEngine'
import { useStore } from '../../hooks/useStore'
import { AudioDevicePanel } from './AudioDevicePanel'
import { AudioSettingsPanel } from './AudioSettingsPanel'
import '../../styles/components/audio/AudioPanel.css'

interface AudioPanelProps {
  sessionId: string
  roomId: string
  role?: Role
}

export function AudioPanel({ sessionId, roomId, role }: AudioPanelProps) {
  const audioEngine = useAudioEngine()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [localTransmitLevel, setLocalTransmitLevel] = useState(0)

  const handleTrackSubscribed = useCallback(
    (trackSid: string, mediaStream: MediaStream) => {
      audioEngine.addTrack(`room:${trackSid}`, mediaStream)
    },
    [audioEngine]
  )

  const handleTrackUnsubscribed = useCallback(
    (trackSid: string) => {
      audioEngine.removeTrack(`room:${trackSid}`)
    },
    [audioEngine]
  )

  const handleBroadcastTrackSubscribed = useCallback(
    (trackSid: string, mediaStream: MediaStream) => {
      audioEngine.addTrack(`vog:${trackSid}`, mediaStream)
    },
    [audioEngine]
  )

  const handleBroadcastTrackUnsubscribed = useCallback(
    (trackSid: string) => {
      audioEngine.removeTrack(`vog:${trackSid}`)
    },
    [audioEngine]
  )

  const livekit = useLiveKit(sessionId, roomId, {
    onTrackSubscribed: handleTrackSubscribed,
    onTrackUnsubscribed: handleTrackUnsubscribed,
    tokenChannel: 'room',
  })

  const device = useStore((state) => state.device)
  const pttActive = useStore((state) => state.pttActive)
  const activeEffects = useStore((state) => state.activeEffects)
  const dmOverrides = useStore((state) => state.dmOverrides)
  const broadcastModeEnabled = useStore((state) => state.broadcastModeEnabled)
  const broadcastRoomIdFromState = useStore((state) => state.broadcastRoomId)
  const currentEnvironment = useStore((state) => state.currentEnvironment)
  const currentDistance = useStore((state) => state.currentDistance)
  const currentCondition = useStore((state) => state.currentCondition)
  const currentVoicePreset = useStore((state) => state.currentVoicePreset)
  const currentICPreset = useStore((state) => state.currentICPreset)
  const setDevice = useStore((state) => state.setDevice)
  const initializeAudio = useStore((state) => state.initializeAudio)
  const togglePTT = useStore((state) => state.togglePTT)
  const currentUser = useStore((state) => state.currentUser)
  const sharedLiveKitState = useStore(
    (state) => state.livekitConnections[buildLiveKitConnectionKey(sessionId, roomId, 'room')]
  )
  const effectiveRole = role ?? currentUser?.role ?? Role.PLAYER

  const broadcastRoomId = broadcastRoomIdFromState || `dm-broadcast:${sessionId}`

  const broadcastLivekit = useLiveKit(sessionId, broadcastModeEnabled ? broadcastRoomId : '', {
    onTrackSubscribed: handleBroadcastTrackSubscribed,
    onTrackUnsubscribed: handleBroadcastTrackUnsubscribed,
    tokenChannel: 'broadcast',
  })

  const {
    isConnected: isBroadcastConnected,
    publishAudio: publishBroadcastAudio,
    unpublishAudio: unpublishBroadcastAudio,
  } = broadcastLivekit

  const handleGoLive = async () => {
    initializeAudio(true)
    await livekit.publishAudio()
    if (broadcastModeEnabled && effectiveRole === Role.DM) {
      try {
        await publishBroadcastAudio()
      } catch {
        // Broadcast channel publish can trail behind room publish while secondary channel connects.
      }
    }
    setDevice({ microphoneOn: true })
  }

  const handleMute = async () => {
    await livekit.unpublishAudio()
    await unpublishBroadcastAudio().catch(() => undefined)
    setDevice({ microphoneOn: false })
  }

  useEffect(() => {
    if (effectiveRole !== Role.DM) {
      return
    }

    if (!device.microphoneOn) {
      void unpublishBroadcastAudio().catch(() => undefined)
      return
    }

    if (broadcastModeEnabled && isBroadcastConnected) {
      void publishBroadcastAudio().catch(() => undefined)
    } else {
      void unpublishBroadcastAudio().catch(() => undefined)
    }
  }, [
    effectiveRole,
    device.microphoneOn,
    broadcastModeEnabled,
    isBroadcastConnected,
    publishBroadcastAudio,
    unpublishBroadcastAudio,
  ])

  useEffect(() => {
    if (device.microphoneOn && !device.enabled) {
      initializeAudio(true)
    }
  }, [device.enabled, device.microphoneOn, initializeAudio])

  useEffect(() => {
    const localTrack = livekit.localAudioTrack
    const localInputTrack = livekit.localInputTrack
    const localPublications = Array.from(
      livekit.room?.localParticipant.audioTrackPublications?.values?.() ?? []
    )
    const publicationFallback = localPublications.find((publication) => publication.track)
    const fallbackTrack = publicationFallback?.track
    const mediaStreamTrack =
      localInputTrack ??
      localTrack?.mediaStreamTrack ??
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
        setLocalTransmitLevel(smoothed)

        rafId = window.requestAnimationFrame(sampleLevel)
      }

      rafId = window.requestAnimationFrame(sampleLevel)

      return () => {
        window.cancelAnimationFrame(rafId)
        setLocalTransmitLevel(0)
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
    livekit.localAudioTrack,
    livekit.localInputTrack,
    livekit.room,
    device.microphoneOn,
    device.selectedMicDeviceId,
    device.pttEnabled,
    pttActive,
    device.autoGainEnabled,
    device.noiseFilterLevel,
    device.micGain,
    settingsOpen,
  ])

  const livekitRoomState = String(livekit.room?.state ?? '').toLowerCase()
  const sharedConnectionState = sharedLiveKitState?.connectionState
  const canonicalConnectionState = sharedConnectionState ?? livekit.connectionState
  const canonicalIsConnected =
    (sharedLiveKitState?.isConnected ?? canonicalConnectionState === ConnectionState.Connected) ||
    livekitRoomState === 'connected'
  const canonicalIsConnecting =
    (sharedLiveKitState?.isConnecting ?? canonicalConnectionState === ConnectionState.Connecting) ||
    canonicalConnectionState === ConnectionState.Reconnecting ||
    canonicalConnectionState === ConnectionState.SignalReconnecting ||
    livekitRoomState === 'connecting' ||
    livekitRoomState === 'reconnecting'

  const statusState = canonicalIsConnected
    ? 'connected'
    : canonicalIsConnecting
      ? 'connecting'
      : 'disconnected'
  const isVoiceConnected = canonicalIsConnected
  const liveKitConnectionKey =
    sharedLiveKitState?.key ?? buildLiveKitConnectionKey(sessionId, roomId, 'room')
  const hasLocalPublication = sharedLiveKitState?.hasLocalPublication ?? false
  const liveKitError = sharedLiveKitState?.error ?? livekit.error

  useEffect(() => {
    audioEngine.setLocalGain(device.volumeLevel / 100)
  }, [audioEngine, device.volumeLevel])

  const effectItems = useMemo(() => {
    const items: Array<{ kind: string; name: string; description: string }> = []

    if (device.pttEnabled) {
      items.push({
        kind: 'ptt',
        name: 'Push to Talk',
        description: pttActive
          ? 'Mic gate is currently open while PTT is held.'
          : 'Mic stays muted until PTT is held.',
      })
    }

    if (currentEnvironment) {
      items.push({
        kind: 'environment',
        name: currentEnvironment.name,
        description: 'Applies room acoustics and reverb to match environment.',
      })
    }

    if (currentDistance) {
      items.push({
        kind: 'distance',
        name: currentDistance.name,
        description: 'Adjusts attenuation and filtering for listener distance.',
      })
    }

    if (currentCondition) {
      items.push({
        kind: 'condition',
        name: currentCondition.name,
        description: 'Adds scene condition processing to the audio chain.',
      })
    }

    if (currentVoicePreset) {
      items.push({
        kind: 'voice',
        name: currentVoicePreset.name,
        description: 'Transforms voice character (pitch/formant) for roleplay.',
      })
    }

    if (currentICPreset) {
      items.push({
        kind: 'ic',
        name: currentICPreset.name,
        description: 'Applies in-character voice coloration preset.',
      })
    }

    Object.entries(activeEffects)
      .filter(([, enabled]) => Boolean(enabled))
      .forEach(([effectId]) => {
        items.push({
          kind: 'custom',
          name: effectId,
          description: 'Custom active effect enabled in the current stack.',
        })
      })

    return items
  }, [
    activeEffects,
    currentCondition,
    currentDistance,
    currentEnvironment,
    currentICPreset,
    currentVoicePreset,
    device.pttEnabled,
    pttActive,
  ])

  const activeEffectsCount = effectItems.length
  const dmOverridesCount = dmOverrides.size
  const isTransmittingNow = device.microphoneOn && (!device.pttEnabled || pttActive)
  const transmittedMicLevel = isTransmittingNow ? localTransmitLevel : 0

  const overrideItems = useMemo(() => {
    return Array.from(dmOverrides.values()).map((override) => {
      const shortUser = override.userId.slice(0, 8)

      if (override.overrideType === 'MUTE') {
        return {
          kind: 'mute',
          name: `Mute (${shortUser})`,
          description: 'Forces the target user microphone to muted.',
        }
      }

      if (override.overrideType === 'UNMUTE') {
        return {
          kind: 'unmute',
          name: `Unmute (${shortUser})`,
          description: 'Explicitly allows the target user microphone signal.',
        }
      }

      if (override.overrideType === 'GAIN') {
        const gainValue = override.parameters?.gain
        const gainText = typeof gainValue === 'number' ? `${gainValue.toFixed(2)}x` : 'custom value'
        return {
          kind: 'gain',
          name: `Gain (${shortUser})`,
          description: `Adjusts target gain (${gainText}).`,
        }
      }

      if (override.overrideType === 'GATE') {
        return {
          kind: 'gate',
          name: `Gate (${shortUser})`,
          description: 'Applies DM gate threshold to suppress background noise.',
        }
      }

      return {
        kind: 'filter',
        name: `Filter (${shortUser})`,
        description: 'Applies a DM filter profile to the target signal.',
      }
    })
  }, [dmOverrides])

  return (
    <section className="audio-panel border-t border-ui-border bg-ui-surface-subtle text-ui-primary">
      {liveKitError && <p className="audio-panel__error">⚠ {liveKitError}</p>}

      <div className="audio-panel__footer">
        {settingsOpen && (
          <AudioSettingsPanel
            device={device}
            localMicLevel={localTransmitLevel}
            onDeviceChange={setDevice}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        <AudioDevicePanel
          device={device}
          statusState={statusState}
          isVoiceConnected={isVoiceConnected}
          liveKitConnectionKey={liveKitConnectionKey}
          hasLocalPublication={hasLocalPublication}
          isDm={effectiveRole === Role.DM}
          pttActive={pttActive}
          activeEffectsCount={activeEffectsCount}
          dmOverridesCount={dmOverridesCount}
          transmittedMicLevel={transmittedMicLevel}
          effectItems={effectItems}
          overrideItems={overrideItems}
          settingsOpen={settingsOpen}
          onGoLive={handleGoLive}
          onMute={handleMute}
          onPTTChange={togglePTT}
          onToggleSettings={() => setSettingsOpen((o) => !o)}
        />
      </div>
    </section>
  )
}
