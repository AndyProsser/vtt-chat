import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { SessionState, isGreenroomSessionState, type UUID } from '@shared'
import type { Session as SessionRecord } from '@/types/session'
import { normalizeSessionRecord } from '@/utils/session/workspaces'
import type { ApiBroadcastState } from '@/types/session/workspaces'

export type UseWorkspacesSessionOrchestrationParams = {
  apiUrl: string
  token: string
  userId: UUID
  currentSession: SessionRecord | null
  selectedCampaignId: UUID | ''
  sessionList: SessionRecord[]
  fetchWithAuthGuard: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  startCampaignSession: (campaignId: UUID, sessionList: SessionRecord[]) => Promise<UUID | null>
  updateSession: (sessionId: UUID, session: SessionRecord) => void
  setBroadcastState: (state: {
    enabled: boolean
    broadcastRoomId?: string
    dmId?: UUID
    changedAt?: number
  }) => void
  setCooldownExtensionCount: (sessionId: UUID, count: number) => void
  setIsGreenroom: (isGreenroom: boolean) => void
  resetToolbarActionsState: () => void
  setSelectedRoomIdOverride: Dispatch<SetStateAction<UUID | ''>>
  setCurrentSession: (sessionId: UUID | null) => void
  clearPersistedActiveSessionContext: () => void
  forceLogoutToAuthScreen: () => void
  setShowStopSessionModal: Dispatch<SetStateAction<boolean>>
  showStopSessionModal: boolean
  setShowExitSessionModal: Dispatch<SetStateAction<boolean>>
  setExitUpgradeError: Dispatch<SetStateAction<string | null>>
  exitUpgradePassword: string
  setExitUpgradePassword: Dispatch<SetStateAction<string>>
  setExitUpgradeLoading: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string | null>>
}

/**
 * Encapsulates session-state actions (start/pause/stop/cooldown/exit/logout)
 * so the workspace shell stays focused on composition.
 */
