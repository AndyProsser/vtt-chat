import type { Role, SessionState, UUID } from '@shared'
import type { RightRailTab } from '@/types/ui'
import { CampaignInformationPanel } from '@/components/workspaces/shared/panels/CampaignInformationPanel'
import { PartyPanel } from '@/components/workspaces/shared/panels/PartyPanel'
import { WorkspaceSettingsPanel } from '@/components/workspaces/shared/panels/WorkspaceSettingsPanel'
import type { PlayerSettingsPanel } from '@/components/workspaces/shared/panels/PlayerSettingsPanel'
import type { CampaignSessionPolicyBindings } from '@/components/workspaces/shared/panels/CampaignSessionSettingsPanel'
import { CampaignScaffoldPanel } from '@/components/workspaces/shared/panels/CampaignScaffoldPanel'
import { HistoryPanel } from '@/components/workspaces/shared/panels/HistoryPanel'
import { JournalPanel } from '@/components/workspaces/shared/panels/JournalPanel'
import { NotesPanel } from '@/components/workspaces/shared/panels/NotesPanel'
import { GroupsPanelSession } from '@/components/workspaces/session/GroupsPanel.session'
import { RightRailContent } from '@/components/workspaces/session/RightRailContent'
import type { ExtensionSyncPolicy } from '@/types/sessionUi'
import type { CampaignSummary } from '@/types/session/campaign'
import type { Session as SessionRecord } from '@/types/session'

type SessionWorkspaceRightRailTabProps = {
  tab: RightRailTab
  selectedCampaign: CampaignSummary | null
  sessions: SessionRecord[]
  sessionCount: number
  totalSessionDurationMs: number
  canEditCampaignInfo: boolean
  onSaveCampaignInfo: (
    campaignId: UUID,
    updates: {
      name: string
      description: string
      posterUrl: string | null
      integrationSyncPolicy: ExtensionSyncPolicy
    }
  ) => Promise<void>
  campaignId: UUID | undefined
  apiUrl: string
  token: string
  currentSessionId: UUID
  currentSessionName: string
  currentSessionState: SessionState
  effectiveSessionUserId: UUID
  partyPresenceRefreshVersion: number
  fetchWithAuthGuard: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  effectiveSessionRole: Role
  userId: UUID
  sessionSettingsName: string
  sessionSettingsPlannedDurationMinutes: number
  defaultSessionDurationMinutes: number
  sessionStartedAt: number | undefined
  canEditSessionSettings: boolean
  canEditEndedSessionName: boolean
  onSessionNameChange: (value: string) => void
  onPlannedDurationMinutesChange: (value: number) => void
  onSaveSessionSettings: () => void
  isSessionSettingsSaving: boolean
  sessionCampaignPolicy?: CampaignSessionPolicyBindings
  campaignIdForSettings: UUID | ''
  characterDraft: PlayerSettingsPanel
  onCharacterFieldChange: (field: keyof PlayerSettingsPanel, value: string | number) => void
  onSaveCharacterSettings: () => void
  isCharacterSettingsLoading: boolean
  isCharacterSettingsSaving: boolean
  onRequestOpenPlayerSettings: () => void
  playerSettingsFocusRequestKey: number
  joinUrl?: string
  watchUrl?: string
  spectatorsEnabled?: boolean
  canRefreshInvites?: boolean
  isInviteReissuing?: boolean
  onCopyInviteUrl?: (inviteType: 'PLAYER' | 'SPECTATOR') => void
  onReissueInvite?: (inviteType: 'PLAYER' | 'SPECTATOR') => void
}

