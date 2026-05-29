import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionState, type UUID } from '@shared'
import { useWorkspacesSessionOrchestration } from '@/hooks/session/useWorkspacesSessionOrchestration'

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as UUID
const USER_ID = '22222222-2222-4222-8222-222222222222' as UUID
const CAMPAIGN_ID = '33333333-3333-4333-8333-333333333333' as UUID

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })

  return { promise, resolve }
}

describe('useWorkspacesSessionOrchestration', () => {
  it('prevents overlapping pause or resume transition requests for the same session', async () => {
    const responseDeferred = createDeferred<Response>()
    const fetchWithAuthGuard = vi.fn(() => responseDeferred.promise)
    const updateSession = vi.fn()
    const setError = vi.fn()

    const { result } = renderHook(() =>
      useWorkspacesSessionOrchestration({
        apiUrl: 'https://api.test',
        token: 'token',
        userId: USER_ID,
        currentSession: {
          id: SESSION_ID,
          name: 'Session Alpha',
          dmId: USER_ID,
          state: SessionState.ACTIVE,
          createdAt: Date.now(),
          startedAt: Date.now() - 1_000,
        },
        selectedCampaignId: CAMPAIGN_ID,
        sessionList: [],
        fetchWithAuthGuard,
        startCampaignSession: vi.fn(async () => null),
        updateSession,
        setBroadcastState: vi.fn(),
        setCooldownExtensionCount: vi.fn(),
        setIsGreenroom: vi.fn(),
        resetToolbarActionsState: vi.fn(),
        setSelectedRoomIdOverride: vi.fn(),
        setCurrentSession: vi.fn(),
        clearPersistedActiveSessionContext: vi.fn(),
        forceLogoutToAuthScreen: vi.fn(),
        setShowStopSessionModal: vi.fn(),
        showStopSessionModal: false,
        setShowExitSessionModal: vi.fn(),
        setExitUpgradeError: vi.fn(),
        exitUpgradePassword: '',
        setExitUpgradePassword: vi.fn(),
        setExitUpgradeLoading: vi.fn(),
        setError,
      })
    )

    await act(async () => {
      void result.current.handlePauseSession(SESSION_ID)
      void result.current.handlePauseSession(SESSION_ID)
    })

    expect(fetchWithAuthGuard).toHaveBeenCalledTimes(1)
    expect(result.current.activeTransitionSessionId).toBe(SESSION_ID)

    responseDeferred.resolve({
      ok: true,
      json: async () => ({
        id: SESSION_ID,
        name: 'Session Alpha',
        dmId: USER_ID,
        state: SessionState.PAUSED,
        createdAt: Date.now(),
        startedAt: Date.now() - 1_000,
        pausedAt: Date.now(),
      }),
    } as Response)

    await waitFor(() => {
      expect(result.current.activeTransitionSessionId).toBeNull()
    })

    expect(updateSession).toHaveBeenCalledTimes(1)
    expect(setError).toHaveBeenCalledWith(null)
  })
})
