import { useEffect, useState } from 'react'
import { Icon } from '../../ui/Icon'
import type { AudioDeviceState } from '@/types/audio'
import {
  AUDIO_CONTROL_COPY,
  AUDIO_SETTINGS_COPY,
  getFallbackAudioDeviceLabel,
} from '../../../constants/audioUi.constants'

interface MediaDeviceOption {
  deviceId: string
  label: string
}

interface AudioSettingsPanelProps {
  device: AudioDeviceState
  localMicLevel: number
  isDm: boolean
  isWhisperMode: boolean
  onDeviceChange: (updates: Partial<AudioDeviceState>) => void
  onClose: () => void
}

const NOISE_OPTIONS: Array<{ value: AudioDeviceState['noiseFilterLevel']; label: string }> = [
  { value: 'auto', label: 'AUTO' },
  { value: 'low', label: 'LOW' },
  { value: 'medium', label: 'MED' },
  { value: 'high', label: 'HIGH' },
]

export function AudioSettingsPanel({
  device,
  localMicLevel,
  isDm,
  isWhisperMode,
  onDeviceChange,
  onClose,
}: AudioSettingsPanelProps) {
  const [micDevices, setMicDevices] = useState<MediaDeviceOption[]>([])
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceOption[]>([])

  useEffect(() => {
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        const mics = devices
          .filter((d) => d.kind === 'audioinput')
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || getFallbackAudioDeviceLabel('microphone', i),
          }))
        const speakers = devices
          .filter((d) => d.kind === 'audiooutput')
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || getFallbackAudioDeviceLabel('speaker', i),
          }))
        setMicDevices(mics)
        setSpeakerDevices(speakers)
      })
      .catch(() => {
        /* permissions not yet granted — list stays empty */
      })
  }, [])

  return (
    <div
      className="audio-settings-panel"
      role="dialog"
      aria-label={AUDIO_SETTINGS_COPY.title}
      data-audio-settings-panel="true"
    >
      <header className="audio-settings-panel__header">
        <span className="audio-settings-panel__title">{AUDIO_SETTINGS_COPY.title}</span>
        <button
          type="button"
          className="audio-settings-panel__close"
          onClick={onClose}
          aria-label={AUDIO_SETTINGS_COPY.close}
        >
          <Icon name="close" />
        </button>
      </header>

      <div className="audio-settings-panel__body">
        {/* Device Selection */}
        <section className="audio-settings-panel__section">
          <label className="audio-settings-panel__label">
            <span className="audio-settings-panel__label-text">
              <Icon name="signal" className="audio-settings-panel__label-icon" />
              {AUDIO_SETTINGS_COPY.speaker}
            </span>
            <select
              className="audio-settings-panel__select"
              value={device.selectedSpeakerDeviceId ?? 'default'}
              onChange={(e) => onDeviceChange({ selectedSpeakerDeviceId: e.target.value })}
            >
              <option value="default">{AUDIO_SETTINGS_COPY.systemDefault}</option>
              {speakerDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          <label className="audio-settings-panel__label">
            <span className="audio-settings-panel__label-text">
              <Icon name="mic" className="audio-settings-panel__label-icon" />
              {AUDIO_SETTINGS_COPY.microphone}
            </span>
            <select
              className="audio-settings-panel__select"
              value={device.selectedMicDeviceId ?? 'default'}
              onChange={(e) => onDeviceChange({ selectedMicDeviceId: e.target.value })}
            >
              <option value="default">{AUDIO_SETTINGS_COPY.systemDefault}</option>
              {micDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          <div
            className="audio-settings-panel__mic-meter"
            aria-label={AUDIO_SETTINGS_COPY.outgoingMicrophoneSignal}
          >
            <span
              className="audio-settings-panel__mic-meter-fill"
              style={{
                width: `${Math.round(Math.max(0, Math.min(1, localMicLevel)) * 100)}%`,
              }}
            />
          </div>
        </section>

        {/* Gain / Sensitivity */}
        <section className="audio-settings-panel__section">
          <div className="audio-settings-panel__row">
            <span className="audio-settings-panel__label-text">{AUDIO_SETTINGS_COPY.autoGain}</span>
            <button
              type="button"
              role="switch"
              aria-checked={device.autoGainEnabled}
              onClick={() => onDeviceChange({ autoGainEnabled: !device.autoGainEnabled })}
              className={`audio-settings-panel__toggle ${device.autoGainEnabled ? 'is-on' : ''}`}
            >
              {device.autoGainEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {!device.autoGainEnabled && (
            <label className="audio-settings-panel__label">
              <span className="audio-settings-panel__label-text">
                {AUDIO_SETTINGS_COPY.sensitivity}
              </span>
              <div className="audio-settings-panel__slider-row">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={device.micGain}
                  onChange={(e) => onDeviceChange({ micGain: Number(e.target.value) })}
                  className="audio-settings-panel__slider"
                  aria-label={AUDIO_SETTINGS_COPY.microphoneSensitivity}
                />
                <span className="audio-settings-panel__slider-value">{device.micGain}</span>
              </div>
            </label>
          )}
        </section>

        {/* Push to Talk */}
        <section className="audio-settings-panel__section">
          <div className="audio-settings-panel__row">
            <span className="audio-settings-panel__label-text">
              {AUDIO_CONTROL_COPY.pushToTalk}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={device.pttEnabled}
              onClick={() => onDeviceChange({ pttEnabled: !device.pttEnabled })}
              className={`audio-settings-panel__toggle ${device.pttEnabled ? 'is-on' : ''}`}
            >
              {device.pttEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </section>

        {/* Noise Filter */}
        <section className="audio-settings-panel__section">
          <div className="audio-settings-panel__row">
            <span className="audio-settings-panel__label-text">
              {AUDIO_SETTINGS_COPY.noiseFilter}
            </span>
          </div>
          <div
            className="audio-settings-panel__segment"
            role="group"
            aria-label={AUDIO_SETTINGS_COPY.noiseFilterLevel}
          >
            {NOISE_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => onDeviceChange({ noiseFilterLevel: value })}
                className={`audio-settings-panel__segment-btn ${device.noiseFilterLevel === value ? 'is-active' : ''}`}
                aria-pressed={device.noiseFilterLevel === value}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* DM Background Audio Level */}
        {isDm ? (
          <section className="audio-settings-panel__section">
            <label className="audio-settings-panel__label">
              <span className="audio-settings-panel__label-text">
                {AUDIO_SETTINGS_COPY.backgroundAudioLevel}
              </span>
              <div className="audio-settings-panel__slider-row">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={device.backgroundAudioLevel}
                  onChange={(e) => onDeviceChange({ backgroundAudioLevel: Number(e.target.value) })}
                  className="audio-settings-panel__slider"
                  aria-label={AUDIO_SETTINGS_COPY.backgroundAudioLevelAria}
                />
                <span className="audio-settings-panel__slider-value">
                  {device.backgroundAudioLevel}
                </span>
              </div>
              {isWhisperMode ? (
                <span className="audio-settings-panel__hint">
                  {AUDIO_SETTINGS_COPY.backgroundAudioLevelWhisperHint}
                </span>
              ) : null}
            </label>
          </section>
        ) : null}

        {/* Master Volume */}
        <section className="audio-settings-panel__section">
          <label className="audio-settings-panel__label">
            <span className="audio-settings-panel__label-text">
              {AUDIO_SETTINGS_COPY.masterVolume}
            </span>
            <div className="audio-settings-panel__slider-row">
              <input
                type="range"
                min={0}
                max={100}
                value={device.volumeLevel}
                onChange={(e) => onDeviceChange({ volumeLevel: Number(e.target.value) })}
                className="audio-settings-panel__slider"
                aria-label={AUDIO_SETTINGS_COPY.masterVolumeAria}
              />
              <span className="audio-settings-panel__slider-value">{device.volumeLevel}</span>
            </div>
          </label>
        </section>
      </div>
    </div>
  )
}
