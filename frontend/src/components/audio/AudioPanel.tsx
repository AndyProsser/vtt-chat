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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConnectionState, RoomEvent } from 'livekit-client'
import { Role, RoomType } from '@shared'
import type { UUID } from '@shared'
import { buildLiveKitConnectionKey, useLiveKit } from '../../hooks/useLiveKit'
import { useAudioEngine } from '../../hooks/useAudioEngine'
import { useStore } from '../../hooks/useStore'
import { getUserDMOverrides } from '@/utils/audioOverrides'
import {
  AUDIO_EFFECT_COPY,
  getPushToTalkEffectDescription,
} from '../../constants/audioUi.constants'
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
  const trackParticipantByTrackIdRef = useRef(new Map<string, UUID>())
  const localSpeakingRef = useRef(false)
  const localSpeakingHoldUntilRef = useRef(0)

  const LOCAL_SPEAKING_TRIGGER_LEVEL = 0.162
  const LOCAL_SPEAKING_RELEASE_LEVEL = 0.092
  const LOCAL_SPEAKING_HOLD_MS = 320

  const handleTrackSubscribed = useCallback(
    (trackSid: string, mediaStream: MediaStream, meta: { participantIdentity: string }) => {
      const trackId = `room:${trackSid}`
      trackParticipantByTrackIdRef.current.set(trackId, meta.participantIdentity as UUID)
      audioEngine.addTrack(trackId, mediaStream)
    },
    [audioEngine]
  )

  const handleTrackUnsubscribed = useCallback(
    (trackSid: string) => {
      const trackId = `room:${trackSid}`
      trackParticipantByTrackIdRef.current.delete(trackId)
      audioEngine.removeTrack(trackId)
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
  const sessionPresenceByUser = useStore((state) => state.sessionPresence[sessionId])
  const selectedRoom = useStore((state) => state.rooms[sessionId]?.[roomId])
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
  const setLiveKitSpeakingUsers = useStore((state) => state.setLiveKitSpeakingUsers)
  const sharedLiveKitState = useStore(
    (state) => state.livekitConnections[buildLiveKitConnectionKey(sessionId, roomId, 'room')]
  )
  const effectiveRole = role ?? currentUser?.role ?? Role.PLAYER
  const isWhisperMode = selectedRoom?.type === RoomType.PRIVATE

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

    // Notify backend that user unmuted themselves
    try {
      const token = sessionStorage.getItem('authToken')
      if (token) {
        await fetch('/api/v1/audio/unmute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sessionId,
            muted: false,
          }),
        })
      }
    } catch (error) {
      // Log but don't fail the unmute action if backend call fails
      console.error('Failed to sync unmute state to backend:', error)
    }
  }

  const handleMute = async () => {
    await livekit.unpublishAudio()
    await unpublishBroadcastAudio().catch(() => undefined)
    setDevice({ microphoneOn: false })

    // Notify backend that user muted themselves
    try {
      const token = sessionStorage.getItem('authToken')
      if (token) {
        await fetch('/api/v1/audio/mute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sessionId,
            muted: true,
          }),
        })
      }
    } catch (error) {
      // Log but don't fail the mute action if backend call fails
      console.error('Failed to sync mute state to backend:', error)
    }
  }

  useEffect(() => {
    const activeRoom = livekit.room

    if (!activeRoom) {
      setLiveKitSpeakingUsers(sessionId, [])
      return
    }

    const syncActiveSpeakers = () => {
      const speakingUsers = activeRoom.activeSpeakers
        .map((participant) => participant.identity as UUID)
        .filter((identity) => Boolean(identity))

      setLiveKitSpeakingUsers(sessionId, speakingUsers)
    }

    syncActiveSpeakers()
    activeRoom.on(RoomEvent.ActiveSpeakersChanged, syncActiveSpeakers)

    return () => {
      activeRoom.off(RoomEvent.ActiveSpeakersChanged, syncActiveSpeakers)
      setLiveKitSpeakingUsers(sessionId, [])
    }
  }, [livekit.room, sessionId, setLiveKitSpeakingUsers])

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

  useEffect(() => {
    const trackEntries = Array.from(trackParticipantByTrackIdRef.current.entries())
    if (trackEntries.length === 0) {
      return
    }

    if (effectiveRole !== Role.DM) {
      for (const [trackId] of trackEntries) {
        audioEngine.setTrackMixGain(trackId, 1)
      }
      return
    }

    const configuredBackgroundGain = Math.max(0, Math.min(1, device.backgroundAudioLevel / 100))
    const effectiveBackgroundGain = isWhisperMode
      ? Math.min(0.2, configuredBackgroundGain)
      : configuredBackgroundGain

    for (const [trackId, participantUserId] of trackEntries) {
      const participantPresence = sessionPresenceByUser?.[participantUserId]
      if (!participantPresence?.primaryRoomId || !roomId) {
        audioEngine.setTrackMixGain(trackId, 1)
        continue
      }

      const isInTargetRoom = participantPresence.primaryRoomId === roomId
      audioEngine.setTrackMixGain(trackId, isInTargetRoom ? 1 : effectiveBackgroundGain)
    }
  }, [
    audioEngine,
    device.backgroundAudioLevel,
    effectiveRole,
    isWhisperMode,
    roomId,
    sessionPresenceByUser,
  ])

  const effectItems = useMemo(() => {
    const items: Array<{ kind: string; name: string; description: string }> = []
    const currentUserId = currentUser?.id as UUID | undefined
    const currentUserOverrides = currentUserId ? getUserDMOverrides(dmOverrides, currentUserId) : []

    if (device.pttEnabled) {
      items.push({
        kind: 'ptt',
        name: AUDIO_EFFECT_COPY.pushToTalkName,
        description: getPushToTalkEffectDescription(pttActive),
      })
    }

    if (currentEnvironment) {
      items.push({
        kind: 'environment',
        name: currentEnvironment.name,
        description: AUDIO_EFFECT_COPY.environmentDescription,
      })
    }

    if (currentDistance) {
      items.push({
        kind: 'distance',
        name: currentDistance.name,
        description: AUDIO_EFFECT_COPY.distanceDescription,
      })
    }

    if (currentCondition) {
      items.push({
        kind: 'condition',
        name: currentCondition.name,
        description: AUDIO_EFFECT_COPY.conditionDescription,
      })
    }

    if (currentVoicePreset) {
      items.push({
        kind: 'voice',
        name: currentVoicePreset.name,
        description: AUDIO_EFFECT_COPY.voiceDescription,
      })
    }

    if (currentICPreset) {
      items.push({
        kind: 'ic',
        name: currentICPreset.name,
        description: AUDIO_EFFECT_COPY.inCharacterDescription,
      })
    }

    Object.entries(activeEffects)
      .filter(([, enabled]) => Boolean(enabled))
      .forEach(([effectId]) => {
        items.push({
          kind: 'custom',
          name: effectId,
          description: AUDIO_EFFECT_COPY.customDescription,
        })
      })

    for (const override of currentUserOverrides) {
      if (override.overrideType === 'MUTE' || override.overrideType === 'UNMUTE') {
        continue
      }

      if (override.overrideType === 'VOICE_OF_GOD') {
        continue
      }

      const presetName =
        typeof override.parameters?.presetName === 'string' ? override.parameters.presetName : null

      const kind = override.overrideType.toLowerCase()
      const name =
        presetName ||
        (override.overrideType === 'CONDITION'
          ? 'Condition'
          : override.overrideType === 'DISTANCE'
            ? 'Distance'
            : override.overrideType === 'VOICE'
              ? 'Voice Preset'
              : override.overrideType === 'FILTER'
                ? 'Audio Filter'
                : override.overrideType === 'GAIN'
                  ? 'Volume'
                  : override.overrideType === 'GATE'
                    ? 'Voice Gate'
                    : override.overrideType)

      items.push({
        kind,
        name,
        description: 'Applied by the DM for this scene.',
      })
    }

    return items
  }, [
    activeEffects,
    currentCondition,
    currentDistance,
    currentEnvironment,
    currentICPreset,
    currentVoicePreset,
    currentUser?.id,
    dmOverrides,
    device.pttEnabled,
    pttActive,
  ])

  const activeEffectsCount = effectItems.length
  const isTransmittingNow = device.microphoneOn && (!device.pttEnabled || pttActive)
  const transmittedMicLevel = isTransmittingNow ? localTransmitLevel : 0

  useEffect(() => {
    const setSpeakingIfChanged = (nextValue: boolean) => {
      if (localSpeakingRef.current === nextValue) {
        return
      }

      localSpeakingRef.current = nextValue
      setDevice({ isSpeaking: nextValue })
    }

    if (!isTransmittingNow) {
      localSpeakingHoldUntilRef.current = 0
      setSpeakingIfChanged(false)
      return
    }

    const now = performance.now()

    // Use transmitted level with a start threshold + release hold window to avoid
    // false positives from clicks/typing and preserve natural speech gaps.
    if (transmittedMicLevel >= LOCAL_SPEAKING_TRIGGER_LEVEL) {
      localSpeakingHoldUntilRef.current = now + LOCAL_SPEAKING_HOLD_MS
      setSpeakingIfChanged(true)
      return
    }

    if (!localSpeakingRef.current) {
      return
    }

    if (transmittedMicLevel >= LOCAL_SPEAKING_RELEASE_LEVEL) {
      localSpeakingHoldUntilRef.current = now + LOCAL_SPEAKING_HOLD_MS
      return
    }

    if (now > localSpeakingHoldUntilRef.current) {
      setSpeakingIfChanged(false)
    }
  }, [isTransmittingNow, setDevice, transmittedMicLevel])

  useEffect(
    () => () => {
      localSpeakingRef.current = false
      localSpeakingHoldUntilRef.current = 0
      setDevice({ isSpeaking: false })
    },
    [setDevice]
  )

  useEffect(() => {
    if (!settingsOpen) {
      return
    }

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      if (target.closest('[data-audio-settings-panel], [data-audio-settings-trigger]')) {
        return
      }

      setSettingsOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSettingsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [settingsOpen])

  return (
    <section className="audio-panel border-t border-ui-border bg-ui-surface-subtle text-ui-primary">
      {liveKitError && <p className="audio-panel__error">⚠ {liveKitError}</p>}

      <div className="audio-panel__footer">
        {settingsOpen && (
          <AudioSettingsPanel
            device={device}
            localMicLevel={localTransmitLevel}
            isDm={effectiveRole === Role.DM}
            isWhisperMode={isWhisperMode}
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
          pttActive={pttActive}
          activeEffectsCount={activeEffectsCount}
          transmittedMicLevel={transmittedMicLevel}
          effectItems={effectItems}
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
