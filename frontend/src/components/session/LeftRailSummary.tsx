import type { Role } from '@shared'
import { SessionState } from '@shared'

interface LeftRailSummaryProps {
  role: Role
  username: string
  sessionName: string
  sessionState: SessionState
  sessionCount: number
  roomCount: number
  presenceCount: number
}

export function LeftRailSummary({
  role,
  username,
  sessionName,
  sessionState,
  sessionCount,
  roomCount,
  presenceCount,
}: LeftRailSummaryProps) {
  return (
    <div>
      <h4 style={{ margin: '0 0 0.5rem 0' }}>Left Rail</h4>
      <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
        User: <strong>{username}</strong>
      </p>
      <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
        Persona: <strong>{role}</strong>
      </p>
      <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
        Session: <strong>{sessionName}</strong>
      </p>
      <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
        State: <strong>{sessionState}</strong>
      </p>

      <div
        style={{
          marginTop: '0.75rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid #e2e8f0',
        }}
      >
        <p style={{ margin: 0, fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>
          Quick counts
        </p>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>
          Sessions in campaign: {sessionCount}
        </p>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>
          Rooms tracked: {roomCount}
        </p>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>
          Presence tracked: {presenceCount}
        </p>
      </div>
    </div>
  )
}
