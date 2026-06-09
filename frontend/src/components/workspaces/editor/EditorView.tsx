import { type ReactNode, useMemo, useState } from 'react'
import { Role, type SessionState, type UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { Icon } from '@/components/ui/Icon'
import { CampaignInformationPanel } from '@/components/workspaces/shared/panels/CampaignInformationPanel'
import { PartyPanel } from '@/components/workspaces/shared/panels/PartyPanel'
import { CampaignScaffoldPanel } from '@/components/workspaces/shared/panels/CampaignScaffoldPanel'
import { GroupsPanel } from '@/components/workspaces/shared/panels/GroupsPanel'
import { NotesPanel } from '@/components/workspaces/shared/panels/NotesPanel'
import { JournalPanel } from '@/components/workspaces/shared/panels/JournalPanel'
import { HistoryPanel } from '@/components/workspaces/shared/panels/HistoryPanel'
import { EditorWorkspaceToolbar } from '@/components/workspaces/shared/toolbar/EditorWorkspaceToolbar'
import type { ExtensionSyncPolicy } from '@/types/sessionUi'
import type { Session } from '@/types/session'
import type { CampaignSummary } from '@/types/session/campaign'
import type { LobbyConnectionStatus } from '@/types/session/lobby'
import { type WorkspaceTab, getTabIcon, getTabLabel, getTabsForRole } from '@/utils/workspaceTabs'

type EditorViewProps = {
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
      integrationSyncPolicy: ExtensionSyncPolicy
    }
  ) => Promise<void>
}

export function EditorView(props: EditorViewProps) {
  const campaign = props.campaign
  const tabs = useMemo(() => getTabsForRole(props.role), [props.role])
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(tabs[0] || 'information')
  const latestSettingsSession = props.settingsCampaignSessions[0] ?? null
  const notesSessionId = props.settingsReferenceSessionId ?? latestSettingsSession?.id ?? null

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
        <PartyPanel
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
        <NotesPanel
          key={`${campaign.id}:${notesSessionId || 'no-session-context'}`}
          apiUrl={props.apiUrl}
          token={props.authToken}
          campaignId={campaign.id}
          sessionId={notesSessionId}
          currentSessionState={props.currentSessionState}
          compactPicker={false}
          user={{ id: props.currentUserId, role: props.role }}
        />
      )
    }

    if (resolvedActiveTab === 'journal') {
      return (
        <JournalPanel
          apiUrl={props.apiUrl}
          token={props.authToken}
          campaignId={campaign.id}
          role={props.role}
          sessions={props.settingsCampaignSessions}
          selectedSessionId={props.settingsReferenceSessionId}
          onSessionChange={props.onSettingsReferenceSessionChange}
        />
      )
    }

    if (resolvedActiveTab === 'history') {
      return (
        <HistoryPanel
          apiUrl={props.apiUrl}
          token={props.authToken}
          campaignId={campaign.id as UUID}
          sessionId={props.currentSessionId || ('' as UUID)}
          role={props.role}
          userId={props.currentUserId}
        />
      )
    }

    if (resolvedActiveTab === 'rooms') {
      return <GroupsPanel campaignId={campaign.id} apiUrl={props.apiUrl} token={props.authToken} />
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
