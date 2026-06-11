import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Session as SessionRecord } from '@/types/session'
import type { PlayerSettingsPanel } from '@/components/workspaces/shared/panels/PlayerSettingsPanel'
import type { UserCharacterRecord } from '@/types/session/workspaces'
import { buildCharacterDraft, DEFAULT_CHARACTER_SETTINGS } from '@/utils/session/workspaces'

type UseWorkspacesSettingsStateBridgeParams = {
  currentSession: SessionRecord | null
  defaultPlannedDurationMinutes: number
  setSessionSettingsName: Dispatch<SetStateAction<string>>
  setSessionSettingsPlannedDurationMinutes: Dispatch<SetStateAction<number>>
  selectedCharacter: UserCharacterRecord | null
  setSelectedCharacterId: (characterId: UserCharacterRecord['id']) => void
  setCharacterSettingsDraft: (draft: PlayerSettingsPanel) => void
}

/**
 * Synchronizes local session-settings fields and character draft state from active session/selection.
 */
export function useWorkspacesSettingsStateBridge({
  currentSession,
  defaultPlannedDurationMinutes,
  setSessionSettingsName,
  setSessionSettingsPlannedDurationMinutes,
  selectedCharacter,
  setSelectedCharacterId,
  setCharacterSettingsDraft,
}: UseWorkspacesSettingsStateBridgeParams) {
  useEffect(() => {
    setSessionSettingsName(currentSession?.name || '')
    setSessionSettingsPlannedDurationMinutes(
      currentSession?.plannedDurationMinutes || defaultPlannedDurationMinutes
    )
  }, [
    currentSession?.id,
    currentSession?.name,
    currentSession?.plannedDurationMinutes,
    defaultPlannedDurationMinutes,
    setSessionSettingsName,
    setSessionSettingsPlannedDurationMinutes,
  ])

  useEffect(() => {
    if (!selectedCharacter) {
      setCharacterSettingsDraft(DEFAULT_CHARACTER_SETTINGS)
      return
    }

    setSelectedCharacterId(selectedCharacter.id)
    setCharacterSettingsDraft(buildCharacterDraft(selectedCharacter))
  }, [selectedCharacter, setCharacterSettingsDraft, setSelectedCharacterId])
}
