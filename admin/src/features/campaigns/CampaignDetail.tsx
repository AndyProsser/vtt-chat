import { CampaignKVGrid } from './CampaignKVGrid'
import { CampaignMovePlayer } from './CampaignMovePlayer'
import { CampaignRoomGrid } from './CampaignRoomGrid'
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
          <CampaignKVGrid campaign={selectedCampaign} />

          <CampaignRoomGrid
            rooms={
              selectedCampaignRooms ?? {
                campaign: { id: '', name: '' },
                session: null,
                rooms: [],
                members: [],
              }
            }
            loading={roomsLoading}
            error={roomsError}
          />

          <CampaignMovePlayer
            rooms={selectedCampaignRooms}
            selectedMemberId={selectedMemberId}
            targetRoomId={targetRoomId}
            moveBusyUserId={moveBusyUserId}
            onSelectedMemberChange={onSelectedMemberChange}
            onTargetRoomChange={onTargetRoomChange}
            onMovePlayer={onMovePlayer}
          />
        </>
      )}
    </section>
  )
}
