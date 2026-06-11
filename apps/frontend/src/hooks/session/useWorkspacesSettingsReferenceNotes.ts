import { useEffect } from 'react'
import type { UUID } from '@shared'
import { fetchSessionNotesOnce } from '@/utils/notesFetch'
import type { Note } from '@/types/notes'

type UseWorkspacesSettingsReferenceNotesParams = {
  showCampaignSettingsModal: boolean
  settingsReferenceSessionId: UUID | ''
  apiUrl: string
  token: string
  addNote: (sessionId: UUID, note: Note) => void
  setIsSettingsReferenceNotesLoading: (isLoading: boolean) => void
  setSettingsReferenceNotesError: (message: string | null) => void
}

/**
 * Loads notes for the selected reference session whenever campaign settings modal
 * is open and a reference session is selected.
 */
export function useWorkspacesSettingsReferenceNotes(
  params: UseWorkspacesSettingsReferenceNotesParams
) {
  const {
    showCampaignSettingsModal,
    settingsReferenceSessionId,
    apiUrl,
    token,
    addNote,
    setIsSettingsReferenceNotesLoading,
    setSettingsReferenceNotesError,
  } = params

  useEffect(() => {
    if (!showCampaignSettingsModal || !settingsReferenceSessionId) {
      setIsSettingsReferenceNotesLoading(false)
      setSettingsReferenceNotesError(null)
      return
    }

    let cancelled = false

    const loadSettingsReferenceNotes = async () => {
      setIsSettingsReferenceNotesLoading(true)
      setSettingsReferenceNotesError(null)

      try {
        const fetchedEntries: Note[] = await fetchSessionNotesOnce(
          apiUrl,
          settingsReferenceSessionId,
          token
        )

        if (!cancelled) {
          for (const entry of fetchedEntries) {
            addNote(settingsReferenceSessionId as UUID, entry)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setSettingsReferenceNotesError(
            err instanceof Error ? err.message : 'Failed to load session notes'
          )
        }
      } finally {
        if (!cancelled) {
          setIsSettingsReferenceNotesLoading(false)
        }
      }
    }

    void loadSettingsReferenceNotes()

    return () => {
      cancelled = true
    }
  }, [
    addNote,
    apiUrl,
    settingsReferenceSessionId,
    setIsSettingsReferenceNotesLoading,
    setSettingsReferenceNotesError,
    showCampaignSettingsModal,
    token,
  ])
}
