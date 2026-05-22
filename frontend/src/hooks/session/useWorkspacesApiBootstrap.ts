import { useCallback, useEffect, useRef } from 'react'
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

  const authFailureHandledRef = useRef(false)

  const clearPersistedActiveSessionContext = useCallback(() => {
    sessionStorage.removeItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY)
    safeLocalStorageRemoveItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY)
  }, [])

  const forceLogoutToAuthScreen = useCallback(() => {
    if (authFailureHandledRef.current) {
      return
    }
    authFailureHandledRef.current = true
    sessionStorage.removeItem('authToken')
    sessionStorage.removeItem('user')
    clearPersistedActiveSessionContext()
    window.location.assign('/')
  }, [clearPersistedActiveSessionContext])

  const fetchWithAuthGuard = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
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
    },
    [forceLogoutToAuthScreen]
  )

  const handleWebSocketAuthFailure = useCallback(() => {
    forceLogoutToAuthScreen()
  }, [forceLogoutToAuthScreen])

  // Lazy-initialize controllers to avoid ref access during render construction.
  const campaignSettingsControllerRef = useRef<ReturnType<
    typeof createCampaignSettingsController
  > | null>(null)
  const characterSettingsControllerRef = useRef<ReturnType<
    typeof createCharacterSettingsController
  > | null>(null)
  const sessionMembershipControllerRef = useRef<ReturnType<
    typeof createSessionMembershipController
  > | null>(null)

  useEffect(() => {
    if (!campaignSettingsControllerRef.current) {
      campaignSettingsControllerRef.current = createCampaignSettingsController({
        apiUrl,
        token,
        fetchWithAuthGuard,
      })
    }
    if (!characterSettingsControllerRef.current) {
      characterSettingsControllerRef.current = createCharacterSettingsController({
        apiUrl,
        token,
        fetchWithAuthGuard,
      })
    }
    if (!sessionMembershipControllerRef.current) {
      sessionMembershipControllerRef.current = createSessionMembershipController({
        apiUrl,
        token,
        fetchWithAuthGuard,
      })
    }
  }, [apiUrl, token, fetchWithAuthGuard])

  return {
    clearPersistedActiveSessionContext,
    forceLogoutToAuthScreen,
    fetchWithAuthGuard,
    handleWebSocketAuthFailure,
    campaignSettingsController: campaignSettingsControllerRef.current!,
    characterSettingsController: characterSettingsControllerRef.current!,
    sessionMembershipController: sessionMembershipControllerRef.current!,
  }
}
