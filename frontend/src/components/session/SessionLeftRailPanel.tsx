import type { Role, SessionState, UUID } from '@shared'
import { PresenceState, RoomType } from '@shared'
import type { AudioDMOverride } from '../../state/audioSlice'
import type { RoomUser } from '../../state/roomSlice'
import { LeftRailSummary } from './LeftRailSummary'
import { RoomSelector } from '../rooms/RoomSelector'

interface SessionLeftRailPanelProps {
  role: Role
  username: string
  sessionName: string
  sessionState: SessionState
  sessionCount: number
  roomCount: number
  presenceCount: number
  dmUserId: UUID
  currentUserId: UUID
  rooms: Array<{ id: UUID; name: string; type: RoomType }>
  roomMembersByRoomId: Record<UUID, RoomUser[]>
  selectedRoomId: UUID | ''
  onSelectRoom: (roomId: UUID) => void
  dmOverrides: Map<UUID, AudioDMOverride>
  currentConditionName?: string
}

export function SessionLeftRailPanel({
  role,
  username,
  sessionName,
  sessionState,
  sessionCount,
  roomCount,
  presenceCount,
  dmUserId,
  currentUserId,
  rooms,
  roomMembersByRoomId,
  selectedRoomId,
  onSelectRoom,
  dmOverrides,
  currentConditionName,
}: SessionLeftRailPanelProps) {
  const selectedMembers = selectedRoomId ? roomMembersByRoomId[selectedRoomId] || [] : []

  return (
    <div className="session-left-rail" data-testid="session-left-rail">
      <LeftRailSummary
        role={role}
        username={username}
        sessionName={sessionName}
        sessionState={sessionState}
        sessionCount={sessionCount}
        roomCount={roomCount}
        presenceCount={presenceCount}
      />
      <RoomSelector
        rooms={rooms.map((room) => ({
          id: room.id,
          name: room.name,
          type: room.type,
          memberCount: (roomMembersByRoomId[room.id] || []).length,
        }))}
        selectedRoomId={selectedRoomId}
        onSelectRoom={onSelectRoom}
        participants={selectedMembers.map((member) => {
          const dmOverride = dmOverrides.get(member.userId)
          return {
            userId: member.userId,
            username: member.username || member.userId,
            roleLabel: member.userId === dmUserId ? ('DM' as const) : ('PLAYER' as const),
            presenceState: member.presenceState,
            isMuted: dmOverride?.overrideType === 'MUTE',
            isSpeaking: member.presenceState === PresenceState.SPEAKING,
            condition:
              currentConditionName && member.userId === currentUserId
                ? currentConditionName
                : undefined,
          }
        })}
      />
    </div>
  )
}
