import { useCallback, useMemo, useRef } from 'react'
import {
  createCampaignSettingsController,
  createCharacterSettingsController,
  createSessionMembershipController,
} from '@/utils/session/sessionController'
import { ACTIVE_SESSION_CONTEXT_STORAGE_KEY } from '@/constants/workspaces.constants'
import { safeLocalStorageRemoveItem } from '@/utils/session/workspaces'

type UseWorkspacesApiBootstrapParams = {
  apiUrl: string
  token: string
}

/**
 * Centralizes auth-guarded fetch wiring plus lazy session controller initialization
 * so the workspace shell avoids low-level bootstrap plumbing.
 */
export function useWorkspacesApiBootstrap(params: UseWorkspacesApiBootstrapParams) {
  const { apiUrl, token } = params
  const inFlightGetRequestsRef = useRef<Map<string, Promise<Response>>>(new Map())

  const clearPersistedActiveSessionContext = useCallback(() => {
    sessionStorage.removeItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY)
    safeLocalStorageRemoveItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY)
  }, [])

  const forceLogoutToAuthScreen = useCallback(() => {
    sessionStorage.removeItem('authToken')
    sessionStorage.removeItem('user')
    clearPersistedActiveSessionContext()
    window.location.assign('/')
  }, [clearPersistedActiveSessionContext])

  const fetchWithAuthGuard = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const resolvedMethod = (
        init?.method || (input instanceof Request ? input.method : 'GET')
      ).toUpperCase()
      const requestUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const canDedupeGet = resolvedMethod === 'GET'
      const requestKey = `${resolvedMethod} ${requestUrl}`

      const runFetchWithGuard = async (): Promise<Response> => {
        const response = await window.fetch(input, init)

        if (response.status === 401) {
          forceLogoutToAuthScreen()
          throw new Error('Authentication failed (401)')
        }

        if (response.status === 403) {
          // 403 is frequently a normal authorization denial (not an auth expiry).
          // Only force logout when backend explicitly marks it as unauthorized/authentication failure.
          try {
            const payload = (await response
              .clone()
              .json()
              .catch(() => null)) as { code?: string; message?: string } | null
            const code = payload?.code?.toUpperCase() || ''
            const message = payload?.message?.toLowerCase() || ''
            const shouldForceLogout =
              code === 'UNAUTHORIZED' ||
              message.includes('authentication required') ||
              message.includes('missing authorization')

            if (shouldForceLogout) {
              forceLogoutToAuthScreen()
              throw new Error('Authentication failed (403)')
            }
          } catch {
            // If payload cannot be parsed, keep caller-level handling for 403.
          }
        }

        return response
      }

      if (!canDedupeGet) {
        return runFetchWithGuard()
      }

      let inFlightRequest = inFlightGetRequestsRef.current.get(requestKey)
      if (!inFlightRequest) {
        inFlightRequest = runFetchWithGuard().finally(() => {
          if (inFlightGetRequestsRef.current.get(requestKey) === inFlightRequest) {
            inFlightGetRequestsRef.current.delete(requestKey)
          }
        })
        inFlightGetRequestsRef.current.set(requestKey, inFlightRequest)
      }

      return (await inFlightRequest).clone()
    },
    [forceLogoutToAuthScreen]
  )

  const handleWebSocketAuthFailure = useCallback(() => {
    forceLogoutToAuthScreen()
  }, [forceLogoutToAuthScreen])

  const campaignSettingsController = useMemo(
    () =>
      createCampaignSettingsController({
        apiUrl,
        token,
        fetchWithAuthGuard,
      }),
    [apiUrl, token, fetchWithAuthGuard]
  )

  const characterSettingsController = useMemo(
    () =>
      createCharacterSettingsController({
        apiUrl,
        token,
        fetchWithAuthGuard,
      }),
    [apiUrl, token, fetchWithAuthGuard]
  )

  const sessionMembershipController = useMemo(
    () =>
      createSessionMembershipController({
        apiUrl,
        token,
        fetchWithAuthGuard,
      }),
    [apiUrl, token, fetchWithAuthGuard]
  )

  return {
    clearPersistedActiveSessionContext,
    forceLogoutToAuthScreen,
    fetchWithAuthGuard,
    handleWebSocketAuthFailure,
    campaignSettingsController,
    characterSettingsController,
    sessionMembershipController,
  }
}
