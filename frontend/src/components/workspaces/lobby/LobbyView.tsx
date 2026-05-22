import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { type CampaignSummary } from '@/types/session/campaign'
import { CampaignCard } from './LobbyView.CampaignCard'
import { WorkspaceTopbar } from '@/components/workspaces/shared/toolbar/WorkspaceTopbar'
import { useCampaignWorkspaceTopbarActions } from '@/components/workspaces/shared/toolbar/useCampaignWorkspaceTopbarActions'

type LobbyViewProps = {
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

export function LobbyView(props: LobbyViewProps) {
  const discoverableCampaigns = props.discoverableCampaigns ?? []
  const totalVisibleCampaigns = props.campaigns.length + discoverableCampaigns.length
  const shouldShowSparseFiller = !props.isLoadingCampaigns && totalVisibleCampaigns <= 3
  const { coreStateToneClass, topbarActions } = useCampaignWorkspaceTopbarActions({
    isCreatingCampaign: props.isCreatingCampaign,
    isJoiningCampaign: props.isJoiningCampaign,
    onCreateCampaign: props.onCreateCampaign,
    onJoinCampaign: props.onJoinCampaign,
    coreWsState: props.connectionStatus.coreWsState,
  })

  return (
    <TooltipProvider delayDuration={140}>
      <div
        className="session-lobby-view"
        data-testid="session-lobby-view"
        data-ui-component="LobbyView"
        data-ui-state={props.isLoadingCampaigns ? 'loading' : 'ready'}
      >
        <WorkspaceTopbar
          className="session-toolbar--lobby"
          dataTestId="session-lobby-toolbar"
          dataUiComponent="LobbyToolbar"
          brandAriaLabel="Lobby toolbar"
          extraActions={topbarActions}
          themeMode={props.themeMode}
          onToggleTheme={props.onToggleTheme}
          onOpenUserSettings={props.onOpenUserSettings}
          onExit={props.onLogoff}
          exitAriaLabel="Logoff"
          exitTooltipLabel="Logoff"
          connectionStatusColorKey={props.connectionStatus.statusColorKey}
          connectionStatusLabel={props.connectionStatus.label}
          connectionStatusRows={[
            {
              label: 'Core',
              value: props.connectionStatus.coreWsState,
              toneClassName: coreStateToneClass,
            },
          ]}
        />

        <section
          className="session-lobby-stats"
          aria-label="Lobby system stats"
          data-ui-component="LobbyStatsBar"
        >
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

        <div
          className="session-card session-card--lobby-list session-card--lobby-list-primary"
          data-ui-component="LobbyCampaignList"
          data-ui-state={totalVisibleCampaigns > 0 ? 'has-campaigns' : 'empty'}
        >
          <div className="session-card-header">
            <div>
              <h3 className="session-card-title">Campaigns</h3>
            </div>
          </div>

          <div className="session-lobby-campaign-sections">
            <section
              className="session-lobby-campaign-section"
              aria-label="Member or DM campaigns"
              data-ui-component="LobbyOwnedCampaignSection"
            >
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
                  data-ui-component="LobbyDiscoverableCampaignSection"
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
