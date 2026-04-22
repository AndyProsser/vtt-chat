import { PresenceState } from '@shared'
import '../../styles/components/rooms/AvatarOverlay.css'

interface AvatarOverlayProps {
  username: string
  roleLabel?: 'DM' | 'PLAYER'
  presenceState: PresenceState
  isSpeaking?: boolean
  isMuted?: boolean
  condition?: string
}

function presenceClass(state: PresenceState): string {
  if (state === PresenceState.SPEAKING) return 'avatar-presence-speaking'
  if (state === PresenceState.ONLINE) return 'avatar-presence-online'
  if (state === PresenceState.TYPING) return 'avatar-presence-typing'
  if (state === PresenceState.OFFLINE) return 'avatar-presence-offline'
  return 'avatar-presence-idle'
}

function initialFor(name: string): string {
  const normalized = name.trim()
  return normalized ? normalized.charAt(0).toUpperCase() : '?'
}

export function AvatarOverlay({
  username,
  roleLabel,
  presenceState,
  isSpeaking = false,
  isMuted = false,
  condition,
}: AvatarOverlayProps) {
  return (
    <div className="avatar-overlay" data-testid="avatar-overlay">
      <div className="avatar-glyph" aria-hidden="true">
        {initialFor(username)}
      </div>
      <div className="avatar-meta">
        <div className="avatar-meta-headline">
          <span className="avatar-name">{username}</span>
          {roleLabel ? <span className="avatar-role-chip">{roleLabel}</span> : null}
        </div>
        <div className="avatar-meta-status">
          <span className={`avatar-presence-dot ${presenceClass(presenceState)}`} />
          <span>{presenceState}</span>
          {isSpeaking ? <span className="avatar-state-chip speaking">Speaking</span> : null}
          {isMuted ? <span className="avatar-state-chip muted">Muted</span> : null}
          {condition ? <span className="avatar-state-chip condition">{condition}</span> : null}
        </div>
      </div>
    </div>
  )
}
