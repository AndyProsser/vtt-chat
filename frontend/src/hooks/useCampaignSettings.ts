/**
 * useCampaignSettings Hook
 * Manages campaign settings loading, saving, and invite reissuing.
 * Handles all campaign configuration state and API interactions.
 */

import { useMemo, useState } from 'react'
import type { UUID } from '@shared'
import type { Session as SessionRecord } from '@/types/session'
import type {
  CampaignSettingsPayload,
  CampaignSettingsHomeTab,
} from '@/components/session/sessionInit.shared'
import { toValidPostSessionDurationMinutes } from '@/components/session/sessionController'

interface UseCampaignSettingsState {
  isSettingsLoading: boolean
  isSettingsSaving: boolean
  isInviteReissuing: boolean
  isDmVoiceTargetingSettingLoading: boolean
  isDmVoiceTargetingSettingSaving: boolean
  settingsCampaignId: UUID | ''
  settingsHomeTab: CampaignSettingsHomeTab
  settingsCampaignSessions: SessionRecord[]
  settingsReferenceSessionId: UUID | ''
  isSettingsReferenceNotesLoading: boolean
  settingsReferenceNotesError: string | null
  settingsData: CampaignSettingsPayload | null
  settingsName: string
  settingsDescription: string
  settingsVisibility: 'PUBLIC' | 'PRIVATE'
  settingsSpectatorsEnabled: boolean
  settingsSpectatorMax: number
  settingsSpectatorWaitlistEnabled: boolean
  settingsSpectatorReconnectGraceSecs: number
  settingsExtensionSyncPolicy: 'ALLOW' | 'DM_ONLY' | 'NONE'
  settingsPostSessionChatEnabled: boolean
  settingsPostSessionChatDurationMinutes: number
  settingsDmAutoTargetOnFirstPlayerJoin: boolean
  settingsLateJoinPolicy: 'OPEN' | 'SCREENED' | 'BLOCKED'
  settingsLateJoinGraceMinutes: number
  settingsPosterUrl: string
}

interface UseCampaignSettingsActions {
  setIsSettingsLoading: (value: boolean) => void
  setIsSettingsSaving: (value: boolean) => void
  setIsInviteReissuing: (value: boolean) => void
  setIsDmVoiceTargetingSettingLoading: (value: boolean) => void
  setIsDmVoiceTargetingSettingSaving: (value: boolean) => void
  setSettingsCampaignId: (value: UUID | '') => void
  setSettingsHomeTab: (value: CampaignSettingsHomeTab) => void
  setSettingsCampaignSessions: (value: SessionRecord[]) => void
  setSettingsReferenceSessionId: (value: UUID | '') => void
  setIsSettingsReferenceNotesLoading: (value: boolean) => void
  setSettingsReferenceNotesError: (value: string | null) => void
  setSettingsData: (value: CampaignSettingsPayload | null) => void
  setSettingsName: (value: string) => void
  setSettingsDescription: (value: string) => void
  setSettingsVisibility: (value: 'PUBLIC' | 'PRIVATE') => void
  setSettingsSpectatorsEnabled: (value: boolean) => void
  setSettingsSpectatorMax: (value: number) => void
  setSettingsSpectatorWaitlistEnabled: (value: boolean) => void
  setSettingsSpectatorReconnectGraceSecs: (value: number) => void
  setSettingsExtensionSyncPolicy: (value: 'ALLOW' | 'DM_ONLY' | 'NONE') => void
  setSettingsPostSessionChatEnabled: (value: boolean) => void
  setSettingsPostSessionChatDurationMinutes: (value: number) => void
  setSettingsDmAutoTargetOnFirstPlayerJoin: (value: boolean) => void
  setSettingsLateJoinPolicy: (value: 'OPEN' | 'SCREENED' | 'BLOCKED') => void
  setSettingsLateJoinGraceMinutes: (value: number) => void
  setSettingsPosterUrl: (value: string) => void
}

