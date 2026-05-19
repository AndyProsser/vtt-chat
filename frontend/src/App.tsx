import { useEffect, useState } from 'react'
import { AppMainRouteView } from './components/routes/AppMainRouteView'
import { BrowseRouteView } from './components/routes/BrowseRouteView'
import { CampaignSettingsRouteView } from './components/routes/CampaignSettingsRouteView'
import { JoinRouteView } from './components/routes/JoinRouteView'
import { WatchRouteView } from './components/routes/WatchRouteView'
import { useAuthSession } from './hooks/useAuthSession'
import { resolveRoute, type RouteView } from './utils/route-view'
import { ToastViewport } from './components/ui/ToastViewport'
import { logger } from './utils/logger'
import type { UUID } from '@shared'
import './styles/components/app/AppShell.css'

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
  const configuredLivekitUrl = import.meta.env.VITE_LIVEKIT_URL?.trim()

  const isLoopbackHost = (host: string) =>
    host === 'localhost' || host === '127.0.0.1' || host === '::1'

  const parsedConfiguredApiUrl = (() => {
    if (!configuredApiUrl) {
      return null
    }

    try {
      return new URL(configuredApiUrl)
    } catch {
      return null
    }
  })()

  const parsedConfiguredLivekitUrl = (() => {
    if (!configuredLivekitUrl) {
      return null
    }

    try {
      return new URL(configuredLivekitUrl)
    } catch {
      return null
    }
  })()

  const parsedBrowserOrigin = new URL(browserOrigin)
  const isConfiguredApiLoopbackTarget =
    Boolean(parsedConfiguredApiUrl) && isLoopbackHost(parsedConfiguredApiUrl!.hostname)
  const isBrowserOnLoopbackHost = isLoopbackHost(parsedBrowserOrigin.hostname)
  const isBrowserOnNonLoopbackHost = !isLoopbackHost(parsedBrowserOrigin.hostname)
  const isBrowserOnDifferentLoopbackOrigin =
    isBrowserOnLoopbackHost &&
    Boolean(parsedConfiguredApiUrl) &&
    parsedConfiguredApiUrl!.origin !== parsedBrowserOrigin.origin
  const isStaleHttpDevProxy =
    browserOrigin.startsWith('https://') && configuredApiUrl === 'http://localhost:8080'
  const shouldUseBrowserProxyOrigin =
    isStaleHttpDevProxy ||
    (isConfiguredApiLoopbackTarget && isBrowserOnNonLoopbackHost) ||
    (isConfiguredApiLoopbackTarget && isBrowserOnDifferentLoopbackOrigin)

  const shouldPreferBrowserWsOrigin = (() => {
    if (shouldUseBrowserProxyOrigin || !configuredWsUrl) {
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

  const apiUrl = shouldUseBrowserProxyOrigin ? browserOrigin : configuredApiUrl || browserOrigin
  const wsUrlBase = shouldPreferBrowserWsOrigin
    ? `${browserOrigin.startsWith('https://') ? 'wss' : 'ws'}://${window.location.host}`
    : configuredWsUrl
  const wsUrl = normalizeWsUrl(wsUrlBase)
  const adminUrl = configuredAdminUrl || `${browserOrigin}/admin`
  const livekitUrl = `${browserOrigin.startsWith('https://') ? 'wss' : 'ws'}://${window.location.host}/livekit`
  const isConfiguredLivekitLoopbackTarget =
    Boolean(parsedConfiguredLivekitUrl) && isLoopbackHost(parsedConfiguredLivekitUrl!.hostname)

  const {
    auth,
    authMessage,
    handleLoginSuccess,
    handleSpectatorAuthenticated,
    handleGuestExtensionAuthenticated,
  } = useAuthSession({
    apiUrl,
    adminUrl,
  })

  useEffect(() => {
    logger.info('app.bootstrap', 'Resolved client endpoints', {
      browserOrigin,
      apiUrl,
      wsUrl,
      adminUrl,
      livekitUrl,
      expectedLivekitTokenUrl: livekitUrl,
      configuredApiUrl: configuredApiUrl || null,
      configuredWsUrl: configuredWsUrl || null,
      configuredAdminUrl: configuredAdminUrl || null,
      configuredLivekitUrl: configuredLivekitUrl || null,
      configuredLivekitLoopbackTarget: isConfiguredLivekitLoopbackTarget,
      livekitConnectionSource: '/api/livekit/token response url',
      secureContext:
        typeof window !== 'undefined'
          ? window.isSecureContext
          : browserOrigin.startsWith('https://'),
      randomUuidAvailable: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function',
      shouldUseBrowserProxyOrigin,
      shouldPreferBrowserWsOrigin,
    })
  }, [
    adminUrl,
    apiUrl,
    browserOrigin,
    configuredAdminUrl,
    configuredApiUrl,
    configuredLivekitUrl,
    isConfiguredLivekitLoopbackTarget,
    configuredWsUrl,
    livekitUrl,
    shouldPreferBrowserWsOrigin,
    shouldUseBrowserProxyOrigin,
    wsUrl,
  ])

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
      window.dispatchEvent(new PopStateEvent('popstate'))
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
    <div className="app-shell relative h-screen overflow-hidden font-sans text-ui-primary">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="app-shell__orb--brand absolute -left-24 top-0 h-72 w-72 rounded-full opacity-60 blur-3xl" />
        <div className="app-shell__orb--info absolute right-0 top-20 h-80 w-80 rounded-full opacity-50 blur-3xl" />
      </div>

      <div className="relative flex h-full flex-col items-center">
        {authMessage && (
          <div className="app-shell__frame mt-4 rounded-ui-md border border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-ui-sm">
            {authMessage}
          </div>
        )}

        <main className="app-shell__frame font-sans mx-auto flex min-h-0 flex-1 flex-col px-3 pt-0">
          <ToastViewport />
          <section className="flex h-full min-h-0 overflow-hidden rounded-ui-lg border border-ui-border bg-ui-surface shadow-ui-md">
            {renderRouteView()}
          </section>
        </main>
      </div>
    </div>
  )
}
