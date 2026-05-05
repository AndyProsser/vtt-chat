import { Role } from '@shared'
import type { UUID } from '@shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PolicyNotice } from './PolicyNotice'
import '@/styles/components/auth/InviteJoinPage.css'

type InviteCampaign = {
  id: string
  name: string
  description: string | null
  posterUrl: string | null
  dmDisplayName: string
  dmOnline: boolean
  connectedPlayersRounded: number
  connectedPlayersLabel: string
  connectedSpectatorsRounded: number
  connectedSpectatorsLabel: string
  displayState: 'INACTIVE' | 'GREENROOM' | 'ACTIVE' | 'PAUSED'
}

type InviteValidationResult =
  | {
      valid: true
      type: 'player'
      campaign: InviteCampaign
      platformStatus: {
        online: boolean
        version: string
        activeUsers: number
        activeCampaigns: number
        activeSessions: number
      }
    }
  | {
      valid: false
      reason: string
    }

interface InviteJoinPageProps {
  apiUrl: string
  inviteCode: string
  authToken: string | null
  onAuthenticated?: (token: string, user: { id: UUID; username: string; role: Role }) => void
}

type PolicyCode = 'INVITE_EXPIRED' | 'FULL_ACCOUNT_REQUIRED' | 'FULL_ACCOUNT_EXISTS' | null

type PlayerPrecheckResult = {
  campaignId: string
  accountStatus: 'none' | 'guest' | 'full'
  guestProfile?: {
    displayName: string
  }
  existingCharacter?: {
    name: string
    race: string | null
    class: string | null
    level: number | null
    avatarUrl: string | null
  }
}

const LOBBY_CAMPAIGN_FOCUS_STORAGE_KEY = 'vtt-chat:lobby-campaign-focus-id'
const LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY = 'vtt-chat:lobby-auto-enter-campaign-id'
const LOBBY_NOTICE_STORAGE_KEY = 'vtt-chat:lobby-notice'
const MAX_AVATAR_WIDTH_PX = 512

