import { memo, type PointerEvent } from 'react'
import { RoomType, type UUID } from '@shared'
import { DEFAULT_AVATAR_META_LINES, ROOM_ROLE_LABELS } from '@/constants/roomPresence.constants'
import { SpeakingIndicator } from './SpeakingIndicator'
import { GhostIndicator } from './GhostIndicator'
import { MicMutedIndicator } from './MicMutedIndicator'
import { ConditionBadge } from './ConditionBadge'
import { DistanceBadge } from './DistanceBadge'
import '@/styles/components/workspaces/session/rooms/AvatarOverlay.css'

interface AvatarOverlayProps {
  username: string
  avatarUrl?: string | null
  roleLabel?: 'DM' | 'PLAYER' | 'SPECTATOR'
  metaLine?: string
  /**
   * Highlights the role chip while the shared profile hover card is open.
   */
  highlightRoleChip?: boolean
  /**
   * Optional pointer handlers used by GroupMemberList to drive a shared
   * profile hover card from the role chip only.
   */
  onRoleChipPointerEnter?: (event: PointerEvent<HTMLSpanElement>) => void
  onRoleChipPointerLeave?: () => void
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

function AvatarOverlayComponent({
  username,
  avatarUrl,
  roleLabel,
  metaLine,
  highlightRoleChip,
  onRoleChipPointerEnter,
  onRoleChipPointerLeave,
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
            <ConditionBadge userId={presence.userId} />
            <DistanceBadge userId={presence.userId} />
          </>
        ) : null}
      </div>
      <div className="avatar-meta">
        <div className="avatar-meta-headline">
          <span className="avatar-name">{username}</span>
          {roleLabel ? (
            <span
              className={`avatar-role-chip ${highlightRoleChip ? 'avatar-role-chip--hovered' : ''}`}
              onPointerEnter={onRoleChipPointerEnter}
              onPointerLeave={onRoleChipPointerLeave}
            >
              {roleLabel}
            </span>
          ) : null}
        </div>
        <div className="avatar-meta-status">
          <span className="avatar-meta-subline">{resolvedMetaLine}</span>
        </div>
      </div>
    </div>
  )
}

function areAvatarOverlayPropsEqual(
  previous: AvatarOverlayProps,
  next: AvatarOverlayProps
): boolean {
  const previousPresence = previous.presence
  const nextPresence = next.presence

  return (
    previous.username === next.username &&
    previous.avatarUrl === next.avatarUrl &&
    previous.roleLabel === next.roleLabel &&
    previous.metaLine === next.metaLine &&
    previous.highlightRoleChip === next.highlightRoleChip &&
    previous.onRoleChipPointerEnter === next.onRoleChipPointerEnter &&
    previous.onRoleChipPointerLeave === next.onRoleChipPointerLeave &&
    previousPresence?.sessionId === nextPresence?.sessionId &&
    previousPresence?.userId === nextPresence?.userId &&
    previousPresence?.isSelf === nextPresence?.isSelf &&
    previousPresence?.roomType === nextPresence?.roomType
  )
}

export const AvatarOverlay = memo(AvatarOverlayComponent, areAvatarOverlayPropsEqual)
