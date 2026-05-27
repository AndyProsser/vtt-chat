import { useEffect, useRef, useState, type ChangeEvent, type SubmitEventHandler } from 'react'
import { Slider } from '@/components/ui'
import { CharacterAvatarUploadField } from './CharacterAvatarUploadField'
import '@/styles/components/workspaces/shared/panels/UserSettingsPanel.css'
import '@/styles/components/workspaces/shared/panels/WorkspaceSettingsPanel.css'

export interface UserSettingsPanelProps {
  messageGroupingWindowMs: number
  onMessageGroupingWindowChange: (value: number) => void
  apiUrl: string
  token: string
  userId: string
  username: string
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

interface ProfileState {
  displayName: string
  avatarUrl: string
}

type SaveStatus = 'idle' | 'saving' | 'success' | 'error'

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

export function UserSettingsPanel({
  messageGroupingWindowMs,
  onMessageGroupingWindowChange,
  apiUrl,
  token,
  userId,
  username,
}: UserSettingsPanelProps) {
  const [profile, setProfile] = useState<ProfileState>({ displayName: '', avatarUrl: '' })
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch(`${apiUrl}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (data: { user?: { displayName?: string | null; avatarUrl?: string | null } } | null) => {
          if (cancelled || !data?.user) return
          setProfile({
            displayName: data.user.displayName ?? '',
            avatarUrl: data.user.avatarUrl ?? '',
          })
          setProfileLoaded(true)
        }
      )
      .catch(() => {
        if (!cancelled) setProfileLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [apiUrl, token, userId])

  const handleProfileSave: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault()
    setSaveStatus('saving')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    try {
      const res = await fetch(`${apiUrl}/api/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          displayName: profile.displayName.trim() || null,
          avatarUrl: profile.avatarUrl.trim() || null,
        }),
      })
      setSaveStatus(res.ok ? 'success' : 'error')
    } catch {
      setSaveStatus('error')
    }
    saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000)
  }

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

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
    <section aria-label="User settings" className="susp-panel">
      <form onSubmit={(e) => void handleProfileSave(e)} noValidate className="susp-panel-section">
        <div className="susp-avatar-row susp-avatar-row--spaced">
          <div className="susp-avatar-meta">
            <p className="susp-section-heading">Profile</p>
            <p className="susp-avatar-username">@{username}</p>
          </div>
        </div>

        <div className="susp-field susp-field--spaced">
          <label htmlFor="susp-display-name" className="susp-field__label">
            Display name
          </label>
          <input
            id="susp-display-name"
            type="text"
            className="susp-field__input"
            placeholder={username}
            maxLength={64}
            value={profile.displayName}
            disabled={!profileLoaded || saveStatus === 'saving'}
            onChange={(e) => setProfile((prev) => ({ ...prev, displayName: e.target.value }))}
          />
          <p className="susp-field__hint">
            Shown to other players. Leave blank to use your username.
          </p>
        </div>

        <CharacterAvatarUploadField
          value={profile.avatarUrl}
          onChange={(value) => setProfile((prev) => ({ ...prev, avatarUrl: value }))}
          disabled={!profileLoaded || saveStatus === 'saving'}
        />

        <div className="susp-profile-actions">
          <button
            type="submit"
            className="session-button"
            disabled={!profileLoaded || saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? 'Saving…' : 'Save profile'}
          </button>
          {saveStatus === 'success' && <span className="susp-save-status is-success">Saved</span>}
          {saveStatus === 'error' && <span className="susp-save-status is-error">Save failed</span>}
        </div>
      </form>

      <div className="susp-panel-section susp-panel-section--preferences">
        <div>
          <p className="susp-section-heading">Chat</p>
          <label htmlFor="susp-grouping-window" className="susp-field__label">
            Message grouping window
          </label>
          <select
            id="susp-grouping-window"
            className="susp-select susp-select--spaced"
            value={String(selectedOption.value)}
            onChange={handleGroupingWindowChange}
          >
            {GROUPING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="susp-hint">{selectedOption.description}</p>
        </div>

        <div>
          <p className="susp-section-heading">Audio</p>
          <div className="susp-audio-stack">
            <div className="susp-range-row">
              <span className="susp-range-label">
                <span>Master volume</span>
                <span>{masterVolume}%</span>
              </span>
              <Slider
                min={0}
                max={100}
                step={1}
                value={masterVolume}
                onValueChange={(nextValue) => setMasterVolume(nextValue)}
                className="susp-range"
                aria-label="Master volume"
              />
            </div>

            <div className="susp-range-row">
              <span className="susp-range-label">
                <span>Microphone level</span>
                <span>{inputVolume}%</span>
              </span>
              <Slider
                min={0}
                max={100}
                step={1}
                value={inputVolume}
                onValueChange={(nextValue) => setInputVolume(nextValue)}
                className="susp-range"
                aria-label="Microphone level"
              />
            </div>
            <div className="susp-range-row">
              <span className="susp-range-label">
                <span>Voice output level</span>
                <span>{outputVolume}%</span>
              </span>
              <Slider
                min={0}
                max={100}
                step={1}
                value={outputVolume}
                onValueChange={(nextValue) => setOutputVolume(nextValue)}
                className="susp-range"
                aria-label="Voice output level"
              />
            </div>

            <div className="susp-toggle-row">
              <label className="susp-toggle" htmlFor="susp-push-to-talk">
                <input
                  id="susp-push-to-talk"
                  type="checkbox"
                  checked={pushToTalkEnabled}
                  onChange={(event) => setPushToTalkEnabled(event.target.checked)}
                />
                <span>Push to talk</span>
              </label>
              <label className="susp-toggle" htmlFor="susp-noise-suppression">
                <input
                  id="susp-noise-suppression"
                  type="checkbox"
                  checked={noiseSuppressionEnabled}
                  onChange={(event) => setNoiseSuppressionEnabled(event.target.checked)}
                />
                <span>Noise suppression</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
