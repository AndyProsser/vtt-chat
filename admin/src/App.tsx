import { useState, useEffect, useMemo } from 'react'
import {
  AppBar,
  Box,
  Button,
  CssBaseline,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ThemeProvider,
  Toolbar,
  Typography,
} from '@mui/material'
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
import { getAdminTheme } from './theme'
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
  const muiTheme = useMemo(() => getAdminTheme(theme), [theme])

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
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        <div className="admin-app">
          <div className="admin-loading-screen">
            <p>Loading...</p>
          </div>
        </div>
      </ThemeProvider>
    )
  }

  // Show setup wizard if no admin exists
  if (setupRequired) {
    return (
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        <div className="admin-app">
          <Setup onComplete={handleSetupComplete} onError={handleAuthError} />
          {authError && <div className="error-alert">{authError}</div>}
        </div>
      </ThemeProvider>
    )
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    if (!setupRequired && inviteToken) {
      return (
        <ThemeProvider theme={muiTheme}>
          <CssBaseline />
          <div className="admin-app">
            <InviteOnboarding
              inviteToken={inviteToken}
              onComplete={handleLoginSuccess}
              onError={handleAuthError}
            />
            {authError && <div className="error-alert">{authError}</div>}
          </div>
        </ThemeProvider>
      )
    }

    return (
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        <div className="admin-app">
          <Login onLoginSuccess={handleLoginSuccess} onError={handleAuthError} />
          {authError && <div className="error-alert">{authError}</div>}
        </div>
      </ThemeProvider>
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

  const navWidth = isNavCollapsed ? 76 : 240

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary' }}>
        <AppBar
          position="fixed"
          color="inherit"
          elevation={0}
          sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
        >
          <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
                VTT-Chat Admin
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Operations console
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setIsNavCollapsed((prev) => !prev)}
                aria-label={isNavCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              >
                {isNavCollapsed ? 'Expand Nav' : 'Collapse Nav'}
              </Button>
              <Button
                variant="contained"
                size="small"
                onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                aria-label="Toggle theme"
              >
                Theme: {theme === 'dark' ? 'Dark' : 'Light'}
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={handleOpenFrontend}
                disabled={launchLoading}
                aria-label="Open frontend"
              >
                {launchLoading ? 'Opening App...' : 'Open App'}
              </Button>
              <Button
                variant="outlined"
                color="error"
                size="small"
                onClick={handleLogout}
                aria-label="Logout"
              >
                Logout
              </Button>
            </Box>
          </Toolbar>
        </AppBar>

        <Drawer
          variant="permanent"
          sx={{
            width: navWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: navWidth,
              boxSizing: 'border-box',
              borderRight: 1,
              borderColor: 'divider',
              mt: '64px',
              height: 'calc(100% - 64px)',
              bgcolor: 'background.paper',
            },
          }}
        >
          <List sx={{ pt: 1 }} aria-label="Admin navigation">
            {NAV_ITEMS.map((item) => (
              <ListItem key={item.key} disablePadding>
                <ListItemButton selected={page === item.key} onClick={() => setPage(item.key)}>
                  <ListItemText
                    primary={isNavCollapsed ? item.label.slice(0, 2).toUpperCase() : item.label}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Drawer>

        <Box component="main" sx={{ ml: `${navWidth}px`, mt: '64px', p: 2 }}>
          {renderPage()}
        </Box>
      </Box>
    </ThemeProvider>
  )
}
