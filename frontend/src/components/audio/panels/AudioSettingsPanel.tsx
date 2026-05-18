import { useEffect, useRef, useState } from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Icon } from '../../ui/Icon'
import { Slider } from '../../../core-ui'
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
  /** Called whenever any device select opens or closes. Used by the parent to
   * suppress the outside-click close handler while Radix disables pointer-events
   * on the body (which would otherwise cause panel-body clicks to mis-fire close). */
  onAnySelectOpen?: (open: boolean) => void
}

const NOISE_OPTIONS: Array<{ value: AudioDeviceState['noiseFilterLevel']; label: string }> = [
  { value: 'auto', label: 'AUTO' },
  { value: 'low', label: 'LOW' },
  { value: 'medium', label: 'MED' },
  { value: 'high', label: 'HIGH' },
]

function normalizeSelectValue(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return 'default'
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : 'default'
}

export function AudioSettingsPanel({
  device,
  localMicLevel,
  isDm,
  isWhisperMode,
  onDeviceChange,
  onClose,
  onAnySelectOpen,
}: AudioSettingsPanelProps) {
  const [micDevices, setMicDevices] = useState<MediaDeviceOption[]>([])
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceOption[]>([])
  const [speakerOpen, setSpeakerOpen] = useState(false)
  const [micOpen, setMicOpen] = useState(false)

  useEffect(() => {
    onAnySelectOpen?.(speakerOpen || micOpen)
  }, [speakerOpen, micOpen, onAnySelectOpen])
  const micMeterFillRef = useRef<HTMLSpanElement | null>(null)
  const localMicLevelPercent = Math.round(Math.max(0, Math.min(1, localMicLevel)) * 100)

  useEffect(() => {
    micMeterFillRef.current?.style.setProperty(
      '--audio-mic-level-width',
      `${localMicLevelPercent}%`
    )
  }, [localMicLevelPercent])

  useEffect(() => {
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        const mics = devices
          .filter((d) => d.kind === 'audioinput' && d.deviceId.trim().length > 0)
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || getFallbackAudioDeviceLabel('microphone', i),
          }))
        const speakers = devices
          .filter((d) => d.kind === 'audiooutput' && d.deviceId.trim().length > 0)
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
      onMouseDown={(e) => e.stopPropagation()}
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
            <SelectPrimitive.Root
              value={normalizeSelectValue(device.selectedSpeakerDeviceId)}
              onValueChange={(nextValue) => onDeviceChange({ selectedSpeakerDeviceId: nextValue })}
              onOpenChange={setSpeakerOpen}
            >
              <SelectPrimitive.Trigger className="audio-settings-panel__select-trigger">
                <SelectPrimitive.Value />
                <SelectPrimitive.Icon className="audio-settings-panel__select-icon">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    arrow_drop_down
                  </span>
                </SelectPrimitive.Icon>
              </SelectPrimitive.Trigger>
              <SelectPrimitive.Portal>
                <SelectPrimitive.Content
                  className="audio-settings-panel__select-content"
                  data-audio-settings-select-content="true"
                  position="popper"
                  sideOffset={4}
                >
                  <SelectPrimitive.Viewport className="audio-settings-panel__select-viewport">
                    <SelectPrimitive.Item
                      value="default"
                      className="audio-settings-panel__select-item"
                    >
                      <SelectPrimitive.ItemText>
                        {AUDIO_SETTINGS_COPY.systemDefault}
                      </SelectPrimitive.ItemText>
                    </SelectPrimitive.Item>
                    {speakerDevices.map((d) => (
                      <SelectPrimitive.Item
                        key={d.deviceId}
                        value={d.deviceId}
                        className="audio-settings-panel__select-item"
                        title={d.label}
                      >
                        <SelectPrimitive.ItemText>{d.label}</SelectPrimitive.ItemText>
                      </SelectPrimitive.Item>
                    ))}
                  </SelectPrimitive.Viewport>
                </SelectPrimitive.Content>
              </SelectPrimitive.Portal>
            </SelectPrimitive.Root>
          </label>

          <label className="audio-settings-panel__label">
            <span className="audio-settings-panel__label-text">
              <Icon name="mic" className="audio-settings-panel__label-icon" />
              {AUDIO_SETTINGS_COPY.microphone}
            </span>
            <SelectPrimitive.Root
              value={normalizeSelectValue(device.selectedMicDeviceId)}
              onValueChange={(nextValue) => onDeviceChange({ selectedMicDeviceId: nextValue })}
              onOpenChange={setMicOpen}
            >
              <SelectPrimitive.Trigger className="audio-settings-panel__select-trigger">
                <SelectPrimitive.Value />
                <SelectPrimitive.Icon className="audio-settings-panel__select-icon">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    arrow_drop_down
                  </span>
                </SelectPrimitive.Icon>
              </SelectPrimitive.Trigger>
              <SelectPrimitive.Portal>
                <SelectPrimitive.Content
                  className="audio-settings-panel__select-content"
                  data-audio-settings-select-content="true"
                  position="popper"
                  sideOffset={4}
                >
                  <SelectPrimitive.Viewport className="audio-settings-panel__select-viewport">
                    <SelectPrimitive.Item
                      value="default"
                      className="audio-settings-panel__select-item"
                    >
                      <SelectPrimitive.ItemText>
                        {AUDIO_SETTINGS_COPY.systemDefault}
                      </SelectPrimitive.ItemText>
                    </SelectPrimitive.Item>
                    {micDevices.map((d) => (
                      <SelectPrimitive.Item
                        key={d.deviceId}
                        value={d.deviceId}
                        className="audio-settings-panel__select-item"
                        title={d.label}
                      >
                        <SelectPrimitive.ItemText>{d.label}</SelectPrimitive.ItemText>
                      </SelectPrimitive.Item>
                    ))}
                  </SelectPrimitive.Viewport>
                </SelectPrimitive.Content>
              </SelectPrimitive.Portal>
            </SelectPrimitive.Root>
          </label>

          <div
            className="audio-settings-panel__mic-meter"
            aria-label={AUDIO_SETTINGS_COPY.outgoingMicrophoneSignal}
          >
            <span ref={micMeterFillRef} className="audio-settings-panel__mic-meter-fill" />
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
                <Slider
                  min={0}
                  max={100}
                  value={device.micGain}
                  onValueChange={(nextValue) => onDeviceChange({ micGain: nextValue })}
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
                <Slider
                  min={0}
                  max={100}
                  value={device.backgroundAudioLevel}
                  onValueChange={(nextValue) => onDeviceChange({ backgroundAudioLevel: nextValue })}
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
              <Slider
                min={0}
                max={100}
                value={device.volumeLevel}
                onValueChange={(nextValue) => onDeviceChange({ volumeLevel: nextValue })}
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
