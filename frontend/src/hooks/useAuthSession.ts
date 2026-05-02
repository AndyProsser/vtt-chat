import { useEffect, useState } from 'react'
import type { Role, UUID } from '@shared'
import type { AuthUser, AuthState, AuthProfile } from '@/types/auth'

export type { AuthUser, AuthState, AuthProfile } from '@/types/auth'

interface UseAuthSessionParams {
  apiUrl: string
  adminUrl: string
}

export function useAuthSession({ apiUrl, adminUrl }: UseAuthSessionParams) {
  const [auth, setAuth] = useState<AuthState>({ token: null, user: null })
  const [authProfile, setAuthProfile] = useState<AuthProfile | null>(null)
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const [adminLaunchLoading, setAdminLaunchLoading] = useState(false)
  const [upgradeLoading, setUpgradeLoading] = useState(false)
  const [upgradePromptDismissed, setUpgradePromptDismissed] = useState(false)

  const storeAuthSession = (token: string, user: AuthUser) => {
    sessionStorage.setItem('authToken', token)
    sessionStorage.setItem('user', JSON.stringify(user))
    setAuth({ token, user })
  }

  const handleLoginSuccess = (token: string, user: { id: UUID; username: string; role: Role }) => {
    storeAuthSession(token, {
      ...user,
      authType: 'FULL',
    })
    setUpgradePromptDismissed(false)
    setAuthMessage(null)
  }

  const handleGuestSpectatorAuthenticated = (
    token: string,
    user: { id: UUID; username: string; role: Role }
  ) => {
    storeAuthSession(token, {
      ...user,
      authType: 'GUEST',
    })
    setUpgradePromptDismissed(false)
    setAuthMessage('Spectator session ready. You are signed in as a guest account.')
  }

  const handleGuestExtensionAuthenticated = (
    token: string,
    user: { id: UUID; username: string; role: Role }
  ) => {
    storeAuthSession(token, {
      ...user,
      authType: 'GUEST',
    })
    setUpgradePromptDismissed(false)
    setAuthMessage('Extension guest login complete. You are signed in as a guest account.')
  }

  const handleLogout = () => {
    setAuth({ token: null, user: null })
    setAuthProfile(null)
    setAuthMessage(null)
    sessionStorage.removeItem('authToken')
    sessionStorage.removeItem('user')
  }

  useEffect(() => {
    const handoff = new URLSearchParams(window.location.search).get('handoff')

    const bootstrap = async () => {
      if (handoff) {
        try {
          const response = await fetch(`${apiUrl}/api/auth/handoff/exchange`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ handoffToken: handoff }),
          })

          if (!response.ok) {
            const data = await response.json().catch(() => ({}))
            throw new Error(data.message || data.error || 'Failed to launch app session')
          }

          const data = await response.json()
          const handoffUser: AuthUser = {
            id: data.user.id as UUID,
            username: String(data.user.username || data.user.displayName || 'user'),
            role: data.user.role as Role,
            authType: data.user.authType === 'GUEST' ? 'GUEST' : 'FULL',
          }
          storeAuthSession(data.token, handoffUser)
          setAuthMessage(null)
          window.history.replaceState({}, document.title, window.location.pathname)
          return
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to complete handoff'
          setAuthMessage(message)
        }
      }

      const existingToken = sessionStorage.getItem('authToken')
      const existingUser = sessionStorage.getItem('user')
      if (existingToken && existingUser) {
        try {
          const parsed = JSON.parse(existingUser) as AuthUser
          setAuth({ token: existingToken, user: parsed })
        } catch {
          sessionStorage.removeItem('authToken')
          sessionStorage.removeItem('user')
        }
      }
    }

    void bootstrap()
  }, [apiUrl])

  useEffect(() => {
    const loadProfile = async () => {
      if (!auth.token) {
        setAuthProfile(null)
        return
      }

      try {
        const response = await fetch(`${apiUrl}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${auth.token}`,
          },
        })

        if (!response.ok) {
          setAuthProfile(null)
          return
        }

        const data = await response.json()
        setAuthProfile({
          adminRole: data.adminRole || null,
          hasAdminAccess: Boolean(data.hasAdminAccess),
          isFullAccount: Boolean(data.isFullAccount),
          requiresUpgradeForAdmin: Boolean(data.requiresUpgradeForAdmin),
          authType: data.authType === 'GUEST' ? 'GUEST' : 'FULL',
          email: typeof data.email === 'string' ? data.email : null,
        })
      } catch {
        setAuthProfile(null)
      }
    }

    void loadProfile()
  }, [auth.token, apiUrl])

  const handleUpgradeAccount = async (password: string) => {
    if (!auth.token) {
      throw new Error('Authentication required')
    }

    setUpgradeLoading(true)
    setAuthMessage(null)

    try {
      const response = await fetch(`${apiUrl}/api/auth/upgrade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({ password }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.message || 'Account upgrade failed')
      }

      if (!auth.user) {
        throw new Error('Missing user session')
      }

      storeAuthSession(data.token, {
        id: auth.user.id,
        username: auth.user.username,
        role: auth.user.role,
        authType: 'FULL',
      })

      setAuthProfile((current) =>
        current
          ? {
              ...current,
              isFullAccount: true,
              requiresUpgradeForAdmin: false,
              authType: 'FULL',
            }
          : current
      )

      setUpgradePromptDismissed(false)
      setAuthMessage('Account upgraded successfully.')
    } finally {
      setUpgradeLoading(false)
    }
  }

  const handleOpenAdmin = async () => {
    if (!auth.token || !auth.user) {
      return
    }

    setAdminLaunchLoading(true)
    setAuthMessage(null)

    try {
      const response = await fetch(`${apiUrl}/api/auth/handoff/admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (data.code === 'GUEST_UPGRADE_REQUIRED') {
          setAuthMessage('Upgrade to a full account before opening the admin console.')
          return
        }
        throw new Error(data.message || data.error || 'Failed to open admin')
      }

      const handoffToken = String(data.handoffToken || '').trim()
      if (!handoffToken) {
        throw new Error('Missing handoff token in response')
      }

      window.location.href = `${adminUrl}/launch?handoff=${encodeURIComponent(handoffToken)}`
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'Failed to open admin console')
    } finally {
      setAdminLaunchLoading(false)
    }
  }

  return {
    auth,
    authProfile,
    authMessage,
    adminLaunchLoading,
    upgradeLoading,
    upgradePromptDismissed,
    setUpgradePromptDismissed,
    handleLoginSuccess,
    handleGuestSpectatorAuthenticated,
    handleGuestExtensionAuthenticated,
    handleLogout,
    handleUpgradeAccount,
    handleOpenAdmin,
  }
}
