import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { CHAT_GROUPING_STORAGE_KEY } from '@/constants/workspaces.constants'

type UseWorkspacesUiEffectsParams = {
  messageGroupingWindowMs: number
  activeTransitionNotice: { eventId: string } | undefined
  setDismissedTransitionEventId: Dispatch<SetStateAction<string | null>>
  error: string | null
  setError: Dispatch<SetStateAction<string | null>>
  lobbyNotice: string | null
  setLobbyNotice: Dispatch<SetStateAction<string | null>>
  showToast: (payload: {
    id: string
    variant: 'error' | 'success'
    message: string
    onDismiss: () => void
  }) => void
}

/**
 * Centralizes UI-only workspace effects (localStorage sync, toast lifecycle, transition auto-dismiss)
 * so the workspace shell can stay focused on orchestration and composition.
 */
export function useWorkspacesUiEffects(params: UseWorkspacesUiEffectsParams) {
  const {
    messageGroupingWindowMs,
    activeTransitionNotice,
    setDismissedTransitionEventId,
    error,
    setError,
    lobbyNotice,
    setLobbyNotice,
    showToast,
  } = params

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const localStorageApi = window.localStorage as Partial<Storage> | undefined
    if (!localStorageApi || typeof localStorageApi.setItem !== 'function') {
      return
    }

    localStorageApi.setItem(CHAT_GROUPING_STORAGE_KEY, String(messageGroupingWindowMs))
  }, [messageGroupingWindowMs])

  useEffect(() => {
    if (!activeTransitionNotice) {
      return
    }

    const timeoutId = setTimeout(() => {
      setDismissedTransitionEventId((current) =>
        current === activeTransitionNotice.eventId ? current : activeTransitionNotice.eventId
      )
    }, 6000)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [activeTransitionNotice, setDismissedTransitionEventId])

  useEffect(() => {
    if (!error) return

    showToast({
      id: `workspaces:error:${error}`,
      variant: 'error',
      message: error,
      onDismiss: () => {
        setError((current) => (current === error ? null : current))
      },
    })
  }, [error, setError, showToast])

  useEffect(() => {
    if (!lobbyNotice) return

    showToast({
      id: `workspaces:notice:${lobbyNotice}`,
      variant: 'success',
      message: lobbyNotice,
      onDismiss: () => {
        setLobbyNotice((current) => (current === lobbyNotice ? null : current))
      },
    })
  }, [lobbyNotice, setLobbyNotice, showToast])
}
