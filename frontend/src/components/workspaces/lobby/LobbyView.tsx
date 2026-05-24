import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { type CampaignSummary } from '@/types/session/campaign'
import type { LobbyConnectionStatus, LobbyStats } from '@/types/session/lobby'
import { CampaignCard } from './LobbyView.CampaignCard'
import { LobbyToolbar } from '@/components/workspaces/shared/toolbar/LobbyToolbar'

type LobbyViewProps = {
  campaigns: CampaignSummary[]
  discoverableCampaigns?: CampaignSummary[]
  lobbyStats: LobbyStats
  selectedCampaignId: CampaignSummary['id'] | ''
  isLoadingCampaigns: boolean
  isCreatingCampaign: boolean
  isJoiningCampaign: boolean
  themeMode: 'light' | 'dark'
  connectionStatus: LobbyConnectionStatus
  onSelectCampaign: (campaignId: CampaignSummary['id']) => void
  onCreateCampaign: () => void
  onJoinCampaign: () => void
  onToggleTheme: () => void
  onOpenUserSettings: () => void
  onLogoff: () => void
  onOpenCampaignSettings: (campaignId: CampaignSummary['id']) => void
  onEnterCampaign: (campaignId: CampaignSummary['id']) => void
  onError: (message: string) => void
  onJoinRequest: (campaign: CampaignSummary) => void
  onWatchCampaign: (campaign: CampaignSummary) => void
}

export function LobbyView(props: LobbyViewProps) {
  const discoverableCampaigns = props.discoverableCampaigns ?? []
  const totalVisibleCampaigns = props.campaigns.length + discoverableCampaigns.length
  const shouldShowSparseFiller = !props.isLoadingCampaigns && totalVisibleCampaigns <= 3

  return (
    <TooltipProvider delayDuration={140}>
      <div
        className="workspaces-lobby-view"
        data-testid="workspaces-lobby-view"
        data-ui-component="LobbyView"
        data-ui-state={props.isLoadingCampaigns ? 'loading' : 'ready'}
      >
        <LobbyToolbar
          themeMode={props.themeMode}
          isCreatingCampaign={props.isCreatingCampaign}
          isJoiningCampaign={props.isJoiningCampaign}
          connectionStatus={props.connectionStatus}
          onCreateCampaign={props.onCreateCampaign}
          onJoinCampaign={props.onJoinCampaign}
          onToggleTheme={props.onToggleTheme}
          onOpenUserSettings={props.onOpenUserSettings}
          onLogoff={props.onLogoff}
        />

        <section
          className="workspaces-lobby-stats"
          aria-label="Lobby system stats"
          data-ui-component="LobbyStatsBar"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="workspaces-lobby-stats__chip">
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
              <span className="workspaces-lobby-stats__chip">
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
              <span className="workspaces-lobby-stats__chip">
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
              <span className="workspaces-lobby-stats__chip">
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
              <span className="workspaces-lobby-stats__chip">
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

        <div
          className="session-card workspaces-card--lobby-list workspaces-card--lobby-list-primary"
          data-ui-component="LobbyCampaignList"
          data-ui-state={totalVisibleCampaigns > 0 ? 'has-campaigns' : 'empty'}
        >
          <div className="session-card-header">
            <div>
              <h3 className="session-card-title">Adventures</h3>
            </div>
          </div>

          <div className="workspaces-lobby-campaign-sections">
            <section
              className="workspaces-lobby-campaign-section"
              aria-label="Member or DM campaigns"
              data-ui-component="LobbyOwnedCampaignSection"
            >
              <div className="workspaces-lobby-campaign-section__frame">
                <h4 className="workspaces-lobby-campaign-section__title">Your Adventures</h4>
                {props.isLoadingCampaigns ? (
                  <div className="workspaces-status-message">Loading campaigns...</div>
                ) : props.campaigns.length === 0 ? (
                  <div className="workspaces-status-message">No campaigns available yet.</div>
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
              </div>
            </section>

            {discoverableCampaigns.length > 0 && (
              <>
                <div
                  className="workspaces-lobby-campaign-divider"
                  role="separator"
                  aria-hidden="true"
                />
                <section
                  className="workspaces-lobby-campaign-section"
                  aria-label="Discoverable campaigns"
                  data-ui-component="LobbyDiscoverableCampaignSection"
                >
                  <div className="workspaces-lobby-campaign-section__frame">
                    <h4 className="workspaces-lobby-campaign-section__title">
                      Discover Adventures
                    </h4>
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
                  </div>
                </section>
              </>
            )}

            {shouldShowSparseFiller && (
              <div className="workspaces-lobby-campaign-filler" aria-hidden="true">
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
