import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { CharacterAvatarUploadField } from './CharacterAvatarUploadField'
import { useTooltipLabelsPreference } from '@/hooks/useTooltipLabelsPreference'
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

export interface UserSettingsPanelHandle {
  flushPendingChanges: () => Promise<void>
}

function normalizeProfile(profile: ProfileState): ProfileState {
  return {
    displayName: profile.displayName.trim(),
    avatarUrl: profile.avatarUrl.trim(),
  }
}

function profilesMatch(left: ProfileState, right: ProfileState): boolean {
  const normalizedLeft = normalizeProfile(left)
  const normalizedRight = normalizeProfile(right)
  return (
    normalizedLeft.displayName === normalizedRight.displayName &&
    normalizedLeft.avatarUrl === normalizedRight.avatarUrl
  )
}

export const UserSettingsPanel = forwardRef<UserSettingsPanelHandle, UserSettingsPanelProps>(
  function UserSettingsPanel({ apiUrl, token, userId, username }, ref) {
    const [profile, setProfile] = useState<ProfileState>({ displayName: '', avatarUrl: '' })
    const [profileLoaded, setProfileLoaded] = useState(false)
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const persistedProfileRef = useRef<ProfileState>({ displayName: '', avatarUrl: '' })
    const { tooltipLabelsEnabled, setTooltipLabelsEnabled } = useTooltipLabelsPreference()

    useEffect(() => {
      let cancelled = false
      void fetch(`${apiUrl}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (data: { user?: { displayName?: string | null; avatarUrl?: string | null } } | null) => {
            if (cancelled || !data?.user) return
            const nextProfile = {
              displayName: data.user.displayName ?? '',
              avatarUrl: data.user.avatarUrl ?? '',
            }
            persistedProfileRef.current = nextProfile
            setProfile(nextProfile)
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

    const saveProfile = useCallback(
      async (nextProfile: ProfileState) => {
        if (!profileLoaded || profilesMatch(nextProfile, persistedProfileRef.current)) {
          return
        }

        setSaveStatus('saving')
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

        const normalizedProfile = normalizeProfile(nextProfile)

        try {
          const res = await fetch(`${apiUrl}/api/users/me`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              displayName: normalizedProfile.displayName || null,
              avatarUrl: normalizedProfile.avatarUrl || null,
            }),
          })

          if (res.ok) {
            persistedProfileRef.current = normalizedProfile
            setProfile(normalizedProfile)
            setSaveStatus('success')
          } else {
            setSaveStatus('error')
          }
        } catch {
          setSaveStatus('error')
        }

        saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000)
      },
      [apiUrl, profileLoaded, token]
    )

    useEffect(() => {
      return () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      }
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        flushPendingChanges: async () => {
          await saveProfile(profile)
        },
      }),
      [profile, saveProfile]
    )

    return (
      <section aria-label="User settings" className="susp-panel">
        <div className="susp-panel-section">
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
              onBlur={() => {
                void saveProfile(profile)
              }}
            />
          </div>

          <CharacterAvatarUploadField
            value={profile.avatarUrl}
            onChange={(value) => {
              const nextProfile = { ...profile, avatarUrl: value }
              setProfile(nextProfile)
              void saveProfile(nextProfile)
            }}
            disabled={!profileLoaded || saveStatus === 'saving'}
          />

          <div className="susp-field susp-field--spaced" role="group" aria-label="Interface labels">
            <label htmlFor="susp-tooltip-labels-toggle" className="susp-field__label">
              Show tooltip labels
            </label>
            <p className="susp-field__help">
              Controls hover labels for toolbar and panel icon buttons.
            </p>
            <label className="susp-toggle" htmlFor="susp-tooltip-labels-toggle">
              <input
                id="susp-tooltip-labels-toggle"
                type="checkbox"
                checked={tooltipLabelsEnabled}
                onChange={(event) => setTooltipLabelsEnabled(event.target.checked)}
              />
              <span>{tooltipLabelsEnabled ? 'Enabled' : 'Disabled'}</span>
            </label>
          </div>
        </div>
      </section>
    )
  }
)
