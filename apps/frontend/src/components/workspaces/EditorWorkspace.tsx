import { memo, useCallback, useMemo, useRef } from 'react'
import type { UUID } from '@shared'
import { SessionState } from '@shared'
import { EditorView } from '@/components/workspaces/editor/EditorView'
import { WorkspaceSettingsPanel } from '@/components/workspaces/shared/panels/WorkspaceSettingsPanel'
import { DmTransferOfferBanner } from '@/components/workspaces/shared/DmTransferOfferBanner'
import type { EditorWorkspaceProps } from '@/types/editorWorkspace'

export const EditorWorkspace = memo(function EditorWorkspace(props: EditorWorkspaceProps) {
  // Destructure props used inside useCallback hooks so deps reference named
  // variables, satisfying exhaustive-deps without listing the whole props object.
  const {
    onSettingsPosterUrlChange,
    apiUrl,
    token,
    showToast,
    settingsData,
    selectedCampaign,
    onDeleteCampaign,
    onCopyInviteUrl,
    onReissueInvite,
    onSettingsReferenceSessionChange,
  } = props

  // Hooks must run unconditionally, before the early-return guard below.

  const handleRemovePoster = useCallback(() => {
    onSettingsPosterUrlChange('')
  }, [onSettingsPosterUrlChange])

  const handleExport = useCallback(() => {
    const campaignId = settingsData?.id
    if (!campaignId) return
    void fetch(`${apiUrl}/api/campaigns/${campaignId}/export`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          showToast({
            message: (err as { message?: string }).message || 'Export failed',
            variant: 'error',
          })
          return
        }
        const data = (await res.json()) as { bundle?: unknown }
        if (!data.bundle) {
          showToast({ message: 'Export failed: empty response', variant: 'error' })
          return
        }
        const blob = new Blob([JSON.stringify(data.bundle, null, 2)], {
          type: 'application/json',
        })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        const safeName = (settingsData?.name || 'campaign')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
        anchor.download = `${safeName}-campaign.json`
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        URL.revokeObjectURL(url)
        showToast({ message: 'Campaign exported successfully', variant: 'success' })
      })
      .catch(() => {
        showToast({ message: 'Export failed: network error', variant: 'error' })
      })
  }, [apiUrl, settingsData, showToast, token])

  const handleDeleteCampaign = useCallback(() => {
    if (selectedCampaign) {
      void onDeleteCampaign(selectedCampaign.id)
    }
  }, [onDeleteCampaign, selectedCampaign])

  // Stable-callback-via-ref pattern: ref stays current on every render so the
  // stable useCallback([]) wrapper always calls the latest prop, regardless of
  // whether the parent stabilises these functions with useCallback.
  const onCopyInviteUrlRef = useRef(onCopyInviteUrl)
  onCopyInviteUrlRef.current = onCopyInviteUrl
  const handleCopyInviteUrl = useCallback(
    (inviteType: 'PLAYER' | 'SPECTATOR') => onCopyInviteUrlRef.current(inviteType),
    []
  )

  const onReissueInviteRef = useRef(onReissueInvite)
  onReissueInviteRef.current = onReissueInvite
  const handleReissueInvite = useCallback(
    (inviteType: 'PLAYER' | 'SPECTATOR') => onReissueInviteRef.current(inviteType),
    []
  )

  const onSettingsReferenceSessionChangeRef = useRef(onSettingsReferenceSessionChange)
  onSettingsReferenceSessionChangeRef.current = onSettingsReferenceSessionChange
  const handleSettingsReferenceSessionChange = useCallback(
    (sessionId: UUID) => onSettingsReferenceSessionChangeRef.current(sessionId),
    []
  )

  // Stable ReactNode reference: EditorView receives the same object when settings
  // data is unchanged, so memo(EditorView) can short-circuit the render cascade.
  const settingsPanel = useMemo(
    () => (
      <WorkspaceSettingsPanel
        role={
          props.membershipRole === 'DM'
            ? 'DM'
            : props.membershipRole === 'PLAYER'
              ? 'PLAYER'
              : 'SPECTATOR'
        }
        campaignSettings={{
          campaignName: props.selectedCampaign?.name,
          isLoading: props.isSettingsLoading,
          isSaving: props.isSettingsSaving,
          isInviteReissuing: props.isInviteReissuing,
          settingsData: props.settingsData,
          settingsName: props.settingsName,
          onSettingsNameChange: props.onSettingsNameChange,
          settingsDescription: props.settingsDescription,
          onSettingsDescriptionChange: props.onSettingsDescriptionChange,
          onPosterFileSelected: props.onPosterFileSelected,
          settingsPosterUrl: props.settingsPosterUrl,
          onSettingsPosterUrlChange: props.onSettingsPosterUrlChange,
          onRemovePoster: handleRemovePoster,
          settingsVisibility: props.settingsVisibility,
          onSettingsVisibilityChange: props.onSettingsVisibilityChange,
          settingsSpectatorsEnabled: props.settingsSpectatorsEnabled,
          onSettingsSpectatorsEnabledChange: props.onSettingsSpectatorsEnabledChange,
          settingsSpectatorMax: props.settingsSpectatorMax,
          onSettingsSpectatorMaxChange: props.onSettingsSpectatorMaxChange,
          settingsSpectatorWaitlistEnabled: props.settingsSpectatorWaitlistEnabled,
          onSettingsSpectatorWaitlistEnabledChange: props.onSettingsSpectatorWaitlistEnabledChange,
          settingsSpectatorReconnectGraceSecs: props.settingsSpectatorReconnectGraceSecs,
          onSettingsSpectatorReconnectGraceSecsChange:
            props.onSettingsSpectatorReconnectGraceSecsChange,
          settingsPostSessionChatEnabled: props.settingsPostSessionChatEnabled,
          onSettingsPostSessionChatEnabledChange: props.onSettingsPostSessionChatEnabledChange,
          settingsPostSessionChatDurationMinutes: props.settingsPostSessionChatDurationMinutes,
          onSettingsPostSessionChatDurationMinutesChange:
            props.onSettingsPostSessionChatDurationMinutesChange,
          settingsExtensionSyncPolicy: props.settingsExtensionSyncPolicy,
          onSettingsExtensionSyncPolicyChange: props.onSettingsExtensionSyncPolicyChange,
          settingsExtensionInventorySyncEnabled: props.settingsExtensionInventorySyncEnabled,
          onSettingsExtensionInventorySyncEnabledChange:
            props.onSettingsExtensionInventorySyncEnabledChange,
          settingsExtensionCurrencySyncEnabled: props.settingsExtensionCurrencySyncEnabled,
          onSettingsExtensionCurrencySyncEnabledChange:
            props.onSettingsExtensionCurrencySyncEnabledChange,
          settingsExtensionPartyInventorySyncAccess:
            props.settingsExtensionPartyInventorySyncAccess,
          onSettingsExtensionPartyInventorySyncAccessChange:
            props.onSettingsExtensionPartyInventorySyncAccessChange,
          settingsExtensionSyncConflictResolution: props.settingsExtensionSyncConflictResolution,
          onSettingsExtensionSyncConflictResolutionChange:
            props.onSettingsExtensionSyncConflictResolutionChange,
          settingsLateJoinPolicy: props.settingsLateJoinPolicy,
          onSettingsLateJoinPolicyChange: props.onSettingsLateJoinPolicyChange,
          settingsLateJoinGraceMinutes: props.settingsLateJoinGraceMinutes,
          onSettingsLateJoinGraceMinutesChange: props.onSettingsLateJoinGraceMinutesChange,
          settingsDmAutoTargetOnFirstPlayerJoin: props.settingsDmAutoTargetOnFirstPlayerJoin,
          onSettingsDmAutoTargetOnFirstPlayerJoinChange:
            props.onSettingsDmAutoTargetOnFirstPlayerJoinChange,
          settingsDefaultSessionDurationMins: props.settingsDefaultSessionDurationMins,
          onSettingsDefaultSessionDurationMinsChange:
            props.onSettingsDefaultSessionDurationMinsChange,
          settingsSupportedPlatforms: props.settingsSupportedPlatforms,
          onSettingsSupportedPlatformsChange: props.onSettingsSupportedPlatformsChange,
          settingsDndRuleset: props.settingsDndRuleset,
          onSettingsDndRulesetChange: props.onSettingsDndRulesetChange,
          settingsAllowPlayerGive: props.settingsAllowPlayerGive,
          onSettingsAllowPlayerGiveChange: props.onSettingsAllowPlayerGiveChange,
          settingsAllowPlayerTake: props.settingsAllowPlayerTake,
          onSettingsAllowPlayerTakeChange: props.onSettingsAllowPlayerTakeChange,
          settingsAllowPlayerLoot: props.settingsAllowPlayerLoot,
          onSettingsAllowPlayerLootChange: props.onSettingsAllowPlayerLootChange,
          sessionNameBase: props.sessionSettingsName,
          onSessionNameBaseChange: props.onSessionNameChange,
          sessionNameContext: 'NEXT',
          isSessionActive:
            props.currentSessionState === SessionState.ACTIVE ||
            props.currentSessionState === SessionState.PAUSED,
          isEditorContext: true,
          onCopyInviteUrl: handleCopyInviteUrl,
          onReissueInvite: handleReissueInvite,
          onExport: handleExport,
          onSave: props.onSaveCampaignSettings,
          onDeleteCampaign: handleDeleteCampaign,
          isDeletingCampaign: props.isDeletingCampaign,
          campaignId: props.selectedCampaignId || null,
        }}
        playerSettings={{
          campaignId: props.selectedCampaignId || null,
          characterDraft: props.characterSettingsPanel,
          onCharacterFieldChange: props.onCharacterFieldChange,
          onClassesChange: props.onClassesChange,
          onSaveCharacterSettings: props.onSaveCharacterSettings,
          isCharacterLoading: props.isCharacterSettingsLoading,
          isCharacterSaving: props.isCharacterSettingsSaving,
        }}
      />
    ),
    [
      handleCopyInviteUrl,
      handleDeleteCampaign,
      handleExport,
      handleRemovePoster,
      handleReissueInvite,
      props.characterSettingsPanel,
      props.currentSessionState,
      props.isDeletingCampaign,
      props.isCharacterSettingsLoading,
      props.isCharacterSettingsSaving,
      props.isInviteReissuing,
      props.isSettingsLoading,
      props.isSettingsSaving,
      props.membershipRole,
      props.onCharacterFieldChange,
      props.onClassesChange,
      props.onPosterFileSelected,
      props.onSaveCampaignSettings,
      props.onSessionNameChange,
      props.onSettingsDefaultSessionDurationMinsChange,
      props.onSettingsDescriptionChange,
      props.onSettingsDmAutoTargetOnFirstPlayerJoinChange,
      props.onSettingsExtensionSyncPolicyChange,
      props.onSettingsExtensionInventorySyncEnabledChange,
      props.onSettingsExtensionCurrencySyncEnabledChange,
      props.onSettingsExtensionPartyInventorySyncAccessChange,
      props.onSettingsExtensionSyncConflictResolutionChange,
      props.onSettingsLateJoinGraceMinutesChange,
      props.onSettingsLateJoinPolicyChange,
      props.onSettingsNameChange,
      props.onSettingsPosterUrlChange,
      props.onSettingsPostSessionChatDurationMinutesChange,
      props.onSettingsPostSessionChatEnabledChange,
      props.onSettingsSpectatorsEnabledChange,
      props.onSettingsSpectatorMaxChange,
      props.onSettingsSpectatorReconnectGraceSecsChange,
      props.onSettingsSpectatorWaitlistEnabledChange,
      props.onSettingsSupportedPlatformsChange,
      props.onSettingsDndRulesetChange,
      props.onSettingsVisibilityChange,
      props.onSaveCharacterSettings,
      props.selectedCampaign,
      props.selectedCampaignId,
      props.sessionSettingsName,
      props.settingsData,
      props.settingsDefaultSessionDurationMins,
      props.settingsDmAutoTargetOnFirstPlayerJoin,
      props.settingsDescription,
      props.settingsExtensionSyncPolicy,
      props.settingsExtensionInventorySyncEnabled,
      props.settingsExtensionCurrencySyncEnabled,
      props.settingsExtensionPartyInventorySyncAccess,
      props.settingsExtensionSyncConflictResolution,
      props.settingsLateJoinGraceMinutes,
      props.settingsLateJoinPolicy,
      props.settingsName,
      props.settingsPosterUrl,
      props.settingsPostSessionChatDurationMinutes,
      props.settingsPostSessionChatEnabled,
      props.settingsSpectatorsEnabled,
      props.settingsSpectatorMax,
      props.settingsSpectatorReconnectGraceSecs,
      props.settingsSpectatorWaitlistEnabled,
      props.settingsSupportedPlatforms,
      props.settingsVisibility,
      props.settingsAllowPlayerGive,
      props.onSettingsAllowPlayerGiveChange,
      props.settingsAllowPlayerTake,
      props.onSettingsAllowPlayerTakeChange,
      props.settingsAllowPlayerLoot,
      props.onSettingsAllowPlayerLootChange,
    ]
  )

  if (props.hasSessionSelected || props.editorWorkspaceView !== 'editor') {
    return null
  }

  return (
    <>
      {props.selectedCampaignId && (
        <DmTransferOfferBanner campaignId={props.selectedCampaignId as UUID} />
      )}
      <EditorView
        campaign={props.selectedCampaign}
        role={props.membershipRole}
        themeMode={props.themeMode}
        apiUrl={props.apiUrl}
        authToken={props.token}
        currentSessionId={props.currentSessionId}
        currentSessionState={props.currentSessionState}
        currentUserId={props.userId}
        partyPresenceRefreshVersion={props.partyPresenceRefreshVersion}
        fetchWithAuthGuard={props.fetchWithAuthGuard}
        connectionStatus={props.connectionStatus}
        sessionCount={props.settingsCampaignSessionsCount}
        totalSessionDurationMs={props.settingsCampaignTotalDurationMs}
        settingsCampaignSessions={props.settingsCampaignSessions}
        settingsReferenceSessionId={props.settingsReferenceSessionId}
        canEditCampaignInfo={Boolean(
          props.selectedCampaign && props.selectedCampaign.currentDmId === props.userId
        )}
        isLaunchDisabled={props.isLaunchDisabled}
        launchDisabledReason={props.launchDisabledReason}
        showInviteWidget={Boolean(
          props.selectedCampaign && props.selectedCampaign.currentDmId === props.userId
        )}
        joinUrl={
          props.settingsData?.inviteCode
            ? `${window.location.origin}/join/${encodeURIComponent(props.settingsData.inviteCode)}`
            : props.selectedCampaign?.inviteCode
              ? `${window.location.origin}/join/${encodeURIComponent(props.selectedCampaign.inviteCode)}`
              : ''
        }
        watchUrl={
          props.settingsData?.spectatorInviteCode || props.selectedCampaign?.spectatorInviteCode
            ? `${window.location.origin}/watch/${encodeURIComponent(props.settingsData?.spectatorInviteCode || props.selectedCampaign?.spectatorInviteCode || '')}`
            : ''
        }
        spectatorsEnabled={
          props.settingsData
            ? props.settingsData.spectatorPolicy !== 'NONE'
            : Boolean(props.selectedCampaign?.spectatorsEnabled)
        }
        isInviteReissuing={props.isInviteReissuing}
        settingsPanel={settingsPanel}
        onBackToLobby={props.onBackToLobby}
        onToggleTheme={props.onToggleTheme}
        onOpenUserSettings={props.onOpenUserSettings}
        onLaunch={props.onLaunch}
        onCopyInviteUrl={props.onCopyInviteUrl}
        onReissueInvite={props.onReissueInvite}
        onSaveCampaignInfo={props.onSaveCampaignInfo}
        onSettingsReferenceSessionChange={props.onSettingsReferenceSessionChange}
      />
    </>
  )
})
