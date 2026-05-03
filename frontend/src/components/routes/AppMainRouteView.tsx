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
  onLoginSuccess: (token: string, user: { id: UUID; username: string; role: Role }) => void
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

            <h2 className="auth-hero__title">Command the table from a real surface.</h2>
            <p className="auth-hero__copy">
              The main app is meant to feel like a restrained tactical console: room roster on the
              left, conversation and notes in the centre, and secondary tools on the right. This
              entry screen should set that expectation before you authenticate.
            </p>

            <div className="auth-hero__frame" aria-hidden="true">
              <section className="auth-panel">
                <p className="auth-panel__eyebrow">Left Rail</p>
                <h3 className="auth-panel__title">Rooms & Presence</h3>
                <ul className="auth-room-list">
                  <li>
                    <div>
                      <strong>Main Hall</strong>
                      <small>Thorin, Lyra, Mira</small>
                    </div>
                    <span className="auth-room-state active">Live</span>
                  </li>
                  <li>
                    <div>
                      <strong>Group One</strong>
                      <small>Side scene with split audio</small>
                    </div>
                    <span className="auth-room-state idle">Idle</span>
                  </li>
                  <li>
                    <div>
                      <strong>Private Thread</strong>
                      <small>DM + player whisper room</small>
                    </div>
                    <span className="auth-room-state active">Open</span>
                  </li>
                </ul>
              </section>

              <section className="auth-stack">
                <div>
                  <p className="auth-stack__eyebrow">Center Pane</p>
                  <h3 className="auth-stack__title">Chat, notes, and room control</h3>
                </div>

                <div className="auth-toolbar-strip">
                  <span>Chat</span>
                  <span>Notes</span>
                  <span>Whispers</span>
                </div>

                <ul className="auth-tool-list">
                  <li>
                    <div>
                      <strong>Message composer</strong>
                      <small>In-character chat, whisper targets, and note publishing.</small>
                    </div>
                    <span className="auth-tool-state ready">Ready</span>
                  </li>
                  <li>
                    <div>
                      <strong>Session timeline</strong>
                      <small>Presence, room events, and system messages aligned in one view.</small>
                    </div>
                    <span className="auth-tool-state live">Live</span>
                  </li>
                  <li>
                    <div>
                      <strong>DM tools rail</strong>
                      <small>Rooms, audio, search, journal, history, and settings tabs.</small>
                    </div>
                    <span className="auth-tool-state ready">Tabs</span>
                  </li>
                </ul>
              </section>

              <aside className="auth-rail">
                <div className="auth-rail__tab">Rooms</div>
                <div className="auth-rail__tab">Audio</div>
                <div className="auth-rail__tab">Notes</div>
                <div className="auth-rail__tab">History</div>
              </aside>
            </div>

            <div className="auth-card-grid">
              <article className="auth-card">
                <p className="auth-card__eyebrow">Voice</p>
                <h3 className="auth-card__title">LiveKit rooms</h3>
                <p>
                  Spatial voice channels, quick room switching, and session-aware audio controls.
                </p>
              </article>
              <article className="auth-card">
                <p className="auth-card__eyebrow">State</p>
                <h3 className="auth-card__title">Event-driven sync</h3>
                <p>
                  Chat, notes, rooms, and presence stay aligned through the same shared pipeline.
                </p>
              </article>
              <article className="auth-card">
                <p className="auth-card__eyebrow">Control</p>
                <h3 className="auth-card__title">DM-first workflow</h3>
                <p>
                  Campaign context, transitions, and side-panel tools are surfaced without clutter.
                </p>
              </article>
            </div>

            <section className="auth-credential-card">
              <p className="auth-card__eyebrow">Smoke-test access</p>
              <ul className="auth-credential-list">
                <li>
                  <div>
                    <strong>Username</strong>
                    <small>Any 3-32 character value using letters, numbers, or underscores.</small>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>Campaign Role</strong>
                    <small>
                      Account identity is user-level. DM, Player, and Spectator are campaign-scoped
                      membership roles.
                    </small>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>Password</strong>
                    <small>Not required in this local authentication flow.</small>
                  </div>
                </li>
              </ul>
            </section>
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
