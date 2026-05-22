import type { PresenceState, RoomType, UUID } from '@shared'
import { getPresenceLabel, ROOM_PRESENCE_COPY } from '@/constants/roomPresence.constants'

interface AudioRoomOption {
  id: UUID
  name: string
  type: RoomType
}

interface ParticipantOption {
  userId: UUID
  username: string
  state: PresenceState
}

interface PendingMove {
  toRoomId: UUID
}

interface DMRoomMovementSectionProps {
  rooms: AudioRoomOption[]
  playersByRoom: Record<UUID, ParticipantOption[]>
  pendingRoomMoves: Record<UUID, PendingMove>
  draggedUserId: UUID | null
  onDragStart: (userId: UUID) => void
  onDragEnd: () => void
  onDrop: (userId: UUID, roomId: UUID) => void
}

export function DMRoomMovementSection({
  rooms,
  playersByRoom,
  pendingRoomMoves,
  draggedUserId,
  onDragStart,
  onDragEnd,
  onDrop,
}: DMRoomMovementSectionProps) {
  return (
    <section className="rounded-ui-md border border-ui-border p-2.5">
      <p className="mb-2 mt-0 font-semibold text-ui-primary">Room Movement (Drag and Drop)</p>
      <p className="mb-2 text-xs text-ui-secondary">
        Drag players between room columns. The UI applies optimistic state and waits for realtime
        confirmation before finalizing.
      </p>

      <div className="grid gap-2">
        {rooms.map((room) => (
          <section
            key={room.id}
            aria-label={`Drop Room ${room.name}`}
            onDragOver={(event) => {
              event.preventDefault()
            }}
            onDrop={(event) => {
              event.preventDefault()
              const droppedUserId = (event.dataTransfer.getData('text/plain') ||
                draggedUserId ||
                '') as UUID | ''
              if (droppedUserId) {
                onDrop(droppedUserId, room.id)
              }
            }}
            className="rounded-ui-sm border border-dashed border-slate-400 bg-ui-surface-subtle p-2"
          >
            <p className="mb-1.5 mt-0 font-semibold text-ui-primary">
              {room.name} ({room.type})
            </p>

            <div className="grid gap-1">
              {(playersByRoom[room.id] || []).map((participant) => {
                const pendingMove = pendingRoomMoves[participant.userId]
                return (
                  <button
                    key={participant.userId}
                    type="button"
                    draggable
                    aria-label={`Drag ${participant.username}`}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', participant.userId)
                      onDragStart(participant.userId)
                    }}
                    onDragEnd={onDragEnd}
                    className="cursor-grab rounded-ui-sm border border-ui-border-soft bg-ui-surface px-2 py-1.5 text-left text-sm text-ui-primary"
                  >
                    {participant.username} ({getPresenceLabel(participant.state)})
                    {pendingMove ? ' - moving...' : ''}
                  </button>
                )
              })}

              {(playersByRoom[room.id] || []).length === 0 ? (
                <p className="m-0 text-xs text-ui-muted">{ROOM_PRESENCE_COPY.noPlayers}</p>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}
