import { RoomType } from '@shared'
import type { UUID } from '@shared'
import type { RoomUser } from '@/types/room'
import {
  getPresenceDotClass,
  getPresenceLabel,
  ROOM_PRESENCE_COPY,
} from '../../constants/roomPresence.constants'

interface SessionRoomsStatusPanelProps {
  rooms: Array<{ id: UUID; name: string; type: RoomType }>
  roomMembersByRoomId: Record<UUID, RoomUser[]>
  presenceCount: number
}

export function SessionRoomsStatusPanel({
  rooms,
  roomMembersByRoomId,
  presenceCount,
}: SessionRoomsStatusPanelProps) {
  return (
    <div className="session-rooms-panel" data-testid="session-rooms-panel">
      <p className="session-rooms-panel-title">{ROOM_PRESENCE_COPY.presencePanelTitle}</p>
      <p className="session-rooms-panel-subtitle">{ROOM_PRESENCE_COPY.presencePanelSubtitle}</p>

      <div className="session-rooms-panel-grid">
        {rooms.map((room) => {
          const members = roomMembersByRoomId[room.id] || []
          return (
            <div key={room.id} className="session-room-card">
              <p className="session-room-card-title">
                {room.name} <span>({room.type})</span>
              </p>
              <p className="session-room-card-count">
                {ROOM_PRESENCE_COPY.membersLabel}: {members.length}
              </p>
              {members.length === 0 ? (
                <p className="session-room-card-empty">{ROOM_PRESENCE_COPY.noMembers}</p>
              ) : (
                members.map((member) => (
                  <p key={`${room.id}:${member.userId}`} className="session-room-card-member">
                    <span
                      className={`session-presence-dot ${getPresenceDotClass(member.presenceState)}`}
                    />
                    {member.username || member.userId} - {getPresenceLabel(member.presenceState)}
                  </p>
                ))
              )}
            </div>
          )
        })}
      </div>
      <p className="session-rooms-panel-footer">
        {ROOM_PRESENCE_COPY.totalTrackedUsersLabel}: {presenceCount}
      </p>
    </div>
  )
}
