import { useEffect, useState, type ChangeEvent } from 'react'

interface SessionUserSettingsPanelProps {
  messageGroupingWindowMs: number
  onMessageGroupingWindowChange: (value: number) => void
}

const GROUPING_OPTIONS: Array<{ label: string; value: number; description: string }> = [
  { label: 'Off', value: 0, description: 'Always show author + timestamp for every message.' },
  { label: '2 minutes', value: 2 * 60 * 1000, description: 'Group quick back-to-back replies.' },
  {
    label: '5 minutes',
    value: 5 * 60 * 1000,
    description: 'Default; balanced grouping for table chat.',
  },
  {
    label: '10 minutes',
    value: 10 * 60 * 1000,
    description: 'More aggressive grouping for long message runs.',
  },
]

const AUDIO_MASTER_VOLUME_KEY = 'vtt-audio-master-volume'
const AUDIO_INPUT_VOLUME_KEY = 'vtt-audio-input-volume'
const AUDIO_OUTPUT_VOLUME_KEY = 'vtt-audio-output-volume'
const AUDIO_PUSH_TO_TALK_KEY = 'vtt-audio-push-to-talk'
const AUDIO_NOISE_SUPPRESSION_KEY = 'vtt-audio-noise-suppression'

function readStoredNumber(key: string, fallback: number): number {
  if (typeof window === 'undefined') {
    return fallback
  }

  const rawValue = window.localStorage.getItem(key)
  const parsed = Number(rawValue)
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : fallback
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') {
    return fallback
  }

  const rawValue = window.localStorage.getItem(key)
  if (rawValue === null) {
    return fallback
  }

  return rawValue === 'true'
}

export function SessionUserSettingsPanel({
  messageGroupingWindowMs,
  onMessageGroupingWindowChange,
}: SessionUserSettingsPanelProps) {
  const [masterVolume, setMasterVolume] = useState<number>(() =>
    readStoredNumber(AUDIO_MASTER_VOLUME_KEY, 80)
  )
  const [inputVolume, setInputVolume] = useState<number>(() =>
    readStoredNumber(AUDIO_INPUT_VOLUME_KEY, 75)
  )
  const [outputVolume, setOutputVolume] = useState<number>(() =>
    readStoredNumber(AUDIO_OUTPUT_VOLUME_KEY, 80)
  )
  const [pushToTalkEnabled, setPushToTalkEnabled] = useState<boolean>(() =>
    readStoredBoolean(AUDIO_PUSH_TO_TALK_KEY, false)
  )
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState<boolean>(() =>
    readStoredBoolean(AUDIO_NOISE_SUPPRESSION_KEY, true)
  )

  const handleGroupingWindowChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onMessageGroupingWindowChange(Number(event.target.value))
  }

  const selectedOption =
    GROUPING_OPTIONS.find((option) => option.value === messageGroupingWindowMs) ||
    GROUPING_OPTIONS[2]

  useEffect(() => {
    window.localStorage.setItem(AUDIO_MASTER_VOLUME_KEY, String(masterVolume))
  }, [masterVolume])

  useEffect(() => {
    window.localStorage.setItem(AUDIO_INPUT_VOLUME_KEY, String(inputVolume))
  }, [inputVolume])

  useEffect(() => {
    window.localStorage.setItem(AUDIO_OUTPUT_VOLUME_KEY, String(outputVolume))
  }, [outputVolume])

  useEffect(() => {
    window.localStorage.setItem(AUDIO_PUSH_TO_TALK_KEY, String(pushToTalkEnabled))
  }, [pushToTalkEnabled])

  useEffect(() => {
    window.localStorage.setItem(AUDIO_NOISE_SUPPRESSION_KEY, String(noiseSuppressionEnabled))
  }, [noiseSuppressionEnabled])

  return (
    <section className="session-settings-panel" aria-label="User settings">
      <h4 className="session-settings-panel__title">User Settings</h4>
      <p className="session-settings-panel__subtitle">
        Personalize your chat and command center behavior.
      </p>

      <div className="session-settings-item">
        <label htmlFor="message-grouping-window" className="session-settings-item__label">
          Message grouping window
        </label>
        <p className="session-settings-item__description">
          Consecutive messages by the same author are grouped within this time window.
        </p>
        <select
          id="message-grouping-window"
          className="session-select session-settings-item__select"
          value={String(selectedOption.value)}
          onChange={handleGroupingWindowChange}
        >
          {GROUPING_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="session-settings-item__hint">{selectedOption.description}</p>
      </div>

      <div className="session-settings-item">
        <h5 className="session-settings-item__heading">Audio Preferences</h5>
        <p className="session-settings-item__description">
          Tune your default voice settings before joining a campaign session.
        </p>

        <label className="session-settings-item__label" htmlFor="audio-master-volume">
          Master volume: {masterVolume}%
        </label>
        <input
          id="audio-master-volume"
          type="range"
          min={0}
          max={100}
          step={1}
          value={masterVolume}
          onChange={(event) => setMasterVolume(Number(event.target.value))}
          className="session-settings-item__range"
        />

        <label className="session-settings-item__label" htmlFor="audio-input-volume">
          Microphone input level: {inputVolume}%
        </label>
        <input
          id="audio-input-volume"
          type="range"
          min={0}
          max={100}
          step={1}
          value={inputVolume}
          onChange={(event) => setInputVolume(Number(event.target.value))}
          className="session-settings-item__range"
        />

        <label className="session-settings-item__label" htmlFor="audio-output-volume">
          Voice output level: {outputVolume}%
        </label>
        <input
          id="audio-output-volume"
          type="range"
          min={0}
          max={100}
          step={1}
          value={outputVolume}
          onChange={(event) => setOutputVolume(Number(event.target.value))}
          className="session-settings-item__range"
        />

        <div className="session-settings-item__toggle-row">
          <label className="session-settings-item__toggle" htmlFor="audio-push-to-talk">
            <input
              id="audio-push-to-talk"
              type="checkbox"
              checked={pushToTalkEnabled}
              onChange={(event) => setPushToTalkEnabled(event.target.checked)}
            />
            <span>Push to talk</span>
          </label>

          <label className="session-settings-item__toggle" htmlFor="audio-noise-suppression">
            <input
              id="audio-noise-suppression"
              type="checkbox"
              checked={noiseSuppressionEnabled}
              onChange={(event) => setNoiseSuppressionEnabled(event.target.checked)}
            />
            <span>Noise suppression</span>
          </label>
        </div>
      </div>
    </section>
  )
}
