import { useCallback, useMemo, useState } from 'react'
import { LoginForm } from '@/components/auth/LoginForm'
import { PasswordResetConfirmForm } from '@/components/auth/PasswordResetConfirmForm'
import { PasswordResetRequestForm } from '@/components/auth/PasswordResetRequestForm'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { resolveAuthSurfaceRoute } from '@/components/auth/auth-surface'
import { AppSplashOverlay } from '@/components/overlays/AppSplashOverlay'
import type { AuthState } from '@/hooks/useAuthSession'
import { APP_SPLASH_TITLES } from '@/constants/appMainRoute.constants'
import { Role } from '@shared'
import type { UUID } from '@shared'
import { AppInit } from '@/components/app/AppInit'
import '@/styles/components/auth/AuthSurface.css'

type AppMainRouteViewProps = {
  apiUrl: string
  wsUrl: string
  auth: AuthState
  onLoginSuccess: (
    token: string,
    user: { id: UUID; username: string; role: Role; accessMode?: 'USER' | 'CAMPAIGN' }
  ) => void
}

export function AppMainRouteView(props: AppMainRouteViewProps) {
  const authSessionKey = useMemo(() => {
    const token = props.auth.token
    const userId = props.auth.user?.id
    return token && userId ? `${userId}:${token}` : null
  }, [props.auth.token, props.auth.user?.id])

  const [readySessionKey, setReadySessionKey] = useState<string | null>(null)
  const [authTagline] = useState(
    () => APP_SPLASH_TITLES[Math.floor(Math.random() * APP_SPLASH_TITLES.length)]
  )

  const isSessionSurfaceReady = authSessionKey !== null && readySessionKey === authSessionKey

  const handleSessionSurfaceReady = useCallback(() => {
    if (authSessionKey) {
      setReadySessionKey(authSessionKey)
    }
  }, [authSessionKey])

  if (!props.auth.token || !props.auth.user) {
    const authSurfaceRoute = resolveAuthSurfaceRoute(window.location.pathname)

    const renderAuthSurface = () => {
      switch (authSurfaceRoute) {
        case 'register':
          return <RegisterForm apiUrl={props.apiUrl} onLoginSuccess={props.onLoginSuccess} />
        case 'forgot-password':
          return <PasswordResetRequestForm apiUrl={props.apiUrl} />
        case 'reset-password':
          return <PasswordResetConfirmForm apiUrl={props.apiUrl} />
        case 'login':
        default:
          return <LoginForm apiUrl={props.apiUrl} onLoginSuccess={props.onLoginSuccess} />
      }
    }

    return (
      <div className="auth-landing">
        <section className="auth-form-pane">
          <div className="auth-form-shell">
            <header className="auth-brand-header" aria-label="VTT Chat auth brand header">
              <img
                src="/branding/app-logo.png"
                alt="VTT-Chat logo"
                className="auth-brand-header__logo"
              />
              <div className="auth-brand-header__copy">
                <h1 className="auth-brand-header__title">VTT-CHAT</h1>
                <p className="auth-brand-header__tagline">{authTagline}</p>
              </div>
            </header>
            {renderAuthSurface()}
          </div>
        </section>
      </div>
    )
  }

  return (
    <>
      <AppSplashOverlay
        active={Boolean(props.auth.token && props.auth.user)}
        sessionSurfaceReady={isSessionSurfaceReady}
        resetKey={props.auth.user?.id || 'anonymous'}
      />

      <AppInit
        apiUrl={props.apiUrl}
        wsUrl={props.wsUrl}
        token={props.auth.token}
        user={props.auth.user}
        onReady={handleSessionSurfaceReady}
        onSessionCreated={(sessionId) => {
          void sessionId
        }}
      />
    </>
  )
}
