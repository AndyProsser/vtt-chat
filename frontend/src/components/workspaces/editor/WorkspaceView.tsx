import { type ReactNode, useMemo, useState } from 'react'
import { Role, type SessionState, type UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { Icon } from '@/components/ui/Icon'
import { CampaignInformationPanel } from '@/components/workspaces/shared/panels/CampaignInformationPanel'
import { CampaignPartyPanel } from '@/components/workspaces/shared/panels/CampaignPartyPanel'
import { CampaignScaffoldPanel } from '@/components/workspaces/shared/panels/CampaignScaffoldPanel'
import { EditorJournalPanel } from '@/components/workspaces/editor/EditorJournalPanel'
import { GroupsPanelEditor } from '@/components/workspaces/editor/GroupsPanel.editor'
import { EditorWorkspaceToolbar } from '@/components/workspaces/shared/toolbar/EditorWorkspaceToolbar'
import type { Session } from '@/types/session'
import type { CampaignSummary } from '@/types/session/campaign'
import type { LobbyConnectionStatus } from '@/types/session/lobby'
import { type WorkspaceTab, getTabIcon, getTabLabel, getTabsForRole } from '@/utils/workspaceTabs'

type WorkspaceViewProps = {
  campaign: CampaignSummary | null
  role: Role
  themeMode: 'light' | 'dark'
  connectionStatus: LobbyConnectionStatus
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
  apiUrl: string
  authToken: string
  currentSessionId: UUID | null
  currentSessionState: SessionState | null
  currentUserId: UUID
  partyPresenceRefreshVersion: number
  fetchWithAuthGuard: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  settingsCampaignSessions: Session[]
  settingsReferenceSessionId: UUID | null
  onSettingsReferenceSessionChange: (sessionId: UUID) => void
  settingsPanel: ReactNode
  onBackToLobby: () => void
  onToggleTheme: () => void
  onOpenUserSettings: () => void
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

export function WorkspaceView(props: WorkspaceViewProps) {
  const campaign = props.campaign
  const tabs = useMemo(() => getTabsForRole(props.role), [props.role])
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(tabs[0] || 'information')

  const resolvedActiveTab = tabs.includes(activeTab) ? activeTab : tabs[0] || 'information'
  if (!campaign) {
    return (
      <>
        <EditorWorkspaceToolbar
          themeMode={props.themeMode}
          dataUiState="no-campaign"
          connectionStatus={props.connectionStatus}
          onToggleTheme={props.onToggleTheme}
          onOpenUserSettings={props.onOpenUserSettings}
          onReturnToLobby={props.onBackToLobby}
          isLaunchDisabled={props.isLaunchDisabled}
          launchDisabledReason={props.launchDisabledReason}
          showInviteWidget={props.showInviteWidget}
          joinUrl={props.joinUrl}
          spectatorsEnabled={props.spectatorsEnabled}
          watchUrl={props.watchUrl}
          canRefreshInvites={props.role === Role.DM}
          onCopyInviteUrl={props.onCopyInviteUrl}
          onReissueInvite={props.onReissueInvite}
          isInviteReissuing={props.isInviteReissuing}
        />
        <section
          className="workspaces-lobby-workspace"
          aria-label="Campaign review workspace"
          data-ui-component="EditorWorkspaceShell"
          data-ui-state="no-campaign"
        >
          <div className="workspaces-status-message">
            Select a campaign from the lobby to review.
          </div>
        </section>
      </>
    )
  }

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
        <CampaignPartyPanel
          key={`${campaign.id}:${props.currentSessionId || 'none'}:${props.currentUserId}`}
          campaignId={campaign.id}
          campaignName={campaign.name}
          apiUrl={props.apiUrl}
          authToken={props.authToken}
          currentSessionId={props.currentSessionId}
          currentSessionState={props.currentSessionState}
          currentUserId={props.currentUserId}
          partyPresenceRefreshVersion={props.partyPresenceRefreshVersion}
          fetchWithAuthGuard={props.fetchWithAuthGuard}
        />
      )
    }

    if (resolvedActiveTab === 'notes') {
      return (
        <CampaignScaffoldPanel
          title="Campaign Notes"
          iconName="notes"
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
        <EditorJournalPanel
          apiUrl={props.apiUrl}
          token={props.authToken}
          role={props.role}
          sessions={props.settingsCampaignSessions}
          selectedSessionId={props.settingsReferenceSessionId}
          onSessionChange={props.onSettingsReferenceSessionChange}
        />
      )
    }

    if (resolvedActiveTab === 'history') {
      return (
        <CampaignScaffoldPanel
          title="Campaign History"
          iconName="history"
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
        <GroupsPanelEditor campaignId={campaign.id} apiUrl={props.apiUrl} token={props.authToken} />
      )
    }

    if (resolvedActiveTab === 'settings') {
      return <>{props.settingsPanel}</>
    }

    return (
      <CampaignScaffoldPanel
        title="Audio"
        iconName="voice"
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
        <EditorWorkspaceToolbar
          themeMode={props.themeMode}
          dataUiState={resolvedActiveTab}
          launchLabel={campaign.name}
          connectionStatus={props.connectionStatus}
          onToggleTheme={props.onToggleTheme}
          onOpenUserSettings={props.onOpenUserSettings}
          onReturnToLobby={props.onBackToLobby}
          onLaunch={() => props.onLaunch(campaign.id)}
          isLaunchDisabled={props.isLaunchDisabled}
          launchDisabledReason={props.launchDisabledReason}
          showInviteWidget={props.showInviteWidget}
          joinUrl={props.joinUrl}
          spectatorsEnabled={props.spectatorsEnabled}
          watchUrl={props.watchUrl}
          canRefreshInvites={props.role === Role.DM}
          onCopyInviteUrl={props.onCopyInviteUrl}
          onReissueInvite={props.onReissueInvite}
          isInviteReissuing={props.isInviteReissuing}
        />

        <section
          className="workspaces-lobby-workspace"
          aria-label="Campaign review workspace"
          data-ui-component="EditorWorkspaceShell"
          data-ui-state={resolvedActiveTab}
        >
          <div className="workspaces-lobby-workspace__body" data-ui-component="EditorWorkspaceBody">
            <div
              className="workspaces-lobby-workspace__panel"
              data-ui-component="EditorWorkspacePanel"
            >
              {renderPanel()}
            </div>

            <aside
              className="workspaces-lobby-workspace__dock"
              aria-label="Campaign workspace tools"
              data-ui-component="EditorWorkspaceDock"
            >
              {tabs.map((tab) => (
                <Tooltip key={tab}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={`workspaces-lobby-workspace__dock-button ${resolvedActiveTab === tab ? 'is-active' : ''}`}
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
