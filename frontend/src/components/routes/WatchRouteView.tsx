import { SpectatorInvitePage } from '@/components/watch/SpectatorInvitePage'
import { Role } from '@shared'
import type { UUID } from '@shared'

type WatchRouteViewProps = {
  apiUrl: string
  inviteCode: string
  authToken: string | null
  authType: 'GUEST' | 'FULL' | null
  onAuthenticated: (
    token: string,
    user: { id: UUID; username: string; role: Role },
    authType: 'GUEST' | 'FULL'
  ) => void
}

export function WatchRouteView(props: WatchRouteViewProps) {
  return (
    <SpectatorInvitePage
      apiUrl={props.apiUrl}
      inviteCode={props.inviteCode}
      authToken={props.authToken}
      authType={props.authType}
      onAuthenticated={props.onAuthenticated}
    />
  )
}
