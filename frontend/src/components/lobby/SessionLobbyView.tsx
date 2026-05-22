import { Icon } from '../ui/Icon'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../core-ui'
import { type CampaignSummary } from '../campaign-runtime/sessionInit.shared'
import { CampaignCard } from './SessionLobbyView.CampaignCard'

type SessionLobbyViewProps = {
  campaigns: CampaignSummary[]
  discoverableCampaigns?: CampaignSummary[]
  lobbyStats: {
    activeSessions: number
    connectedPlayersAndDms: number
    connectedSpectators: number
    peakConcurrentUsers24h: number
    totalTimePlayedLabel: string
    activeCampaigns: number
    pausedCampaigns: number
    averageSessionDurationLabel: string
  }
  selectedCampaignId: CampaignSummary['id'] | ''
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
  onJoinRequest: (campaignId: CampaignSummary['id']) => void
  onWatchCampaign: (campaignId: CampaignSummary['id']) => void
}

export function SessionLobbyView(props: SessionLobbyViewProps) {
  const discoverableCampaigns = props.discoverableCampaigns ?? []
  const totalVisibleCampaigns = props.campaigns.length + discoverableCampaigns.length
  const shouldShowSparseFiller = !props.isLoadingCampaigns && totalVisibleCampaigns <= 3

  return (
    <TooltipProvider delayDuration={140}>
      <div className="session-lobby-view" data-testid="session-lobby-view">
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
            <div className="session-toolbar__extra-buttons" aria-label="Campaign actions">
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  className="session-toolbar__icon-btn"
                  onClick={props.onCreateCampaign}
                  disabled={props.isCreatingCampaign}
                  aria-label="Create campaign"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    add_circle
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end">
                  Create Campaign
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  type="button"
                  className="session-toolbar__icon-btn"
                  onClick={props.onJoinCampaign}
                  disabled={props.isJoiningCampaign}
                  aria-label="Join campaign"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    group_add
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end">
                  Join Campaign
                </TooltipContent>
              </Tooltip>
            </div>

            <span className="session-toolbar__separator" aria-hidden="true" />

            <Tooltip>
              <TooltipTrigger
                type="button"
                className="session-toolbar__icon-btn"
                onClick={props.onToggleTheme}
                aria-label="Theme"
              >
                <Icon name={props.themeMode === 'dark' ? 'sun' : 'moon'} />
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">
                Theme
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                type="button"
                className="session-toolbar__icon-btn"
                onClick={props.onOpenUserSettings}
                aria-label="Settings"
              >
                <Icon name="settings" />
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">
                Settings
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                type="button"
                className="session-toolbar__icon-btn session-toolbar__icon-btn--exit"
                onClick={props.onLogoff}
                aria-label="Logoff"
              >
                <Icon name="logout" />
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">
                Logoff
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                type="button"
                className="session-toolbar__connection"
                data-status-color={props.connectionStatus.statusColorKey}
                aria-label={`Connection: ${props.connectionStatus.label}`}
              >
                <span className="session-toolbar__connection-dot" aria-hidden="true" />
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
          </div>
        </div>

        <section className="session-lobby-stats" aria-label="Lobby system stats">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="session-lobby-stats__chip">
                <span className="material-symbols-outlined" aria-hidden="true">
                  rocket_launch
                </span>
                <strong>{props.lobbyStats.activeSessions}</strong>
                <span>Active</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">
              {props.lobbyStats.activeCampaigns} campaigns live now,{' '}
              {props.lobbyStats.pausedCampaigns} paused.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="session-lobby-stats__chip">
                <span className="material-symbols-outlined" aria-hidden="true">
                  groups
                </span>
                <strong>{props.lobbyStats.connectedPlayersAndDms}</strong>
                <span>Players + DMs</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">
              Connected players and DMs across campaigns.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="session-lobby-stats__chip">
                <span className="material-symbols-outlined" aria-hidden="true">
                  visibility
                </span>
                <strong>{props.lobbyStats.connectedSpectators}</strong>
                <span>Spectators</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">
              Connected spectators across campaigns.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="session-lobby-stats__chip">
                <span className="material-symbols-outlined" aria-hidden="true">
                  schedule
                </span>
                <strong>{props.lobbyStats.totalTimePlayedLabel}</strong>
                <span>Total played</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">
              Total Session time.
              <br />
              Average/session: {props.lobbyStats.averageSessionDurationLabel}.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="session-lobby-stats__chip">
                <span className="material-symbols-outlined" aria-hidden="true">
                  speed
                </span>
                <strong>{props.lobbyStats.peakConcurrentUsers24h}</strong>
                <span>Peak 24h</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">
              Highest concurrent connected users in the last 24 hours.
            </TooltipContent>
          </Tooltip>
        </section>

        <div className="session-card session-card--lobby-list session-card--lobby-list-primary">
          <div className="session-card-header">
            <div>
              <h3 className="session-card-title">Campaigns</h3>
            </div>
          </div>

          <div className="session-lobby-campaign-sections">
            <section className="session-lobby-campaign-section" aria-label="Member or DM campaigns">
              <h4 className="session-lobby-campaign-section__title">Your Campiagns</h4>
              {props.isLoadingCampaigns ? (
                <div className="session-status-message">Loading campaigns...</div>
              ) : props.campaigns.length === 0 ? (
                <div className="session-status-message">No campaigns available yet.</div>
              ) : (
                <div className="session-campaign-grid" role="list" aria-label="Campaign list">
                  {props.campaigns.map((campaign) => (
                    <CampaignCard
                      key={campaign.id}
                      campaign={campaign}
                      isSelected={props.selectedCampaignId === campaign.id}
                      onSelectCampaign={props.onSelectCampaign}
                      onOpenCampaignSettings={props.onOpenCampaignSettings}
                      onEnterCampaign={props.onEnterCampaign}
                      onJoinRequest={props.onJoinRequest}
                      onWatchCampaign={props.onWatchCampaign}
                      onError={props.onError}
                    />
                  ))}
                </div>
              )}
            </section>

            {discoverableCampaigns.length > 0 && (
              <>
                <div
                  className="session-lobby-campaign-divider"
                  role="separator"
                  aria-hidden="true"
                />
                <section
                  className="session-lobby-campaign-section"
                  aria-label="Discoverable campaigns"
                >
                  <h4 className="session-lobby-campaign-section__title">Discoverable</h4>
                  <div
                    className="session-campaign-grid"
                    role="list"
                    aria-label="Discoverable campaigns"
                  >
                    {discoverableCampaigns.map((campaign) => (
                      <CampaignCard
                        key={campaign.id}
                        campaign={campaign}
                        isSelected={props.selectedCampaignId === campaign.id}
                        onSelectCampaign={props.onSelectCampaign}
                        onOpenCampaignSettings={props.onOpenCampaignSettings}
                        onEnterCampaign={props.onEnterCampaign}
                        onJoinRequest={props.onJoinRequest}
                        onWatchCampaign={props.onWatchCampaign}
                        onError={props.onError}
                      />
                    ))}
                  </div>
                </section>
              </>
            )}

            {shouldShowSparseFiller && (
              <div className="session-lobby-campaign-filler" aria-hidden="true">
                <span className="material-symbols-outlined" aria-hidden="true">
                  auto_awesome
                </span>
                <span>More adventures will appear here as campaigns join your roster.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
