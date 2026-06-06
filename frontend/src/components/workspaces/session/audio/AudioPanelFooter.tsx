import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ConnectionState } from 'livekit-client'
import { Role, RoomType, type UUID } from '@shared'
import { useStore } from '@/hooks/useStore'
import { buildLiveKitConnectionKey } from '@/hooks/useLiveKit'
import { getUserDMOverrides } from '@/utils/audioOverrides'
import { AUDIO_EFFECT_COPY, getPushToTalkEffectDescription } from '@/constants/audioUi.constants'
import { AUDIO_TRANSITION_CONTROL_STICKY_MS } from '@/constants/audioPanel.constants'
import { AudioDevicePanel } from './panels/AudioDevicePanel'
import type { AudioDetailItem } from './panels/AudioDevicePanel'
import { AudioSettingsPanel } from './panels/AudioSettingsPanel'

type AudioPanelFooterProps = {
  sessionId: UUID
  roomId: UUID
  role?: Role
  settingsOpen: boolean
  localTransmitLevelRef: RefObject<number>
  livekitConnectionState: ConnectionState
  livekitRoomState: string
  livekitError: string | null
  hasLocalPublicationFallback: boolean
  onGoLive: () => void
  onMute: () => void
  onCloseSettings: () => void
  onToggleSettings: () => void
}

/**
 * Owns render-only audio footer state so the parent AudioPanel can stay focused on transport
 * effects while connection chrome, effect badges, and settings controls subscribe locally.
 */
export function AudioPanelFooter({
  sessionId,
  roomId,
  role,
  settingsOpen,
  localTransmitLevelRef,
  livekitConnectionState,
  livekitRoomState,
  livekitError,
  hasLocalPublicationFallback,
  onGoLive,
  onMute,
  onCloseSettings,
  onToggleSettings,
}: AudioPanelFooterProps) {
  const controlConnectionStickyUntilRef = useRef(0)
  const [controlIsVoiceConnected, setControlIsVoiceConnected] = useState(false)
  const device = useStore((state) => state.device)
  const pttActive = useStore((state) => state.pttActive)
  const selectedRoomType = useStore((state) => state.rooms[sessionId]?.[roomId]?.type)
  const activeEffects = useStore((state) => state.activeEffects)
  const dmOverrides = useStore((state) => state.dmOverrides)
  const currentEnvironment = useStore((state) => state.currentEnvironment)
  const currentDistance = useStore((state) => state.currentDistance)
  const currentCondition = useStore((state) => state.currentCondition)
  const currentVoicePreset = useStore((state) => state.currentVoicePreset)
  const currentICPreset = useStore((state) => state.currentICPreset)
  const currentUserId = useStore((state) => state.currentUser?.id as UUID | undefined)
  const currentUserRole = useStore((state) => state.currentUser?.role)
  const setDevice = useStore((state) => state.setDevice)
  const togglePTT = useStore((state) => state.togglePTT)
  const sharedLiveKitState = useStore(
    (state) => state.livekitConnections[buildLiveKitConnectionKey(sessionId, roomId, 'room')]
  )

  const effectiveRole = role ?? currentUserRole ?? Role.PLAYER
  const isWhisperMode = selectedRoomType === RoomType.PRIVATE
  const sharedConnectionState = sharedLiveKitState?.connectionState
  const canonicalConnectionState = sharedConnectionState ?? livekitConnectionState
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
  const hasLocalPublication = sharedLiveKitState?.hasLocalPublication ?? hasLocalPublicationFallback
  const effectiveLiveKitError = sharedLiveKitState?.error ?? livekitError

  useEffect(() => {
    if (canonicalIsConnected) {
      controlConnectionStickyUntilRef.current = 0
      setControlIsVoiceConnected(true)
      return
    }

    if (canonicalIsConnecting && controlIsVoiceConnected) {
      if (controlConnectionStickyUntilRef.current === 0) {
        controlConnectionStickyUntilRef.current = Date.now() + AUDIO_TRANSITION_CONTROL_STICKY_MS
      }

      const remainingMs = controlConnectionStickyUntilRef.current - Date.now()
      if (remainingMs > 0) {
        const timeoutId = window.setTimeout(() => {
          setControlIsVoiceConnected(false)
          controlConnectionStickyUntilRef.current = 0
        }, remainingMs)

        return () => {
          window.clearTimeout(timeoutId)
        }
      }

      setControlIsVoiceConnected(false)
      controlConnectionStickyUntilRef.current = 0
      return
    }

    setControlIsVoiceConnected(false)
    controlConnectionStickyUntilRef.current = 0
  }, [canonicalIsConnected, canonicalIsConnecting, controlIsVoiceConnected])

  const effectItems = useMemo(() => {
    const items: AudioDetailItem[] = []
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

    // CONDITION is the primary narrative effect — highlighted above other items.
    if (currentCondition) {
      items.push({
        kind: 'condition',
        name: currentCondition.name,
        description: AUDIO_EFFECT_COPY.conditionDescription,
        isPrimary: true,
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
      // Skip types already represented by dedicated slots above.
      if (
        override.overrideType === 'MUTE' ||
        override.overrideType === 'UNMUTE' ||
        override.overrideType === 'VOICE_OF_GOD' ||
        override.overrideType === 'CONDITION' ||
        override.overrideType === 'DISTANCE'
      ) {
        continue
      }

      const presetName =
        typeof override.parameters?.presetName === 'string' ? override.parameters.presetName : null

      items.push({
        kind: override.overrideType.toLowerCase(),
        name:
          presetName ||
          (override.overrideType === 'VOICE'
            ? 'Voice Preset'
            : override.overrideType === 'FILTER'
              ? 'Audio Filter'
              : override.overrideType === 'GAIN'
                ? 'Volume'
                : override.overrideType === 'GATE'
                  ? 'Voice Gate'
                  : override.overrideType),
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
    currentUserId,
    currentVoicePreset,
    device.pttEnabled,
    dmOverrides,
    pttActive,
  ])

  return (
    <>
      {effectiveLiveKitError ? (
        <p className="session-audio-panel__error">⚠ {effectiveLiveKitError}</p>
      ) : null}

      <div className="session-audio-panel__footer">
        {settingsOpen ? (
          <AudioSettingsPanel
            device={device}
            localMicLevelRef={localTransmitLevelRef}
            isDm={effectiveRole === Role.DM}
            isWhisperMode={isWhisperMode}
            onDeviceChange={setDevice}
            onClose={onCloseSettings}
          />
        ) : null}
        <AudioDevicePanel
          device={device}
          statusState={statusState}
          isVoiceConnected={controlIsVoiceConnected}
          hasLocalPublication={hasLocalPublication}
          pttActive={pttActive}
          activeEffectsCount={effectItems.length}
          transmittedMicLevelRef={localTransmitLevelRef}
          effectItems={effectItems}
          settingsOpen={settingsOpen}
          sessionId={sessionId}
          userId={currentUserId || ('unknown' as UUID)}
          onGoLive={onGoLive}
          onMute={onMute}
          onPTTChange={togglePTT}
          onToggleSettings={onToggleSettings}
        />
      </div>
    </>
  )
}
