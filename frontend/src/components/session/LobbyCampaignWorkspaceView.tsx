import { type ReactNode, useMemo, useState } from 'react'
import { Role, type UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../core-ui'
import { Icon } from '../ui/Icon'
import { CampaignInformationPanel } from './CampaignInformationPanel'
import { CampaignScaffoldPanel } from './CampaignScaffoldPanel'
import { InvitePopoverWidget } from './InvitePopoverWidget'
import {
  type WorkspaceTab,
  getTabIcon,
  getTabLabel,
  getTabsForRole,
} from './LobbyCampaignWorkspaceView.tabs'
import type { CampaignSummary } from './sessionInit.shared'

type LobbyCampaignWorkspaceViewProps = {
  campaign: CampaignSummary | null
  role: Role
  themeMode: 'light' | 'dark'
  isCreatingCampaign: boolean
  isJoiningCampaign: boolean
  connectionStatus: {
    statusColorKey: string
    label: string
    coreWsState: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED'
  }
  sessionCount: number
  totalSessionDurationMs: number
  canEditCampaignInfo: boolean
  isLaunchDisabled: boolean
  launchDisabledReason?: string
  showInviteWidget: boolean
  joinUrl: string
  watchUrl: string
  spectatorsEnabled: boolean
  isInviteReissuing: boolean
  settingsPanel: ReactNode
  onBackToLobby: () => void
  onCreateCampaign: () => void
  onJoinCampaign: () => void
  onToggleTheme: () => void
  onOpenUserSettings: () => void
  onLogoff: () => void
  onLaunch: (campaignId: UUID) => void
  onCopyInviteUrl: (inviteType: 'PLAYER' | 'SPECTATOR') => void
  onReissueInvite: (inviteType: 'PLAYER' | 'SPECTATOR') => void
  onSaveCampaignInfo: (
    campaignId: UUID,
    updates: {
      name: string
      description: string
      posterUrl: string | null
      integrationSyncPolicy: 'ALLOW' | 'DM_ONLY' | 'NONE'
    }
  ) => Promise<void>
}

export function LobbyCampaignWorkspaceView(props: LobbyCampaignWorkspaceViewProps) {
  const tabs = useMemo(() => getTabsForRole(props.role), [props.role])
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(tabs[0] || 'information')

  const resolvedActiveTab = tabs.includes(activeTab) ? activeTab : tabs[0] || 'information'

  if (!props.campaign) {
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
        </div>
        <section className="session-lobby-workspace" aria-label="Campaign review workspace">
          <div className="session-status-message">Select a campaign from the lobby to review.</div>
        </section>
      </>
    )
  }

  // Campaign is now non-null for the rest of this component
  const campaign = props.campaign

  const renderPanel = () => {
    if (resolvedActiveTab === 'information') {
      return (
        <CampaignInformationPanel
          campaign={campaign}
          sessionCount={props.sessionCount}
          totalSessionDurationMs={props.totalSessionDurationMs}
          canEdit={props.canEditCampaignInfo}
          workspaceMode
          onSaveCampaignInfo={props.onSaveCampaignInfo}
        />
      )
    }

    if (resolvedActiveTab === 'party') {
      return (
        <CampaignScaffoldPanel
          title="Party"
          subtitle="Campaign members and their current status."
          sections={[
            'Review all campaign players including offline members',
            'Check connection status and last seen timestamps',
            'View active conditions and character stats',
          ]}
          campaignName={campaign.name}
        />
      )
    }

    if (resolvedActiveTab === 'notes') {
      return (
        <CampaignScaffoldPanel
          title="Campaign Notes"
          subtitle="Offline authoring space for handouts and prep notes."
          sections={[
            'Compose and organize campaign notes',
            'Manage sharing targets before launch',
            'Review tagged references by topic',
          ]}
          campaignName={campaign.name}
        />
      )
    }

    if (resolvedActiveTab === 'journal') {
      return (
        <CampaignScaffoldPanel
          title="Campaign Journal"
          subtitle="Session journal timeline in pre-session review mode."
          sections={[
            'Review reverse-chronological entries',
            'Prepare next-session recap points',
            'Track searchable hashtags and chapter notes',
          ]}
          campaignName={campaign.name}
        />
      )
    }

    if (resolvedActiveTab === 'history') {
      return (
        <CampaignScaffoldPanel
          title="Campaign History"
          subtitle="Browse prior-session boundaries and archived chat context."
          sections={[
            'History remains read-only in offline mode',
            'Current active-session messages are excluded',
            'Use this view for prep and recap context',
          ]}
          campaignName={campaign.name}
        />
      )
    }

    if (resolvedActiveTab === 'rooms') {
      return (
        <CampaignScaffoldPanel
          title="Rooms"
          subtitle="Campaign room planning outside a live session."
          sections={[
            'Review persistent group structure',
            'Prepare room-level environment defaults',
            'Validate room naming before launch',
          ]}
          campaignName={campaign.name}
        />
      )
    }

    if (resolvedActiveTab === 'settings') {
      return <>{props.settingsPanel}</>
    }

    return (
      <CampaignScaffoldPanel
        title="Audio"
        subtitle="Campaign-level audio policy and preset review."
        sections={[
          'Preview environment and condition policy',
          'Validate DM audio behavior defaults',
          'Confirm player-facing audio expectations',
        ]}
        campaignName={campaign.name}
      />
    )
  }

  return (
    <TooltipProvider delayDuration={140}>
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

        <section className="session-lobby-workspace" aria-label="Campaign review workspace">
          <header className="session-lobby-workspace__header">
            <div className="session-lobby-workspace__title-wrap">
              <h3 className="session-card-title">{props.campaign.name}</h3>
            </div>
            <InvitePopoverWidget
              show={props.showInviteWidget}
              joinUrl={props.joinUrl}
              spectatorsEnabled={props.spectatorsEnabled}
              watchUrl={props.watchUrl}
              canRefreshInvites={props.role === Role.DM}
              onCopyInviteUrl={props.onCopyInviteUrl}
              onReissueInvite={props.onReissueInvite}
              isInviteReissuing={props.isInviteReissuing}
            />
            <div className="session-action-row session-action-row--right session-action-row--compact">
              <button
                type="button"
                className="session-button session-button-neutral"
                onClick={props.onBackToLobby}
              >
                Back
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <button
                      type="button"
                      className="session-button session-button-brand"
                      disabled={props.isLaunchDisabled}
                      onClick={() => props.onLaunch(campaign.id)}
                    >
                      Launch
                    </button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end">
                  {props.launchDisabledReason || 'Launch campaign'}
                </TooltipContent>
              </Tooltip>
            </div>
          </header>

          <div className="session-lobby-workspace__body">
            <div className="session-lobby-workspace__panel">{renderPanel()}</div>

            <aside className="session-lobby-workspace__dock" aria-label="Campaign workspace tools">
              {tabs.map((tab) => (
                <Tooltip key={tab}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={`session-lobby-workspace__dock-button ${resolvedActiveTab === tab ? 'is-active' : ''}`}
                      onClick={() => setActiveTab(tab)}
                      aria-label={getTabLabel(tab)}
                    >
                      <Icon name={getTabIcon(tab)} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">{getTabLabel(tab)}</TooltipContent>
                </Tooltip>
              ))}
            </aside>
          </div>
        </section>
      </>
    </TooltipProvider>
  )
}
