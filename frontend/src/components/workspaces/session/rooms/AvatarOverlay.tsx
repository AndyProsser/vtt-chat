import { RoomType, type UUID } from '@shared'
import { DEFAULT_AVATAR_META_LINES, ROOM_ROLE_LABELS } from '@/constants/roomPresence.constants'
import { SpeakingIndicator } from './SpeakingIndicator'
import { GhostIndicator } from './GhostIndicator'
import { MicMutedIndicator } from './MicMutedIndicator'
import '@/styles/components/workspaces/session/rooms/AvatarOverlay.css'

interface AvatarOverlayProps {
  username: string
  avatarUrl?: string | null
  roleLabel?: 'DM' | 'PLAYER' | 'SPECTATOR'
  metaLine?: string
  /**
   * Per-user presence wiring. When provided, leaf indicators
   * (SpeakingIndicator, MicMutedIndicator, GhostIndicator) subscribe directly
   * to the per-user store bits. The parent does not see speaking, mute, or
   * ghost flips and is not re-rendered when any of those change.
   *
   * The `.avatar-glyph--ghost` modifier is now driven by CSS
   * `:has(.avatar-ghost-badge)` so the parent never needs the ghost bit.
   *
   * Omit `presence` to render the avatar without any presence leaves.
   */
  presence?: {
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
  presence,
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
        {presence ? (
          <>
            <SpeakingIndicator
              sessionId={presence.sessionId}
              userId={presence.userId}
              isSelf={Boolean(presence.isSelf)}
              roomType={presence.roomType ?? RoomType.GROUP}
            />
            <MicMutedIndicator
              sessionId={presence.sessionId}
              userId={presence.userId}
              isSelf={Boolean(presence.isSelf)}
              variant="avatar"
            />
            <GhostIndicator sessionId={presence.sessionId} userId={presence.userId} />
          </>
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
