import { InviteJoinPage } from '@/components/guest/InviteJoinPage'
import { Role } from '@shared'
import type { UUID } from '@shared'

type JoinRouteViewProps = {
  apiUrl: string
  inviteCode: string
  authToken: string | null
  onAuthenticated?: (token: string, user: { id: UUID; username: string; role: Role }) => void
}

export function JoinRouteView(props: JoinRouteViewProps) {
  return (
    <InviteJoinPage
      apiUrl={props.apiUrl}
      inviteCode={props.inviteCode}
      authToken={props.authToken}
      onAuthenticated={props.onAuthenticated}
    />
  )
}
