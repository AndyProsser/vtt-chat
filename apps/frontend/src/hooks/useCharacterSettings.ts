/**
 * useCharacterSettings Hook
 * Manages character state and draft settings for campaign players.
 * Handles character selection, validation, and field mutations.
 */

import { useMemo, useState } from 'react'
import type { CharacterClassEntry, UUID } from '@shared'
import type { PlayerSettingsPanel } from '@/components/workspaces/shared/panels/PlayerSettingsPanel'

export const DEFAULT_CHARACTER_SETTINGS: PlayerSettingsPanel = {
  name: '',
  race: 'Human',
  className: 'Fighter',
  classes: [{ name: 'Fighter', level: 1 }],
  avatarUrl: '',
  level: 1,
  strength: 8,
  dexterity: 8,
  constitution: 8,
  intelligence: 8,
  wisdom: 8,
  charisma: 8,
  hpCurrent: 6,
  hpMax: 6,
  ac: 10,
  initiative: 0,
  passivePerception: 10,
  speed: 30,
}

export interface UserCharacterRecord {
  id: UUID
  campaignId: UUID
  userId: UUID
  name: string
  race: string | null
  class: string | null
  /** @deprecated Use `classes` instead. Kept for backward-compat with legacy DB rows. */
  subclass: string | null
  classes: CharacterClassEntry[] | null
  avatarUrl: string | null
  metadata: Record<string, unknown> | null
  isActive: boolean
}

interface UseCharacterSettingsState {
  isCharacterSettingsLoading: boolean
  isCharacterSettingsSaving: boolean
  userCharacters: UserCharacterRecord[]
  selectedCharacterId: UUID | ''
  characterSettingsPanel: PlayerSettingsPanel
}

interface UseCharacterSettingsActions {
  setIsCharacterSettingsLoading: (value: boolean) => void
  setIsCharacterSettingsSaving: (value: boolean) => void
  setUserCharacters: (value: UserCharacterRecord[]) => void
  setSelectedCharacterId: (value: UUID | '') => void
  setCharacterSettingsDraft: (value: PlayerSettingsPanel) => void
}

export function useCharacterSettings(): [UseCharacterSettingsState, UseCharacterSettingsActions] {
  const [isCharacterSettingsLoading, setIsCharacterSettingsLoading] = useState(false)
  const [isCharacterSettingsSaving, setIsCharacterSettingsSaving] = useState(false)
  const [userCharacters, setUserCharacters] = useState<UserCharacterRecord[]>([])
  const [selectedCharacterId, setSelectedCharacterId] = useState<UUID | ''>('')
  const [characterSettingsPanel, setCharacterSettingsDraft] = useState<PlayerSettingsPanel>(
    DEFAULT_CHARACTER_SETTINGS
  )

  const state: UseCharacterSettingsState = useMemo(
    () => ({
      isCharacterSettingsLoading,
      isCharacterSettingsSaving,
      userCharacters,
      selectedCharacterId,
      characterSettingsPanel,
    }),
    [
      isCharacterSettingsLoading,
      isCharacterSettingsSaving,
      userCharacters,
      selectedCharacterId,
      characterSettingsPanel,
    ]
  )

  const actions: UseCharacterSettingsActions = useMemo(
    () => ({
      setIsCharacterSettingsLoading,
      setIsCharacterSettingsSaving,
      setUserCharacters,
      setSelectedCharacterId,
      setCharacterSettingsDraft,
    }),
    []
  )

  return [state, actions]
}

export type { UseCharacterSettingsState, UseCharacterSettingsActions }
