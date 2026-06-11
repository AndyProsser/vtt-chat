import { useCallback, useState, type SubmitEventHandler } from 'react'
import * as Form from '@radix-ui/react-form'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { PolicyNotice } from '@/components/auth/PolicyNotice'
import { MAX_AVATAR_WIDTH_PX } from '@/constants/inviteJoin.constants'
import type { InviteJoinPageProps, PlayerPrecheckResult, PolicyCode } from '@/types/invite'
import {
  continueToCampaignSession,
  getEmailStatusIcon,
  getEmailStatusLabel,
  joinAsFullAccountApi,
  joinAsGuestApi,
  joinAuthenticatedUserApi,
} from '@/utils/inviteJoin'
import '@/styles/components/guest/InviteJoinPage.css'
import { useInviteValidation } from '@/hooks/useInviteValidation'
import { useEmailPrecheck } from '@/hooks/useEmailPrecheck'
import { InviteJoinCampaignAside } from './InviteJoinCampaignAside'
import { InviteJoinCharacterForm } from './InviteJoinCharacterForm'

export function InviteJoinPage({
  apiUrl,
  inviteCode,
  authToken,
  onAuthenticated,
}: InviteJoinPageProps) {
  const [joining, setJoining] = useState(false)
  const [playerName, setPlayerName] = useState('')
  const [showCharacterDetails, setShowCharacterDetails] = useState(true)
  const [characterName, setCharacterName] = useState('')
  const [characterRace, setCharacterRace] = useState('')
  const [characterClass, setCharacterClass] = useState('')
  const [characterLevel, setCharacterLevel] = useState(1)
  const [characterAvatarUrl, setCharacterAvatarUrl] = useState('')
  const [characterNameTouched, setCharacterNameTouched] = useState(false)

  const { loading, campaign, error, errorCode, setError, setErrorCode, validateInvite } =
    useInviteValidation({ apiUrl, inviteCode })

  const onPrecheckSuccess = useCallback(
    (result: PlayerPrecheckResult, emailValue: string) => {
      if (result.accountStatus === 'guest') {
        if (result.guestProfile?.displayName?.trim()) {
          setPlayerName(result.guestProfile.displayName.trim())
        }
        if (result.existingCharacter && !characterNameTouched) {
          setCharacterName(result.existingCharacter.name || '')
          setCharacterRace(result.existingCharacter.race || '')
          setCharacterClass(result.existingCharacter.class || '')
          setCharacterLevel(result.existingCharacter.level || 1)
          setCharacterAvatarUrl(result.existingCharacter.avatarUrl || '')
        }
        if (!result.guestProfile?.displayName?.trim() && !playerName.trim()) {
          setPlayerName(emailValue.split('@')[0] || 'Guest')
        }
      } else if (result.accountStatus === 'none' && !playerName.trim()) {
        setPlayerName(emailValue.split('@')[0] || 'Guest')
      }
    },
    [characterNameTouched, playerName]
  )

  const {
    email,
    setEmail,
    emailChecked,
    emailCheckStatus,
    precheckLoading,
    fullAccountPassword,
    setFullAccountPassword,
    isFullUserEmail,
    canEditJoinFields,
  } = useEmailPrecheck({ apiUrl, inviteCode, campaign, setError, setErrorCode, onPrecheckSuccess })

  const handleAvatarSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

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

  const submitJoin: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault()
    if (!campaign) return
    if (!emailChecked) { setError('Check email before continuing.'); return }
    if (!email.trim()) { setError('Email is required.'); return }
    if (isFullUserEmail && !fullAccountPassword.trim()) {
      setError('Password is required for full account sign in.')
      return
    }
    if (!isFullUserEmail && !playerName.trim()) { setError('Player name is required.'); return }

    setJoining(true)
    setError(null)
    setErrorCode(null)

    const character =
      showCharacterDetails && characterName.trim()
        ? {
            name: characterName.trim(),
            race: characterRace.trim() || undefined,
            class: characterClass.trim() || undefined,
            level: characterLevel,
            avatarUrl: characterAvatarUrl || undefined,
          }
        : undefined

    try {
      let resolvedCampaignId: string
      if (authToken) {
        resolvedCampaignId = await joinAuthenticatedUserApi({
          apiUrl,
          authToken,
          campaignId: campaign.id,
          inviteCode,
          character,
        })
      } else if (isFullUserEmail) {
        resolvedCampaignId = await joinAsFullAccountApi({
          apiUrl,
          inviteCode,
          email: email.trim(),
          password: fullAccountPassword,
          campaignId: campaign.id,
          onAuthenticated,
        })
      } else {
        resolvedCampaignId = await joinAsGuestApi({
          apiUrl,
          campaignId: campaign.id,
          inviteCode,
          email: email.trim(),
          displayName: playerName.trim(),
          character,
          onAuthenticated,
        })
      }
      continueToCampaignSession(resolvedCampaignId)
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : 'Failed to join campaign')
    } finally {
      setJoining(false)
    }
  }

  const renderPolicyNotice = () => {
    const effectiveCode: PolicyCode =
      errorCode || (!loading && campaign === null ? 'INVITE_EXPIRED' : null)
    if (!effectiveCode) return null

    if (effectiveCode === 'INVITE_EXPIRED') {
      return (
        <PolicyNotice
          title="Invite unavailable"
          tone="danger"
          actionLabel="Check Invite Again"
          onAction={() => { void validateInvite() }}
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

  const hasPolicyNotice = Boolean(errorCode || (!loading && campaign === null))

  return (
    <main className="invite-join-page">
      <section className="invite-join-shell" aria-label="Player invite join">
        <InviteJoinCampaignAside campaign={campaign} inviteCode={inviteCode} />

        <section className="invite-join-form-wrap invite-join-form-wrap--short-desktop">
          <header className="invite-join-form-wrap__header">
            <h2>Join campaign</h2>
          </header>

          {loading && <p className="invite-join-status">Validating invite…</p>}

          {renderPolicyNotice()}

          {campaign && (
            <Form.Root className="invite-join-form" onSubmit={submitJoin}>
              <label htmlFor="join-player-email">Email</label>
              <div className="invite-join-email-field">
                <input
                  id="join-player-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                />
                <TooltipProvider delayDuration={140}>
                  <Tooltip>
                    <TooltipTrigger asChild>
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
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          {getEmailStatusIcon(emailCheckStatus)}
                        </span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {getEmailStatusLabel(emailCheckStatus)}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
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
                    onChange={(event) => {
                      const nextPlayerName = event.target.value
                      setPlayerName(nextPlayerName)
                      if (!characterNameTouched) setCharacterName(nextPlayerName.trim())
                    }}
                    autoComplete="name"
                  />

                  <InviteJoinCharacterForm
                    characterName={characterName}
                    characterRace={characterRace}
                    characterClass={characterClass}
                    characterLevel={characterLevel}
                    characterAvatarUrl={characterAvatarUrl}
                    showCharacterDetails={showCharacterDetails}
                    onCharacterNameChange={(v) => { setCharacterName(v); setCharacterNameTouched(true) }}
                    onCharacterRaceChange={setCharacterRace}
                    onCharacterClassChange={setCharacterClass}
                    onCharacterLevelChange={setCharacterLevel}
                    onAvatarSelected={handleAvatarSelected}
                    onToggleDetails={() => setShowCharacterDetails((prev) => !prev)}
                  />
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

              <Form.Submit asChild>
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
              </Form.Submit>
            </Form.Root>
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
