import { lazy, Suspense } from 'react'
import { LoginForm } from '@/components/auth/LoginForm'
import type { AuthState } from '@/hooks/useAuthSession'
import { Role } from '@shared'
import type { UUID } from '@shared'

const SessionInit = lazy(async () => {
  const module = await import('@/components/session/SessionInit')
  return { default: module.SessionInit }
})

type AppMainRouteViewProps = {
  apiUrl: string
  wsUrl: string
  auth: AuthState
  onLoginSuccess: (token: string, user: { id: UUID; username: string; role: Role }) => void
}

export function AppMainRouteView(props: AppMainRouteViewProps) {
  if (!props.auth.token || !props.auth.user) {
    return (
      <>
        <section className="mb-8 text-center">
          <h2 className="text-3xl font-semibold text-ui-primary">Welcome to VTT-Chat</h2>
          <p className="mx-auto mt-2 max-w-xl text-ui-secondary">
            Room voice, LiveKit transport, and the client audio engine are available. Start a
            session to unlock chat, room state, and mounted audio controls.
          </p>
        </section>

        <LoginForm apiUrl={props.apiUrl} onLoginSuccess={props.onLoginSuccess} />

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
              <strong>Password:</strong> Not required in this test flow
            </li>
          </ul>
          <p className="mt-2">
            After login, you&apos;ll be able to create sessions and see real-time WebSocket state,
            room updates, and audio controls activate together.
          </p>
        </section>
      </>
    )
  }

  return (
    <Suspense
      fallback={
        <div className="rounded-ui-md border border-ui-border bg-ui-surface p-4">
          Loading session surface...
        </div>
      }
    >
      <SessionInit
        apiUrl={props.apiUrl}
        wsUrl={props.wsUrl}
        token={props.auth.token}
        user={props.auth.user}
        onSessionCreated={(sessionId) => {
          void sessionId
        }}
      />
    </Suspense>
  )
}
