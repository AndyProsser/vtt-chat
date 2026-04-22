import type { CampaignRoomsResponse } from './types'

interface CampaignMovePlayerProps {
  rooms: CampaignRoomsResponse | null
  selectedMemberId: string
  targetRoomId: string
  moveBusyUserId: string | null
  onSelectedMemberChange: (memberId: string) => void
  onTargetRoomChange: (roomId: string) => void
  onMovePlayer: () => void
}

export function CampaignMovePlayer({
  rooms,
  selectedMemberId,
  targetRoomId,
  moveBusyUserId,
  onSelectedMemberChange,
  onTargetRoomChange,
  onMovePlayer,
}: CampaignMovePlayerProps) {
  return (
    <div className="campaign-move-player-block">
      <h4 className="campaign-rooms-title">Move Player Between Rooms</h4>
      <div className="campaign-move-player-controls">
        <select
          value={selectedMemberId}
          onChange={(event) => onSelectedMemberChange(event.target.value)}
          aria-label="Select player to move"
        >
          {(rooms?.members || []).map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.username} ({member.role})
            </option>
          ))}
        </select>

        <select
          value={targetRoomId}
          onChange={(event) => onTargetRoomChange(event.target.value)}
          aria-label="Select destination room"
        >
          {(rooms?.rooms || []).map((room) => (
            <option key={room.id} value={room.id}>
              {room.name} ({room.type})
            </option>
          ))}
        </select>

        <button
          className="admin-btn admin-btn-ghost"
          onClick={onMovePlayer}
          disabled={
            !rooms?.session || !selectedMemberId || !targetRoomId || Boolean(moveBusyUserId)
          }
        >
          {moveBusyUserId ? 'Moving...' : 'Move Player'}
        </button>
      </div>
    </div>
  )
}
