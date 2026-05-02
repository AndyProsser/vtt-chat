import { SpectatorInvitePage } from '@/components/auth/SpectatorInvitePage'
import { Role } from '@shared'
import type { UUID } from '@shared'

type WatchRouteViewProps = {
  apiUrl: string
  inviteCode: string
  onAuthenticated: (token: string, user: { id: UUID; username: string; role: Role }) => void
}

export function WatchRouteView(props: WatchRouteViewProps) {
  return (
    <SpectatorInvitePage
      apiUrl={props.apiUrl}
      inviteCode={props.inviteCode}
      onAuthenticated={props.onAuthenticated}
    />
  )
}
