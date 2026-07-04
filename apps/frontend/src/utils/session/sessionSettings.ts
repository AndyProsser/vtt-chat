import type { UseCampaignSettingsActions } from '../../hooks/useCampaignSettings'
import type { UseCharacterSettingsActions } from '../../hooks/useCharacterSettings'
import type { PlayerSettingsPanel } from '@/components/workspaces/shared/panels/PlayerSettingsPanel'
import { normalizeExtensionSyncPolicy, serializeExtensionSyncPolicy } from '@/utils/sessionUi'
import type {
  CampaignVisibility,
  ExtensionPartyInventorySyncAccess,
  ExtensionSyncConflictResolution,
  ExtensionSyncPolicy,
  LateJoinPolicy,
  SupportedPlatform,
} from '@/types/sessionUi'
import type { CampaignSettingsPayload, CampaignSummary } from '@/types/session/campaign'
import type { UserCharacterRecord } from '@/types/session/workspaces'
import {
  buildCharacterDraft,
  DEFAULT_CHARACTER_SETTINGS,
  toValidPostSessionDurationMinutes,
} from '@/utils/session/workspaces'
import { SessionScheduleType, formatScheduleLabel } from '@shared'
import { useStore } from '@/state/store'

export function applyCampaignSettingsPayload(
  campaignSettingsActions: UseCampaignSettingsActions,
  settings: CampaignSettingsPayload
): void {
  campaignSettingsActions.setSettingsData(settings)
  campaignSettingsActions.setSettingsReferenceSessionId(settings.latestSessionId || '')
  campaignSettingsActions.setSettingsName(settings.name)
  campaignSettingsActions.setSettingsDescription(settings.description || '')
  campaignSettingsActions.setSettingsVisibility(settings.discoverable ? 'PUBLIC' : 'PRIVATE')
  campaignSettingsActions.setSettingsSpectatorsEnabled(settings.spectatorPolicy !== 'NONE')
  campaignSettingsActions.setSettingsSpectatorMax(settings.spectatorMax ?? 10)
  campaignSettingsActions.setSettingsSpectatorWaitlistEnabled(settings.spectatorWaitlistEnabled)
  campaignSettingsActions.setSettingsSpectatorReconnectGraceSecs(
    settings.spectatorReconnectGraceSecs
  )
  campaignSettingsActions.setSettingsPostSessionChatEnabled(settings.postSessionChatEnabled)
  campaignSettingsActions.setSettingsPostSessionChatDurationMinutes(
    toValidPostSessionDurationMinutes(settings.postSessionChatDurationMs / 60000)
  )
  campaignSettingsActions.setSettingsDmAutoTargetOnFirstPlayerJoin(
    settings.dmAutoTargetOnFirstPlayerJoin ?? true
  )
  campaignSettingsActions.setSettingsExtensionSyncPolicy(
    normalizeExtensionSyncPolicy(settings.extensionSyncPolicy)
  )
  campaignSettingsActions.setSettingsExtensionInventorySyncEnabled(
    settings.extensionInventorySyncEnabled ?? true
  )
  campaignSettingsActions.setSettingsExtensionCurrencySyncEnabled(
    settings.extensionCurrencySyncEnabled ?? true
  )
  campaignSettingsActions.setSettingsExtensionPartyInventorySyncAccess(
    settings.extensionPartyInventorySyncAccess ?? 'DM_ONLY'
  )
  campaignSettingsActions.setSettingsExtensionSyncConflictResolution(
    settings.extensionSyncConflictResolution ?? 'OVERWRITE'
  )
  campaignSettingsActions.setSettingsLateJoinPolicy(settings.lateJoinPolicy)
  campaignSettingsActions.setSettingsLateJoinGraceMinutes(settings.lateJoinGraceMinutes)
  campaignSettingsActions.setSettingsPosterUrl(settings.posterUrl || '')
  campaignSettingsActions.setSettingsDefaultSessionDurationMins(
    settings.defaultSessionDurationMins ?? 240
  )
  campaignSettingsActions.setSettingsSupportedPlatforms(
    (settings.supportedPlatforms ?? ['ANY']) as SupportedPlatform[]
  )
  campaignSettingsActions.setSettingsDndRuleset(settings.dndRuleset ?? '2024')
  campaignSettingsActions.setSettingsAllowPlayerGive(settings.allowPlayerGive ?? true)
  campaignSettingsActions.setSettingsAllowPlayerTake(settings.allowPlayerTake ?? true)
  campaignSettingsActions.setSettingsAllowPlayerLoot(settings.allowPlayerLoot ?? false)

  // Hydrate campaign schedule slice — needed for NextSessionDate on refresh and after info edits
  const schedLabel =
    settings.sessionScheduleType &&
    settings.sessionScheduleDay != null &&
    settings.sessionScheduleHour != null &&
    settings.sessionScheduleMinute != null &&
    settings.sessionScheduleTz
      ? formatScheduleLabel({
          type: settings.sessionScheduleType as SessionScheduleType,
          dayOfWeek: settings.sessionScheduleDay,
          nth: settings.sessionScheduleNth ?? undefined,
          hour: settings.sessionScheduleHour,
          minute: settings.sessionScheduleMinute,
          timezone: settings.sessionScheduleTz,
        })
      : null

  useStore.getState().setCampaignSchedule(settings.id, {
    nextSessionDate: settings.nextSessionDate ?? null,
    scheduleLabel: schedLabel,
    nextSessionIsManual: settings.nextSessionIsManual ?? false,
  })
}