export function SessionWorkspaceRightRailTab(props: SessionWorkspaceRightRailTabProps) {
  return (
    <RightRailContent
      tab={props.tab}
      informationPanel={
        <CampaignInformationPanel
          campaign={props.selectedCampaign ?? null}
          sessionCount={props.sessionCount}
          totalSessionDurationMs={props.totalSessionDurationMs}
          canEdit={props.canEditCampaignInfo}
          sessionId={props.currentSessionId}
          onSaveCampaignInfo={props.onSaveCampaignInfo}
          joinUrl={props.joinUrl}
          watchUrl={props.watchUrl}
          spectatorsEnabled={props.spectatorsEnabled}
          canRefreshInvites={props.canRefreshInvites}
          isInviteReissuing={props.isInviteReissuing}
          onCopyInviteUrl={props.onCopyInviteUrl}
          onReissueInvite={props.onReissueInvite}
        />
      }
      partyPanel={
        props.campaignId ? (
          <PartyPanel
            key={`${props.campaignId}:${props.currentSessionId}:${props.effectiveSessionUserId}`}
            campaignId={props.campaignId}
            campaignName={props.selectedCampaign?.name}
            apiUrl={props.apiUrl}
            authToken={props.token}
            currentSessionId={props.currentSessionId}
            currentSessionState={props.currentSessionState}
            currentUserId={props.effectiveSessionUserId}
            partyPresenceRefreshVersion={props.partyPresenceRefreshVersion}
            fetchWithAuthGuard={props.fetchWithAuthGuard}
            canOpenCharacterSettings={props.effectiveSessionRole === 'PLAYER'}
            onOpenCharacterSettings={props.onRequestOpenPlayerSettings}
          />
        ) : (
          <CampaignScaffoldPanel
            title="Party"
            iconName="party"
            subtitle="Party roster is unavailable until a campaign is selected."
            sections={[
              'Select or open a campaign session',
              'Party presence snapshots will load automatically',
            ]}
          />
        )
      }
      roomsPanel={
        props.selectedCampaign && props.campaignId ? (
          <GroupsPanelSession
            sessionId={props.currentSessionId}
            sessionState={props.currentSessionState}
            effectiveSessionRole={props.effectiveSessionRole}
            campaignId={props.campaignId}
            apiUrl={props.apiUrl}
            token={props.token}
          />
        ) : (
          <CampaignScaffoldPanel
            title="Groups"
            iconName="rooms"
            subtitle="Groups panel unavailable."
            sections={['Load a campaign and start a session to manage groups.']}
            campaignName={props.selectedCampaign?.name}
          />
        )
      }
      notesPanel={
        props.campaignId ? (
          <NotesPanel
            key={`${props.campaignId}:${props.currentSessionId}`}
            apiUrl={props.apiUrl}
            token={props.token}
            campaignId={props.campaignId}
            sessionId={props.currentSessionId}
            currentSessionState={props.currentSessionState}
            compactPicker
            user={{ id: props.effectiveSessionUserId, role: props.effectiveSessionRole }}
          />
        ) : (
          <CampaignScaffoldPanel
            title="Handouts"
            iconName="notes"
            subtitle="Handouts are unavailable until a campaign is selected."
            sections={[
              'Select or open a campaign session',
              'Handouts and private notes will load automatically',
            ]}
          />
        )
      }
      journalPanel={
        <JournalPanel
          apiUrl={props.apiUrl}
          token={props.token}
          campaignId={props.campaignId}
          role={props.effectiveSessionRole}
          sessions={props.sessions}
          selectedSessionId={props.currentSessionId}
          onSessionChange={() => {}}
        />
      }
      historyPanel={
        <HistoryPanel
          apiUrl={props.apiUrl}
          token={props.token}
          campaignId={props.campaignId}
          sessionId={props.currentSessionId}
          role={props.effectiveSessionRole}
          userId={props.userId}
        />
      }
      settingsPanel={
        <WorkspaceSettingsPanel
          role={
            props.effectiveSessionRole === 'DM'
              ? 'DM'
              : props.effectiveSessionRole === 'PLAYER'
                ? 'PLAYER'
                : 'SPECTATOR'
          }
          sessionSettings={{
            campaignId: props.campaignIdForSettings || null,
            sessionName: props.sessionSettingsName,
            plannedDurationMinutes: props.sessionSettingsPlannedDurationMinutes,
            defaultSessionDurationMinutes: props.defaultSessionDurationMinutes,
            sessionStateLabel: props.currentSessionState,
            sessionStartedAt: props.sessionStartedAt,
            canEditSessionSettings: props.canEditSessionSettings,
            canEditEndedSessionName: props.canEditEndedSessionName,
            onSessionNameChange: props.onSessionNameChange,
            onPlannedDurationMinutesChange: props.onPlannedDurationMinutesChange,
            onSaveSessionSettings: props.onSaveSessionSettings,
            isSessionSaving: props.isSessionSettingsSaving,
            isSaving: false,
            isLoading: false,
            campaignPolicy: props.sessionCampaignPolicy,
          }}
          playerSettings={{
            campaignId: props.campaignIdForSettings || null,
            characterDraft: props.characterDraft,
            onCharacterFieldChange: props.onCharacterFieldChange,
            onSaveCharacterSettings: props.onSaveCharacterSettings,
            isCharacterLoading: props.isCharacterSettingsLoading,
            isCharacterSaving: props.isCharacterSettingsSaving,
            focusRequestKey: props.playerSettingsFocusRequestKey,
          }}
        />
      }
    />
  )
}
