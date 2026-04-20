import { useState, useEffect } from 'react'
import Dashboard from './pages/Dashboard'
import UserManagement from './pages/UserManagement'
import CampaignManagement from './pages/CampaignManagement'
import PlatformStatus from './pages/PlatformStatus'
import Logs from './pages/Logs'
import Settings from './pages/Settings'
import Setup from './pages/Setup'
import Login from './pages/Login'
import { useAuthStore } from './store'
import './styles/App.css'

type AdminPage = 'dashboard' | 'users' | 'campaigns' | 'status' | 'logs' | 'settings'

interface NavItem {
  key: AdminPage
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'users', label: 'Users' },
  { key: 'campaigns', label: 'Rooms & Campaigns' },
  { key: 'status', label: 'System Health' },
  { key: 'logs', label: 'Logs & Activity' },
  { key: 'settings', label: 'Settings' },
]

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000/api'

export default function App() {
  const [page, setPage] = useState<AdminPage>('dashboard')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [isNavCollapsed, setIsNavCollapsed] = useState(false)
  const [setupRequired, setSetupRequired] = useState(false)
  const [setupLoading, setSetupLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  const { isAuthenticated, logout, setToken, initializeAuth } = useAuthStore()

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

  if (setupLoading) {
    return (
      <div className="admin-app">
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
          }}
        >
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
    return (
      <div className="admin-app">
        <Login onLoginSuccess={handleLoginSuccess} onError={handleAuthError} />
        {authError && <div className="error-alert">{authError}</div>}
      </div>
    )
  }

  const renderPage = () => {
    switch (page) {
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
