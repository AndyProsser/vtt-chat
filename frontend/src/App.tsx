import { useEffect, useState } from 'react'
import { AppMainRouteView } from './components/routes/AppMainRouteView'
import { BrowseRouteView } from './components/routes/BrowseRouteView'
import { CampaignSettingsRouteView } from './components/routes/CampaignSettingsRouteView'
import { JoinRouteView } from './components/routes/JoinRouteView'
import { WatchRouteView } from './components/routes/WatchRouteView'
import { useAuthSession } from './hooks/useAuthSession'
import { useStore } from './hooks/useStore'
import { resolveRoute, type RouteView } from './utils/route-view'
import { ToastViewport } from './components/ui/ToastViewport'
import type { UUID } from '@shared'

export default function App() {
  const normalizeWsUrl = (rawWsUrl: string): string => {
    try {
      const parsed = new URL(rawWsUrl)
      if (parsed.pathname === '/' || parsed.pathname === '') {
        parsed.pathname = '/ws/connect'
      }
      return parsed.toString()
    } catch {
      const trimmed = rawWsUrl.replace(/\/$/, '')
      return trimmed.endsWith('/ws') || trimmed.endsWith('/ws/connect')
        ? trimmed
        : `${trimmed}/ws/connect`
    }
  }

  const [routeView, setRouteView] = useState<RouteView>(() =>
    resolveRoute(window.location.pathname)
  )
  const browserOrigin = window.location.origin
  const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()
  const configuredWsUrl = import.meta.env.VITE_WS_URL?.trim()
  const configuredAdminUrl = import.meta.env.VITE_ADMIN_URL?.trim()
  const isStaleHttpDevProxy =
    browserOrigin.startsWith('https://') && configuredApiUrl === 'http://localhost:8080'

  const isLoopbackHost = (host: string) =>
    host === 'localhost' || host === '127.0.0.1' || host === '::1'

  const shouldPreferBrowserWsOrigin = (() => {
    if (isStaleHttpDevProxy || !configuredWsUrl) {
      return true
    }

    try {
      const configured = new URL(configuredWsUrl)
      const browser = new URL(browserOrigin)
      return isLoopbackHost(configured.hostname) && !isLoopbackHost(browser.hostname)
    } catch {
      return true
    }
  })()

  const apiUrl = isStaleHttpDevProxy ? browserOrigin : configuredApiUrl || browserOrigin
  const wsUrlBase = shouldPreferBrowserWsOrigin
    ? `${browserOrigin.startsWith('https://') ? 'wss' : 'ws'}://${window.location.host}`
    : configuredWsUrl
  const wsUrl = normalizeWsUrl(wsUrlBase)
  const adminUrl = configuredAdminUrl || `${browserOrigin}/admin`

  const {
    auth,
    authProfile,
    authMessage,
    handleLoginSuccess,
    handleSpectatorAuthenticated,
    handleGuestExtensionAuthenticated,
  } = useAuthSession({
    apiUrl,
    adminUrl,
  })

  const currentSessionId = useStore((state) => state.currentSessionId)

  useEffect(() => {
    const handleRouteChange = () => {
      setRouteView(resolveRoute(window.location.pathname))
    }

    window.addEventListener('popstate', handleRouteChange)
    return () => {
      window.removeEventListener('popstate', handleRouteChange)
    }
  }, [])

  useEffect(() => {
    if (!auth.token) {
      return
    }

    const pendingPath = sessionStorage.getItem('postLoginRedirectPath')
    if (!pendingPath) {
      return
    }

    sessionStorage.removeItem('postLoginRedirectPath')

    if (window.location.pathname !== pendingPath) {
      window.history.pushState({}, '', pendingPath)
      setRouteView(resolveRoute(pendingPath))
    }
  }, [auth.token])

  const renderRouteView = () => {
    switch (routeView.kind) {
      case 'join':
        return (
          <JoinRouteView
            apiUrl={apiUrl}
            inviteCode={routeView.inviteCode}
            authToken={auth.token}
            onAuthenticated={handleGuestExtensionAuthenticated}
          />
        )
      case 'watch':
        return (
          <WatchRouteView
            apiUrl={apiUrl}
            inviteCode={routeView.inviteCode}
            authToken={auth.token}
            authType={auth.user?.authType || null}
            onAuthenticated={handleSpectatorAuthenticated}
          />
        )
      case 'browse':
        return <BrowseRouteView apiUrl={apiUrl} authToken={auth.token} />
      case 'campaign-settings':
        if (!auth.token || !auth.user) {
          return (
            <AppMainRouteView
              apiUrl={apiUrl}
              wsUrl={wsUrl}
              auth={auth}
              onLoginSuccess={handleLoginSuccess}
            />
          )
        }

        return (
          <CampaignSettingsRouteView
            apiUrl={apiUrl}
            token={auth.token}
            campaignId={routeView.campaignId as UUID}
          />
        )
      case 'app':
      default:
        return (
          <AppMainRouteView
            apiUrl={apiUrl}
            wsUrl={wsUrl}
            auth={auth}
            onLoginSuccess={handleLoginSuccess}
          />
        )
    }
  }

  return (
    <div
      className="relative h-screen overflow-hidden font-sans text-ui-primary"
      style={{ height: '100dvh' }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-24 top-0 h-72 w-72 rounded-full opacity-60 blur-3xl"
          style={{ background: 'color-mix(in srgb, var(--color-brand) 18%, transparent)' }}
        />
        <div
          className="absolute right-0 top-20 h-80 w-80 rounded-full opacity-50 blur-3xl"
          style={{ background: 'color-mix(in srgb, var(--color-info) 22%, transparent)' }}
        />
      </div>

      <div className="relative flex h-full flex-col items-center">
        {authMessage && (
          <div
            className="mt-4 rounded-ui-md border border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-ui-sm"
            style={{ width: '100%', maxWidth: '900px' }}
          >
            {authMessage}
          </div>
        )}

        <main
          className="font-sans mx-auto flex min-h-0 flex-1 flex-col px-3 pt-0"
          style={{ width: '100%', maxWidth: '900px', paddingBottom: '10px' }}
        >
          <ToastViewport />
          <section className="flex h-full min-h-0 overflow-hidden rounded-ui-lg border border-ui-border bg-ui-surface shadow-ui-md">
            {renderRouteView()}
          </section>
        </main>
      </div>
    </div>
  )
}
