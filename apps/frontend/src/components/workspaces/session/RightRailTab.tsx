import { memo, useMemo } from 'react'
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
import { InventoryPanel } from '@/components/workspaces/shared/panels/InventoryPanel'
import { RightRailContent } from '@/components/workspaces/session/RightRailContent'
import type { ExtensionSyncPolicy } from '@/types/sessionUi'
import type { CampaignSummary } from '@/types/session/campaign'
import type { Session as SessionRecord } from '@/types/session'

// JournalPanel manages session selection internally via optimisticSelection state;
// the parent workspace does not need to respond to journal session changes.
const NOOP_SESSION_CHANGE = () => {}

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
  dndRuleset?: '2014' | '2024'
  onSrdFieldFocus?: () => void
  onSrdFieldBlur?: () => void
  joinUrl?: string
  watchUrl?: string
  spectatorsEnabled?: boolean
  canRefreshInvites?: boolean
  isInviteReissuing?: boolean
  onCopyInviteUrl?: (inviteType: 'PLAYER' | 'SPECTATOR') => void
  onReissueInvite?: (inviteType: 'PLAYER' | 'SPECTATOR') => void
}

export const SessionWorkspaceRightRailTab = memo(function SessionWorkspaceRightRailTab({
  tab,
  selectedCampaign,
  sessions,
  sessionCount,
  totalSessionDurationMs,
  canEditCampaignInfo,
  onSaveCampaignInfo,
  campaignId,
  apiUrl,
  token,
  currentSessionId,
  currentSessionName: _currentSessionName,
  currentSessionState,
  effectiveSessionUserId,
  partyPresenceRefreshVersion,
  fetchWithAuthGuard,
  effectiveSessionRole,
  userId,
  sessionSettingsName,
  sessionSettingsPlannedDurationMinutes,
  defaultSessionDurationMinutes,
  sessionStartedAt,
  canEditSessionSettings,
  canEditEndedSessionName,
  onSessionNameChange,
  onPlannedDurationMinutesChange,
  onSaveSessionSettings,
  isSessionSettingsSaving,
  sessionCampaignPolicy,
  campaignIdForSettings,
  characterDraft,
  onCharacterFieldChange,
  onSaveCharacterSettings,
  isCharacterSettingsLoading,
  isCharacterSettingsSaving,
  onRequestOpenPlayerSettings,
  playerSettingsFocusRequestKey,
  joinUrl,
  watchUrl,
  spectatorsEnabled,
  canRefreshInvites,
  isInviteReissuing,
  onCopyInviteUrl,
  onReissueInvite,
  dndRuleset,
  onSrdFieldFocus,
  onSrdFieldBlur,
}: SessionWorkspaceRightRailTabProps) {
  const informationPanel = useMemo(
    () => (
      <CampaignInformationPanel
        campaign={selectedCampaign ?? null}
        sessionCount={sessionCount}
        totalSessionDurationMs={totalSessionDurationMs}
        canEdit={canEditCampaignInfo}
        sessionId={currentSessionId}
        onSaveCampaignInfo={onSaveCampaignInfo}
        joinUrl={joinUrl}
        watchUrl={watchUrl}
        spectatorsEnabled={spectatorsEnabled}
        canRefreshInvites={canRefreshInvites}
        isInviteReissuing={isInviteReissuing}
        onCopyInviteUrl={onCopyInviteUrl}
        onReissueInvite={onReissueInvite}
      />
    ),
    [
      selectedCampaign,
      sessionCount,
      totalSessionDurationMs,
      canEditCampaignInfo,
      currentSessionId,
      onSaveCampaignInfo,
      joinUrl,
      watchUrl,
      spectatorsEnabled,
      canRefreshInvites,
      isInviteReissuing,
      onCopyInviteUrl,
      onReissueInvite,
    ]
  )

  const partyPanel = useMemo(
    () =>
      campaignId ? (
        <PartyPanel
          key={`${campaignId}:${currentSessionId}:${effectiveSessionUserId}`}
          campaignId={campaignId}
          campaignName={selectedCampaign?.name}
          apiUrl={apiUrl}
          authToken={token}
          currentSessionId={currentSessionId}
          currentSessionState={currentSessionState}
          currentUserId={effectiveSessionUserId}
          partyPresenceRefreshVersion={partyPresenceRefreshVersion}
          fetchWithAuthGuard={fetchWithAuthGuard}
          canOpenCharacterSettings={effectiveSessionRole === 'PLAYER'}
          onOpenCharacterSettings={onRequestOpenPlayerSettings}
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
      ),
    [
      campaignId,
      selectedCampaign,
      currentSessionId,
      currentSessionState,
      effectiveSessionUserId,
      partyPresenceRefreshVersion,
      apiUrl,
      token,
      fetchWithAuthGuard,
      effectiveSessionRole,
      onRequestOpenPlayerSettings,
    ]
  )

  const inventoryPanel = useMemo(
    () =>
      campaignId ? (
        <InventoryPanel
          key={`${campaignId}:${currentSessionId}`}
          campaignId={campaignId}
          sessionId={currentSessionId}
          sessionState={currentSessionState}
          currentUserId={effectiveSessionUserId}
          effectiveSessionRole={effectiveSessionRole}
          apiUrl={apiUrl}
          authToken={token}
          dndRuleset={dndRuleset}
        />
      ) : (
        <CampaignScaffoldPanel
          title="Inventory"
          iconName="inventory"
          subtitle="Inventory is unavailable until a campaign is selected."
          sections={[
            'Select or open a campaign session',
            'Character and party inventories will load automatically',
          ]}
        />
      ),
    [campaignId, currentSessionId, currentSessionState, effectiveSessionUserId, effectiveSessionRole, apiUrl, token, dndRuleset]
  )

  const roomsPanel = useMemo(
    () =>
      selectedCampaign && campaignId ? (
        <GroupsPanelSession
          sessionId={currentSessionId}
          sessionState={currentSessionState}
          effectiveSessionRole={effectiveSessionRole}
          campaignId={campaignId}
          apiUrl={apiUrl}
          token={token}
        />
      ) : (
        <CampaignScaffoldPanel
          title="Groups"
          iconName="rooms"
          subtitle="Groups panel unavailable."
          sections={['Load a campaign and start a session to manage groups.']}
          campaignName={selectedCampaign?.name}
        />
      ),
    [
      selectedCampaign,
      campaignId,
      currentSessionId,
      currentSessionState,
      effectiveSessionRole,
      apiUrl,
      token,
    ]
  )

  const notesPanel = useMemo(
    () =>
      campaignId ? (
        <NotesPanel
          key={`${campaignId}:${currentSessionId}`}
          apiUrl={apiUrl}
          token={token}
          campaignId={campaignId}
          sessionId={currentSessionId}
          currentSessionState={currentSessionState}
          compactPicker
          user={{ id: effectiveSessionUserId, role: effectiveSessionRole }}
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
      ),
    [
      campaignId,
      currentSessionId,
      currentSessionState,
      effectiveSessionUserId,
      effectiveSessionRole,
      apiUrl,
      token,
    ]
  )

  const journalPanel = useMemo(
    () => (
      <JournalPanel
        apiUrl={apiUrl}
        token={token}
        campaignId={campaignId}
        role={effectiveSessionRole}
        sessions={sessions}
        selectedSessionId={currentSessionId}
        onSessionChange={NOOP_SESSION_CHANGE}
      />
    ),
    [apiUrl, token, campaignId, effectiveSessionRole, sessions, currentSessionId]
  )

  const historyPanel = useMemo(
    () => (
      <HistoryPanel
        apiUrl={apiUrl}
        token={token}
        campaignId={campaignId}
        sessionId={currentSessionId}
        role={effectiveSessionRole}
        userId={userId}
      />
    ),
    [apiUrl, token, campaignId, currentSessionId, effectiveSessionRole, userId]
  )

  const settingsPanel = useMemo(
    () => (
      <WorkspaceSettingsPanel
        role={
          effectiveSessionRole === 'DM'
            ? 'DM'
            : effectiveSessionRole === 'PLAYER'
              ? 'PLAYER'
              : 'SPECTATOR'
        }
        sessionSettings={{
          campaignId: campaignIdForSettings || null,
          sessionName: sessionSettingsName,
          plannedDurationMinutes: sessionSettingsPlannedDurationMinutes,
          defaultSessionDurationMinutes: defaultSessionDurationMinutes,
          sessionStateLabel: currentSessionState,
          sessionStartedAt: sessionStartedAt,
          canEditSessionSettings: canEditSessionSettings,
          canEditEndedSessionName: canEditEndedSessionName,
          onSessionNameChange: onSessionNameChange,
          onPlannedDurationMinutesChange: onPlannedDurationMinutesChange,
          onSaveSessionSettings: onSaveSessionSettings,
          isSessionSaving: isSessionSettingsSaving,
          isSaving: false,
          isLoading: false,
          campaignPolicy: sessionCampaignPolicy,
        }}
        playerSettings={{
          campaignId: campaignIdForSettings || null,
          characterDraft: characterDraft,
          onCharacterFieldChange: onCharacterFieldChange,
          onSaveCharacterSettings: onSaveCharacterSettings,
          isCharacterLoading: isCharacterSettingsLoading,
          isCharacterSaving: isCharacterSettingsSaving,
          focusRequestKey: playerSettingsFocusRequestKey,
          dndRuleset: dndRuleset ?? '2024',
          apiUrl,
          token,
          onSrdFieldFocus,
          onSrdFieldBlur,
        }}
      />
    ),
    [
      effectiveSessionRole,
      campaignIdForSettings,
      sessionSettingsName,
      sessionSettingsPlannedDurationMinutes,
      defaultSessionDurationMinutes,
      currentSessionState,
      sessionStartedAt,
      canEditSessionSettings,
      canEditEndedSessionName,
      onSessionNameChange,
      onPlannedDurationMinutesChange,
      onSaveSessionSettings,
      isSessionSettingsSaving,
      sessionCampaignPolicy,
      characterDraft,
      onCharacterFieldChange,
      onSaveCharacterSettings,
      isCharacterSettingsLoading,
      isCharacterSettingsSaving,
      playerSettingsFocusRequestKey,
      onSrdFieldFocus,
      onSrdFieldBlur,
    ]
  )

  return (
    <RightRailContent
      tab={tab}
      informationPanel={informationPanel}
      partyPanel={partyPanel}
      inventoryPanel={inventoryPanel}
      roomsPanel={roomsPanel}
      notesPanel={notesPanel}
      journalPanel={journalPanel}
      historyPanel={historyPanel}
      settingsPanel={settingsPanel}
    />
  )
})
