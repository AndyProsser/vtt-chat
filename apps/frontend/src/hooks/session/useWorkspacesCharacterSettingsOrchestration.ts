import { useCallback, useEffect, useRef } from 'react'
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

/** Debounce delay for regular field changes (ms). */
const AUTO_SAVE_DEBOUNCE_MS = 1500

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
   * isDirtyRef: true when the user has edited a non-avatar field since the last save/load.
   * pendingImmediateSaveRef: true when an avatar change just occurred and requires an immediate save.
   * srdFieldFocusedRef: true while race/class/subclass input has focus — suppresses the debounce
   *   timer so the popup isn't dismissed by a mid-typing save. Save fires on blur instead.
   * doAutoSaveRef: always holds the latest auto-save closure to avoid stale captures in setTimeout.
   */
  const isDirtyRef = useRef(false)
  const pendingImmediateSaveRef = useRef(false)
  const srdFieldFocusedRef = useRef(false)
  const doAutoSaveRef = useRef<() => Promise<void>>(async () => {})

  const loadUserCharacters = useCallback(async () => {
    if (!selectedCampaignId) {
      resetCharacterSettings(characterSettingsActions)
      isDirtyRef.current = false
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

    // Clear dirty flag so the state change from applyLoadedCharacters doesn't
    // trigger an auto-save of freshly-loaded server data.
    isDirtyRef.current = false
    characterSettingsActions.setIsCharacterSettingsLoading(false)
  }, [characterSettingsActions, characterSettingsController, selectedCampaignId])

  /**
   * Core save implementation.
   * showNotice: false for background auto-saves to avoid toasting on every debounce.
   * For new characters (no selectedCharacterId) we reload after save to obtain the server-assigned ID.
   * For existing characters we skip the reload — the draft is already correct and an unnecessary
   * reload would clobber any edits the user made while the request was in-flight.
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

  // Update ref on every render so setTimeout callbacks always call the latest doSave.
  doAutoSaveRef.current = () => doSave({ showNotice: false })

  /**
   * Auto-save effect.
   * Fires whenever characterSettingsPanel changes (i.e. after any field edit).
   *
   * - If an avatar change was just flagged (pendingImmediateSaveRef), save immediately.
   * - Otherwise, start a 1.5s debounce; each new edit resets the timer via cleanup.
   * - Guards against saving while a save or load is already in-flight.
   */
  useEffect(() => {
    if (!selectedCampaignId || isCharacterSettingsLoading || isCharacterSettingsSaving) {
      return
    }

    if (pendingImmediateSaveRef.current) {
      pendingImmediateSaveRef.current = false
      isDirtyRef.current = false
      void doAutoSaveRef.current()
      return
    }

    if (!isDirtyRef.current) {
      return
    }

    // Suppress the timer while a SRD field has focus — save fires on blur instead.
    if (srdFieldFocusedRef.current) {
      return
    }

    const timer = setTimeout(() => {
      isDirtyRef.current = false
      void doAutoSaveRef.current()
    }, AUTO_SAVE_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [
    characterSettingsPanel,
    selectedCampaignId,
    isCharacterSettingsLoading,
    isCharacterSettingsSaving,
  ])

  /** Manual save triggered by the Save button. Shows notice and cancels any pending auto-save. */
  const saveCharacterSettings = useCallback(async () => {
    isDirtyRef.current = false
    pendingImmediateSaveRef.current = false
    await doSave({ showNotice: true })
  }, [doSave])

  /**
   * Updates the draft for a single field.
   * Avatar changes (upload applied or remove) trigger an immediate save.
   * All other changes arm the debounce timer.
   */
  const handleCharacterFieldChange = useCallback(
    (field: keyof PlayerSettingsPanel, value: string | number) => {
      characterSettingsActions.setCharacterSettingsDraft(
        updateCharacterField(characterSettingsPanel, field, value)
      )
      if (field === 'avatarUrl') {
        pendingImmediateSaveRef.current = true
      } else {
        isDirtyRef.current = true
      }
    },
    [characterSettingsActions, characterSettingsPanel]
  )

  /** Called when race/class/subclass input receives focus — suppresses auto-save timer. */
  const handleSrdFieldFocus = useCallback(() => {
    srdFieldFocusedRef.current = true
  }, [])

  /**
   * Called when race/class/subclass input loses focus.
   * If the user made changes while focused, triggers an immediate background save
   * now that the popup is safely dismissed.
   */
  const handleSrdFieldBlur = useCallback(() => {
    srdFieldFocusedRef.current = false
    if (isDirtyRef.current && !isCharacterSettingsLoading && !isCharacterSettingsSaving) {
      isDirtyRef.current = false
      void doAutoSaveRef.current()
    }
  }, [isCharacterSettingsLoading, isCharacterSettingsSaving])

  return {
    loadUserCharacters,
    saveCharacterSettings,
    handleCharacterFieldChange,
    handleSrdFieldFocus,
    handleSrdFieldBlur,
  }
}
