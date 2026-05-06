import { useState } from 'react'
import { Icon } from '../ui/Icon'
import type { AudioDeviceState } from '@/types/audio'

interface AudioDetailItem {
  kind: string
  name: string
  description: string
}

interface AudioDevicePanelProps {
  device: AudioDeviceState
  statusState: 'connected' | 'connecting' | 'disconnected'
  isVoiceConnected: boolean
  isDm: boolean
  pttActive: boolean
  activeEffectsCount: number
  dmOverridesCount: number
  transmittedMicLevel: number
  effectItems: AudioDetailItem[]
  overrideItems: AudioDetailItem[]
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
  isDm,
  pttActive,
  activeEffectsCount,
  dmOverridesCount,
  transmittedMicLevel,
  effectItems,
  overrideItems,
  settingsOpen,
  onGoLive,
  onMute,
  onPTTChange,
  onToggleSettings,
}: AudioDevicePanelProps) {
  const [effectsHovered, setEffectsHovered] = useState(false)
  const [overridesHovered, setOverridesHovered] = useState(false)

  const micTitle = device.microphoneOn
    ? 'Mute microphone'
    : isVoiceConnected
      ? 'Unmute microphone'
      : 'Voice not connected'

  const isMuted = device.pttEnabled ? !pttActive : !device.microphoneOn
  const mutedLabel = isMuted ? 'Muted' : 'Live'

  const effectsOpen = effectsHovered
  const overridesOpen = overridesHovered
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

  const statusTitles = {
    connected: 'Voice connected',
    connecting: 'Voice connecting…',
    disconnected: 'Voice disconnected',
  }

  return (
    <footer className="audio-panel__controls">
      {/* Connection status indicator */}
      <span
        className="audio-panel__status-dot"
        data-state={statusState}
        title={statusTitles[statusState]}
        aria-label={statusTitles[statusState]}
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
        title={device.pttEnabled ? 'Push to talk (hold)' : micTitle}
        aria-label={device.pttEnabled ? 'Push to talk' : micTitle}
        aria-pressed={device.pttEnabled ? pttActive : undefined}
        disabled={!device.microphoneOn && !isVoiceConnected}
      >
        {device.pttEnabled ? (
          <Icon name="voice" />
        ) : (
          <Icon name={device.microphoneOn ? 'mic' : 'mic_off'} />
        )}
      </button>

      <span className="audio-panel__tx-meter" aria-label="Outgoing microphone level">
        <span
          className="audio-panel__tx-meter-fill"
          style={{ height: `${Math.round(Math.max(0, Math.min(1, transmittedMicLevel)) * 100)}%` }}
        />
      </span>

      <span className={`audio-panel__mode-pill ${isMuted ? 'is-muted' : 'is-live'}`}>
        {mutedLabel}
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
          title={`Audio effects (${activeEffectsCount} active)`}
          aria-label={`Audio effects, ${activeEffectsCount} active`}
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
          <div className="audio-panel__quick-panel" role="dialog" aria-label="Active audio effects">
            <p className="audio-panel__quick-title">Audio Effects</p>
            {effectItems.length === 0 ? (
              <p className="audio-panel__quick-empty">No active processing enabled.</p>
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

      {/* DM overrides indicator — DM only */}
      {isDm && (
        <div
          className="audio-panel__control-group"
          onMouseEnter={() => setOverridesHovered(true)}
          onMouseLeave={() => setOverridesHovered(false)}
        >
          <button
            className={`audio-panel__control audio-panel__control--icon ${dmOverridesCount > 0 ? 'is-active' : ''}`}
            title={`DM overrides (${dmOverridesCount} active)`}
            aria-label={`DM audio overrides, ${dmOverridesCount} active`}
            aria-expanded={overridesOpen}
            type="button"
          >
            <Icon name="overrides" />
            {dmOverridesCount > 0 ? (
              <span className="audio-panel__pip" aria-hidden="true">
                {dmOverridesCount}
              </span>
            ) : null}
          </button>
          {overridesOpen && (
            <div className="audio-panel__quick-panel" role="dialog" aria-label="DM audio overrides">
              <p className="audio-panel__quick-title">DM Audio Overrides</p>
              {overrideItems.length === 0 ? (
                <p className="audio-panel__quick-empty">No active DM audio overrides.</p>
              ) : (
                <ul className="audio-panel__quick-list">
                  {overrideItems.map((item) => (
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
      )}

      {/* Audio settings */}
      <button
        onClick={onToggleSettings}
        className={`audio-panel__control audio-panel__control--icon ${settingsOpen ? 'is-active' : ''}`}
        title="Audio settings"
        aria-label="Audio settings"
        aria-expanded={settingsOpen}
      >
        <Icon name="settings" />
      </button>
    </footer>
  )
}