export function buildCampaignSettingsSavePayload(params: {
  settingsName: string
  settingsDescription: string
  settingsPosterUrl: string
  settingsVisibility: CampaignVisibility
  settingsSpectatorsEnabled: boolean
  settingsSpectatorMax: number
  settingsSpectatorWaitlistEnabled: boolean
  settingsSpectatorReconnectGraceSecs: number
  settingsExtensionSyncPolicy: ExtensionSyncPolicy
  settingsExtensionInventorySyncEnabled: boolean
  settingsExtensionCurrencySyncEnabled: boolean
  settingsExtensionPartyInventorySyncAccess: ExtensionPartyInventorySyncAccess
  settingsExtensionSyncConflictResolution: ExtensionSyncConflictResolution
  settingsPostSessionChatEnabled: boolean
  settingsPostSessionChatDurationMinutes: number
  settingsDmAutoTargetOnFirstPlayerJoin: boolean
  settingsLateJoinPolicy: LateJoinPolicy
  settingsLateJoinGraceMinutes: number
  settingsDefaultSessionDurationMins: number
  settingsSupportedPlatforms: SupportedPlatform[]
  settingsDndRuleset: '2014' | '2024'
  settingsAllowPlayerGive: boolean
  settingsAllowPlayerTake: boolean
  settingsAllowPlayerLoot: boolean
}) {
  return {
    name: params.settingsName,
    description: params.settingsDescription,
    posterUrl: params.settingsPosterUrl.trim().length > 0 ? params.settingsPosterUrl.trim() : null,
    discoverable: params.settingsVisibility === 'PUBLIC',
    spectatorsEnabled: params.settingsSpectatorsEnabled,
    spectatorMax: params.settingsSpectatorsEnabled ? params.settingsSpectatorMax : null,
    spectatorWaitlistEnabled: params.settingsSpectatorsEnabled
      ? params.settingsSpectatorWaitlistEnabled
      : false,
    spectatorReconnectGraceSecs: params.settingsSpectatorsEnabled
      ? params.settingsSpectatorReconnectGraceSecs
      : 60,
    extensionSyncPolicy: serializeExtensionSyncPolicy(params.settingsExtensionSyncPolicy),
    extensionInventorySyncEnabled: params.settingsExtensionInventorySyncEnabled,
    extensionCurrencySyncEnabled: params.settingsExtensionCurrencySyncEnabled,
    extensionPartyInventorySyncAccess: params.settingsExtensionPartyInventorySyncAccess,
    extensionSyncConflictResolution: params.settingsExtensionSyncConflictResolution,
    postSessionChatEnabled: Boolean(params.settingsPostSessionChatEnabled),
    postSessionChatDurationMs:
      toValidPostSessionDurationMinutes(params.settingsPostSessionChatDurationMinutes) * 60_000,
    dmAutoTargetOnFirstPlayerJoin: params.settingsDmAutoTargetOnFirstPlayerJoin,
    lateJoinPolicy: params.settingsLateJoinPolicy,
    lateJoinGraceMinutes:
      params.settingsLateJoinPolicy === 'OPEN' ? 30 : params.settingsLateJoinGraceMinutes,
    defaultSessionDurationMins: params.settingsDefaultSessionDurationMins,
    supportedPlatforms: params.settingsSupportedPlatforms,
    dndRuleset: params.settingsDndRuleset,
    allowPlayerGive: params.settingsAllowPlayerGive,
    allowPlayerTake: params.settingsAllowPlayerTake,
    allowPlayerLoot: params.settingsAllowPlayerLoot,
  }
}

export function syncCampaignSummaryFromSettings(
  campaigns: CampaignSummary[],
  campaign: CampaignSettingsPayload
): CampaignSummary[] {
  return campaigns.map((entry) =>
    entry.id === campaign.id
      ? {
          ...entry,
          name: campaign.name,
          description: campaign.description,
          posterUrl: campaign.posterUrl,
          extensionSyncPolicy: campaign.extensionSyncPolicy,
        }
      : entry
  )
}

export function resetCharacterSettings(
  characterSettingsActions: UseCharacterSettingsActions
): void {
  characterSettingsActions.setUserCharacters([])
  characterSettingsActions.setSelectedCharacterId('')
  characterSettingsActions.setCharacterSettingsDraft({ ...DEFAULT_CHARACTER_SETTINGS })
}

export function applyLoadedCharacters(
  characterSettingsActions: UseCharacterSettingsActions,
  loadedCharacters: UserCharacterRecord[]
): void {
  characterSettingsActions.setUserCharacters(loadedCharacters)
  const preferred = loadedCharacters.find((character) => character.isActive) || loadedCharacters[0]
  characterSettingsActions.setSelectedCharacterId(preferred?.id || '')
  characterSettingsActions.setCharacterSettingsDraft(buildCharacterDraft(preferred || null))
}

export function updateCharacterField(
  characterSettingsPanel: PlayerSettingsPanel,
  field: keyof PlayerSettingsPanel,
  value: string | number
): PlayerSettingsPanel {
  return {
    ...characterSettingsPanel,
    [field]:
      typeof value === 'number'
        ? Number.isFinite(value)
          ? value
          : characterSettingsPanel[field]
        : value,
  }
}
