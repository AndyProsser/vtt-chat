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
    <div className="space-y-1">
      <h4 className="mb-2 mt-0 text-base font-semibold text-ui-primary">Left Rail</h4>
      <p className="m-0 text-xs text-ui-secondary">
        User: <strong>{username}</strong>
      </p>
      <p className="m-0 text-xs text-ui-secondary">
        Persona: <strong>{role}</strong>
      </p>
      <p className="m-0 text-xs text-ui-secondary">
        Session: <strong>{sessionName}</strong>
      </p>
      <p className="m-0 text-xs text-ui-secondary">
        State: <strong>{sessionState}</strong>
      </p>

      <div className="mt-3 border-t border-ui-border pt-3">
        <p className="m-0 text-xs font-semibold text-ui-primary">Quick counts</p>
        <p className="mt-1 text-xs text-ui-secondary">Sessions in campaign: {sessionCount}</p>
        <p className="mt-1 text-xs text-ui-secondary">Rooms tracked: {roomCount}</p>
        <p className="mt-1 text-xs text-ui-secondary">Presence tracked: {presenceCount}</p>
      </div>
    </div>
  )
}
