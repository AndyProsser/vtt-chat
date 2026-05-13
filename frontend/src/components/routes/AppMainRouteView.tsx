import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { LoginForm } from '@/components/auth/LoginForm'
import { PasswordResetConfirmForm } from '@/components/auth/PasswordResetConfirmForm'
import { PasswordResetRequestForm } from '@/components/auth/PasswordResetRequestForm'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { resolveAuthSurfaceRoute } from '@/components/auth/auth-surface'
import { AppSplashOverlay } from '@/components/overlays/AppSplashOverlay'
import type { AuthState } from '@/hooks/useAuthSession'
import {
  AUTH_FEATURE_CARDS,
  AUTH_HERO_CHIP_TEXT,
  AUTH_HERO_COPY,
  AUTH_HERO_TITLE,
} from '@/constants/appMainRoute.constants'
import { Role } from '@shared'
import type { UUID } from '@shared'
import '@/styles/components/auth/AuthSurface.css'

const SessionInit = lazy(async () => {
  const module = await import('@/components/session/SessionInit')
  return { default: module.SessionInit }
})

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
  const [isSessionSurfaceReady, setIsSessionSurfaceReady] = useState(false)

  const handleSessionSurfaceReady = useCallback(() => {
    setIsSessionSurfaceReady(true)
  }, [])

  useEffect(() => {
    if (!props.auth.token || !props.auth.user) {
      return
    }

    setIsSessionSurfaceReady(false)
  }, [props.auth.token, props.auth.user?.id])

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
        <section className="auth-hero">
          <div className="auth-hero__inner">
            <div className="auth-chip">
              <img src="/branding/app-logo.png" alt="" className="auth-chip__logo" />
              <span className="auth-chip__dot" />
              {AUTH_HERO_CHIP_TEXT}
            </div>

            <h2 className="auth-hero__title">{AUTH_HERO_TITLE}</h2>
            <p className="auth-hero__copy">{AUTH_HERO_COPY}</p>

            <div className="auth-card-grid">
              {AUTH_FEATURE_CARDS.map((card) => (
                <article key={card.title} className="auth-card">
                  <span className="auth-card__icon material-symbols-outlined" aria-hidden="true">
                    {card.icon}
                  </span>
                  <div className="auth-card__body">
                    <p className="auth-card__eyebrow">{card.eyebrow}</p>
                    <h3 className="auth-card__title">{card.title}</h3>
                    <p>{card.copy}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="auth-form-pane">
          <div className="auth-form-shell">{renderAuthSurface()}</div>
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

      <Suspense fallback={<div className="h-full w-full" />}>
        <SessionInit
          apiUrl={props.apiUrl}
          wsUrl={props.wsUrl}
          token={props.auth.token}
          user={props.auth.user}
          onReady={handleSessionSurfaceReady}
          onSessionCreated={(sessionId) => {
            void sessionId
          }}
        />
      </Suspense>
    </>
  )
}
