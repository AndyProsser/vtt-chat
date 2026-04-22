import type { CampaignRoomsResponse } from './types'

interface CampaignRoomGridProps {
  rooms: CampaignRoomsResponse
  loading: boolean
  error: string | null
}

export function CampaignRoomGrid({ rooms, loading, error }: CampaignRoomGridProps) {
  return (
    <div className="campaign-rooms-block">
      <h4 className="campaign-rooms-title">
        {rooms.session ? `Rooms in session: ${rooms.session.name}` : 'No session rooms available'}
      </h4>

      {error && <p className="admin-inline-error campaign-room-error">{error}</p>}

      {loading ? (
        <p className="admin-inline-status">Loading room occupancy...</p>
      ) : rooms.rooms.length ? (
        <div className="campaign-room-grid">
          {rooms.rooms.map((room) => (
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
  )
}
