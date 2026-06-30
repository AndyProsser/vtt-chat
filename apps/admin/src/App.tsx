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
import UserManagement from './pages/UserManagement'
import CampaignManagement from './pages/CampaignManagement'
import Logs from './pages/Logs'
import Settings from './pages/Settings'
import Setup from './pages/Setup'
import Login from './pages/Login'
import InviteOnboarding from './pages/InviteOnboarding'
import { useAuthStore } from './store'
import { getAdminTheme } from './theme'
import { ADMIN_SESSION_EXPIRED_EVENT, SessionExpiredError, getJson, API_BASE } from './utils/api'
import type { AdminPage, NavItem } from '@/types/nav'
import './styles/App.css'

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', subtitle: 'The Scrying Pool' },
  { key: 'campaigns', label: 'Campaigns', subtitle: 'The Chronicle' },
  { key: 'users', label: 'Users', subtitle: 'Guild Roster' },
  { key: 'settings', label: 'Settings', subtitle: 'The Tome' },
  { key: 'logs', label: 'Logs', subtitle: 'Hall of Records' },
]

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
    (import.meta.env.VITE_FRONTEND_URL as string | undefined) ||
    (import.meta.env.VITE_APP_URL as string | undefined) ||
    window.location.origin
  const inviteToken = new URLSearchParams(window.location.search).get('invite')

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
    if (!handoff || setupRequired) return

    const exchange = async () => {
      setLaunchLoading(true)
      try {
        const response = await fetch(`${API_BASE}/admin/auth/handoff/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
    return () => window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, onSessionExpired)
  }, [logout])

  useEffect(() => {
    if (!isAuthenticated || !token || setupRequired || setupLoading) return

    let cancelled = false

    const validateSession = async () => {
      try {
        await getJson<{ admin: { id: string } }>('/me')
        if (!cancelled) setAuthError(null)
      } catch (error) {
        if (cancelled) return
        if (error instanceof SessionExpiredError) return
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
      if (!handoffToken) throw new Error('Missing handoff token in response')

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
            <p>Loading…</p>
          </div>
        </div>
      </ThemeProvider>
    )
  }

  if (setupRequired) {
    return (
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        <div className="admin-app">
          <Setup onComplete={handleSetupComplete} onError={(e) => setAuthError(e)} />
          {authError && <div className="error-alert">{authError}</div>}
        </div>
      </ThemeProvider>
    )
  }

  if (!isAuthenticated) {
    if (!setupRequired && inviteToken) {
      return (
        <ThemeProvider theme={muiTheme}>
          <CssBaseline />
          <div className="admin-app">
            <InviteOnboarding
              inviteToken={inviteToken}
              onComplete={handleLoginSuccess}
              onError={(e) => setAuthError(e)}
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
          <Login onLoginSuccess={handleLoginSuccess} onError={(e) => setAuthError(e)} />
          {authError && <div className="error-alert">{authError}</div>}
        </div>
      </ThemeProvider>
    )
  }

  const renderPage = () => {
    switch (page) {
      case 'campaigns':
        return <CampaignManagement />
      case 'users':
        return <UserManagement />
      case 'settings':
        return <Settings />
      case 'logs':
        return <Logs />
      default:
        return <Dashboard onNavigateToJobs={() => setPage('settings')} />
    }
  }

  const navWidth = isNavCollapsed ? 56 : 200

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
                Operations Console
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Button
                variant="outlined"
                size="small"
                aria-label={isNavCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                onClick={() => setIsNavCollapsed((prev) => !prev)}
              >
                {isNavCollapsed ? '▶' : '◀'}
              </Button>
              <Button
                variant="contained"
                size="small"
                aria-label="Toggle theme"
                onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              >
                {theme === 'dark' ? 'Dark' : 'Light'}
              </Button>
              <Button
                variant="outlined"
                size="small"
                aria-label="Open frontend"
                onClick={handleOpenFrontend}
                disabled={launchLoading}
              >
                {launchLoading ? 'Opening…' : 'Open App'}
              </Button>
              <Button
                variant="outlined"
                color="error"
                size="small"
                aria-label="Logout"
                onClick={handleLogout}
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
                <ListItemButton
                  selected={page === item.key}
                  onClick={() => setPage(item.key)}
                  sx={{ borderRadius: '0 8px 8px 0', mr: 1 }}
                >
                  {isNavCollapsed ? (
                    <ListItemText
                      primary={
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
                          {item.label.slice(0, 2).toUpperCase()}
                        </span>
                      }
                    />
                  ) : (
                    <ListItemText
                      primary={<span style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</span>}
                      secondary={
                        <span style={{ fontSize: 11, opacity: 0.6 }}>{item.subtitle}</span>
                      }
                    />
                  )}
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Drawer>

        <Box component="main" sx={{ ml: `${navWidth}px`, mt: '64px', p: 3 }}>
          {authError && (
            <div className="error-alert" style={{ marginBottom: 16 }}>
              {authError}
            </div>
          )}
          {renderPage()}
        </Box>
      </Box>
    </ThemeProvider>
  )
}