export function useWorkspacesSessionOrchestration(params: UseWorkspacesSessionOrchestrationParams) {
  const {
    apiUrl,
    token,
    userId,
    currentSession,
    selectedCampaignId,
    sessionList,
    fetchWithAuthGuard,
    startCampaignSession,
    updateSession,
    setBroadcastState,
    setCooldownExtensionCount,
    setIsGreenroom,
    resetToolbarActionsState,
    setSelectedRoomIdOverride,
    setCurrentSession,
    clearPersistedActiveSessionContext,
    forceLogoutToAuthScreen,
    setShowStopSessionModal,
    showStopSessionModal,
    setShowExitSessionModal,
    setExitUpgradeError,
    exitUpgradePassword,
    setExitUpgradePassword,
    setExitUpgradeLoading,
    setError,
  } = params
  const pendingTransitionBySessionIdRef = useRef<Map<UUID, SessionState>>(new Map())
  const queuedTransitionBySessionIdRef = useRef<Map<UUID, SessionState>>(new Map())
  const [activeTransitionSessionId, setActiveTransitionSessionId] = useState<UUID | null>(null)

  const handleTransitionSession = useCallback(
    async function runTransition(sessionId: UUID, state: SessionState) {
      const pendingState = pendingTransitionBySessionIdRef.current.get(sessionId)
      if (pendingState) {
        if (pendingState !== state) {
          queuedTransitionBySessionIdRef.current.set(sessionId, state)
        }
        return
      }

      setError(null)
      pendingTransitionBySessionIdRef.current.set(sessionId, state)
      queuedTransitionBySessionIdRef.current.delete(sessionId)
      setActiveTransitionSessionId(sessionId)

      let transitionSucceeded = false
      let completedState = state

      try {
        const response = await fetchWithAuthGuard(`${apiUrl}/api/session/${sessionId}/state`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ state }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || `Failed to transition session to ${state}`)
        }

        const updatedSession = normalizeSessionRecord((await response.json()) as SessionRecord)
        const transitionTimestamp = Date.now()
        const localTransitionFallbacks: Partial<SessionRecord> =
          state === SessionState.PAUSED
            ? {
                pausedAt: updatedSession.pausedAt ?? transitionTimestamp,
              }
            : state === SessionState.ACTIVE
              ? {
                  startedAt:
                    updatedSession.startedAt ?? currentSession?.startedAt ?? transitionTimestamp,
                  pausedAt: undefined,
                }
              : state === SessionState.COOLDOWN
                ? {
                    endedAt: updatedSession.endedAt ?? transitionTimestamp,
                  }
                : {}

        updateSession(sessionId, {
          ...updatedSession,
          ...localTransitionFallbacks,
        })
        transitionSucceeded = true
        completedState = updatedSession.state

        if (isGreenroomSessionState(state)) {
          setSelectedRoomIdOverride('')
          resetToolbarActionsState()
        }

        setIsGreenroom(isGreenroomSessionState(state))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
      } finally {
        pendingTransitionBySessionIdRef.current.delete(sessionId)
        setActiveTransitionSessionId((current) => (current === sessionId ? null : current))

        const queuedState = queuedTransitionBySessionIdRef.current.get(sessionId)
        queuedTransitionBySessionIdRef.current.delete(sessionId)

        if (transitionSucceeded && queuedState && queuedState !== completedState) {
          await runTransition(sessionId, queuedState)
        }
      }
    },
    [
      apiUrl,
      currentSession,
      fetchWithAuthGuard,
      resetToolbarActionsState,
      setError,
      setIsGreenroom,
      setSelectedRoomIdOverride,
      token,
      updateSession,
    ]
  )

  const handleStartSession = useCallback(
    async (sessionId: UUID) => {
      if (
        currentSession?.id === sessionId &&
        (currentSession.state === SessionState.ENDED ||
          currentSession.state === SessionState.CLEANUP)
      ) {
        if (!selectedCampaignId) {
          setError('Select a campaign before starting a new session.')
          return
        }

        const nextSessionId = await startCampaignSession(selectedCampaignId, sessionList)
        if (nextSessionId) {
          await handleTransitionSession(nextSessionId, SessionState.ACTIVE)
        }
        return
      }

      await handleTransitionSession(sessionId, SessionState.ACTIVE)
    },
    [
      currentSession,
      handleTransitionSession,
      selectedCampaignId,
      sessionList,
      setError,
      startCampaignSession,
    ]
  )

  const handlePauseSession = useCallback(
    async (sessionId: UUID) => {
      const nextState =
        currentSession?.id === sessionId && currentSession.state === SessionState.PAUSED
          ? SessionState.ACTIVE
          : SessionState.PAUSED

      await handleTransitionSession(sessionId, nextState)
    },
    [currentSession, handleTransitionSession]
  )

  const handleStopSession = useCallback(() => {
    setShowStopSessionModal(true)
  }, [setShowStopSessionModal])

  const handleCancelCooldown = useCallback(
    async (sessionId: UUID) => {
      setError(null)

      try {
        const response = await fetchWithAuthGuard(
          `${apiUrl}/api/session/${sessionId}/cooldown/end`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({}),
          }
        )

        const payload = (await response.json().catch(() => ({}))) as {
          message?: string
          session?: SessionRecord
        }

        if (!response.ok) {
          throw new Error(payload.message || 'Failed to end cooldown')
        }

        if (payload.session) {
          updateSession(sessionId, normalizeSessionRecord(payload.session))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to end cooldown')
      }
    },
    [apiUrl, fetchWithAuthGuard, setError, token, updateSession]
  )

  const handleExtendCooldown = useCallback(
    async (sessionId: UUID, cooldownBlockMs: number) => {
      if (!Number.isFinite(cooldownBlockMs) || cooldownBlockMs <= 0) {
        return
      }

      setError(null)

      try {
        const response = await fetchWithAuthGuard(
          `${apiUrl}/api/session/${sessionId}/cooldown/extend`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ extensionMs: cooldownBlockMs }),
          }
        )

        const payload = (await response.json().catch(() => ({}))) as {
          message?: string
          session?: SessionRecord
          extensionCount?: number
        }

        if (!response.ok) {
          if (
            response.status === 409 &&
            typeof payload.message === 'string' &&
            /up to 3 times per session/i.test(payload.message)
          ) {
            setCooldownExtensionCount(sessionId, 3)
          }

          throw new Error(payload.message || 'Failed to extend cooldown')
        }

        if (payload.session) {
          updateSession(sessionId, normalizeSessionRecord(payload.session))
        }

        if (typeof payload.extensionCount === 'number' && Number.isFinite(payload.extensionCount)) {
          setCooldownExtensionCount(sessionId, payload.extensionCount)
        }
      } catch (error) {
        if (error instanceof Error && /up to 3 times per session/i.test(error.message)) {
          setCooldownExtensionCount(sessionId, 3)
        }

        setError(error instanceof Error ? error.message : 'Failed to extend cooldown')
      }
    },
    [apiUrl, fetchWithAuthGuard, setCooldownExtensionCount, setError, token, updateSession]
  )

  const handleConfirmStopSession = useCallback(async () => {
    if (!currentSession) {
      setShowStopSessionModal(false)
      return
    }

    setShowStopSessionModal(false)
    await handleTransitionSession(currentSession.id, SessionState.COOLDOWN)
  }, [currentSession, handleTransitionSession, setShowStopSessionModal])

  useEffect(() => {
    if (!showStopSessionModal) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowStopSessionModal(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [setShowStopSessionModal, showStopSessionModal])

  const returnToCampaignSelector = useCallback(async () => {
    if (currentSession) {
      try {
        await fetchWithAuthGuard(`${apiUrl}/api/session/${currentSession.id}/members/leave`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
      } catch {
        // Best effort: UI still returns to lobby even if leave call fails.
      }
    }

    setCurrentSession(null)
    setSelectedRoomIdOverride('')
    clearPersistedActiveSessionContext()
  }, [
    apiUrl,
    clearPersistedActiveSessionContext,
    currentSession,
    fetchWithAuthGuard,
    setCurrentSession,
    setSelectedRoomIdOverride,
    token,
  ])

  const handleLogoff = useCallback(() => {
    if (currentSession && currentSession.dmId !== userId) {
      void fetchWithAuthGuard(`${apiUrl}/api/session/${currentSession.id}/members/leave`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
    }

    sessionStorage.removeItem('authToken')
    sessionStorage.removeItem('user')
    window.location.assign('/')
  }, [apiUrl, currentSession, fetchWithAuthGuard, token, userId])

  const handleExitToCampaignSelector = useCallback(() => {
    setExitUpgradeError(null)
    setExitUpgradePassword('')
    setShowExitSessionModal(true)
  }, [setExitUpgradeError, setExitUpgradePassword, setShowExitSessionModal])

  const handleConfirmExitAsFullAccount = useCallback(async () => {
    setShowExitSessionModal(false)
    await returnToCampaignSelector()
  }, [returnToCampaignSelector, setShowExitSessionModal])

  const handleSkipGuestUpgrade = useCallback(() => {
    setShowExitSessionModal(false)
    forceLogoutToAuthScreen()
  }, [forceLogoutToAuthScreen, setShowExitSessionModal])

  const handleUpgradeAndExit = useCallback(async () => {
    if (!exitUpgradePassword.trim()) {
      setExitUpgradeError('Password is required to upgrade before exit.')
      return
    }

    setExitUpgradeLoading(true)
    setExitUpgradeError(null)

    try {
      const response = await fetchWithAuthGuard(`${apiUrl}/api/auth/upgrade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: exitUpgradePassword }),
      })

      const data = (await response.json().catch(() => ({}))) as {
        message?: string
      }

      if (!response.ok) {
        throw new Error(data.message || 'Failed to upgrade account')
      }

      setShowExitSessionModal(false)
      forceLogoutToAuthScreen()
    } catch (upgradeError) {
      const message =
        upgradeError instanceof Error ? upgradeError.message : 'Failed to upgrade account'
      setExitUpgradeError(message)
    } finally {
      setExitUpgradeLoading(false)
    }
  }, [
    apiUrl,
    fetchWithAuthGuard,
    forceLogoutToAuthScreen,
    setExitUpgradeError,
    setExitUpgradeLoading,
    setShowExitSessionModal,
    token,
    exitUpgradePassword,
  ])

  const handleToggleBroadcastMode = useCallback(
    async (enabled: boolean) => {
      if (!currentSession || currentSession.dmId !== userId) {
        return
      }

      const response = await fetchWithAuthGuard(`${apiUrl}/api/audio/broadcast/state`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId: currentSession.id,
          enabled,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string }
        throw new Error(payload.message || 'Failed to update broadcast voice state')
      }

      const payload = (await response.json().catch(() => ({}))) as {
        broadcast?: ApiBroadcastState
        voiceOfGod?: ApiBroadcastState
      }

      const broadcastState = payload.broadcast || payload.voiceOfGod

      if (broadcastState) {
        setBroadcastState({
          enabled: Boolean(broadcastState.enabled),
          broadcastRoomId: broadcastState.broadcastRoomId,
          dmId: broadcastState.dmId,
          changedAt: broadcastState.changedAt,
        })
      } else {
        setBroadcastState({ enabled })
      }
    },
    [apiUrl, currentSession, fetchWithAuthGuard, setBroadcastState, token, userId]
  )

  return {
    activeTransitionSessionId,
    handleToggleBroadcastMode,
    handleStartSession,
    handlePauseSession,
    handleStopSession,
    handleCancelCooldown,
    handleExtendCooldown,
    handleConfirmStopSession,
    handleLogoff,
    handleExitToCampaignSelector,
    handleConfirmExitAsFullAccount,
    handleSkipGuestUpgrade,
    handleUpgradeAndExit,
    handleTransitionSession,
  }
}
