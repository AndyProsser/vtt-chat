import { lazy, Suspense, useEffect, useState } from 'react'
import { RoomType } from '@shared'
import type { UUID, Role } from '@shared'
import { LoginForm } from './components/auth/LoginForm'
import { useStore } from './hooks/useStore'
import { cn } from './utils/cn'

const SessionInit = lazy(async () => {
  const module = await import('./components/session/SessionInit')
  return { default: module.SessionInit }
})

const AudioPanel = lazy(async () => {
  const module = await import('./components/audio/AudioPanel')
  return { default: module.AudioPanel }
})

/**
 * App Component
 * Stage 7: Audio & LiveKit Integration
 * - Login form to get JWT
 * - WebSocket connection with event dispatcher
 * - Session creation and state transitions
 * - Zustand store integration
 * - LiveKit audio connection + DSP engine mounted when a session room is active
 *
 * The pipeline: UI → Event → Dispatcher → Store → UI
 */

interface AuthState {
  token: string | null
  user: {
    id: UUID
    username: string
    role: Role
  } | null
}

interface AuthProfile {
  adminRole: 'SUPER_ADMIN' | 'ADMIN' | 'CAMPAIGN_DM' | 'READ_ONLY' | null
  hasAdminAccess: boolean
  isFullAccount: boolean
  requiresUpgradeForAdmin: boolean
}

export default function App() {
  const [auth, setAuth] = useState<AuthState>({
    token: null,
    user: null,
  })
  const [authProfile, setAuthProfile] = useState<AuthProfile | null>(null)
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const [adminLaunchLoading, setAdminLaunchLoading] = useState(false)

  // API and WebSocket URLs (configurable via env or hardcoded for testing)
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000'
  const adminUrl = import.meta.env.VITE_ADMIN_URL || 'http://localhost:5174'

  // Derive active session + primary room from store to know when to mount AudioPanel
  const { currentSessionId, rooms } = useStore((s) => ({
    currentSessionId: s.currentSessionId,
    rooms: s.rooms,
  }))

  // Prefer the session's primary room when audio is mounted.
  const activeRoomId = currentSessionId
    ? Object.values(rooms[currentSessionId] ?? {}).find((room) => room.type === RoomType.MAIN)
        ?.id || (Object.keys(rooms[currentSessionId] ?? {})[0] as UUID | undefined)
    : undefined

  const handleLoginSuccess = (token: string, user: { id: UUID; username: string; role: Role }) => {
    setAuth({
      token,
      user,
    })
    setAuthMessage(null)
  }

  const handleLogout = () => {
    setAuth({
      token: null,
      user: null,
    })
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
          sessionStorage.setItem('authToken', data.token)
          sessionStorage.setItem('user', JSON.stringify(data.user))
          setAuth({ token: data.token, user: data.user })
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
          setAuth({ token: existingToken, user: JSON.parse(existingUser) })
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
        })
      } catch {
        setAuthProfile(null)
      }
    }

    void loadProfile()
  }, [auth.token, apiUrl])

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

  const showAdminButton = Boolean(
    auth.user && (auth.user.role === 'DM' || authProfile?.hasAdminAccess)
  )
  const adminButtonDisabled =
    adminLaunchLoading ||
    Boolean(authProfile?.requiresUpgradeForAdmin) ||
    !authProfile?.hasAdminAccess

  return (
    <div className="min-h-screen bg-ui-surface-subtle font-sans text-ui-primary">
      {/* Header */}
      <header className="border-b border-ui-border bg-ui-surface px-4 py-4">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <div>
            <h1 className="m-0 text-2xl font-bold">VTT-Chat</h1>
            <p className="mt-1 text-sm text-ui-secondary">
              Stage 7: Audio &amp; LiveKit Integration
            </p>
          </div>

          {auth.user && (
            <div className="flex gap-2">
              {showAdminButton && (
                <button
                  onClick={handleOpenAdmin}
                  disabled={adminButtonDisabled}
                  title={
                    authProfile?.requiresUpgradeForAdmin
                      ? 'Upgrade to full account to access admin'
                      : undefined
                  }
                  className={cn(
                    'rounded-ui-sm px-4 py-2 text-sm text-white',
                    adminButtonDisabled
                      ? 'cursor-not-allowed bg-slate-400'
                      : 'cursor-pointer bg-teal-700 hover:bg-teal-800'
                  )}
                >
                  {adminLaunchLoading ? 'Opening Admin...' : 'Open Admin'}
                </button>
              )}
              <button
                onClick={handleLogout}
                className="cursor-pointer rounded-ui-sm bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {authMessage && (
        <div className="mx-auto mt-4 w-full max-w-6xl rounded-ui-md border border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {authMessage}
        </div>
      )}

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        {!auth.token || !auth.user ? (
          <>
            <section className="mb-8 text-center">
              <h2 className="text-3xl font-semibold text-ui-primary">Welcome to VTT-Chat</h2>
              <p className="mx-auto mt-2 max-w-xl text-ui-secondary">
                Stage 7 adds room voice, LiveKit transport, and the client audio engine. Start a
                session to unlock chat, room state, and the mounted audio controls.
              </p>
            </section>

            <LoginForm apiUrl={apiUrl} onLoginSuccess={handleLoginSuccess} />

            <section className="mx-auto mt-8 max-w-2xl rounded-ui-lg border border-blue-300 bg-blue-50 p-6 text-sm text-blue-900">
              <h3 className="mt-0 text-base font-semibold">Test Credentials</h3>
              <ul className="my-2 list-disc pl-5">
                <li>
                  <strong>Username:</strong> Any 3-32 character username (alphanumeric + underscore)
                </li>
                <li>
                  <strong>Role:</strong> DM, PLAYER, or SPECTATOR
                </li>
                <li>
                  <strong>Password:</strong> Not required in Stage 1 (for testing)
                </li>
              </ul>
              <p className="mt-2">
                After login, you&apos;ll be able to create sessions and see real-time WebSocket
                state, room updates, and audio controls activate together.
              </p>
            </section>
          </>
        ) : (
          <Suspense
            fallback={
              <div className="rounded-ui-md border border-ui-border bg-ui-surface p-4">
                Loading session surface...
              </div>
            }
          >
            <SessionInit
              apiUrl={apiUrl}
              wsUrl={wsUrl}
              token={auth.token}
              user={auth.user}
              onSessionCreated={(sessionId) => {
                void sessionId
              }}
            />
          </Suspense>
        )}
      </main>

      {/* Audio bar — mounted once a session room is active */}
      {auth.token && currentSessionId && activeRoomId && (
        <Suspense
          fallback={
            <div className="border-t border-ui-border bg-ui-surface-subtle px-4 py-2 text-sm text-ui-secondary">
              Loading audio controls...
            </div>
          }
        >
          <AudioPanel sessionId={currentSessionId} roomId={activeRoomId} />
        </Suspense>
      )}

      {/* Footer */}
      <footer className="mt-8 border-t border-ui-border bg-ui-surface px-4 py-4 text-center text-sm text-ui-secondary">
        <p className="m-0">
          Stage 7 Active: Audio &amp; LiveKit Integration (voice rooms, DSP engine, DM overrides)
        </p>
      </footer>
    </div>
  )
}
