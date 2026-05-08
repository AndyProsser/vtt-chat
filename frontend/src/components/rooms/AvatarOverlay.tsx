import type { PresenceState } from '@shared'
import { DEFAULT_AVATAR_META_LINES, ROOM_ROLE_LABELS } from '@/constants/roomPresence.constants'
import '../../styles/components/rooms/AvatarOverlay.css'

interface AvatarOverlayProps {
  username: string
  avatarUrl?: string | null
  roleLabel?: 'DM' | 'PLAYER'
  metaLine?: string
  presenceState?: PresenceState
  isSpeaking?: boolean
  isMuted?: boolean
}

function initialFor(name: string): string {
  const normalized = name.trim()
  return normalized ? normalized.charAt(0).toUpperCase() : '?'
}

export function AvatarOverlay({
  username,
  avatarUrl,
  roleLabel,
  metaLine,
  isMuted = false,
}: AvatarOverlayProps) {
  const resolvedMetaLine =
    metaLine?.trim() ||
    (roleLabel === ROOM_ROLE_LABELS.dm
      ? DEFAULT_AVATAR_META_LINES.dm
      : DEFAULT_AVATAR_META_LINES.player)

  return (
    <div className="avatar-overlay" data-testid="avatar-overlay">
      <div className="avatar-glyph" aria-hidden="true">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="avatar-glyph__image" />
        ) : (
          initialFor(username)
        )}
        {isMuted ? (
          <span className="avatar-muted-badge" aria-label="Muted microphone" role="img">
            <span className="material-symbols-outlined" aria-hidden="true">
              mic_off
            </span>
          </span>
        ) : null}
      </div>
      <div className="avatar-meta">
        <div className="avatar-meta-headline">
          <span className="avatar-name">{username}</span>
          {roleLabel ? <span className="avatar-role-chip">{roleLabel}</span> : null}
        </div>
        <div className="avatar-meta-status">
          <span className="avatar-meta-subline">{resolvedMetaLine}</span>
        </div>
      </div>
    </div>
  )
}
