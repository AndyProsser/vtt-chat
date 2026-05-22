import type { Role, SessionState, UUID } from '@shared'
import type { RightRailTab } from '@/types/ui'
import { CampaignInformationPanel } from '@/components/workspaces/shared/panels/CampaignInformationPanel'
import { CampaignPartyPanel } from '@/components/workspaces/shared/panels/CampaignPartyPanel'
import { CampaignRightbarSettings } from '@/components/workspaces/shared/panels/CampaignRightbarSettings'
import type { CharacterSettingsDraft } from '@/components/workspaces/shared/panels/CampaignRightbarSettings'
import { CampaignScaffoldPanel } from '@/components/workspaces/shared/panels/CampaignScaffoldPanel'
import { HistoryPanel } from '@/components/workspaces/shared/panels/HistoryPanel'
import { JournalPanel } from '@/components/workspaces/shared/panels/JournalPanel'
import { NotesRailPanel } from '@/components/workspaces/shared/panels/NotesRailPanel'
import { RightRailContent } from '@/components/workspaces/session/RightRailContent'
import type { CampaignSummary } from '@/types/session/campaign'

type SessionWorkspaceRightRailTabProps = {
  tab: RightRailTab
  selectedCampaign: CampaignSummary | null
  sessionCount: number
  totalSessionDurationMs: number
  canEditCampaignInfo: boolean
  onSaveCampaignInfo: (
    campaignId: UUID,
    updates: {
      name: string
      description: string
      posterUrl: string | null
      integrationSyncPolicy: 'ALLOW' | 'DM_ONLY' | 'NONE'
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
  onOpenNotesWorkspace: () => void
  effectiveSessionRole: Role
  userId: UUID
  sessionSettingsName: string
  sessionSettingsDescription: string
  sessionSettingsPlannedDurationMinutes: number
  canEditSessionSettings: boolean
  onSessionNameChange: (value: string) => void
  onSessionDescriptionChange: (value: string) => void
  onPlannedDurationMinutesChange: (value: number) => void
  onSaveSessionSettings: () => void
  isSessionSettingsSaving: boolean
  dmAutoTargetOnFirstPlayerJoin: boolean
  onDmAutoTargetChange: (value: boolean) => void
  onSaveDmAutoTarget: () => void
  isDmVoiceTargetingSettingSaving: boolean
  isDmVoiceTargetingSettingLoading: boolean
  campaignIdForSettings: UUID | ''
  characterDraft: CharacterSettingsDraft
  onCharacterFieldChange: (field: keyof CharacterSettingsDraft, value: string | number) => void
  onSaveCharacterSettings: () => void
  isCharacterSettingsLoading: boolean
  isCharacterSettingsSaving: boolean
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
          onSaveCampaignInfo={props.onSaveCampaignInfo}
        />
      }
      partyPanel={
        props.campaignId ? (
          <CampaignPartyPanel
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
          />
        ) : (
          <CampaignScaffoldPanel
            title="Party"
            subtitle="Party roster is unavailable until a campaign is selected."
            sections={[
              'Select or open a campaign session',
              'Party presence snapshots will load automatically',
            ]}
          />
        )
      }
      roomsPanel={
        <CampaignScaffoldPanel
          title="Groups"
          subtitle="Voice group configuration is being rebuilt around campaign-level controls."
          sections={[
            'DM-only group management',
            'Greenroom pre-create support',
            'Group defaults and templates',
            'Campaign routing and policy',
          ]}
          campaignName={props.selectedCampaign?.name}
        />
      }
      audioPanel={
        <CampaignScaffoldPanel
          title="Campaign Audio"
          subtitle="Audio policy controls are being reduced to a cleaner campaign-first surface."
          sections={[
            'Default campaign audio policy',
            'Environment and override presets',
            'Broadcast and moderation policy',
          ]}
          campaignName={props.selectedCampaign?.name}
        />
      }
      notesPanel={
        <NotesRailPanel
          apiUrl={props.apiUrl}
          token={props.token}
          sessionId={props.currentSessionId}
          role={props.effectiveSessionRole}
          onOpenNotesWorkspace={props.onOpenNotesWorkspace}
        />
      }
      journalPanel={
        <JournalPanel
          apiUrl={props.apiUrl}
          token={props.token}
          sessionId={props.currentSessionId}
          sessionName={props.currentSessionName}
          role={props.effectiveSessionRole}
          userId={props.userId}
        />
      }
      historyPanel={
        <HistoryPanel
          apiUrl={props.apiUrl}
          token={props.token}
          sessionId={props.currentSessionId}
          role={props.effectiveSessionRole}
          userId={props.userId}
        />
      }
      settingsPanel={
        <CampaignRightbarSettings
          role={
            props.effectiveSessionRole === 'DM'
              ? 'DM'
              : props.effectiveSessionRole === 'PLAYER'
                ? 'PLAYER'
                : 'SPECTATOR'
          }
          campaignId={props.campaignIdForSettings || null}
          sessionName={props.sessionSettingsName}
          sessionDescription={props.sessionSettingsDescription}
          plannedDurationMinutes={props.sessionSettingsPlannedDurationMinutes}
          sessionStateLabel={props.currentSessionState}
          canEditSessionSettings={props.canEditSessionSettings}
          onSessionNameChange={props.onSessionNameChange}
          onSessionDescriptionChange={props.onSessionDescriptionChange}
          onPlannedDurationMinutesChange={props.onPlannedDurationMinutesChange}
          onSaveSessionSettings={props.onSaveSessionSettings}
          isSessionSaving={props.isSessionSettingsSaving}
          dmAutoTarget={props.dmAutoTargetOnFirstPlayerJoin}
          onDmAutoTargetChange={props.onDmAutoTargetChange}
          onSaveDmAutoTarget={props.onSaveDmAutoTarget}
          isSaving={props.isDmVoiceTargetingSettingSaving}
          isLoading={props.isDmVoiceTargetingSettingLoading}
          characterDraft={props.characterDraft}
          onCharacterFieldChange={props.onCharacterFieldChange}
          onSaveCharacterSettings={props.onSaveCharacterSettings}
          isCharacterLoading={props.isCharacterSettingsLoading}
          isCharacterSaving={props.isCharacterSettingsSaving}
        />
      }
    />
  )
}
