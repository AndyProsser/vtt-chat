import { createPortal } from 'react-dom'
import type { UUID } from '@shared'
import { GroupMemberProfileCard } from './GroupMemberProfileCard'
import type {
  GroupPanelGroupWithParticipants,
  GroupParticipantWithGroupId,
} from '@/types/groupPanel'

type HoverAnchorRect = {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

type HoverContainerRect = {
  left: number
  right: number
}

type GroupMemberSharedProfileHoverCardProps = {
  sessionId: UUID
  currentUserId: UUID
  room: GroupPanelGroupWithParticipants
  member: GroupParticipantWithGroupId | null
  activeTakeoverUserId?: UUID | null
  anchorRect: HoverAnchorRect | null
  containerRect: HoverContainerRect | null
  getParticipantMetaLine: (member: GroupParticipantWithGroupId) => string
  getStatEntries: (member: GroupParticipantWithGroupId) => Array<[string, unknown]>
  getResolvedGroupEnvironmentName: (room: GroupPanelGroupWithParticipants) => string
  onMouseEnter: () => void
  onMouseLeave: () => void
}

/**
 * Shared profile hover card rendered once per member list.
 * It is anchored to the currently hovered role chip so row content
 * stays drag-friendly and we avoid per-row tooltip subtree churn.
 */
export function GroupMemberSharedProfileHoverCard({
  sessionId,
  currentUserId,
  room,
  member,
  activeTakeoverUserId,
  anchorRect,
  containerRect,
  getParticipantMetaLine,
  getStatEntries,
  getResolvedGroupEnvironmentName,
  onMouseEnter,
  onMouseLeave,
}: GroupMemberSharedProfileHoverCardProps) {
  if (!member || !anchorRect || typeof document === 'undefined') {
    return null
  }

  const cardWidth = 320
  const edgePadding = 8
  const leftNudge = 18

  // Keep the card inside the room-list container when available.
  const minLeft = containerRect ? containerRect.left + edgePadding : edgePadding
  const maxLeft = containerRect
    ? containerRect.right - cardWidth - edgePadding
    : window.innerWidth - cardWidth - edgePadding

  // Prefer left-of-pill placement to avoid covering the next role pill below.
  const preferredLeft = anchorRect.left - cardWidth - edgePadding - leftNudge
  const clampedLeft = Math.max(minLeft, Math.min(maxLeft, preferredLeft))

  return createPortal(
    <div
      className="room-selector-profile-tooltip"
      style={{
        position: 'fixed',
        zIndex: 1200,
        width: cardWidth,
        left: clampedLeft,
        top:
          anchorRect.bottom + 8 + 220 <= window.innerHeight - 8
            ? anchorRect.bottom + 8
            : Math.max(8, anchorRect.top - 228),
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <GroupMemberProfileCard
        sessionId={sessionId}
        isSelf={member.userId === currentUserId}
        member={member}
        metaLine={getParticipantMetaLine(member)}
        statEntries={getStatEntries(member)}
        environmentName={getResolvedGroupEnvironmentName(room)}
        activeTakeover={activeTakeoverUserId === member.userId}
      />
    </div>,
    document.body
  )
}
