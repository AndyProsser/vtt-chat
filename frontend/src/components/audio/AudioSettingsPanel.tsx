import { useEffect, useState } from 'react'
import { Icon } from '../ui/Icon'
import type { AudioDeviceState } from '@/types/audio'

interface MediaDeviceOption {
  deviceId: string
  label: string
}

interface AudioSettingsPanelProps {
  device: AudioDeviceState
  localMicLevel: number
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
            label: d.label || `Microphone ${i + 1}`,
          }))
        const speakers = devices
          .filter((d) => d.kind === 'audiooutput')
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Speaker ${i + 1}`,
          }))
        setMicDevices(mics)
        setSpeakerDevices(speakers)
      })
      .catch(() => {
        /* permissions not yet granted — list stays empty */
      })
  }, [])

  return (
    <div className="audio-settings-panel" role="dialog" aria-label="Audio settings">
      <header className="audio-settings-panel__header">
        <span className="audio-settings-panel__title">Audio Settings</span>
        <button
          type="button"
          className="audio-settings-panel__close"
          onClick={onClose}
          aria-label="Close audio settings"
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
              Speaker
            </span>
            <select
              className="audio-settings-panel__select"
              value={device.selectedSpeakerDeviceId ?? 'default'}
              onChange={(e) => onDeviceChange({ selectedSpeakerDeviceId: e.target.value })}
            >
              <option value="default">System default</option>
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
              Microphone
            </span>
            <select
              className="audio-settings-panel__select"
              value={device.selectedMicDeviceId ?? 'default'}
              onChange={(e) => onDeviceChange({ selectedMicDeviceId: e.target.value })}
            >
              <option value="default">System default</option>
              {micDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          <div className="audio-settings-panel__mic-meter" aria-label="Outgoing microphone signal">
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
            <span className="audio-settings-panel__label-text">Auto Gain</span>
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
              <span className="audio-settings-panel__label-text">Sensitivity</span>
              <div className="audio-settings-panel__slider-row">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={device.micGain}
                  onChange={(e) => onDeviceChange({ micGain: Number(e.target.value) })}
                  className="audio-settings-panel__slider"
                  aria-label="Microphone sensitivity"
                />
                <span className="audio-settings-panel__slider-value">{device.micGain}</span>
              </div>
            </label>
          )}
        </section>

        {/* Push to Talk */}
        <section className="audio-settings-panel__section">
          <div className="audio-settings-panel__row">
            <span className="audio-settings-panel__label-text">Push to Talk</span>
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
            <span className="audio-settings-panel__label-text">Noise Filter</span>
          </div>
          <div
            className="audio-settings-panel__segment"
            role="group"
            aria-label="Noise filter level"
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

        {/* Master Volume */}
        <section className="audio-settings-panel__section">
          <label className="audio-settings-panel__label">
            <span className="audio-settings-panel__label-text">Master Volume</span>
            <div className="audio-settings-panel__slider-row">
              <input
                type="range"
                min={0}
                max={100}
                value={device.volumeLevel}
                onChange={(e) => onDeviceChange({ volumeLevel: Number(e.target.value) })}
                className="audio-settings-panel__slider"
                aria-label="Master volume"
              />
              <span className="audio-settings-panel__slider-value">{device.volumeLevel}</span>
            </div>
          </label>
        </section>
      </div>
    </div>
  )
}
