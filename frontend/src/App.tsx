import { lazy, Suspense, useState } from 'react'
import { RoomType } from '@shared'
import type { UUID } from '@shared'
import { BrowseCampaignsPage } from './components/auth/BrowseCampaignsPage'
import { GuestUpgradePrompt } from './components/auth/GuestUpgradePrompt'
import { InviteJoinPage } from './components/auth/InviteJoinPage'
import { LoginForm } from './components/auth/LoginForm'
import { SpectatorInvitePage } from './components/auth/SpectatorInvitePage'
import { useAuthSession } from './hooks/useAuthSession'
import { useStore } from './hooks/useStore'
import { resolveRoute, type RouteView } from './utils/route-view'
import { cn } from './utils/cn'

const SessionInit = lazy(async () => {
  const module = await import('./components/session/SessionInit')
  return { default: module.SessionInit }
})

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

  const { currentSessionId, rooms } = useStore((s) => ({
    currentSessionId: s.currentSessionId,
    rooms: s.rooms,
  }))

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

  return (
    <div className="min-h-screen bg-ui-surface-subtle font-sans text-ui-primary">
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

      {showUpgradePrompt && authProfile?.email && (
        <GuestUpgradePrompt
          email={authProfile.email}
          loading={upgradeLoading}
          onUpgrade={handleUpgradeAccount}
          onDismiss={() => setUpgradePromptDismissed(true)}
        />
      )}

      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        {routeView.kind === 'join' ? (
          <InviteJoinPage
            apiUrl={apiUrl}
            inviteCode={routeView.inviteCode}
            authToken={auth.token}
            onAuthenticated={handleGuestExtensionAuthenticated}
          />
        ) : routeView.kind === 'watch' ? (
          <SpectatorInvitePage
            apiUrl={apiUrl}
            inviteCode={routeView.inviteCode}
            onAuthenticated={handleGuestSpectatorAuthenticated}
          />
        ) : routeView.kind === 'browse' ? (
          <BrowseCampaignsPage apiUrl={apiUrl} authToken={auth.token} />
        ) : !auth.token || !auth.user ? (
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

      <footer className="mt-8 border-t border-ui-border bg-ui-surface px-4 py-4 text-center text-sm text-ui-secondary">
        <p className="m-0">
          Stage 7 Active: Audio &amp; LiveKit Integration (voice rooms, DSP engine, DM overrides)
        </p>
      </footer>
    </div>
  )
}
