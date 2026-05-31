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

type GroupMemberSharedProfileHoverCardProps = {
  sessionId: UUID
  currentUserId: UUID
  room: GroupPanelGroupWithParticipants
  member: GroupParticipantWithGroupId | null
  activeTakeoverUserId?: UUID | null
  anchorRect: HoverAnchorRect | null
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
  getParticipantMetaLine,
  getStatEntries,
  getResolvedGroupEnvironmentName,
  onMouseEnter,
  onMouseLeave,
}: GroupMemberSharedProfileHoverCardProps) {
  if (!member || !anchorRect || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      className="room-selector-profile-tooltip"
      style={{
        position: 'fixed',
        zIndex: 1200,
        width: 320,
        left: Math.max(
          8,
          Math.min(window.innerWidth - 328, anchorRect.left + anchorRect.width / 2 - 160)
        ),
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
