import type { ChangeEvent, FormEvent } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { Role, SessionState, UUID } from '@shared'
import { Slider, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import type { Session as SessionRecord } from '@/types/session'
import { SessionUserSettingsPanel } from './SessionUserSettingsPanel'
import { CampaignScaffoldPanel } from '../shared/CampaignScaffoldPanel'
import type { CampaignSettingsHomeTab, CampaignSettingsPayload } from '@/types/session/campaign'

type SessionInitModalsProps = {
  apiUrl: string
  token: string
  user: { id: UUID; username: string; authType?: 'FULL' | 'GUEST' }
  selectedCampaignName?: string
  showCreateCampaignModal: boolean
  isCreatingCampaign: boolean
  newCampaignName: string
  onCreateCampaignSubmit: (intent: 'edit' | 'launch') => void
  onNewCampaignNameChange: (value: string) => void
  onCloseCreateCampaign: () => void
  showJoinCampaignModal: boolean
  joinInviteInput: string
  isJoiningCampaign: boolean
  onJoinCampaignSubmit: (event: FormEvent) => void
  onJoinInviteInputChange: (value: string) => void
  onCloseJoinCampaign: () => void
  showCampaignSettingsModal: boolean
  settingsHomeTab: CampaignSettingsHomeTab
  onSettingsHomeTabChange: (tab: CampaignSettingsHomeTab) => void
  settingsCampaignSessions: SessionRecord[]
  settingsReferenceSessionId: UUID | ''
  onSettingsReferenceSessionChange: (sessionId: UUID) => void
  settingsReferenceSession: SessionRecord | null
  isSettingsLoading: boolean
  settingsData: CampaignSettingsPayload | null
  isSettingsSaving: boolean
  onCloseCampaignSettings: () => void
  onSaveCampaignSettings: (event: FormEvent) => void
  settingsName: string
  onSettingsNameChange: (value: string) => void
  settingsDescription: string
  onSettingsDescriptionChange: (value: string) => void
  onPosterFileSelected: (event: ChangeEvent<HTMLInputElement>) => void
  isInviteReissuing: boolean
  onCopyInviteUrl: (inviteType: 'PLAYER' | 'SPECTATOR') => void
  onReissueInvite: (inviteType: 'PLAYER' | 'SPECTATOR') => void
  settingsVisibility: 'PUBLIC' | 'PRIVATE'
  onSettingsVisibilityChange: (value: 'PUBLIC' | 'PRIVATE') => void
  settingsSpectatorsEnabled: boolean
  onSettingsSpectatorsEnabledChange: (value: boolean) => void
  settingsSpectatorMax: number
  onSettingsSpectatorMaxChange: (value: number) => void
  settingsSpectatorWaitlistEnabled: boolean
  onSettingsSpectatorWaitlistEnabledChange: (value: boolean) => void
  settingsSpectatorReconnectGraceSecs: number
  onSettingsSpectatorReconnectGraceSecsChange: (value: number) => void
  settingsPostSessionChatEnabled: boolean
  onSettingsPostSessionChatEnabledChange: (value: boolean) => void
  settingsPostSessionChatDurationMinutes: number
  onSettingsPostSessionChatDurationMinutesChange: (value: number) => void
  settingsExtensionSyncPolicy: 'ALLOW' | 'DM_ONLY' | 'NONE'
  onSettingsExtensionSyncPolicyChange: (value: 'ALLOW' | 'DM_ONLY' | 'NONE') => void
  settingsLateJoinPolicy: 'OPEN' | 'SCREENED' | 'BLOCKED'
  onSettingsLateJoinPolicyChange: (value: 'OPEN' | 'SCREENED' | 'BLOCKED') => void
  settingsLateJoinGraceMinutes: number
  onSettingsLateJoinGraceMinutesChange: (value: number) => void
  showUserSettingsModal: boolean
  onUserSettingsOpenChange: (open: boolean) => void
  messageGroupingWindowMs: number
  onMessageGroupingWindowChange: (value: number) => void
  showExitSessionModal: boolean
  currentSessionState?: SessionState | null
  effectiveSessionRole: Role
  exitUpgradePassword: string
  onExitUpgradePasswordChange: (value: string) => void
  exitUpgradeLoading: boolean
  exitUpgradeError: string | null
  onCloseExitSession: () => void
  onSkipGuestUpgrade: () => void
  onUpgradeAndExit: () => void
  onConfirmExitAsFullAccount: () => void
  showStopSessionModal: boolean
  onCloseStopSession: () => void
  onConfirmStopSession: () => void
  showReissueInviteModal: boolean
  reissueInviteType: 'PLAYER' | 'SPECTATOR' | null
  onCloseReissueInviteModal: () => void
  onConfirmReissueInvite: () => void
}

export function SessionInitModals(props: SessionInitModalsProps) {
  const shouldWarnDmDuringActivePlay =
    props.effectiveSessionRole === 'DM' &&
    (props.currentSessionState === 'ACTIVE' || props.currentSessionState === 'PAUSED')
  const shouldWarnDmDuringWrapUp =
    props.effectiveSessionRole === 'DM' && props.currentSessionState === 'COOLDOWN'

  const leaveSessionWarning = shouldWarnDmDuringActivePlay
    ? 'If you leave now, everyone gets the surprise ending. Even if they were mid-scene.'
    : shouldWarnDmDuringWrapUp
      ? 'If you can, stick around until the wrap-up finishes. The curtain is already falling.'
      : null

  const playerInviteUrl = props.settingsData
    ? `${window.location.origin}/join/${encodeURIComponent(props.settingsData.inviteCode)}`
    : ''
  const spectatorInviteUrl =
    props.settingsSpectatorsEnabled && props.settingsData?.spectatorInviteCode
      ? `${window.location.origin}/watch/${encodeURIComponent(props.settingsData.spectatorInviteCode)}`
      : ''

  return (
    <TooltipProvider delayDuration={140}>
      <>
        {props.showCreateCampaignModal ? (
          <div
            className="session-modal-backdrop session-modal-backdrop--top-offset"
            role="presentation"
          >
            <div
              className="session-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Create campaign"
            >
              <h4 className="session-inline-form-title">Create Campaign</h4>
              <p className="session-card-subtitle">
                Create the campaign and either open offline edit/review mode or launch directly.
              </p>
              {props.user.authType === 'GUEST' ? (
                <p className="session-card-subtitle session-card-subtitle--warn">
                  Guest access is campaign-scoped. Upgrade to a full account to create a new
                  campaign.
                </p>
              ) : null}
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                }}
              >
                <label className="session-label" htmlFor="create-campaign-name">
                  Campaign name
                </label>
                <input
                  id="create-campaign-name"
                  type="text"
                  value={props.newCampaignName}
                  onChange={(event) => props.onNewCampaignNameChange(event.target.value)}
                  placeholder="The Emerald Crown"
                  className="session-input"
                  disabled={props.isCreatingCampaign}
                  required
                />
                <div
                  className="session-create-campaign-note"
                  aria-label="Create campaign next steps"
                >
                  <p className="session-create-campaign-note__title">What happens next</p>
                  <ul className="session-create-campaign-note__list">
                    <li>You become the campaign DM.</li>
                    <li>The new campaign appears selected in your lobby.</li>
                    <li>You can open edit/review mode immediately or launch right away.</li>
                  </ul>
                </div>
                <div className="session-action-row session-action-row--right">
                  <button
                    type="button"
                    className="session-button session-button-neutral"
                    onClick={props.onCloseCreateCampaign}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={
                      props.isCreatingCampaign ||
                      !props.newCampaignName.trim() ||
                      props.user.authType === 'GUEST'
                    }
                    className="session-button session-button-brand"
                    onClick={() => props.onCreateCampaignSubmit('edit')}
                  >
                    {props.isCreatingCampaign ? 'Saving...' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    disabled={
                      props.isCreatingCampaign ||
                      !props.newCampaignName.trim() ||
                      props.user.authType === 'GUEST'
                    }
                    className="session-button session-button-indigo"
                    onClick={() => props.onCreateCampaignSubmit('launch')}
                  >
                    {props.isCreatingCampaign ? 'Saving...' : 'Launch'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {props.showJoinCampaignModal ? (
          <div
            className="session-modal-backdrop session-modal-backdrop--top-offset"
            role="presentation"
          >
            <div
              className="session-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Join campaign"
            >
              <h4 className="session-inline-form-title">Join Campaign</h4>
              <form onSubmit={props.onJoinCampaignSubmit}>
                <input
                  type="text"
                  value={props.joinInviteInput}
                  onChange={(event) => props.onJoinInviteInputChange(event.target.value)}
                  placeholder="Invite code or /join link"
                  className="session-input"
                  disabled={props.isJoiningCampaign}
                  required
                />
                <div className="session-action-row session-action-row--right">
                  <button
                    type="button"
                    className="session-button session-button-neutral"
                    onClick={props.onCloseJoinCampaign}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={props.isJoiningCampaign || !props.joinInviteInput.trim()}
                    className="session-button session-button-indigo"
                  >
                    {props.isJoiningCampaign ? 'Joining...' : 'Join'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {props.showCampaignSettingsModal ? (
          <div className="session-modal-backdrop" role="presentation">
            <div
              className="session-modal session-campaign-settings-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Campaign settings"
            >
              <div className="session-campaign-settings-header">
                <div>
                  <h4 className="session-inline-form-title">Campaign Settings</h4>
                  <p className="session-card-subtitle">
                    Manage metadata, poster, and invite links from the lobby.
                  </p>
                </div>
                <div className="session-campaign-settings-header__actions">
                  <button
                    type="submit"
                    form="campaign-settings-form"
                    className="session-icon-action"
                    aria-label={props.isSettingsSaving ? 'Saving settings' : 'Save settings'}
                    disabled={
                      props.settingsHomeTab !== 'home' ||
                      props.isSettingsSaving ||
                      !props.settingsData ||
                      !props.settingsName.trim()
                    }
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {props.isSettingsSaving ? 'hourglass_top' : 'save'}
                    </span>
                  </button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="session-icon-action"
                        aria-label="Close settings"
                        onClick={props.onCloseCampaignSettings}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          close
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Close settings</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              <div
                className="session-campaign-settings-tabs"
                role="tablist"
                aria-label="Settings home tabs"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={props.settingsHomeTab === 'home'}
                  className={`session-campaign-settings-tab ${props.settingsHomeTab === 'home' ? 'is-active' : ''}`}
                  onClick={() => props.onSettingsHomeTabChange('home')}
                >
                  Home
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={props.settingsHomeTab === 'notes'}
                  className={`session-campaign-settings-tab ${props.settingsHomeTab === 'notes' ? 'is-active' : ''}`}
                  onClick={() => props.onSettingsHomeTabChange('notes')}
                  disabled={!props.settingsReferenceSessionId}
                >
                  Notes
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={props.settingsHomeTab === 'journal'}
                  className={`session-campaign-settings-tab ${props.settingsHomeTab === 'journal' ? 'is-active' : ''}`}
                  onClick={() => props.onSettingsHomeTabChange('journal')}
                  disabled={!props.settingsReferenceSessionId}
                >
                  Journal
                </button>
              </div>

              {props.settingsHomeTab === 'journal' && props.settingsCampaignSessions.length > 0 ? (
                <div className="session-campaign-settings-session-context">
                  <label className="session-label" htmlFor="settings-session-context">
                    Session context
                  </label>
                  <select
                    id="settings-session-context"
                    className="session-input"
                    value={props.settingsReferenceSessionId}
                    onChange={(event) =>
                      props.onSettingsReferenceSessionChange(event.target.value as UUID)
                    }
                    disabled={!props.settingsCampaignSessions.length}
                  >
                    {props.settingsCampaignSessions.length === 0 ? (
                      <option value="">No sessions available</option>
                    ) : (
                      [...props.settingsCampaignSessions].reverse().map((session) => (
                        <option key={session.id} value={session.id}>
                          {session.name} ({new Date(session.createdAt).toLocaleDateString()})
                        </option>
                      ))
                    )}
                  </select>
                  {props.settingsReferenceSession ? (
                    <p className="session-card-subtitle">
                      Working in {props.settingsReferenceSession.name} (
                      {props.settingsReferenceSession.id}).
                    </p>
                  ) : null}
                </div>
              ) : null}

              {props.isSettingsLoading ? (
                <div className="session-status-message">Loading campaign settings...</div>
              ) : !props.settingsData ? (
                <div className="session-status-message">Unable to load campaign settings.</div>
              ) : props.settingsHomeTab === 'notes' ? (
                <CampaignScaffoldPanel
                  title="Campaign Notes"
                  subtitle="Notes are being transitioned to campaign-scoped authoring and sharing."
                  sections={[
                    'Campaign notebook landing view',
                    'Handout permissions and targeting',
                    'Pinned references and templates',
                  ]}
                  campaignName={props.selectedCampaignName}
                />
              ) : props.settingsHomeTab === 'journal' ? (
                <CampaignScaffoldPanel
                  title="Campaign Journal"
                  subtitle={
                    props.settingsReferenceSessionId
                      ? `Session context available: ${props.settingsReferenceSession?.name || props.settingsReferenceSessionId}`
                      : 'No session context selected yet.'
                  }
                  sections={[
                    'Session recap flow and timeline anchors',
                    'DM editing guardrails',
                    'Player/spectator read visibility',
                  ]}
                  campaignName={props.selectedCampaignName}
                />
              ) : (
                <div className="session-campaign-settings-grid session-campaign-settings-grid-dialog">
                  <div className="session-campaign-settings-column">
                    <CampaignScaffoldPanel
                      title="Campaign Overview"
                      subtitle="Home now focuses on campaign metadata and policy, not session snapshots."
                      sections={[
                        'Campaign profile and branding',
                        'Invite and visibility controls',
                        'Participation and access policy',
                      ]}
                      campaignName={props.selectedCampaignName}
                    />

                    <form
                      id="campaign-settings-form"
                      className="session-campaign-settings-panel"
                      onSubmit={props.onSaveCampaignSettings}
                    >
                      <h5 className="session-inline-form-title">Campaign Profile</h5>

                      <label className="session-label" htmlFor="campaign-settings-name">
                        Name
                      </label>
                      <input
                        id="campaign-settings-name"
                        className="session-input"
                        type="text"
                        value={props.settingsName}
                        onChange={(event) => props.onSettingsNameChange(event.target.value)}
                        disabled={props.isSettingsSaving}
                        required
                      />

                      <label className="session-label" htmlFor="campaign-settings-description">
                        Description
                      </label>
                      <textarea
                        id="campaign-settings-description"
                        className="session-textarea"
                        value={props.settingsDescription}
                        onChange={(event) => props.onSettingsDescriptionChange(event.target.value)}
                        rows={4}
                        disabled={props.isSettingsSaving}
                      />

                      <label className="session-label" htmlFor="campaign-settings-poster-file">
                        Upload poster
                      </label>
                      <input
                        id="campaign-settings-poster-file"
                        className="session-input"
                        type="file"
                        accept="image/*"
                        onChange={props.onPosterFileSelected}
                        disabled={props.isSettingsSaving}
                      />

                      <p className="session-card-subtitle">
                        Poster appears muted behind the campaign card so text remains readable.
                      </p>
                    </form>

                    <section
                      className="session-campaign-settings-panel session-campaign-invite-panel"
                      aria-label="Invite links"
                    >
                      <h5 className="session-inline-form-title">Invite Links</h5>
                      <div className="session-invite-link-row">
                        <div className="session-invite-link-row__label">Player</div>
                        <div className="session-invite-link-row__input-wrap">
                          <input
                            className="session-invite-link-row__input"
                            type="text"
                            readOnly
                            value={playerInviteUrl}
                            aria-label="Player invite URL"
                          />
                        </div>
                        <div className="session-invite-link-row__actions">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="session-icon-action"
                                aria-label="Copy player invite URL"
                                onClick={() => props.onCopyInviteUrl('PLAYER')}
                              >
                                <span className="material-symbols-outlined" aria-hidden="true">
                                  content_copy
                                </span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Copy player invite URL</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="session-icon-action"
                                aria-label="Refresh player invite URL"
                                disabled={props.isInviteReissuing}
                                onClick={() => props.onReissueInvite('PLAYER')}
                              >
                                <span className="material-symbols-outlined" aria-hidden="true">
                                  refresh
                                </span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Refresh player invite URL</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>

                      <div className="session-invite-link-row">
                        <div className="session-invite-link-row__label">Spectator</div>
                        <div className="session-invite-link-row__input-wrap">
                          <input
                            className="session-invite-link-row__input"
                            type="text"
                            readOnly
                            value={spectatorInviteUrl}
                            aria-label="Spectator invite URL"
                            disabled={!props.settingsSpectatorsEnabled}
                          />
                        </div>
                        <div className="session-invite-link-row__actions">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="session-icon-action"
                                aria-label="Copy spectator invite URL"
                                disabled={
                                  !props.settingsSpectatorsEnabled ||
                                  !props.settingsData.spectatorInviteCode
                                }
                                onClick={() => props.onCopyInviteUrl('SPECTATOR')}
                              >
                                <span className="material-symbols-outlined" aria-hidden="true">
                                  content_copy
                                </span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Copy spectator invite URL</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="session-icon-action"
                                aria-label="Refresh spectator invite URL"
                                disabled={
                                  !props.settingsSpectatorsEnabled || props.isInviteReissuing
                                }
                                onClick={() => props.onReissueInvite('SPECTATOR')}
                              >
                                <span className="material-symbols-outlined" aria-hidden="true">
                                  refresh
                                </span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Refresh spectator invite URL</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </section>
                  </div>

                  <section
                    className="session-campaign-settings-panel session-campaign-settings-panel--compact"
                    aria-label="Campaign settings controls"
                  >
                    <h5 className="session-inline-form-title">Settings</h5>
                    <label className="session-label" htmlFor="campaign-settings-visibility">
                      Visibility
                    </label>
                    <div className="session-toggle-group" role="group" aria-label="Visibility">
                      <button
                        type="button"
                        className={`session-toggle-button ${props.settingsVisibility === 'PUBLIC' ? 'is-active' : ''}`}
                        aria-pressed={props.settingsVisibility === 'PUBLIC'}
                        onClick={() => props.onSettingsVisibilityChange('PUBLIC')}
                        disabled={props.isSettingsSaving}
                      >
                        Public
                      </button>
                      <button
                        type="button"
                        className={`session-toggle-button ${props.settingsVisibility === 'PRIVATE' ? 'is-active' : ''}`}
                        aria-pressed={props.settingsVisibility === 'PRIVATE'}
                        onClick={() => props.onSettingsVisibilityChange('PRIVATE')}
                        disabled={props.isSettingsSaving}
                      >
                        Private
                      </button>
                    </div>

                    <label className="session-label" htmlFor="campaign-settings-spectators">
                      Spectators
                    </label>
                    <div className="session-toggle-group" role="group" aria-label="Spectators">
                      <button
                        type="button"
                        className={`session-toggle-button ${props.settingsSpectatorsEnabled ? 'is-active' : ''}`}
                        aria-pressed={props.settingsSpectatorsEnabled}
                        onClick={() => props.onSettingsSpectatorsEnabledChange(true)}
                        disabled={props.isSettingsSaving}
                      >
                        ON
                      </button>
                      <button
                        type="button"
                        className={`session-toggle-button ${!props.settingsSpectatorsEnabled ? 'is-active' : ''}`}
                        aria-pressed={!props.settingsSpectatorsEnabled}
                        onClick={() => props.onSettingsSpectatorsEnabledChange(false)}
                        disabled={props.isSettingsSaving}
                      >
                        OFF
                      </button>
                    </div>

                    <label className="session-label" htmlFor="campaign-settings-spectator-max">
                      Max spectators: {props.settingsSpectatorMax}
                    </label>
                    <Slider
                      id="campaign-settings-spectator-max"
                      className="session-slider"
                      min={5}
                      max={50}
                      step={5}
                      value={props.settingsSpectatorMax}
                      onValueChange={(nextValue) => props.onSettingsSpectatorMaxChange(nextValue)}
                      disabled={props.isSettingsSaving || !props.settingsSpectatorsEnabled}
                    />

                    <label className="session-label" htmlFor="campaign-settings-waitlist">
                      Spectator waitlist
                    </label>
                    <div
                      className="session-toggle-group"
                      role="group"
                      aria-label="Spectator waitlist"
                    >
                      <button
                        type="button"
                        className={`session-toggle-button ${props.settingsSpectatorWaitlistEnabled ? 'is-active' : ''}`}
                        aria-pressed={props.settingsSpectatorWaitlistEnabled}
                        onClick={() => props.onSettingsSpectatorWaitlistEnabledChange(true)}
                        disabled={props.isSettingsSaving || !props.settingsSpectatorsEnabled}
                      >
                        ON
                      </button>
                      <button
                        type="button"
                        className={`session-toggle-button ${!props.settingsSpectatorWaitlistEnabled ? 'is-active' : ''}`}
                        aria-pressed={!props.settingsSpectatorWaitlistEnabled}
                        onClick={() => props.onSettingsSpectatorWaitlistEnabledChange(false)}
                        disabled={props.isSettingsSaving || !props.settingsSpectatorsEnabled}
                      >
                        OFF
                      </button>
                    </div>

                    <label className="session-label" htmlFor="campaign-settings-reconnect-grace">
                      Spectator reconnect grace (seconds):{' '}
                      {props.settingsSpectatorReconnectGraceSecs}
                    </label>
                    <Slider
                      id="campaign-settings-reconnect-grace"
                      className="session-slider"
                      min={30}
                      max={90}
                      step={5}
                      value={props.settingsSpectatorReconnectGraceSecs}
                      onValueChange={(nextValue) =>
                        props.onSettingsSpectatorReconnectGraceSecsChange(nextValue)
                      }
                      disabled={props.isSettingsSaving || !props.settingsSpectatorsEnabled}
                    />

                    <label className="session-label" htmlFor="campaign-settings-post-session-chat">
                      Post-session spectator chat
                    </label>
                    <div
                      className="session-toggle-group"
                      role="group"
                      aria-label="Post-session spectator chat"
                    >
                      <button
                        type="button"
                        className={`session-toggle-button ${props.settingsPostSessionChatEnabled ? 'is-active' : ''}`}
                        aria-pressed={props.settingsPostSessionChatEnabled}
                        onClick={() => props.onSettingsPostSessionChatEnabledChange(true)}
                        disabled={props.isSettingsSaving}
                      >
                        ON
                      </button>
                      <button
                        type="button"
                        className={`session-toggle-button ${!props.settingsPostSessionChatEnabled ? 'is-active' : ''}`}
                        aria-pressed={!props.settingsPostSessionChatEnabled}
                        onClick={() => props.onSettingsPostSessionChatEnabledChange(false)}
                        disabled={props.isSettingsSaving}
                      >
                        OFF
                      </button>
                    </div>

                    <label
                      className="session-label"
                      htmlFor="campaign-settings-post-session-duration"
                    >
                      Post-session duration: {props.settingsPostSessionChatDurationMinutes} min
                    </label>
                    <Slider
                      id="campaign-settings-post-session-duration"
                      className="session-slider"
                      min={1}
                      max={15}
                      step={1}
                      value={props.settingsPostSessionChatDurationMinutes}
                      onValueChange={(nextValue) =>
                        props.onSettingsPostSessionChatDurationMinutesChange(nextValue)
                      }
                      disabled={props.isSettingsSaving || !props.settingsPostSessionChatEnabled}
                    />
                    <p className="session-card-subtitle">
                      Default 5 minutes. Minimum 1 minute, maximum 15 minutes.
                    </p>

                    <label
                      className="session-label"
                      htmlFor="campaign-settings-extension-sync-policy"
                    >
                      Extension sync policy
                    </label>
                    <div
                      className="session-toggle-group"
                      role="group"
                      aria-label="Extension sync policy"
                    >
                      <button
                        type="button"
                        className={`session-toggle-button ${props.settingsExtensionSyncPolicy === 'ALLOW' ? 'is-active' : ''}`}
                        aria-pressed={props.settingsExtensionSyncPolicy === 'ALLOW'}
                        onClick={() => props.onSettingsExtensionSyncPolicyChange('ALLOW')}
                        disabled={props.isSettingsSaving}
                      >
                        ALLOW
                      </button>
                      <button
                        type="button"
                        className={`session-toggle-button ${props.settingsExtensionSyncPolicy === 'DM_ONLY' ? 'is-active' : ''}`}
                        aria-pressed={props.settingsExtensionSyncPolicy === 'DM_ONLY'}
                        onClick={() => props.onSettingsExtensionSyncPolicyChange('DM_ONLY')}
                        disabled={props.isSettingsSaving}
                      >
                        DM_ONLY
                      </button>
                      <button
                        type="button"
                        className={`session-toggle-button ${props.settingsExtensionSyncPolicy === 'NONE' ? 'is-active' : ''}`}
                        aria-pressed={props.settingsExtensionSyncPolicy === 'NONE'}
                        onClick={() => props.onSettingsExtensionSyncPolicyChange('NONE')}
                        disabled={props.isSettingsSaving}
                      >
                        NONE
                      </button>
                    </div>

                    <label className="session-label" htmlFor="campaign-settings-late-join-policy">
                      Late join policy
                    </label>
                    <div
                      className="session-toggle-group"
                      role="group"
                      aria-label="Late join policy"
                    >
                      <button
                        type="button"
                        className={`session-toggle-button ${props.settingsLateJoinPolicy === 'OPEN' ? 'is-active' : ''}`}
                        aria-pressed={props.settingsLateJoinPolicy === 'OPEN'}
                        onClick={() => props.onSettingsLateJoinPolicyChange('OPEN')}
                        disabled={props.isSettingsSaving}
                      >
                        OPEN
                      </button>
                      <button
                        type="button"
                        className={`session-toggle-button ${props.settingsLateJoinPolicy === 'SCREENED' ? 'is-active' : ''}`}
                        aria-pressed={props.settingsLateJoinPolicy === 'SCREENED'}
                        onClick={() => props.onSettingsLateJoinPolicyChange('SCREENED')}
                        disabled={props.isSettingsSaving}
                      >
                        SCREENED
                      </button>
                      <button
                        type="button"
                        className={`session-toggle-button ${props.settingsLateJoinPolicy === 'BLOCKED' ? 'is-active' : ''}`}
                        aria-pressed={props.settingsLateJoinPolicy === 'BLOCKED'}
                        onClick={() => props.onSettingsLateJoinPolicyChange('BLOCKED')}
                        disabled={props.isSettingsSaving}
                      >
                        BLOCKED
                      </button>
                    </div>

                    <label className="session-label" htmlFor="campaign-settings-late-join-grace">
                      Late join grace (minutes): {props.settingsLateJoinGraceMinutes}
                    </label>
                    <Slider
                      id="campaign-settings-late-join-grace"
                      className="session-slider"
                      min={30}
                      max={90}
                      step={10}
                      value={props.settingsLateJoinGraceMinutes}
                      onValueChange={(nextValue) =>
                        props.onSettingsLateJoinGraceMinutesChange(nextValue)
                      }
                      disabled={props.isSettingsSaving || props.settingsLateJoinPolicy === 'OPEN'}
                    />
                  </section>
                </div>
              )}
            </div>
          </div>
        ) : null}

        <DialogPrimitive.Root
          open={props.showUserSettingsModal}
          onOpenChange={props.onUserSettingsOpenChange}
        >
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="session-modal-backdrop session-modal-backdrop--overlay" />
            <DialogPrimitive.Content className="session-modal session-user-settings-modal session-modal--floating">
              <DialogPrimitive.Title className="session-inline-form-title">
                User Settings
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                Configure your user preferences.
              </DialogPrimitive.Description>
              <SessionUserSettingsPanel
                messageGroupingWindowMs={props.messageGroupingWindowMs}
                onMessageGroupingWindowChange={props.onMessageGroupingWindowChange}
                apiUrl={props.apiUrl}
                token={props.token}
                userId={props.user.id}
                username={props.user.username}
              />
              <div className="session-action-row">
                <DialogPrimitive.Close asChild>
                  <button type="button" className="session-button session-button-neutral">
                    Close
                  </button>
                </DialogPrimitive.Close>
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        {props.showExitSessionModal ? (
          <div
            className="session-modal-backdrop session-modal-backdrop--top-offset"
            role="presentation"
          >
            <div
              className="session-modal session-modal--confirm-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Exit session"
            >
              <h4 className="session-inline-form-title">Leave Session</h4>
              {leaveSessionWarning ? (
                <p className="session-card-subtitle session-card-subtitle--warn">
                  {leaveSessionWarning}
                </p>
              ) : null}
              {props.user.authType === 'GUEST' ? (
                <>
                  <p className="session-card-subtitle">
                    Add a password now to save this guest account before you leave. Or skip and sign
                    out.
                  </p>
                  <p className="session-card-subtitle">
                    If you skip, you will need your invite link to get back in.
                  </p>

                  <label className="session-label" htmlFor="exit-upgrade-password">
                    Password to upgrade account
                  </label>
                  <input
                    id="exit-upgrade-password"
                    type="password"
                    className="session-input"
                    value={props.exitUpgradePassword}
                    onChange={(event) => props.onExitUpgradePasswordChange(event.target.value)}
                    autoComplete="new-password"
                    disabled={props.exitUpgradeLoading}
                  />

                  {props.exitUpgradeError ? (
                    <p className="session-card-subtitle">{props.exitUpgradeError}</p>
                  ) : null}

                  <div className="session-action-row session-action-row--confirm-dialog">
                    <button
                      type="button"
                      className="session-button session-button-neutral"
                      onClick={props.onCloseExitSession}
                      disabled={props.exitUpgradeLoading}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="session-button session-button-warn"
                      onClick={props.onSkipGuestUpgrade}
                      disabled={props.exitUpgradeLoading}
                    >
                      Skip
                    </button>
                    <button
                      type="button"
                      className="session-button session-button-success"
                      onClick={props.onUpgradeAndExit}
                      disabled={props.exitUpgradeLoading || !props.exitUpgradePassword.trim()}
                    >
                      {props.exitUpgradeLoading ? 'Upgrading...' : 'Upgrade and Exit'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="session-card-subtitle">Leave now and go back to campaign select?</p>
                  <p className="session-card-subtitle">
                    Any unsaved screen changes on this page will disappear.
                  </p>
                  <div className="session-action-row session-action-row--confirm-dialog">
                    <button
                      type="button"
                      className="session-button session-button-neutral"
                      onClick={props.onCloseExitSession}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="session-button session-button-primary"
                      onClick={props.onConfirmExitAsFullAccount}
                    >
                      OK
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}

        {props.showStopSessionModal ? (
          <div
            className="session-modal-backdrop session-modal-backdrop--top-offset"
            role="presentation"
            onClick={props.onCloseStopSession}
          >
            <div
              className="session-modal session-modal--confirm-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="End session"
              onClick={(event) => event.stopPropagation()}
            >
              <h4 className="session-inline-form-title">End Session</h4>
              <p className="session-card-subtitle">End this session for everyone?</p>
              <p className="session-card-subtitle">
                This ends tonight&apos;s chapter for the whole table. Final scene, then credits.
              </p>
              <div className="session-action-row session-action-row--confirm-dialog">
                <button
                  type="button"
                  className="session-button session-button-neutral"
                  onClick={props.onCloseStopSession}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="session-button session-button-warn"
                  onClick={props.onConfirmStopSession}
                >
                  End Session
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <DialogPrimitive.Root
          open={props.showReissueInviteModal}
          onOpenChange={(open) => {
            if (!open) {
              props.onCloseReissueInviteModal()
            }
          }}
        >
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="session-modal-backdrop session-modal-backdrop--overlay" />
            <DialogPrimitive.Content className="session-modal session-modal--confirm-dialog session-modal--floating">
              <DialogPrimitive.Title className="session-inline-form-title">
                Refresh {props.reissueInviteType === 'SPECTATOR' ? 'Watch' : 'Join'} Link
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="session-card-subtitle">
                Refresh this invite? Existing links will stop working for new joins.
              </DialogPrimitive.Description>
              <div className="session-action-row session-action-row--confirm-dialog">
                <button
                  type="button"
                  className="session-button session-button-neutral"
                  onClick={props.onCloseReissueInviteModal}
                  disabled={props.isInviteReissuing}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="session-button session-button-warn"
                  onClick={props.onConfirmReissueInvite}
                  disabled={props.isInviteReissuing || !props.reissueInviteType}
                >
                  {props.isInviteReissuing ? 'Refreshing...' : 'Refresh Link'}
                </button>
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </>
    </TooltipProvider>
  )
}
