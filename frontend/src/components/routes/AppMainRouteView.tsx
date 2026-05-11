import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { LoginForm } from '@/components/auth/LoginForm'
import { PasswordResetConfirmForm } from '@/components/auth/PasswordResetConfirmForm'
import { PasswordResetRequestForm } from '@/components/auth/PasswordResetRequestForm'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { resolveAuthSurfaceRoute } from '@/components/auth/auth-surface'
import type { AuthState } from '@/hooks/useAuthSession'
import { Role } from '@shared'
import type { UUID } from '@shared'
import '@/styles/components/auth/AuthSurface.css'

const SessionInit = lazy(async () => {
  const module = await import('@/components/session/SessionInit')
  return { default: module.SessionInit }
})

const SPLASH_LINES = [
  'Consulting the rules index. This may require a short rest.',
  'Aligning the initiative tracker with questionable destiny.',
  'Polishing dice. Not for balance, just for confidence.',
  'Checking line of sight and emotional damage.',
  'Counting spell slots and pretending to be calm.',
  'Negotiating with the goblin union about loading times.',
  'Rehearsing your dramatic entrance for no reason at all.',
  'Sharpening narrative knives to a responsible edge.',
  'Reviewing party plans. Yes, all seventeen versions.',
  'Rolling for startup speed with a suspiciously weighted d20.',
  'Summoning ambience from the nearest legal dimension.',
  'Checking if the bard has touched anything critical.',
  'Preparing whispers that definitely will not derail the plot.',
  'Asking the cleric to bless the websocket connection.',
  'Translating DM notes from ancient shorthand into reality.',
  'Calibrating dramatic pauses to campaign-approved levels.',
  'Inspecting mimic chests for user interface compliance.',
  'Double-checking that chaos remains inside acceptable limits.',
  'Verifying that the dragon is decorative and mostly cooperative.',
  'Warming up the tavern gossip engine for live service.',
] as const

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
  const initialSplashLineIndex = useMemo(() => Math.floor(Math.random() * SPLASH_LINES.length), [])
  const [splashLineIndex, setSplashLineIndex] = useState(initialSplashLineIndex)
  const [isSplashLineVisible, setIsSplashLineVisible] = useState(true)
  const [isSplashMounted, setIsSplashMounted] = useState(true)
  const [isSplashFadingOut, setIsSplashFadingOut] = useState(false)
  const [isSessionSurfaceReady, setIsSessionSurfaceReady] = useState(false)

  const handleSessionSurfaceReady = useCallback(() => {
    setIsSessionSurfaceReady(true)
  }, [])

  useEffect(() => {
    if (!props.auth.token || !props.auth.user) {
      return
    }

    setIsSplashMounted(true)
    setIsSplashFadingOut(false)
    setIsSessionSurfaceReady(false)
    setIsSplashLineVisible(true)
  }, [props.auth.token, props.auth.user?.id])

  useEffect(() => {
    if (!isSessionSurfaceReady || !isSplashMounted || isSplashFadingOut) {
      return
    }

    setIsSplashFadingOut(true)
  }, [isSessionSurfaceReady, isSplashMounted, isSplashFadingOut])

  useEffect(() => {
    if (!isSplashFadingOut || !isSplashMounted) {
      return
    }

    const fadeTimeoutId = window.setTimeout(() => {
      setIsSplashMounted(false)
    }, 1000)

    return () => {
      window.clearTimeout(fadeTimeoutId)
    }
  }, [isSplashFadingOut, isSplashMounted])

  useEffect(() => {
    if (!isSplashMounted) {
      return
    }

    const cycleIntervalId = window.setInterval(() => {
      setIsSplashLineVisible(false)

      window.setTimeout(() => {
        setSplashLineIndex((previous) => {
          if (SPLASH_LINES.length <= 1) {
            return previous
          }

          let next = Math.floor(Math.random() * SPLASH_LINES.length)
          if (next === previous) {
            next = (previous + 1) % SPLASH_LINES.length
          }

          return next
        })
        setIsSplashLineVisible(true)
      }, 220)
    }, 2500)

    return () => {
      window.clearInterval(cycleIntervalId)
    }
  }, [isSplashMounted])

  const splashLine = SPLASH_LINES[splashLineIndex]

  const splashOverlay =
    isSplashMounted &&
    createPortal(
      <div
        className={`app-splash-overlay ${isSplashFadingOut ? 'is-fading-out' : 'is-visible'}`}
        aria-live="polite"
        aria-busy="true"
      >
        <div className="app-splash-card">
          <img
            src="/branding/app-logo.png"
            alt="VTT Chat dragon emblem"
            className="app-splash-logo"
            loading="eager"
            decoding="async"
          />
          <p className="app-splash-kicker">Summoning Table</p>
          <h3 className="app-splash-title">Preparing Session Surface</h3>
          <p
            className={`app-splash-line splash-line ${
              isSplashLineVisible ? 'is-visible' : 'is-hidden'
            }`}
          >
            {splashLine}
          </p>
        </div>
      </div>,
      document.body
    )

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
              Live tabletop shell
            </div>

            <h2 className="auth-hero__title">VTT Chat.</h2>
            <p className="auth-hero__copy">
              A DM-grade, session-aware voice and chat platform built specifically for tabletop RPGs{' '}
              — because Discord was never designed for this.
            </p>

            <div className="auth-card-grid">
              <article className="auth-card">
                <span className="auth-card__icon material-symbols-outlined" aria-hidden="true">
                  admin_panel_settings
                </span>
                <div className="auth-card__body">
                  <p className="auth-card__eyebrow">Authority</p>
                  <h3 className="auth-card__title">DM-Controlled Session Gating</h3>
                  <p>
                    The DM controls table access, speaking presence, and when spectators can
                    observe.
                  </p>
                </div>
              </article>
              <article className="auth-card">
                <span className="auth-card__icon material-symbols-outlined" aria-hidden="true">
                  diversity_3
                </span>
                <div className="auth-card__body">
                  <p className="auth-card__eyebrow">Roles</p>
                  <h3 className="auth-card__title">Role-Specific Experience</h3>
                  <p>
                    DM, Player, and Spectator each get purpose-built permissions and workflow
                    surfaces.
                  </p>
                </div>
              </article>
              <article className="auth-card">
                <span className="auth-card__icon material-symbols-outlined" aria-hidden="true">
                  lock
                </span>
                <div className="auth-card__body">
                  <p className="auth-card__eyebrow">Privacy</p>
                  <h3 className="auth-card__title">Privacy Boundaries That Hold</h3>
                  <p>
                    Whispers, DM notes, and green-room state are enforced server-side rather than
                    hidden by UI only.
                  </p>
                </div>
              </article>
              <article className="auth-card">
                <span className="auth-card__icon material-symbols-outlined" aria-hidden="true">
                  timeline
                </span>
                <div className="auth-card__body">
                  <p className="auth-card__eyebrow">Flow</p>
                  <h3 className="auth-card__title">Built for Session Lifecycle</h3>
                  <p>
                    Green room, active play, and recap are one continuous session state instead of
                    disconnected channels.
                  </p>
                </div>
              </article>
              <article className="auth-card">
                <span className="auth-card__icon material-symbols-outlined" aria-hidden="true">
                  dashboard
                </span>
                <div className="auth-card__body">
                  <p className="auth-card__eyebrow">Integrated</p>
                  <h3 className="auth-card__title">One Surface for the Table</h3>
                  <p>
                    Voice, chat, notes, and presence stay synchronized so groups can run sessions
                    without tool switching.
                  </p>
                </div>
              </article>
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
      {splashOverlay}

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
