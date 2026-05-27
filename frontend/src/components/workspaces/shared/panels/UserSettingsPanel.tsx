import { useEffect, useRef, useState, type SubmitEventHandler } from 'react'
import { CharacterAvatarUploadField } from './CharacterAvatarUploadField'
import '@/styles/components/workspaces/shared/panels/UserSettingsPanel.css'
import '@/styles/components/workspaces/shared/panels/WorkspaceSettingsPanel.css'

export interface UserSettingsPanelProps {
  apiUrl: string
  token: string
  userId: string
  username: string
}

interface ProfileState {
  displayName: string
  avatarUrl: string
}

type SaveStatus = 'idle' | 'saving' | 'success' | 'error'

export function UserSettingsPanel({ apiUrl, token, userId, username }: UserSettingsPanelProps) {
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

  return (
    <section aria-label="User settings" className="susp-panel">
      <form onSubmit={(e) => void handleProfileSave(e)} noValidate className="susp-panel-section">
        <div className="susp-avatar-row susp-avatar-row--spaced">
          <div className="susp-avatar-meta">
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
    </section>
  )
}
