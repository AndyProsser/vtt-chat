import { RoomType, type PresenceState, type UUID } from '@shared'
import { DEFAULT_AVATAR_META_LINES, ROOM_ROLE_LABELS } from '@/constants/roomPresence.constants'
import { SpeakingIndicator } from './SpeakingIndicator'
import '@/styles/components/workspaces/session/rooms/AvatarOverlay.css'

interface AvatarOverlayProps {
  username: string
  avatarUrl?: string | null
  roleLabel?: 'DM' | 'PLAYER' | 'SPECTATOR'
  metaLine?: string
  presenceState?: PresenceState
  isMuted?: boolean
  isGhost?: boolean
  /**
   * Speaking-indicator wiring. When provided, a leaf SpeakingIndicator
   * subscribes directly to the per-user speaking bits from the store.
   * The parent does not see speaking changes and is not re-rendered when
   * this user starts or stops speaking — the only DOM change is a single
   * child <span> mounting/unmounting on the avatar glyph.
   *
   * Omit to render the avatar without any speaking visualisation.
   */
  speaking?: {
    sessionId: UUID
    userId: UUID
    isSelf?: boolean
    roomType?: RoomType
  }
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
  isGhost = false,
  speaking,
}: AvatarOverlayProps) {
  const resolvedMetaLine =
    metaLine?.trim() ||
    (roleLabel === ROOM_ROLE_LABELS.dm
      ? DEFAULT_AVATAR_META_LINES.dm
      : DEFAULT_AVATAR_META_LINES.player)

  return (
    <div className="avatar-overlay" data-testid="avatar-overlay">
      <div className={`avatar-glyph ${isGhost ? 'avatar-glyph--ghost' : ''}`} aria-hidden="true">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="avatar-glyph__image" />
        ) : (
          initialFor(username)
        )}
        {speaking ? (
          <SpeakingIndicator
            sessionId={speaking.sessionId}
            userId={speaking.userId}
            isSelf={Boolean(speaking.isSelf)}
            isMuted={isMuted}
            roomType={speaking.roomType ?? RoomType.GROUP}
          />
        ) : null}
        {isMuted ? (
          <span className="avatar-muted-badge" aria-label="Muted microphone" role="img">
            <span className="material-symbols-outlined" aria-hidden="true">
              mic_off
            </span>
          </span>
        ) : null}
        {isGhost ? (
          <span className="avatar-ghost-badge" aria-label="Ghost mode" role="img">
            <span className="material-symbols-outlined" aria-hidden="true">
              visibility_off
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
