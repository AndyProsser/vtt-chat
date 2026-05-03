import { lazy, Suspense, useState } from 'react'
import { RoomType } from '@shared'
import type { UUID } from '@shared'
import { GuestUpgradePrompt } from './components/auth/GuestUpgradePrompt'
import { AppMainRouteView } from './components/routes/AppMainRouteView'
import { BrowseRouteView } from './components/routes/BrowseRouteView'
import { JoinRouteView } from './components/routes/JoinRouteView'
import { WatchRouteView } from './components/routes/WatchRouteView'
import { useAuthSession } from './hooks/useAuthSession'
import { useStore } from './hooks/useStore'
import { resolveRoute, type RouteView } from './utils/route-view'
import { cn } from './utils/cn'

const AudioPanel = lazy(async () => {
  const module = await import('./components/audio/AudioPanel')
  return { default: module.AudioPanel }
})

export default function App() {
  const [routeView] = useState<RouteView>(() => resolveRoute(window.location.pathname))

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000'
  const adminUrl = import.meta.env.VITE_ADMIN_URL || 'http://localhost:5174'

  const {
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
  } = useAuthSession({
    apiUrl,
    adminUrl,
  })

  const currentSessionId = useStore((state) => state.currentSessionId)
  const rooms = useStore((state) => state.rooms)

  const activeRoomId = currentSessionId
    ? Object.values(rooms[currentSessionId] ?? {}).find((room) => room.type === RoomType.MAIN)
        ?.id || (Object.keys(rooms[currentSessionId] ?? {})[0] as UUID | undefined)
    : undefined

  const showAdminButton = Boolean(
    auth.user && (auth.user.role === 'DM' || authProfile?.hasAdminAccess)
  )
  const adminButtonDisabled =
    adminLaunchLoading ||
    Boolean(authProfile?.requiresUpgradeForAdmin) ||
    !authProfile?.hasAdminAccess

  const isGuestAccount = Boolean(
    auth.token && auth.user && (authProfile?.authType === 'GUEST' || auth.user.authType === 'GUEST')
  )
  const showUpgradePrompt =
    routeView.kind === 'app' && isGuestAccount && !upgradePromptDismissed && !currentSessionId

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
            onAuthenticated={handleGuestSpectatorAuthenticated}
          />
        )
      case 'browse':
        return <BrowseRouteView apiUrl={apiUrl} authToken={auth.token} />
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
    <div className="relative min-h-screen overflow-hidden font-sans text-ui-primary">
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

      <div className="relative">
        <header className="border-b border-ui-border bg-ui-surface px-4 py-5 shadow-ui-sm">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
            <div>
              <p className="mb-1 text-xs font-semibold tracking-wide text-ui-secondary uppercase">
                Campaign Control Surface
              </p>
              <h1 className="m-0 text-2xl font-bold">VTT-Chat</h1>
              <p className="mt-1 text-sm text-ui-secondary">
                Audio rooms, live session state, and DM tooling in one surface
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
          <div className="mx-auto mt-4 w-full max-w-6xl rounded-ui-md border border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-ui-sm">
            {authMessage}
          </div>
        )}

        {showUpgradePrompt && authProfile?.email && (
          <GuestUpgradePrompt
            email={authProfile.email}
            loading={upgradeLoading}
            onUpgrade={handleUpgradeAccount}
            onDismiss={() => setUpgradePromptDismissed(true)}
          />
        )}

        <main className="mx-auto w-full max-w-6xl px-4 py-8">
          <section className="overflow-hidden rounded-ui-lg border border-ui-border bg-ui-surface shadow-ui-md">
            {renderRouteView()}
          </section>
        </main>

        {routeView.kind === 'app' && auth.token && currentSessionId && activeRoomId && (
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

        <footer className="mt-8 border-t border-ui-border bg-ui-surface/80 px-4 py-4 text-center text-sm text-ui-secondary shadow-ui-sm">
          <p className="m-0">
            Audio and LiveKit are enabled with room voice, DSP engine processing, and DM overrides.
          </p>
        </footer>
      </div>
    </div>
  )
}
