import { lazy, Suspense } from 'react'
import { LoginForm } from '@/components/auth/LoginForm'
import type { AuthState } from '@/hooks/useAuthSession'
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
  if (!props.auth.token || !props.auth.user) {
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
          <div className="auth-form-shell">
            <LoginForm apiUrl={props.apiUrl} onLoginSuccess={props.onLoginSuccess} />
          </div>
        </section>
      </div>
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
