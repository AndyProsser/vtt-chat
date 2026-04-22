import type { CampaignRoomsResponse, CampaignSummary } from './types'

interface CampaignDetailProps {
  selectedCampaign: CampaignSummary | null
  selectedCampaignRooms: CampaignRoomsResponse | null
  roomsLoading: boolean
  roomsError: string | null
  selectedMemberId: string
  targetRoomId: string
  moveBusyUserId: string | null
  onSelectedMemberChange: (memberId: string) => void
  onTargetRoomChange: (roomId: string) => void
  onMovePlayer: () => void
}

export function CampaignDetail({
  selectedCampaign,
  selectedCampaignRooms,
  roomsLoading,
  roomsError,
  selectedMemberId,
  targetRoomId,
  moveBusyUserId,
  onSelectedMemberChange,
  onTargetRoomChange,
  onMovePlayer,
}: CampaignDetailProps) {
  return (
    <section className="admin-card campaign-detail-card">
      <div className="admin-detail-header">
        <h3>Selected Campaign Detail</h3>
        {selectedCampaign && (
          <span className="campaign-detail-meta">DM: {selectedCampaign.currentDm.username}</span>
        )}
      </div>

      {!selectedCampaign ? (
        <p className="admin-page-subtitle">Select a campaign to inspect rooms and occupancy.</p>
      ) : (
        <>
          <div className="kv-grid campaign-kv-grid">
            <div>
              <strong>Campaign:</strong> {selectedCampaign.name}
            </div>
            <div>
              <strong>Invite Code:</strong> {selectedCampaign.inviteCode}
            </div>
            <div>
              <strong>Members:</strong> {selectedCampaign.memberCount}
            </div>
            <div>
              <strong>Total Sessions:</strong> {selectedCampaign.sessionCount}
            </div>
            <div>
              <strong>Lifecycle:</strong> {selectedCampaign.isArchived ? 'Archived' : 'Active'}
            </div>
          </div>

          {roomsError && <p className="admin-inline-error campaign-room-error">{roomsError}</p>}

          <div className="campaign-rooms-block">
            <h4 className="campaign-rooms-title">
              {selectedCampaignRooms?.session
                ? `Rooms in session: ${selectedCampaignRooms.session.name}`
                : 'No session rooms available'}
            </h4>

            {roomsLoading ? (
              <p className="admin-inline-status">Loading room occupancy...</p>
            ) : selectedCampaignRooms?.rooms.length ? (
              <div className="campaign-room-grid">
                {selectedCampaignRooms.rooms.map((room) => (
                  <article key={room.id} className="campaign-room-card">
                    <div className="campaign-room-card-header">
                      <strong>{room.name}</strong>
                      <span>{room.type}</span>
                    </div>
                    <p>Occupants: {room.occupantCount}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="admin-page-subtitle">No rooms found for the selected campaign session.</p>
            )}
          </div>

          <div className="campaign-move-player-block">
            <h4 className="campaign-rooms-title">Move Player Between Rooms</h4>
            <div className="campaign-move-player-controls">
              <select
                value={selectedMemberId}
                onChange={(event) => onSelectedMemberChange(event.target.value)}
                aria-label="Select player to move"
              >
                {(selectedCampaignRooms?.members || []).map((member) => (
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
                {(selectedCampaignRooms?.rooms || []).map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name} ({room.type})
                  </option>
                ))}
              </select>

              <button
                className="admin-btn admin-btn-ghost"
                onClick={onMovePlayer}
                disabled={
                  !selectedCampaignRooms?.session ||
                  !selectedMemberId ||
                  !targetRoomId ||
                  Boolean(moveBusyUserId)
                }
              >
                {moveBusyUserId ? 'Moving...' : 'Move Player'}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
