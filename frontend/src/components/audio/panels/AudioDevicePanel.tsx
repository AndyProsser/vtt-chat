import { useState } from 'react'
import { Icon } from '../../ui/Icon'
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
  liveKitConnectionKey: string
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
  liveKitConnectionKey,
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
    liveKitConnectionKey,
  })

  return (
    <footer className="audio-panel__controls">
      {/* Connection status indicator */}
      <span
        className="audio-panel__status-dot"
        data-state={statusState}
        title={AUDIO_CONNECTION_STATUS_TITLES[statusState]}
        aria-label={AUDIO_CONNECTION_STATUS_TITLES[statusState]}
      />

      {/* Mic toggle: go live / mute / unmute */}
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
        title={device.pttEnabled ? AUDIO_CONTROL_COPY.pushToTalkHold : micTitle}
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

      <span
        className="audio-panel__tx-meter"
        aria-label={AUDIO_SETTINGS_COPY.outgoingMicrophoneLevel}
      >
        <span
          className="audio-panel__tx-meter-fill"
          style={{ height: `${Math.round(Math.max(0, Math.min(1, transmittedMicLevel)) * 100)}%` }}
        />
      </span>

      <span className={`audio-panel__mode-pill ${isMuted ? 'is-muted' : 'is-live'}`}>
        {mutedLabel}
        <span
          className="audio-panel__mode-pill-badge"
          data-state={lkBadgeState}
          title={liveKitBadgeLabel}
          aria-label={liveKitBadgeLabel}
        />
      </span>

      {/* Spacer pushes right-side controls to the edge */}
      <span className="audio-panel__controls-spacer" aria-hidden="true" />

      {/* Effects indicator */}
      <div
        className="audio-panel__control-group"
        onMouseEnter={() => setEffectsHovered(true)}
        onMouseLeave={() => setEffectsHovered(false)}
      >
        <button
          className={`audio-panel__control audio-panel__control--icon ${activeEffectsCount > 0 ? 'is-active' : ''}`}
          title={getAudioQuickPanelCountLabel(activeEffectsCount)}
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
      <button
        onClick={onToggleSettings}
        className={`audio-panel__control audio-panel__control--icon ${settingsOpen ? 'is-active' : ''}`}
        title={AUDIO_CONTROL_COPY.audioSettings}
        aria-label={AUDIO_CONTROL_COPY.audioSettings}
        aria-expanded={settingsOpen}
        data-audio-settings-trigger="true"
      >
        <Icon name="settings" />
      </button>
    </footer>
  )
}
