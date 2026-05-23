/**
 * useCharacterSettings Hook
 * Manages character state and draft settings for campaign players.
 * Handles character selection, validation, and field mutations.
 */

import { useMemo, useState } from 'react'
import type { UUID } from '@shared'
import type { CharacterSettingsDraft } from '@/components/workspaces/session/SessionSettingsPanel'

export const DEFAULT_CHARACTER_SETTINGS: CharacterSettingsDraft = {
  name: '',
  race: 'Human',
  className: 'Fighter',
  subclass: '',
  avatarUrl: '',
  level: 1,
  strength: 8,
  dexterity: 8,
  constitution: 8,
  intelligence: 8,
  wisdom: 8,
  charisma: 8,
}

export interface UserCharacterRecord {
  id: UUID
  campaignId: UUID
  userId: UUID
  name: string
  race: string | null
  class: string | null
  subclass: string | null
  avatarUrl: string | null
  metadata: Record<string, unknown> | null
  isActive: boolean
}

interface UseCharacterSettingsState {
  isCharacterSettingsLoading: boolean
  isCharacterSettingsSaving: boolean
  userCharacters: UserCharacterRecord[]
  selectedCharacterId: UUID | ''
  characterSettingsDraft: CharacterSettingsDraft
}

interface UseCharacterSettingsActions {
  setIsCharacterSettingsLoading: (value: boolean) => void
  setIsCharacterSettingsSaving: (value: boolean) => void
  setUserCharacters: (value: UserCharacterRecord[]) => void
  setSelectedCharacterId: (value: UUID | '') => void
  setCharacterSettingsDraft: (value: CharacterSettingsDraft) => void
}

export function useCharacterSettings(): [UseCharacterSettingsState, UseCharacterSettingsActions] {
  const [isCharacterSettingsLoading, setIsCharacterSettingsLoading] = useState(false)
  const [isCharacterSettingsSaving, setIsCharacterSettingsSaving] = useState(false)
  const [userCharacters, setUserCharacters] = useState<UserCharacterRecord[]>([])
  const [selectedCharacterId, setSelectedCharacterId] = useState<UUID | ''>('')
  const [characterSettingsDraft, setCharacterSettingsDraft] = useState<CharacterSettingsDraft>(
    DEFAULT_CHARACTER_SETTINGS
  )

  const state: UseCharacterSettingsState = useMemo(
    () => ({
      isCharacterSettingsLoading,
      isCharacterSettingsSaving,
      userCharacters,
      selectedCharacterId,
      characterSettingsDraft,
    }),
    [
      isCharacterSettingsLoading,
      isCharacterSettingsSaving,
      userCharacters,
      selectedCharacterId,
      characterSettingsDraft,
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
