import { useCallback, useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { CharacterClassEntry, UUID } from '@shared'
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
  isCharacterSettingsLoading: boolean
  isCharacterSettingsSaving: boolean
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
    isCharacterSettingsLoading,
    isCharacterSettingsSaving,
    setError,
    setLobbyNotice,
  } = params

  /**
   * pendingImmediateSaveRef: true when an avatar change just occurred and requires an immediate save.
   * doAutoSaveRef: always holds the latest save closure to avoid stale captures in the effect.
   */
  const pendingImmediateSaveRef = useRef(false)
  const doAutoSaveRef = useRef<() => Promise<void>>(async () => {})

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

  /**
   * Core save implementation.
   * For new characters (no selectedCharacterId) we reload after save to obtain the server-assigned ID.
   * For existing characters we skip the reload — the draft is already correct.
   */
  const doSave = useCallback(
    async ({ showNotice = true }: { showNotice?: boolean } = {}) => {
      if (!selectedCampaignId) {
        return
      }

      const isCreatingNew = !selectedCharacterId
      characterSettingsActions.setIsCharacterSettingsSaving(true)
      setError(null)

      await characterSettingsController.saveCharacterSettings(
        selectedCampaignId,
        selectedCharacterId,
        characterSettingsPanel,
        {
          onNotice: showNotice ? (message) => setLobbyNotice(message) : undefined,
          onError: (message) => setError(message),
          onCharacterSaved: async () => {
            if (isCreatingNew) {
              await loadUserCharacters()
            }
          },
        }
      )

      characterSettingsActions.setIsCharacterSettingsSaving(false)
    },
    [
      characterSettingsActions,
      characterSettingsController,
      characterSettingsPanel,
      loadUserCharacters,
      selectedCampaignId,
      selectedCharacterId,
      setError,
      setLobbyNotice,
    ]
  )

  // Update ref on every render so the effect always calls the latest doSave.
  doAutoSaveRef.current = () => doSave({ showNotice: false })

  /**
   * Avatar-only auto-save effect.
   * Fires immediately after an avatar upload/remove (pendingImmediateSaveRef).
   * All other field changes require an explicit manual save via the Save button.
   */
  useEffect(() => {
    if (!selectedCampaignId || isCharacterSettingsLoading || isCharacterSettingsSaving) {
      return
    }

    if (pendingImmediateSaveRef.current) {
      pendingImmediateSaveRef.current = false
      void doAutoSaveRef.current()
    }
  }, [
    characterSettingsPanel,
    selectedCampaignId,
    isCharacterSettingsLoading,
    isCharacterSettingsSaving,
  ])

  /** Manual save triggered by the Save button. */
  const saveCharacterSettings = useCallback(async () => {
    pendingImmediateSaveRef.current = false
    await doSave({ showNotice: true })
  }, [doSave])

  /**
   * Updates the draft for a single field.
   * Avatar changes trigger an immediate background save; all other fields require manual save.
   */
  const handleCharacterFieldChange = useCallback(
    (field: keyof PlayerSettingsPanel, value: string | number) => {
      characterSettingsActions.setCharacterSettingsDraft(
        updateCharacterField(characterSettingsPanel, field, value)
      )
      if (field === 'avatarUrl') {
        pendingImmediateSaveRef.current = true
      }
    },
    [characterSettingsActions, characterSettingsPanel]
  )

  const handleSrdFieldFocus = useCallback(() => {}, [])
  const handleSrdFieldBlur = useCallback(() => {}, [])

  /**
   * Updates the classes array on the draft, keeping className and level in sync.
   * Total level is recomputed from per-class levels so callers need not do it themselves.
   */
  const handleClassesChange = useCallback(
    (classes: CharacterClassEntry[]) => {
      const totalLevel = classes.reduce((sum, c) => sum + c.level, 0)
      characterSettingsActions.setCharacterSettingsDraft({
        ...characterSettingsPanel,
        classes,
        className: classes[0]?.name ?? characterSettingsPanel.className,
        level: totalLevel,
      })
    },
    [characterSettingsActions, characterSettingsPanel]
  )

  return {
    loadUserCharacters,
    saveCharacterSettings,
    handleCharacterFieldChange,
    handleClassesChange,
    handleSrdFieldFocus,
    handleSrdFieldBlur,
  }
}
