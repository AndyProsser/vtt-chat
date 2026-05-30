import type { RefObject } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import type { UUID } from '@shared'
import type { AudioDeviceState } from '@/types/audio'
import { ConnectionStatusIndicator } from '../indicators/ConnectionStatusIndicator'
import { ModeStatusPill } from '../indicators/ModeStatusPill'
import { MicLevelMeter } from '../indicators/MicLevelMeter'
import {
  AUDIO_CONTROL_COPY,
  AUDIO_SETTINGS_COPY,
  type AudioConnectionStatusState,
  getAudioQuickPanelAriaLabel,
  getAudioQuickPanelCountLabel,
  getMicrophoneControlLabel,
} from '@/constants/audioUi.constants'

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
  /**
   * Ref holding the live 0..1 mic transmit level. Read imperatively at ~60Hz
   * by the MicLevelMeter leaf so this panel does NOT re-render at audio frame
   * rate (the previous number prop drove 900+ renders per soak window and
   * caused the unmute-induced CPU/memory spike).
   */
  transmittedMicLevelRef: RefObject<number>
  effectItems: AudioDetailItem[]
  settingsOpen: boolean
  sessionId: UUID
  userId: UUID
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
  transmittedMicLevelRef,
  effectItems,
  settingsOpen,
  sessionId,
  userId,
  onGoLive,
  onMute,
  onPTTChange,
  onToggleSettings,
}: AudioDevicePanelProps) {
  const micTitle = getMicrophoneControlLabel({
    microphoneOn: device.microphoneOn,
    isVoiceConnected,
  })

  const primaryControlClass = device.pttEnabled
    ? `session-audio-device-panel__control session-audio-device-panel__control--ptt ${pttActive ? 'is-active' : ''}`
    : `session-audio-device-panel__control ${device.microphoneOn ? 'is-danger' : isVoiceConnected ? 'is-success' : ''}`

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
      return <Icon name="rooms" className="session-audio-device-panel__detail-icon" />
    }
    if (kind === 'distance') {
      return <Icon name="signal" className="session-audio-device-panel__detail-icon" />
    }
    if (kind === 'condition') {
      return <Icon name="status" className="session-audio-device-panel__detail-icon" />
    }
    if (kind === 'custom') {
      return <Icon name="effects" className="session-audio-device-panel__detail-icon" />
    }
    if (kind === 'voice' || kind === 'ic') {
      return <Icon name="voice" className="session-audio-device-panel__detail-icon" />
    }
    if (kind === 'mute') {
      return <Icon name="mic_off" className="session-audio-device-panel__detail-icon" />
    }
    if (kind === 'unmute') {
      return <Icon name="mic" className="session-audio-device-panel__detail-icon" />
    }
    if (kind === 'gain') {
      return <Icon name="signal" className="session-audio-device-panel__detail-icon" />
    }
    if (kind === 'gate') {
      return <Icon name="timer" className="session-audio-device-panel__detail-icon" />
    }
    if (kind === 'filter') {
      return <Icon name="effects" className="session-audio-device-panel__detail-icon" />
    }
    if (kind === 'ptt') {
      return <Icon name="mic" className="session-audio-device-panel__detail-icon" />
    }
    return <Icon name="status" className="session-audio-device-panel__detail-icon" />
  }

  return (
    <TooltipProvider delayDuration={140}>
      <footer className="session-audio-device-panel__controls">
        {/* Connection status indicator — leaf component prevents parent re-render on status changes */}
        <ConnectionStatusIndicator statusState={statusState} />

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

        <MicLevelMeter
          levelRef={transmittedMicLevelRef}
          wrapperClassName="session-audio-device-panel__tx-meter"
          fillClassName="session-audio-device-panel__tx-meter-fill"
          cssVariable="--audio-tx-level-height"
          ariaLabel={AUDIO_SETTINGS_COPY.outgoingMicrophoneLevel}
        />

        {/* Mode status pill — leaf component subscribed only to mute state */}
        <div className="session-audio-device-panel__mode-pill-wrapper">
          <ModeStatusPill sessionId={sessionId} userId={userId} />
        </div>

        {/* Spacer pushes right-side controls to the edge */}
        <span className="session-audio-device-panel__controls-spacer" aria-hidden="true" />

        {/* Effects indicator */}
        <div className="session-audio-device-panel__control-group">
          <button
            className={`session-audio-device-panel__control session-audio-device-panel__control--icon ${activeEffectsCount > 0 ? 'is-active' : ''}`}
            aria-label={getAudioQuickPanelAriaLabel(activeEffectsCount)}
            aria-haspopup="dialog"
            type="button"
          >
            <Icon name="effects" />
            {activeEffectsCount > 0 ? (
              <span className="session-audio-device-panel__pip" aria-hidden="true">
                {activeEffectsCount}
              </span>
            ) : null}
          </button>
          <div
            className="session-audio-device-panel__quick-panel"
            role="dialog"
            aria-label={AUDIO_CONTROL_COPY.activeAudioEffects}
          >
            <p className="session-audio-device-panel__quick-title">
              {AUDIO_CONTROL_COPY.audioEffects}
            </p>
            {effectItems.length === 0 ? (
              <p className="session-audio-device-panel__quick-empty">
                {AUDIO_CONTROL_COPY.noActiveProcessing}
              </p>
            ) : (
              <ul className="session-audio-device-panel__quick-list">
                {effectItems.map((item) => (
                  <li
                    key={`${item.kind}-${item.name}`}
                    className="session-audio-device-panel__quick-item"
                  >
                    {renderItemIcon(item.kind)}
                    <span className="session-audio-device-panel__quick-main">
                      <span className="session-audio-device-panel__quick-name">{item.name}</span>
                      <span className="session-audio-device-panel__quick-desc">
                        {item.description}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Audio settings */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleSettings}
              className={`session-audio-device-panel__control session-audio-device-panel__control--icon ${settingsOpen ? 'is-active' : ''}`}
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
