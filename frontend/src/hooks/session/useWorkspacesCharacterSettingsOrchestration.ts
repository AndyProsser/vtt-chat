import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { UUID } from '@shared'
import type { UseCharacterSettingsActions } from '../../hooks/useCharacterSettings'
import {
  applyLoadedCharacters,
  resetCharacterSettings,
  updateCharacterField,
} from '@/utils/session/sessionSettings'
import type { PlayerSettingsPanel } from '@/components/workspaces/shared/panels/PlayerSettingsPanel'
import { createCharacterSettingsController } from '@/utils/session/sessionController'

type UseWorkspacesCharacterSettingsOrchestrationParams = {
  characterSettingsController: ReturnType<typeof createCharacterSettingsController>
  characterSettingsActions: UseCharacterSettingsActions
  selectedCampaignId: UUID | ''
  selectedCharacterId: UUID | ''
  characterSettingsPanel: PlayerSettingsPanel
  setError: Dispatch<SetStateAction<string | null>>
  setLobbyNotice: Dispatch<SetStateAction<string | null>>
}

export function useWorkspacesCharacterSettingsOrchestration(
  params: UseWorkspacesCharacterSettingsOrchestrationParams
) {
  const {
    characterSettingsController,
    characterSettingsActions,
    selectedCampaignId,
    selectedCharacterId,
    characterSettingsPanel,
    setError,
    setLobbyNotice,
  } = params

  const loadUserCharacters = useCallback(async () => {
    if (!selectedCampaignId) {
      resetCharacterSettings(characterSettingsActions)
      return
    }

    characterSettingsActions.setIsCharacterSettingsLoading(true)

    const characters = await characterSettingsController.loadUserCharacters(selectedCampaignId, {
      onCharactersLoaded: (loadedCharacters) => {
        applyLoadedCharacters(characterSettingsActions, loadedCharacters)
      },
      onError: () => {
        resetCharacterSettings(characterSettingsActions)
      },
    })

    if (characters.length === 0) {
      resetCharacterSettings(characterSettingsActions)
    }

    characterSettingsActions.setIsCharacterSettingsLoading(false)
  }, [characterSettingsActions, characterSettingsController, selectedCampaignId])

  const saveCharacterSettings = useCallback(async () => {
    if (!selectedCampaignId) {
      return
    }

    characterSettingsActions.setIsCharacterSettingsSaving(true)
    setError(null)

    await characterSettingsController.saveCharacterSettings(
      selectedCampaignId,
      selectedCharacterId,
      characterSettingsPanel,
      {
        onNotice: (message) => setLobbyNotice(message),
        onError: (message) => setError(message),
        onCharacterSaved: async () => {
          await loadUserCharacters()
        },
      }
    )

    characterSettingsActions.setIsCharacterSettingsSaving(false)
  }, [
    characterSettingsActions,
    characterSettingsController,
    characterSettingsPanel,
    loadUserCharacters,
    selectedCampaignId,
    selectedCharacterId,
    setError,
    setLobbyNotice,
  ])

  const handleCharacterFieldChange = useCallback(
    (field: keyof PlayerSettingsPanel, value: string | number) => {
      characterSettingsActions.setCharacterSettingsDraft(
        updateCharacterField(characterSettingsPanel, field, value)
      )
    },
    [characterSettingsActions, characterSettingsPanel]
  )

  return {
    loadUserCharacters,
    saveCharacterSettings,
    handleCharacterFieldChange,
  }
}
