import { useState, useEffect } from 'react'
import Dashboard from './pages/Dashboard'
import Analytics from './pages/Analytics'
import UserManagement from './pages/UserManagement'
import CampaignManagement from './pages/CampaignManagement'
import PlatformStatus from './pages/PlatformStatus'
import Logs from './pages/Logs'
import Settings from './pages/Settings'
import Integrations from './pages/Integrations'
import Setup from './pages/Setup'
import Login from './pages/Login'
import InviteOnboarding from './pages/InviteOnboarding'
import { useAuthStore } from './store'
import { ADMIN_SESSION_EXPIRED_EVENT, SessionExpiredError, getJson } from './utils/api'
import './styles/App.css'

type AdminPage =
  | 'dashboard'
  | 'analytics'
  | 'users'
  | 'campaigns'
  | 'status'
  | 'logs'
  | 'settings'
  | 'integrations'

interface NavItem {
  key: AdminPage
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'users', label: 'Users' },
  { key: 'campaigns', label: 'Rooms & Campaigns' },
  { key: 'status', label: 'System Health' },
  { key: 'logs', label: 'Logs & Activity' },
  { key: 'settings', label: 'Settings' },
  { key: 'integrations', label: 'Integrations' },
]

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000/api'

export default function App() {
  const [page, setPage] = useState<AdminPage>('dashboard')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [isNavCollapsed, setIsNavCollapsed] = useState(false)
  const [setupRequired, setSetupRequired] = useState(false)
  const [setupLoading, setSetupLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [launchLoading, setLaunchLoading] = useState(false)

  const { isAuthenticated, logout, setToken, initializeAuth, token } = useAuthStore()

  const frontendUrl =
    (import.meta as any).env?.VITE_FRONTEND_URL ||
    (import.meta as any).env?.VITE_APP_URL ||
    'http://localhost:5173'
  const inviteToken = new URLSearchParams(window.location.search).get('invite')

  // Check if setup is required and restore auth on mount
  useEffect(() => {
    initializeAuth()

    const checkSetup = async () => {
      try {
        const response = await fetch(`${API_BASE}/admin/setup-status`)
        const data = await response.json()
        setSetupRequired(data.setupRequired)
      } catch (error) {
        console.error('Failed to check setup status:', error)
      } finally {
        setSetupLoading(false)
      }
    }

    checkSetup()
  }, [initializeAuth])

  useEffect(() => {
    const handoff = new URLSearchParams(window.location.search).get('handoff')
    if (!handoff || setupRequired) {
      return
    }

    const exchange = async () => {
      setLaunchLoading(true)
      try {
        const response = await fetch(`${API_BASE}/admin/auth/handoff/exchange`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ handoffToken: handoff }),
        })

        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data.error || data.message || 'Failed to launch admin session')
        }

        setToken(data.token, data.admin)
        setAuthError(null)
        window.history.replaceState({}, document.title, window.location.pathname)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to complete admin launch handoff'
        setAuthError(message)
      } finally {
        setLaunchLoading(false)
      }
    }

    void exchange()
  }, [setToken, setupRequired])

  useEffect(() => {
    const onSessionExpired = () => {
      logout()
      setAuthError('Admin session expired. Please sign in again.')
    }

    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, onSessionExpired)
    return () => {
      window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, onSessionExpired)
    }
  }, [logout])

  useEffect(() => {
    if (!isAuthenticated || !token || setupRequired || setupLoading) {
      return
    }

    let cancelled = false

    const validateSession = async () => {
      try {
        await getJson<{ admin: { id: string } }>('/me')

        if (cancelled) {
          return
        }

        setAuthError(null)
      } catch (error) {
        if (cancelled) {
          return
        }

        if (error instanceof SessionExpiredError) {
          return
        }

        const message =
          error instanceof Error ? error.message : 'Unable to validate admin session state'
        setAuthError(message)
      }
    }

    void validateSession()

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, setupLoading, setupRequired, token])

  const handleSetupComplete = (
    token: string,
    admin: { id: string; username: string; email: string }
  ) => {
    setToken(token, admin)
    setSetupRequired(false)
  }

  const handleLoginSuccess = (
    token: string,
    admin: { id: string; username: string; email: string }
  ) => {
    setToken(token, admin)
    setAuthError(null)
  }

  const handleLogout = () => {
    logout()
    setAuthError(null)
  }

  const handleAuthError = (error: string) => {
    setAuthError(error)
  }

  const handleOpenFrontend = async () => {
    if (!token) {
      setAuthError('Missing admin session token')
      return
    }

    setLaunchLoading(true)
    setAuthError(null)

    try {
      const response = await fetch(`${API_BASE}/admin/handoff/app`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to open frontend')
      }

      const handoffToken = String(data.handoffToken || '').trim()
      if (!handoffToken) {
        throw new Error('Missing handoff token in response')
      }

      window.location.href = `${frontendUrl}/launch?handoff=${encodeURIComponent(handoffToken)}`
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open frontend app'
      setAuthError(message)
      setLaunchLoading(false)
    }
  }

  if (setupLoading) {
    return (
      <div className="admin-app">
        <div className="admin-loading-screen">
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  // Show setup wizard if no admin exists
  if (setupRequired) {
    return (
      <div className="admin-app">
        <Setup onComplete={handleSetupComplete} onError={handleAuthError} />
        {authError && <div className="error-alert">{authError}</div>}
      </div>
    )
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    if (!setupRequired && inviteToken) {
      return (
        <div className="admin-app">
          <InviteOnboarding
            inviteToken={inviteToken}
            onComplete={handleLoginSuccess}
            onError={handleAuthError}
          />
          {authError && <div className="error-alert">{authError}</div>}
        </div>
      )
    }

    return (
      <div className="admin-app">
        <Login onLoginSuccess={handleLoginSuccess} onError={handleAuthError} />
        {authError && <div className="error-alert">{authError}</div>}
      </div>
    )
  }

  const renderPage = () => {
    switch (page) {
      case 'analytics':
        return <Analytics />
      case 'users':
        return <UserManagement />
      case 'campaigns':
        return <CampaignManagement />
      case 'status':
        return <PlatformStatus />
      case 'logs':
        return <Logs />
      case 'settings':
        return <Settings />
      case 'integrations':
        return <Integrations />
      default:
        return <Dashboard />
    }
  }

  return (
    <div className={`admin-app theme-${theme}`}>
      <header className="admin-topbar">
        <div>
          <h1 className="admin-title">VTT-Chat Admin</h1>
          <p className="admin-subtitle">Operations console</p>
        </div>

        <div className="admin-topbar-actions">
          <button
            className="admin-btn admin-btn-ghost"
            onClick={() => setIsNavCollapsed((prev) => !prev)}
            aria-label={isNavCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {isNavCollapsed ? 'Expand Nav' : 'Collapse Nav'}
          </button>
          <button
            className="admin-btn"
            onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            aria-label="Toggle theme"
          >
            Theme: {theme === 'dark' ? 'Dark' : 'Light'}
          </button>
          <button
            className="admin-btn admin-btn-ghost"
            onClick={handleOpenFrontend}
            disabled={launchLoading}
            aria-label="Open frontend"
          >
            {launchLoading ? 'Opening App...' : 'Open App'}
          </button>
          <button className="admin-btn admin-btn-danger" onClick={handleLogout} aria-label="Logout">
            Logout
          </button>
        </div>
      </header>

      <div className="admin-layout">
        <aside className={`admin-nav ${isNavCollapsed ? 'collapsed' : ''}`}>
          <nav aria-label="Admin navigation">
            <ul className="admin-nav-list">
              {NAV_ITEMS.map((item) => (
                <li key={item.key}>
                  <button
                    className={`admin-nav-item ${page === item.key ? 'active' : ''}`}
                    onClick={() => setPage(item.key)}
                    title={item.label}
                  >
                    {isNavCollapsed ? item.label.slice(0, 2).toUpperCase() : item.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <main className="admin-main-content">{renderPage()}</main>
      </div>
    </div>
  )
}
