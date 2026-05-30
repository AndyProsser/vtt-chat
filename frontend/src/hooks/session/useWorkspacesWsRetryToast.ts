import { useEffect } from 'react'
import { WS_AUTO_RETRY_WINDOW_MS, WS_ERROR_TOAST_ID } from '../../constants/workspaces.constants'
import { dismissToast, type ShowToastInput } from '../../state/toastCenter'
import type { UseSessionLifecycleActions } from '../../hooks/useSessionLifecycle'
import type { ConnectionState } from '@/ws/client'

type UseWorkspacesWsRetryToastParams = {
  wsState: ConnectionState
  wsError: Error | null
  wsRetryWindowExpired: boolean
  sessionLifecycleActions: Pick<
    UseSessionLifecycleActions,
    'setWsRetryWindowExpired' | 'setWsRetrySecondsRemaining'
  >
  wsRetryWindowStartRef: React.RefObject<number | null>
  wsRetryToastTimerRef: React.RefObject<number | null>
  wsErrorMessageRef: React.RefObject<string | null>
  retryConnection: () => Promise<void> | void
  showToast: (input: ShowToastInput) => void
}

/**
 * Keeps Workspaces websocket retry timers and user-facing retry toast in sync.
 * Runs whenever websocket connectivity changes or retry window state updates.
 */
export function useWorkspacesWsRetryToast({
  wsState,
  wsError,
  wsRetryWindowExpired,
  sessionLifecycleActions,
  wsRetryWindowStartRef,
  wsRetryToastTimerRef,
  wsErrorMessageRef,
  retryConnection,
  showToast,
}: UseWorkspacesWsRetryToastParams): void {
  useEffect(() => {
    wsErrorMessageRef.current = wsError?.message || null
  }, [wsError, wsErrorMessageRef])

  useEffect(() => {
    if (wsState === 'connected') {
      wsRetryWindowStartRef.current = null
      sessionLifecycleActions.setWsRetryWindowExpired(false)
      sessionLifecycleActions.setWsRetrySecondsRemaining(null)

      if (wsRetryToastTimerRef.current !== null) {
        window.clearTimeout(wsRetryToastTimerRef.current)
        wsRetryToastTimerRef.current = null
      }

      dismissToast(WS_ERROR_TOAST_ID)
      return
    }

    if (wsRetryWindowStartRef.current === null) {
      wsRetryWindowStartRef.current = Date.now()
    }

    const elapsedMs = Date.now() - wsRetryWindowStartRef.current
    const remainingMs = Math.max(0, WS_AUTO_RETRY_WINDOW_MS - elapsedMs)
    sessionLifecycleActions.setWsRetrySecondsRemaining(Math.ceil(remainingMs / 1000))

    if (remainingMs <= 0) {
      sessionLifecycleActions.setWsRetryWindowExpired(true)
      sessionLifecycleActions.setWsRetrySecondsRemaining(null)
      return
    }

    if (wsRetryToastTimerRef.current !== null) {
      window.clearTimeout(wsRetryToastTimerRef.current)
    }

    wsRetryToastTimerRef.current = window.setTimeout(() => {
      sessionLifecycleActions.setWsRetryWindowExpired(true)
    }, remainingMs)

    return () => {
      if (wsRetryToastTimerRef.current !== null) {
        window.clearTimeout(wsRetryToastTimerRef.current)
        wsRetryToastTimerRef.current = null
      }
    }
  }, [wsState, sessionLifecycleActions, wsRetryToastTimerRef, wsRetryWindowStartRef])

  useEffect(() => {
    if (wsState === 'connected' || wsRetryWindowExpired || wsRetryWindowStartRef.current === null) {
      return
    }

    const updateCountdown = () => {
      if (wsRetryWindowStartRef.current === null) {
        sessionLifecycleActions.setWsRetrySecondsRemaining(null)
        return
      }

      const elapsedMs = Date.now() - wsRetryWindowStartRef.current
      const remainingMs = Math.max(0, WS_AUTO_RETRY_WINDOW_MS - elapsedMs)
      sessionLifecycleActions.setWsRetrySecondsRemaining(
        remainingMs > 0 ? Math.ceil(remainingMs / 1000) : null
      )
    }

    updateCountdown()
    const intervalId = window.setInterval(updateCountdown, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [wsRetryWindowExpired, wsState, sessionLifecycleActions, wsRetryWindowStartRef])

  useEffect(() => {
    if (!wsRetryWindowExpired || wsState === 'connected') {
      dismissToast(WS_ERROR_TOAST_ID)
      return
    }

    const detail = wsErrorMessageRef.current
      ? `Last log from the crystal: ${wsErrorMessageRef.current}.`
      : ''

    showToast({
      id: WS_ERROR_TOAST_ID,
      variant: 'error',
      message:
        `Our sending stone has tried for 30 seconds and now lies ominously silent. ` +
        `The system appears to be down in this realm. Roll for patience, then press Retry now.` +
        `\n${detail}`,
      actionLabel: 'Retry now',
      onAction: () => {
        wsRetryWindowStartRef.current = Date.now()
        sessionLifecycleActions.setWsRetryWindowExpired(false)
        sessionLifecycleActions.setWsRetrySecondsRemaining(
          Math.ceil(WS_AUTO_RETRY_WINDOW_MS / 1000)
        )
        dismissToast(WS_ERROR_TOAST_ID)
        void retryConnection()
      },
      durationMs: null,
    })
  }, [
    retryConnection,
    showToast,
    wsRetryWindowExpired,
    wsState,
    sessionLifecycleActions,
    wsErrorMessageRef,
    wsRetryWindowStartRef,
  ])
}
