import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../ui/Icon'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../core-ui'
import type { AudioDeviceState } from '@/types/audio'
import {
  AUDIO_CONNECTION_STATUS_TITLES,
  AUDIO_CONTROL_COPY,
  AUDIO_SETTINGS_COPY,
  type AudioConnectionStatusState,
  getAudioModeLabel,
  getAudioQuickPanelAriaLabel,
  getAudioQuickPanelCountLabel,
  getLiveKitBadgeLabel,
  getMicrophoneControlLabel,
} from '../../../constants/audioUi.constants'

interface AudioDetailItem {
  kind: string
  name: string
  description: string
}

interface AudioDevicePanelProps {
  device: AudioDeviceState
  statusState: AudioConnectionStatusState
  isVoiceConnected: boolean
  hasLocalPublication: boolean
  pttActive: boolean
  activeEffectsCount: number
  transmittedMicLevel: number
  effectItems: AudioDetailItem[]
  settingsOpen: boolean
  onGoLive: () => void
  onMute: () => void
  onPTTChange: (active: boolean) => void
  onToggleSettings: () => void
}

export function AudioDevicePanel({
  device,
  statusState,
  isVoiceConnected,
  hasLocalPublication,
  pttActive,
  activeEffectsCount,
  transmittedMicLevel,
  effectItems,
  settingsOpen,
  onGoLive,
  onMute,
  onPTTChange,
  onToggleSettings,
}: AudioDevicePanelProps) {
  const [effectsHovered, setEffectsHovered] = useState(false)
  const txMeterFillRef = useRef<HTMLSpanElement | null>(null)
  const transmittedMicLevelPercent = Math.round(Math.max(0, Math.min(1, transmittedMicLevel)) * 100)

  useEffect(() => {
    txMeterFillRef.current?.style.setProperty(
      '--audio-tx-level-height',
      `${transmittedMicLevelPercent}%`
    )
  }, [transmittedMicLevelPercent])

  const micTitle = getMicrophoneControlLabel({
    microphoneOn: device.microphoneOn,
    isVoiceConnected,
  })

  const isMuted = device.pttEnabled ? !pttActive : !device.microphoneOn
  const mutedLabel = getAudioModeLabel(isMuted)

  const effectsOpen = effectsHovered
  const lkBadgeState =
    statusState === 'disconnected'
      ? 'disconnected'
      : statusState === 'connecting'
        ? 'connecting'
        : hasLocalPublication
          ? 'connected-publishing'
          : 'connected-idle'
  const primaryControlClass = device.pttEnabled
    ? `audio-panel__control audio-panel__control--ptt ${pttActive ? 'is-active' : ''}`
    : `audio-panel__control ${device.microphoneOn ? 'is-danger' : isVoiceConnected ? 'is-success' : ''}`

  const handlePrimaryDown = () => {
    if (device.pttEnabled) {
      if (!device.microphoneOn) {
        void onGoLive()
        return
      }
      onPTTChange(true)
      return
    }

    if (device.microphoneOn) {
      void onMute()
      return
    }

    void onGoLive()
  }

  const handlePrimaryUp = () => {
    if (device.pttEnabled) {
      onPTTChange(false)
    }
  }

  const renderItemIcon = (kind: string) => {
    if (kind === 'environment') {
      return <Icon name="rooms" className="audio-panel__detail-icon" />
    }
    if (kind === 'distance') {
      return <Icon name="signal" className="audio-panel__detail-icon" />
    }
    if (kind === 'condition') {
      return <Icon name="status" className="audio-panel__detail-icon" />
    }
    if (kind === 'custom') {
      return <Icon name="effects" className="audio-panel__detail-icon" />
    }
    if (kind === 'voice' || kind === 'ic') {
      return <Icon name="voice" className="audio-panel__detail-icon" />
    }
    if (kind === 'mute') {
      return <Icon name="mic_off" className="audio-panel__detail-icon" />
    }
    if (kind === 'unmute') {
      return <Icon name="mic" className="audio-panel__detail-icon" />
    }
    if (kind === 'gain') {
      return <Icon name="signal" className="audio-panel__detail-icon" />
    }
    if (kind === 'gate') {
      return <Icon name="timer" className="audio-panel__detail-icon" />
    }
    if (kind === 'filter') {
      return <Icon name="effects" className="audio-panel__detail-icon" />
    }
    if (kind === 'ptt') {
      return <Icon name="mic" className="audio-panel__detail-icon" />
    }
    return <Icon name="status" className="audio-panel__detail-icon" />
  }

  const liveKitBadgeLabel = getLiveKitBadgeLabel({
    statusState,
    hasLocalPublication,
  })

  return (
    <TooltipProvider delayDuration={140}>
      <footer className="audio-panel__controls">
        {/* Connection status indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="audio-panel__status-dot"
              data-state={statusState}
              aria-label={AUDIO_CONNECTION_STATUS_TITLES[statusState]}
            />
          </TooltipTrigger>
          <TooltipContent side="top">{AUDIO_CONNECTION_STATUS_TITLES[statusState]}</TooltipContent>
        </Tooltip>

        {/* Mic toggle: go live / mute / unmute */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onMouseDown={handlePrimaryDown}
              onMouseUp={handlePrimaryUp}
              onMouseLeave={handlePrimaryUp}
              onTouchStart={handlePrimaryDown}
              onTouchEnd={handlePrimaryUp}
              onKeyDown={(event) => {
                if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
                  event.preventDefault()
                  handlePrimaryDown()
                }
              }}
              onKeyUp={(event) => {
                if (event.key === ' ' || event.key === 'Enter') {
                  event.preventDefault()
                  handlePrimaryUp()
                }
              }}
              onBlur={handlePrimaryUp}
              className={primaryControlClass}
              aria-label={device.pttEnabled ? AUDIO_CONTROL_COPY.pushToTalk : micTitle}
              aria-pressed={device.pttEnabled ? pttActive : undefined}
              disabled={!device.microphoneOn && !isVoiceConnected}
            >
              {device.pttEnabled ? (
                <Icon name="voice" />
              ) : (
                <Icon name={device.microphoneOn ? 'mic' : 'mic_off'} />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {device.pttEnabled ? AUDIO_CONTROL_COPY.pushToTalkHold : micTitle}
          </TooltipContent>
        </Tooltip>

        <span
          className="audio-panel__tx-meter"
          aria-label={AUDIO_SETTINGS_COPY.outgoingMicrophoneLevel}
        >
          <span ref={txMeterFillRef} className="audio-panel__tx-meter-fill" />
        </span>

        <span className={`audio-panel__mode-pill ${isMuted ? 'is-muted' : 'is-live'}`}>
          {mutedLabel}
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="audio-panel__mode-pill-badge"
                data-state={lkBadgeState}
                aria-label={liveKitBadgeLabel}
              />
            </TooltipTrigger>
            <TooltipContent side="top">{liveKitBadgeLabel}</TooltipContent>
          </Tooltip>
        </span>

        {/* Spacer pushes right-side controls to the edge */}
        <span className="audio-panel__controls-spacer" aria-hidden="true" />

        {/* Effects indicator */}
        <div
          className="audio-panel__control-group"
          onMouseEnter={() => setEffectsHovered(true)}
          onMouseLeave={() => setEffectsHovered(false)}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`audio-panel__control audio-panel__control--icon ${activeEffectsCount > 0 ? 'is-active' : ''}`}
                aria-label={getAudioQuickPanelAriaLabel(activeEffectsCount)}
                aria-expanded={effectsOpen}
                type="button"
              >
                <Icon name="effects" />
                {activeEffectsCount > 0 ? (
                  <span className="audio-panel__pip" aria-hidden="true">
                    {activeEffectsCount}
                  </span>
                ) : null}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {getAudioQuickPanelCountLabel(activeEffectsCount)}
            </TooltipContent>
          </Tooltip>
          {effectsOpen && (
            <div
              className="audio-panel__quick-panel"
              role="dialog"
              aria-label={AUDIO_CONTROL_COPY.activeAudioEffects}
            >
              <p className="audio-panel__quick-title">{AUDIO_CONTROL_COPY.audioEffects}</p>
              {effectItems.length === 0 ? (
                <p className="audio-panel__quick-empty">{AUDIO_CONTROL_COPY.noActiveProcessing}</p>
              ) : (
                <ul className="audio-panel__quick-list">
                  {effectItems.map((item) => (
                    <li key={`${item.kind}-${item.name}`} className="audio-panel__quick-item">
                      {renderItemIcon(item.kind)}
                      <span className="audio-panel__quick-main">
                        <span className="audio-panel__quick-name">{item.name}</span>
                        <span className="audio-panel__quick-desc">{item.description}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Audio settings */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleSettings}
              className={`audio-panel__control audio-panel__control--icon ${settingsOpen ? 'is-active' : ''}`}
              aria-label={AUDIO_CONTROL_COPY.audioSettings}
              aria-expanded={settingsOpen}
              data-audio-settings-trigger="true"
            >
              <Icon name="settings" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{AUDIO_CONTROL_COPY.audioSettings}</TooltipContent>
        </Tooltip>
      </footer>
    </TooltipProvider>
  )
}