export function useCampaignSettings(): [UseCampaignSettingsState, UseCampaignSettingsActions] {
  const [isSettingsLoading, setIsSettingsLoading] = useState(false)
  const [isSettingsSaving, setIsSettingsSaving] = useState(false)
  const [isInviteReissuing, setIsInviteReissuing] = useState(false)
  const [isDmVoiceTargetingSettingLoading, setIsDmVoiceTargetingSettingLoading] = useState(false)
  const [isDmVoiceTargetingSettingSaving, setIsDmVoiceTargetingSettingSaving] = useState(false)
  const [settingsCampaignId, setSettingsCampaignId] = useState<UUID | ''>('')
  const [settingsHomeTab, setSettingsHomeTab] = useState<CampaignSettingsHomeTab>('home')
  const [settingsCampaignSessions, setSettingsCampaignSessions] = useState<SessionRecord[]>([])
  const [settingsReferenceSessionId, setSettingsReferenceSessionId] = useState<UUID | ''>('')
  const [isSettingsReferenceNotesLoading, setIsSettingsReferenceNotesLoading] = useState(false)
  const [settingsReferenceNotesError, setSettingsReferenceNotesError] = useState<string | null>(
    null
  )
  const [settingsData, setSettingsData] = useState<CampaignSettingsPayload | null>(null)
  const [settingsName, setSettingsName] = useState('')
  const [settingsDescription, setSettingsDescription] = useState('')
  const [settingsVisibility, setSettingsVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PRIVATE')
  const [settingsSpectatorsEnabled, setSettingsSpectatorsEnabled] = useState(false)
  const [settingsSpectatorMax, setSettingsSpectatorMax] = useState(10)
  const [settingsSpectatorWaitlistEnabled, setSettingsSpectatorWaitlistEnabled] = useState(false)
  const [settingsSpectatorReconnectGraceSecs, setSettingsSpectatorReconnectGraceSecs] = useState(60)
  const [settingsExtensionSyncPolicy, setSettingsExtensionSyncPolicy] = useState<
    'ALLOW' | 'DM_ONLY' | 'NONE'
  >('ALLOW')
  const [settingsPostSessionChatEnabled, setSettingsPostSessionChatEnabled] = useState(true)
  const [settingsPostSessionChatDurationMinutes, setSettingsPostSessionChatDurationMinutes] =
    useState(5)
  const [settingsDmAutoTargetOnFirstPlayerJoin, setSettingsDmAutoTargetOnFirstPlayerJoin] =
    useState(true)
  const [settingsLateJoinPolicy, setSettingsLateJoinPolicy] = useState<
    'OPEN' | 'SCREENED' | 'BLOCKED'
  >('OPEN')
  const [settingsLateJoinGraceMinutes, setSettingsLateJoinGraceMinutes] = useState(30)
  const [settingsPosterUrl, setSettingsPosterUrl] = useState('')

  const state: UseCampaignSettingsState = useMemo(
    () => ({
      isSettingsLoading,
      isSettingsSaving,
      isInviteReissuing,
      isDmVoiceTargetingSettingLoading,
      isDmVoiceTargetingSettingSaving,
      settingsCampaignId,
      settingsHomeTab,
      settingsCampaignSessions,
      settingsReferenceSessionId,
      isSettingsReferenceNotesLoading,
      settingsReferenceNotesError,
      settingsData,
      settingsName,
      settingsDescription,
      settingsVisibility,
      settingsSpectatorsEnabled,
      settingsSpectatorMax,
      settingsSpectatorWaitlistEnabled,
      settingsSpectatorReconnectGraceSecs,
      settingsExtensionSyncPolicy,
      settingsPostSessionChatEnabled,
      settingsPostSessionChatDurationMinutes,
      settingsDmAutoTargetOnFirstPlayerJoin,
      settingsLateJoinPolicy,
      settingsLateJoinGraceMinutes,
      settingsPosterUrl,
    }),
    [
      isSettingsLoading,
      isSettingsSaving,
      isInviteReissuing,
      isDmVoiceTargetingSettingLoading,
      isDmVoiceTargetingSettingSaving,
      settingsCampaignId,
      settingsHomeTab,
      settingsCampaignSessions,
      settingsReferenceSessionId,
      isSettingsReferenceNotesLoading,
      settingsReferenceNotesError,
      settingsData,
      settingsName,
      settingsDescription,
      settingsVisibility,
      settingsSpectatorsEnabled,
      settingsSpectatorMax,
      settingsSpectatorWaitlistEnabled,
      settingsSpectatorReconnectGraceSecs,
      settingsExtensionSyncPolicy,
      settingsPostSessionChatEnabled,
      settingsPostSessionChatDurationMinutes,
      settingsDmAutoTargetOnFirstPlayerJoin,
      settingsLateJoinPolicy,
      settingsLateJoinGraceMinutes,
      settingsPosterUrl,
    ]
  )

  const actions: UseCampaignSettingsActions = useMemo(
    () => ({
      setIsSettingsLoading,
      setIsSettingsSaving,
      setIsInviteReissuing,
      setIsDmVoiceTargetingSettingLoading,
      setIsDmVoiceTargetingSettingSaving,
      setSettingsCampaignId,
      setSettingsHomeTab,
      setSettingsCampaignSessions,
      setSettingsReferenceSessionId,
      setIsSettingsReferenceNotesLoading,
      setSettingsReferenceNotesError,
      setSettingsData,
      setSettingsName,
      setSettingsDescription,
      setSettingsVisibility,
      setSettingsSpectatorsEnabled,
      setSettingsSpectatorMax,
      setSettingsSpectatorWaitlistEnabled,
      setSettingsSpectatorReconnectGraceSecs,
      setSettingsExtensionSyncPolicy,
      setSettingsPostSessionChatEnabled,
      setSettingsPostSessionChatDurationMinutes,
      setSettingsDmAutoTargetOnFirstPlayerJoin,
      setSettingsLateJoinPolicy,
      setSettingsLateJoinGraceMinutes,
      setSettingsPosterUrl,
    }),
    []
  )

  return [state, actions]
}

export type { UseCampaignSettingsState, UseCampaignSettingsActions }
