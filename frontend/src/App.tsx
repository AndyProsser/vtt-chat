import { useEffect, useState } from 'react'
import { RoomType } from '@shared'
import type { UUID, Role } from '@shared'
import { LoginForm } from './components/auth/LoginForm'
import { SessionInit } from './components/session/SessionInit'
import { AudioPanel } from './components/audio/AudioPanel'
import { useStore } from './hooks/useStore'

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
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#f9fafb',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
      }}
    >
      {/* Header */}
      <header
        style={{
          backgroundColor: '#fff',
          borderBottom: '1px solid #e5e7eb',
          padding: '1rem',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700' }}>VTT-Chat</h1>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
              Stage 7: Audio &amp; LiveKit Integration
            </p>
          </div>

          {auth.user && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {showAdminButton && (
                <button
                  onClick={handleOpenAdmin}
                  disabled={adminButtonDisabled}
                  title={
                    authProfile?.requiresUpgradeForAdmin
                      ? 'Upgrade to full account to access admin'
                      : undefined
                  }
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: adminButtonDisabled ? '#94a3b8' : '#0f766e',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: adminButtonDisabled ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  {adminLaunchLoading ? 'Opening Admin...' : 'Open Admin'}
                </button>
              )}
              <button
                onClick={handleLogout}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {authMessage && (
        <div
          style={{
            maxWidth: '1200px',
            margin: '1rem auto 0',
            padding: '0.75rem 1rem',
            border: '1px solid #f59e0b',
            backgroundColor: '#fffbeb',
            color: '#92400e',
            borderRadius: '6px',
            fontSize: '0.875rem',
          }}
        >
          {authMessage}
        </div>
      )}

      {/* Main Content */}
      <main
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '2rem 1rem',
        }}
      >
        {!auth.token || !auth.user ? (
          <>
            <section
              style={{
                textAlign: 'center',
                marginBottom: '2rem',
              }}
            >
              <h2 style={{ color: '#1f2937' }}>Welcome to VTT-Chat</h2>
              <p style={{ color: '#6b7280', maxWidth: '500px', margin: '0 auto' }}>
                Stage 7 adds room voice, LiveKit transport, and the client audio engine. Start a
                session to unlock chat, room state, and the mounted audio controls.
              </p>
            </section>

            <LoginForm apiUrl={apiUrl} onLoginSuccess={handleLoginSuccess} />

            <section
              style={{
                maxWidth: '600px',
                margin: '2rem auto',
                padding: '1.5rem',
                backgroundColor: '#eff6ff',
                border: '1px solid #93c5fd',
                borderRadius: '8px',
                color: '#1e40af',
                fontSize: '0.875rem',
              }}
            >
              <h3 style={{ marginTop: 0 }}>Test Credentials</h3>
              <ul style={{ margin: '0.5rem 0' }}>
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
              <p style={{ margin: '0.5rem 0 0 0' }}>
                After login, you&apos;ll be able to create sessions and see real-time WebSocket
                state, room updates, and audio controls activate together.
              </p>
            </section>
          </>
        ) : (
          <SessionInit
            apiUrl={apiUrl}
            wsUrl={wsUrl}
            token={auth.token}
            user={auth.user}
            onSessionCreated={(sessionId) => {
              void sessionId
            }}
          />
        )}
      </main>

      {/* Audio bar — mounted once a session room is active */}
      {auth.token && currentSessionId && activeRoomId && (
        <AudioPanel sessionId={currentSessionId} roomId={activeRoomId} />
      )}

      {/* Footer */}
      <footer
        style={{
          backgroundColor: '#f3f4f6',
          borderTop: '1px solid #e5e7eb',
          padding: '1rem',
          marginTop: '2rem',
          textAlign: 'center',
          color: '#6b7280',
          fontSize: '0.875rem',
        }}
      >
        <p style={{ margin: 0 }}>
          Stage 7 Active: Audio &amp; LiveKit Integration (voice rooms, DSP engine, DM overrides)
        </p>
      </footer>
    </div>
  )
}
