import { PresenceState, RoomType } from '@shared'
import type { UUID } from '@shared'
import type { RoomUser } from '@/types/room'

interface SessionRoomsStatusPanelProps {
  rooms: Array<{ id: UUID; name: string; type: RoomType }>
  roomMembersByRoomId: Record<UUID, RoomUser[]>
  presenceCount: number
}

function presenceClass(state: PresenceState): string {
  if (state === PresenceState.ONLINE) return 'session-presence-dot-online'
  if (state === PresenceState.SPEAKING) return 'session-presence-dot-speaking'
  if (state === PresenceState.TYPING) return 'session-presence-dot-typing'
  if (state === PresenceState.OFFLINE) return 'session-presence-dot-offline'
  return 'session-presence-dot-idle'
}

export function SessionRoomsStatusPanel({
  rooms,
  roomMembersByRoomId,
  presenceCount,
}: SessionRoomsStatusPanelProps) {
  return (
    <div className="session-rooms-panel" data-testid="session-rooms-panel">
      <p className="session-rooms-panel-title">Presence and Rooms</p>
      <p className="session-rooms-panel-subtitle">
        Live updates from room/presence websocket events.
      </p>

      <div className="session-rooms-panel-grid">
        {rooms.map((room) => {
          const members = roomMembersByRoomId[room.id] || []
          return (
            <div key={room.id} className="session-room-card">
              <p className="session-room-card-title">
                {room.name} <span>({room.type})</span>
              </p>
              <p className="session-room-card-count">Members: {members.length}</p>
              {members.length === 0 ? (
                <p className="session-room-card-empty">No members</p>
              ) : (
                members.map((member) => (
                  <p key={`${room.id}:${member.userId}`} className="session-room-card-member">
                    <span
                      className={`session-presence-dot ${presenceClass(member.presenceState)}`}
                    />
                    {member.username || member.userId} - {member.presenceState}
                  </p>
                ))
              )}
            </div>
          )
        })}
      </div>

      <p className="session-rooms-panel-footer">Total tracked users: {presenceCount}</p>
    </div>
  )
}
