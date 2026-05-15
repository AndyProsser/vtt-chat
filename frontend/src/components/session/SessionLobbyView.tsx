import { Icon } from '../ui/Icon'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../core-ui'
import {
  type CampaignSummary,
  getCampaignDisplayState,
  getCampaignEntryAction,
  getPrivacyCounterLabel,
} from './sessionInit.shared'

type SessionLobbyViewProps = {
  campaigns: CampaignSummary[]
  selectedCampaignId: CampaignSummary['id'] | ''
  currentUserId: string
  isLoadingCampaigns: boolean
  isCreatingCampaign: boolean
  isJoiningCampaign: boolean
  themeMode: 'light' | 'dark'
  connectionStatus: {
    statusColorKey: string
    label: string
    coreWsState: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED'
  }
  onSelectCampaign: (campaignId: CampaignSummary['id']) => void
  onCreateCampaign: () => void
  onJoinCampaign: () => void
  onToggleTheme: () => void
  onOpenUserSettings: () => void
  onLogoff: () => void
  onOpenCampaignSettings: (campaignId: CampaignSummary['id']) => void
  onEnterCampaign: (campaignId: CampaignSummary['id']) => void
  onError: (message: string) => void
}

export function SessionLobbyView(props: SessionLobbyViewProps) {
  return (
    <>
      <div className="session-toolbar session-toolbar--lobby" data-testid="session-lobby-toolbar">
        <div className="session-toolbar__zone session-toolbar__zone--left">
          <div className="session-toolbar__brand" aria-label="Lobby toolbar">
            <span className="session-toolbar__brand-mark" aria-hidden="true">
              <img src="/branding/app-logo.png" alt="" className="session-toolbar__brand-logo" />
            </span>
            <strong className="session-toolbar__brand-title">VTT Chat</strong>
          </div>
        </div>

        <div className="session-toolbar__zone session-toolbar__zone--right">
          <TooltipProvider delayDuration={140}>
            <div className="session-toolbar__extra-buttons" aria-label="Campaign actions">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="session-toolbar__icon-btn"
                    onClick={props.onCreateCampaign}
                    disabled={props.isCreatingCampaign}
                    aria-label="Create campaign"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      add_circle
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end">
                  Create Campaign
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="session-toolbar__icon-btn"
                    onClick={props.onJoinCampaign}
                    disabled={props.isJoiningCampaign}
                    aria-label="Join campaign"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      group_add
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end">
                  Join Campaign
                </TooltipContent>
              </Tooltip>
            </div>

            <span className="session-toolbar__separator" aria-hidden="true" />

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="session-toolbar__icon-btn"
                  onClick={props.onToggleTheme}
                  aria-label="Theme"
                >
                  <Icon name={props.themeMode === 'dark' ? 'sun' : 'moon'} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">
                Theme
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="session-toolbar__icon-btn"
                  onClick={props.onOpenUserSettings}
                  aria-label="Settings"
                >
                  <Icon name="settings" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">
                Settings
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="session-toolbar__icon-btn session-toolbar__icon-btn--exit"
                  onClick={props.onLogoff}
                  aria-label="Logoff"
                >
                  <Icon name="logout" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">
                Logoff
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="session-toolbar__connection"
                  data-status-color={props.connectionStatus.statusColorKey}
                  aria-label={`Connection: ${props.connectionStatus.label}`}
                  role="status"
                >
                  <span className="session-toolbar__connection-dot" aria-hidden="true" />
                </span>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="end"
                className="session-toolbar__tooltip-content--status"
              >
                <div className="session-toolbar__status-tooltip-title">Status</div>
                <div className="session-toolbar__status-tooltip-row">
                  <span>Core</span>
                  <strong
                    className={
                      props.connectionStatus.coreWsState === 'CONNECTED'
                        ? 'is-green'
                        : props.connectionStatus.coreWsState === 'CONNECTING'
                          ? 'is-yellow'
                          : 'is-red'
                    }
                  >
                    {props.connectionStatus.coreWsState}
                  </strong>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="session-card">
        <div className="session-card-header">
          <div>
            <h3 className="session-card-title">Campaigns</h3>
          </div>
        </div>

        {props.isLoadingCampaigns ? (
          <div className="session-status-message">Loading campaigns...</div>
        ) : props.campaigns.length === 0 ? (
          <div className="session-status-message">No campaigns available yet.</div>
        ) : (
          <div className="session-campaign-grid" role="list" aria-label="Campaign list">
            {props.campaigns.map((campaign) => {
              const isSelected = props.selectedCampaignId === campaign.id
              const state = getCampaignDisplayState(campaign)
              const entryAction = getCampaignEntryAction(campaign)
              const dmStatus = campaign.dmOnline ? 'Online' : 'Offline'
              const playersLabel = getPrivacyCounterLabel(
                campaign.connectedPlayersLabel,
                campaign.connectedPlayersRounded
              )
              const spectatorsLabel = getPrivacyCounterLabel(
                campaign.connectedSpectatorsLabel,
                campaign.connectedSpectatorsRounded
              )
              const isCampaignDm = campaign.currentDmId === props.currentUserId
              const dmDisplayName = campaign.dmDisplayName || campaign.dmUsername || 'DM'
              const dmInitial = dmDisplayName.charAt(0).toUpperCase()
              const cardPosterUrl = campaign.posterUrl || undefined

              return (
                <div
                  key={campaign.id}
                  role="listitem"
                  tabIndex={0}
                  onClick={() => props.onSelectCampaign(campaign.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      props.onSelectCampaign(campaign.id)
                    }
                  }}
                  className={`session-campaign-card ${isSelected ? 'is-selected' : ''} ${cardPosterUrl ? 'has-poster' : ''}`}
                  style={
                    cardPosterUrl
                      ? {
                          backgroundImage: `linear-gradient(rgba(12, 17, 28, 0.62), rgba(12, 17, 28, 0.62)), url(${cardPosterUrl})`,
                        }
                      : undefined
                  }
                >
                  <span className="session-campaign-card__header">
                    <span className="session-campaign-card__title">
                      <span
                        className={`session-campaign-card__state-dot state-${state.toLowerCase()}`}
                        aria-label={`Campaign ${state.toLowerCase()}`}
                      />
                      <span>{campaign.name}</span>
                    </span>
                    <span
                      className="session-campaign-card__stats"
                      aria-label="Campaign activity stats"
                    >
                      <span className="session-campaign-card__stat" title="Connected players">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          groups
                        </span>
                        <span>{playersLabel}</span>
                      </span>
                      <span className="session-campaign-card__stat" title="Connected spectators">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          visibility
                        </span>
                        <span>{spectatorsLabel}</span>
                      </span>
                    </span>
                  </span>
                  <span
                    className={`session-campaign-card__dm session-campaign-card__dm--${campaign.dmOnline ? 'online' : 'offline'}`}
                  >
                    {campaign.dmAvatarUrl ? (
                      <img
                        src={campaign.dmAvatarUrl}
                        alt={`${dmDisplayName} avatar`}
                        className="session-campaign-card__dm-avatar"
                      />
                    ) : (
                      <span className="session-campaign-card__dm-avatar session-campaign-card__dm-avatar--fallback">
                        {dmInitial}
                      </span>
                    )}
                    <span className="session-campaign-card__dm-name">{dmDisplayName}</span>
                    <span className="session-campaign-card__dm-status">{dmStatus}</span>
                  </span>
                  <span className="session-campaign-card__description">
                    {campaign.description || 'No description provided.'}
                  </span>
                  <span className="session-campaign-card__actions">
                    {isCampaignDm ? (
                      <button
                        type="button"
                        className="session-card-action-button"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          props.onOpenCampaignSettings(campaign.id)
                        }}
                        title="Campaign settings"
                        aria-label="Campaign settings"
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          tune
                        </span>
                        <span>Settings</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="session-card-action-button session-card-action-button-launch"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        if (entryAction.disabled) {
                          if (entryAction.reason) {
                            props.onError(entryAction.reason)
                          }
                          return
                        }
                        props.onEnterCampaign(campaign.id)
                      }}
                      title={entryAction.reason || `${entryAction.label} campaign`}
                      aria-label={entryAction.reason || `${entryAction.label} campaign`}
                      disabled={entryAction.disabled}
                    >
                      <span>{entryAction.label}</span>
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {entryAction.icon}
                      </span>
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
