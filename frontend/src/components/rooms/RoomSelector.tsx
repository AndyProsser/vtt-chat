import { RoomType } from '@shared'
import type { UUID } from '@shared'
import { PresenceState } from '@shared'
import { AvatarOverlay } from './AvatarOverlay'
import { Icon } from '../ui/Icon'
import '../../styles/components/rooms/RoomSelector.css'

export interface RoomSelectorRoom {
  id: UUID
  name: string
  type: RoomType
  memberCount: number
}

export interface RoomParticipantStatus {
  userId: UUID
  username: string
  presenceState: PresenceState
  roleLabel?: 'DM' | 'PLAYER'
  isMuted?: boolean
  isSpeaking?: boolean
  condition?: string
}

interface RoomSelectorProps {
  rooms: RoomSelectorRoom[]
  selectedRoomId?: UUID | ''
  onSelectRoom: (roomId: UUID) => void
  participants: RoomParticipantStatus[]
}

export function RoomSelector({
  rooms,
  selectedRoomId,
  onSelectRoom,
  participants,
}: RoomSelectorProps) {
  const formatRoomTypeLabel = (type: RoomType): string => {
    if (type === RoomType.MAIN) return 'Main'
    if (type === RoomType.BREAKOUT) return 'Breakout'
    if (type === RoomType.PRIVATE) return 'Private'
    return type
  }

  return (
    <section className="room-selector" aria-label="Room Selector">
      <header className="room-selector-header">
        <h4>
          <Icon name="rooms" /> Voice Channels
        </h4>
        <span>{rooms.length}</span>
      </header>

      <div className="room-selector-list" role="list" aria-label="Session rooms">
        {rooms.length === 0 ? (
          <p className="room-selector-empty">No rooms available.</p>
        ) : (
          rooms.map((room) => {
            const selected = room.id === selectedRoomId
            return (
              <button
                key={room.id}
                type="button"
                className={`room-selector-item ${selected ? 'selected' : ''}`}
                aria-label={`Select room ${room.name}`}
                aria-pressed={selected}
                onClick={() => onSelectRoom(room.id)}
              >
                <span className="room-selector-item-name">
                  <Icon name="voice" />
                  {room.name}
                </span>
                <span className="room-selector-item-meta">
                  {formatRoomTypeLabel(room.type)} · {room.memberCount}
                </span>
              </button>
            )
          })
        )}
      </div>

      <div className="room-selector-members" aria-live="polite">
        <h5>
          <Icon name="users" /> Connected Members
        </h5>
        {participants.length === 0 ? (
          <p className="room-selector-empty">No members in selected room.</p>
        ) : (
          <div className="room-selector-members-list">
            {participants.map((member) => (
              <AvatarOverlay
                key={member.userId}
                username={member.username}
                roleLabel={member.roleLabel}
                presenceState={member.presenceState}
                isMuted={member.isMuted}
                isSpeaking={member.isSpeaking}
                condition={member.condition}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
