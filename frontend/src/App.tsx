import { useState } from 'react'
import type { UUID, Role } from '@shared'
import { LoginForm } from './components/auth/LoginForm'
import { SessionInit } from './components/session/SessionInit'

/**
 * App Component
 * Stage 2: Frontend Transport Spine
 * - Login form to get JWT
 * - WebSocket connection with event dispatcher
 * - Session creation and state transitions
 * - Zustand store integration
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

export default function App() {
  const [auth, setAuth] = useState<AuthState>({
    token: null,
    user: null,
  })

  // API and WebSocket URLs (configurable via env or hardcoded for testing)
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000'

  const handleLoginSuccess = (token: string, user: { id: UUID; username: string; role: Role }) => {
    setAuth({
      token,
      user,
    })
  }

  const handleLogout = () => {
    setAuth({
      token: null,
      user: null,
    })
    sessionStorage.removeItem('authToken')
    sessionStorage.removeItem('user')
  }

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
              Stage 2: Frontend Transport Spine
            </p>
          </div>

          {auth.user && (
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
          )}
        </div>
      </header>

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
                Stage 2 implements the transport spine: WebSocket client, event dispatcher, and
                Zustand store with reducers. This demonstrates the complete UI → Event → Reducer →
                Store → UI pipeline.
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
                After login, you'll be able to create sessions and see real-time WebSocket events
                updating the store.
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
          Stage 2 Complete: Transport Spine (WebSocket + Event Dispatcher + Zustand Store)
        </p>
      </footer>
    </div>
  )
}