function isValidEmailFormat(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function getStateLabel(state: InviteCampaign['displayState']): string {
  if (state === 'ACTIVE') return 'Active'
  if (state === 'PAUSED') return 'Paused'
  if (state === 'GREENROOM') return 'Greenroom'
  return 'Inactive'
}

function getEmailStatusIcon(
  status: 'idle' | 'invalid' | 'checking' | 'none' | 'guest' | 'full' | 'error'
) {
  if (status === 'checking') return 'hourglass_top'
  if (status === 'guest') return 'badge'
  if (status === 'full') return 'verified_user'
  if (status === 'invalid' || status === 'error') return 'error'
  return 'help'
}

function getEmailStatusLabel(
  status: 'idle' | 'invalid' | 'checking' | 'none' | 'guest' | 'full' | 'error'
) {
  if (status === 'checking') return 'Checking email status'
  if (status === 'guest') return 'GUEST account detected'
  if (status === 'full') return 'FULL account detected'
  if (status === 'invalid') return 'Email format is invalid'
  if (status === 'error') return 'Email check failed'
  return 'NONE detected yet'
}

export function InviteJoinPage({
  apiUrl,
  inviteCode,
  authToken,
  onAuthenticated,
}: InviteJoinPageProps) {
  const [loading, setLoading] = useState(true)
  const [validation, setValidation] = useState<InviteValidationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<PolicyCode>(null)
  const [joining, setJoining] = useState(false)

  const [playerName, setPlayerName] = useState('')
  const [email, setEmail] = useState('')
  const [emailChecked, setEmailChecked] = useState(false)
  const [emailCheckStatus, setEmailCheckStatus] = useState<
    'idle' | 'invalid' | 'checking' | 'none' | 'guest' | 'full' | 'error'
  >('idle')
  const [precheckLoading, setPrecheckLoading] = useState(false)
  const [precheckResult, setPrecheckResult] = useState<PlayerPrecheckResult | null>(null)
  const [fullAccountPassword, setFullAccountPassword] = useState('')
  const precheckRequestIdRef = useRef(0)

  const [showCharacterDetails, setShowCharacterDetails] = useState(true)
  const [characterName, setCharacterName] = useState('')
  const [characterRace, setCharacterRace] = useState('')
  const [characterClass, setCharacterClass] = useState('')
  const [characterLevel, setCharacterLevel] = useState(1)
  const [characterAvatarUrl, setCharacterAvatarUrl] = useState('')
  const [characterNameTouched, setCharacterNameTouched] = useState(false)

  const validateInvite = async () => {
    setLoading(true)
    setError(null)
    setErrorCode(null)

    try {
      const response = await fetch(
        `${apiUrl}/api/campaigns/invite/${encodeURIComponent(inviteCode)}/validate`
      )
      const data = (await response.json()) as InviteValidationResult
      setValidation(data)
      if (!response.ok && 'reason' in data && data.reason === 'INVITE_EXPIRED') {
        setErrorCode('INVITE_EXPIRED')
      }
    } catch {
      setError('Failed to validate invite code')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void validateInvite()
  }, [apiUrl, inviteCode])

  const campaign = useMemo(() => {
    if (!validation || !validation.valid || validation.type !== 'player') {
      return null
    }
    return validation.campaign
  }, [validation])

  useEffect(() => {
    if (characterNameTouched) {
      return
    }

    const trimmedPlayerName = playerName.trim()
    setCharacterName(trimmedPlayerName)
  }, [characterNameTouched, playerName])

  const isFullUserEmail = precheckResult?.accountStatus === 'full'
  const canEditJoinFields = emailChecked && !isFullUserEmail

  const runEmailPrecheck = async (params: { requestId: number; emailValue: string }) => {
    if (!campaign || !params.emailValue.trim()) {
      setError('Email is required.')
      return
    }

    setPrecheckLoading(true)
    setEmailCheckStatus('checking')
    setError(null)

    try {
      const response = await fetch(`${apiUrl}/api/v1/auth/validate/player`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inviteCode,
          email: params.emailValue.trim(),
        }),
      })

      const data = (await response.json().catch(() => ({}))) as PlayerPrecheckResult & {
        code?: string
        message?: string
      }

      if (!response.ok) {
        if (precheckRequestIdRef.current !== params.requestId) {
          return
        }

        if (data.code === 'INVITE_EXPIRED') {
          setErrorCode('INVITE_EXPIRED')
        }
        throw new Error(data.message || 'Unable to check email for invite')
      }

      if (precheckRequestIdRef.current !== params.requestId) {
        return
      }

      setPrecheckResult(data)
      setEmailChecked(true)
      setEmailCheckStatus(data.accountStatus)

      if (data.accountStatus === 'guest') {
        if (data.guestProfile?.displayName?.trim()) {
          setPlayerName(data.guestProfile.displayName.trim())
        }

        if (data.existingCharacter && !characterNameTouched) {
          setCharacterName(data.existingCharacter.name || '')
          setCharacterRace(data.existingCharacter.race || '')
          setCharacterClass(data.existingCharacter.class || '')
          setCharacterLevel(data.existingCharacter.level || 1)
          setCharacterAvatarUrl(data.existingCharacter.avatarUrl || '')
        }

        if (!data.guestProfile?.displayName?.trim() && !playerName.trim()) {
          setPlayerName(params.emailValue.split('@')[0] || 'Guest')
        }
      } else if (data.accountStatus === 'none') {
        if (!playerName.trim()) {
          setPlayerName(params.emailValue.split('@')[0] || 'Guest')
        }
      }
    } catch (precheckError) {
      if (precheckRequestIdRef.current !== params.requestId) {
        return
      }

      const message = precheckError instanceof Error ? precheckError.message : 'Email check failed'
      setError(message)
      setEmailChecked(false)
      setPrecheckResult(null)
      setEmailCheckStatus('error')
    } finally {
      if (precheckRequestIdRef.current === params.requestId) {
        setPrecheckLoading(false)
      }
    }
  }

  useEffect(() => {
    const trimmedEmail = email.trim()

    setEmailChecked(false)
    setPrecheckResult(null)
    setFullAccountPassword('')

    if (!trimmedEmail) {
      setEmailCheckStatus('idle')
      setPrecheckLoading(false)
      return
    }

    if (!isValidEmailFormat(trimmedEmail)) {
      setEmailCheckStatus('invalid')
      setPrecheckLoading(false)
      return
    }

    const requestId = precheckRequestIdRef.current + 1
    precheckRequestIdRef.current = requestId
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        setPrecheckLoading(true)
        setEmailCheckStatus('checking')
        await runEmailPrecheck({ requestId, emailValue: trimmedEmail })
      })()
    }, 500)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [email])

  const continueToCampaignSession = (campaignId: string) => {
    sessionStorage.setItem(LOBBY_CAMPAIGN_FOCUS_STORAGE_KEY, campaignId)
    sessionStorage.setItem(LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY, campaignId)
    sessionStorage.removeItem(LOBBY_NOTICE_STORAGE_KEY)
    window.history.pushState({}, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const handleAvatarSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setError('Avatar must be an image file.')
      return
    }

    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      try {
        const naturalWidth = Math.max(1, img.naturalWidth)
        const naturalHeight = Math.max(1, img.naturalHeight)
        const scale = naturalWidth > MAX_AVATAR_WIDTH_PX ? MAX_AVATAR_WIDTH_PX / naturalWidth : 1
        const targetWidth = Math.max(1, Math.round(naturalWidth * scale))
        const targetHeight = Math.max(1, Math.round(naturalHeight * scale))

        const canvas = document.createElement('canvas')
        canvas.width = targetWidth
        canvas.height = targetHeight

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          setError('Unable to process avatar image.')
          return
        }

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

        let quality = 0.84
        let dataUrl = canvas.toDataURL('image/jpeg', quality)
        while (dataUrl.length > 300_000 && quality > 0.55) {
          quality -= 0.1
          dataUrl = canvas.toDataURL('image/jpeg', quality)
        }

        setCharacterAvatarUrl(dataUrl)
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      setError('Unable to read avatar image.')
    }

    img.src = objectUrl
  }

  const joinAuthenticatedUser = async () => {
    if (!campaign || !authToken) {
      return
    }

    const joinResponse = await fetch(`${apiUrl}/api/campaigns/${campaign.id}/join`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inviteCode,
      }),
    })

    const joinData = await joinResponse.json().catch(() => ({}))
    if (!joinResponse.ok) {
      throw new Error(joinData.message || 'Failed to join campaign')
    }

    const trimmedCharacterName = characterName.trim()
    if (showCharacterDetails && trimmedCharacterName) {
      await fetch(`${apiUrl}/api/campaigns/${campaign.id}/characters`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedCharacterName,
          race: characterRace.trim() || undefined,
          class: characterClass.trim() || undefined,
          avatarUrl: characterAvatarUrl || undefined,
          metadata: { level: characterLevel },
          isActive: true,
        }),
      })
    }

    continueToCampaignSession(campaign.id)
  }

  const joinAsGuest = async () => {
    if (!campaign) {
      return
    }

    const payload = {
      inviteCode,
      email: email.trim(),
      displayName: playerName.trim(),
      externalSystem: 'none',
      character:
        showCharacterDetails && characterName.trim()
          ? {
              name: characterName.trim(),
              race: characterRace.trim() || undefined,
              class: characterClass.trim() || undefined,
              level: characterLevel,
              avatarUrl: characterAvatarUrl || undefined,
            }
          : undefined,
    }

    const response = await fetch(`${apiUrl}/api/v1/auth/join/guest/player`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = (await response.json().catch(() => ({}))) as {
      token?: string
      user?: { id: string; username: string; role: 'PLAYER' }
      message?: string
      code?: string
    }

    if (!response.ok) {
      if (data.code === 'FULL_ACCOUNT_EXISTS') {
        setErrorCode('FULL_ACCOUNT_EXISTS')
      }
      if (data.code === 'INVITE_EXPIRED') {
        setErrorCode('INVITE_EXPIRED')
      }
      throw new Error(data.message || 'Unable to create player account for this invite')
    }

    if (data.token && data.user) {
      onAuthenticated?.(data.token, {
        id: data.user.id as UUID,
        username: data.user.username,
        role: data.user.role as Role,
      })
    }

    continueToCampaignSession(campaign.id)
  }

  const joinAsFullAccount = async () => {
    if (!campaign) {
      return
    }

    const response = await fetch(`${apiUrl}/api/v1/auth/join/full/player`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inviteCode,
        email: email.trim(),
        password: fullAccountPassword,
      }),
    })

    const data = (await response.json().catch(() => ({}))) as {
      token?: string
      user?: { id: string; username: string; role: 'DM' | 'PLAYER' | 'SPECTATOR' }
      campaignId?: string
      message?: string
      code?: string
    }

    if (!response.ok) {
      throw new Error(data.message || 'Failed to sign in and join campaign')
    }

    if (data.token && data.user) {
      onAuthenticated?.(data.token, {
        id: data.user.id as UUID,
        username: data.user.username,
        role: data.user.role as Role,
      })
    }

    continueToCampaignSession(data.campaignId || campaign.id)
  }

  const submitJoin = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!campaign) {
      return
    }

    if (!emailChecked) {
      setError('Check email before continuing.')
      return
    }

    if (!email.trim()) {
      setError('Email is required.')
      return
    }

    if (isFullUserEmail && !fullAccountPassword.trim()) {
      setError('Password is required for full account sign in.')
      return
    }

    if (!isFullUserEmail && !playerName.trim()) {
      setError('Player name is required.')
      return
    }

    setJoining(true)
    setError(null)
    setErrorCode(null)

    try {
      if (authToken) {
        await joinAuthenticatedUser()
      } else if (isFullUserEmail) {
        await joinAsFullAccount()
      } else {
        await joinAsGuest()
      }
    } catch (joinError) {
      const message = joinError instanceof Error ? joinError.message : 'Failed to join campaign'
      setError(message)
    } finally {
      setJoining(false)
    }
  }

  const renderPolicyNotice = () => {
    const effectiveCode: PolicyCode =
      errorCode || (!loading && validation && !validation.valid ? 'INVITE_EXPIRED' : null)

    if (!effectiveCode) {
      return null
    }

    if (effectiveCode === 'INVITE_EXPIRED') {
      return (
        <PolicyNotice
          title="Invite unavailable"
          tone="danger"
          actionLabel="Check Invite Again"
          onAction={() => {
            void validateInvite()
          }}
        >
          <p>Ask the DM for a new player invite code, then try again.</p>
        </PolicyNotice>
      )
    }

    if (effectiveCode === 'FULL_ACCOUNT_EXISTS' || effectiveCode === 'FULL_ACCOUNT_REQUIRED') {
      return (
        <PolicyNotice title="Full account required" tone="warning">
          <p>This email already has a full account. Enter your password below to continue.</p>
        </PolicyNotice>
      )
    }

    return null
  }

  const hasPolicyNotice = Boolean(
    errorCode ||
    (!loading && validation && !validation.valid && validation.reason === 'INVITE_EXPIRED')
  )

  return (
    <main className="invite-join-page">
      <section className="invite-join-shell" aria-label="Player invite join">
        <aside
          className={`invite-join-campaign ${campaign?.posterUrl ? 'has-poster' : ''}`}
          style={
            campaign?.posterUrl
              ? {
                  backgroundImage: `linear-gradient(120deg, rgba(8, 16, 28, 0.84), rgba(8, 16, 28, 0.66)), url(${campaign.posterUrl})`,
                }
              : undefined
          }
        >
          <div className="invite-join-campaign__chip">Player Invite</div>
          <h1 className="invite-join-campaign__title">{campaign?.name || 'Campaign Invite'}</h1>
          <p className="invite-join-campaign__subtitle">Invite code {inviteCode}</p>

          {campaign ? (
            <>
              <div className="invite-join-campaign__stats" aria-label="Campaign activity stats">
                <span className="invite-join-campaign__stat">
                  Players {campaign.connectedPlayersLabel}
                </span>
                <span className="invite-join-campaign__stat">
                  Spectators {campaign.connectedSpectatorsLabel}
                </span>
                <span className="invite-join-campaign__stat">
                  {getStateLabel(campaign.displayState)}
                </span>
              </div>
              <div className="invite-join-campaign__meta">
                <span>DM</span>
                <strong>{campaign.dmDisplayName}</strong>
                <span
                  className={`invite-join-campaign__presence ${campaign.dmOnline ? 'online' : 'offline'}`}
                >
                  {campaign.dmOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              {campaign.description ? (
                <p className="invite-join-campaign__description">{campaign.description}</p>
              ) : null}
            </>
          ) : (
            <p className="invite-join-campaign__description">Validating campaign invite.</p>
          )}
        </aside>

        <section className="invite-join-form-wrap invite-join-form-wrap--short-desktop">
          <header className="invite-join-form-wrap__header">
            <h2>Join campaign</h2>
          </header>

          {loading && <p className="invite-join-status">Validating invite…</p>}

          {renderPolicyNotice()}

          {campaign && (
            <form className="invite-join-form" onSubmit={submitJoin}>
              <label htmlFor="join-player-email">Email</label>
              <div className="invite-join-email-field">
                <input
                  id="join-player-email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                  }}
                  autoComplete="email"
                />
                <span
                  className={`invite-join-email-status status-${
                    emailCheckStatus === 'guest' || emailCheckStatus === 'full'
                      ? emailCheckStatus
                      : emailCheckStatus === 'checking'
                        ? 'checking'
                        : emailCheckStatus === 'invalid' || emailCheckStatus === 'error'
                          ? 'error'
                          : 'none'
                  }`}
                  aria-label={getEmailStatusLabel(emailCheckStatus)}
                  title={getEmailStatusLabel(emailCheckStatus)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {getEmailStatusIcon(emailCheckStatus)}
                  </span>
                </span>
              </div>

              {precheckLoading && <p className="invite-join-status">Checking email…</p>}
              {emailCheckStatus === 'invalid' && (
                <p className="invite-join-status">Enter a valid email to continue.</p>
              )}

              {isFullUserEmail && (
                <PolicyNotice title="Full account found" tone="info">
                  <p>This email belongs to a full account. Enter your password to continue.</p>
                </PolicyNotice>
              )}

              {canEditJoinFields && (
                <>
                  <label htmlFor="join-player-name">Player name</label>
                  <input
                    id="join-player-name"
                    type="text"
                    value={playerName}
                    onChange={(event) => setPlayerName(event.target.value)}
                    autoComplete="name"
                  />

                  <button
                    type="button"
                    className="invite-join-disclosure"
                    onClick={() => setShowCharacterDetails((prev) => !prev)}
                    aria-expanded={showCharacterDetails}
                  >
                    {showCharacterDetails
                      ? 'Hide optional character details'
                      : 'Show optional character details'}
                  </button>

                  {showCharacterDetails && (
                    <div className="invite-join-character-grid">
                      <p className="invite-join-character-grid__title">Optional</p>

                      <label htmlFor="join-character-name">Character name</label>
                      <input
                        id="join-character-name"
                        type="text"
                        value={characterName}
                        onChange={(event) => {
                          setCharacterName(event.target.value)
                          setCharacterNameTouched(true)
                        }}
                      />

                      <label htmlFor="join-character-race">Race</label>
                      <input
                        id="join-character-race"
                        type="text"
                        value={characterRace}
                        onChange={(event) => setCharacterRace(event.target.value)}
                      />

                      <label htmlFor="join-character-class">Class</label>
                      <input
                        id="join-character-class"
                        type="text"
                        value={characterClass}
                        onChange={(event) => setCharacterClass(event.target.value)}
                      />

                      <label htmlFor="join-character-level">Level</label>
                      <input
                        id="join-character-level"
                        type="range"
                        min={1}
                        max={20}
                        step={1}
                        value={characterLevel}
                        onChange={(event) => setCharacterLevel(Number(event.target.value) || 1)}
                      />
                      <output className="invite-join-level-output" htmlFor="join-character-level">
                        Level {characterLevel}
                      </output>

                      <label htmlFor="join-character-avatar">Avatar upload</label>
                      <input
                        id="join-character-avatar"
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarSelected}
                      />

                      {characterAvatarUrl ? (
                        <img
                          src={characterAvatarUrl}
                          alt="Character avatar preview"
                          className="invite-join-avatar-preview"
                        />
                      ) : null}
                    </div>
                  )}
                </>
              )}

              {isFullUserEmail && (
                <>
                  <label htmlFor="join-full-password">Password</label>
                  <input
                    id="join-full-password"
                    type="password"
                    value={fullAccountPassword}
                    onChange={(event) => setFullAccountPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                </>
              )}

              <button
                type="submit"
                className="invite-join-submit"
                disabled={
                  joining ||
                  precheckLoading ||
                  !emailChecked ||
                  !email.trim() ||
                  (isFullUserEmail ? !fullAccountPassword.trim() : !playerName.trim())
                }
              >
                {joining ? 'Joining…' : 'Join Campaign'}
              </button>
            </form>
          )}

          {error && !hasPolicyNotice && (
            <PolicyNotice title="Something went wrong" tone="danger">
              <p>{error}</p>
            </PolicyNotice>
          )}
        </section>
      </section>
    </main>
  )
}
