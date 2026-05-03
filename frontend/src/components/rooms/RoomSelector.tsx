import { useMemo, useState } from 'react'
import { RoomType } from '@shared'
import type { UUID } from '@shared'
import { PresenceState } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../core-ui'
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
  avatarUrl?: string | null
  characterName?: string | null
  playerName?: string | null
  characterClass?: string | null
  characterSubclass?: string | null
  characterRace?: string | null
  level?: number | null
  characterStats?: Record<string, unknown> | null
  presenceState: PresenceState
  roleLabel?: 'DM' | 'PLAYER'
  isMuted?: boolean
  isSpeaking?: boolean
  condition?: string
}

interface RoomSelectorRoomWithParticipants extends RoomSelectorRoom {
  participants: RoomParticipantStatus[]
}

interface RoomSelectorProps {
  apiUrl: string
  token: string
  canManageRooms: boolean
  rooms: RoomSelectorRoomWithParticipants[]
  selectedRoomId?: UUID | ''
  onSelectRoom: (roomId: UUID) => void
}

export function RoomSelector({
  apiUrl,
  token,
  canManageRooms,
  rooms,
  selectedRoomId,
  onSelectRoom,
}: RoomSelectorProps) {
  const [draggedUserId, setDraggedUserId] = useState<UUID | null>(null)
  const [pendingRoomMoves, setPendingRoomMoves] = useState<Record<UUID, UUID>>({})
  const [moveError, setMoveError] = useState<string | null>(null)

  const formatRoomTypeLabel = (type: RoomType): string => {
    if (type === RoomType.MAIN) return 'Main'
    if (type === RoomType.BREAKOUT) return 'Breakout'
    if (type === RoomType.PRIVATE) return 'Private'
    return type
  }

  const baseParticipants = useMemo(
    () =>
      rooms.flatMap((room) =>
        room.participants.map((participant) => ({ ...participant, roomId: room.id }))
      ),
    [rooms]
  )

  const displayedParticipantsByRoom = useMemo(() => {
    const next: Record<string, RoomParticipantStatus[]> = {}

    for (const room of rooms) {
      next[room.id] = []
    }

    for (const participant of baseParticipants) {
      const targetRoomId = pendingRoomMoves[participant.userId] || participant.roomId
      if (!next[targetRoomId]) {
        next[targetRoomId] = []
      }
      next[targetRoomId].push(participant)
    }

    return next
  }, [baseParticipants, pendingRoomMoves, rooms])

  const handleMoveParticipant = async (userId: UUID, toRoomId: UUID) => {
    setMoveError(null)
    setPendingRoomMoves((state) => ({ ...state, [userId]: toRoomId }))

    try {
      const response = await fetch(`${apiUrl}/api/rooms/${toRoomId}/move-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to move participant')
      }
    } catch (error) {
      setPendingRoomMoves((state) => {
        const next = { ...state }
        delete next[userId]
        return next
      })
      setMoveError(error instanceof Error ? error.message : 'Failed to move participant')
    }
  }

  const formatProfileDetails = (member: RoomParticipantStatus): string => {
    const parts = [member.characterRace, member.characterClass, member.characterSubclass].filter(
      Boolean
    )

    if (parts.length === 0 && typeof member.level !== 'number') {
      return 'Character details unavailable in current session payload.'
    }

    const base = parts.join(' · ')
    return typeof member.level === 'number'
      ? `${base ? `${base} · ` : ''}Level ${member.level}`
      : base
  }

  const getStatEntries = (member: RoomParticipantStatus): Array<[string, unknown]> => {
    const stats = member.characterStats
    if (!stats) {
      return []
    }

    return Object.entries(stats)
      .filter(([key, value]) => key !== 'level' && value !== null && value !== undefined)
      .slice(0, 4)
  }

  return (
    <TooltipProvider delayDuration={140}>
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
              const participants = displayedParticipantsByRoom[room.id] || []

              return (
                <section
                  key={room.id}
                  className={`room-selector-item ${selected ? 'selected' : ''}`}
                  aria-label={`Room ${room.name}`}
                  onDragOver={(event) => {
                    if (!canManageRooms) {
                      return
                    }
                    event.preventDefault()
                  }}
                  onDrop={(event) => {
                    if (!canManageRooms) {
                      return
                    }
                    event.preventDefault()
                    const droppedUserId = (event.dataTransfer.getData('text/plain') ||
                      draggedUserId ||
                      '') as UUID | ''

                    if (droppedUserId) {
                      void handleMoveParticipant(droppedUserId, room.id)
                    }

                    setDraggedUserId(null)
                  }}
                >
                  <button
                    type="button"
                    className="room-selector-item__header"
                    aria-label={`Select room ${room.name}`}
                    aria-pressed={selected}
                    onClick={() => onSelectRoom(room.id)}
                  >
                    <span className="room-selector-item-name">
                      <Icon name="voice" />
                      {room.name}
                    </span>
                    <span className="room-selector-item-meta">
                      {formatRoomTypeLabel(room.type)} · {participants.length}
                    </span>
                  </button>

                  <div className="room-selector-members-list">
                    {participants.length === 0 ? (
                      <p className="room-selector-empty">No members in this room.</p>
                    ) : (
                      participants.map((member) => {
                        const canDrag = canManageRooms && member.roleLabel !== 'DM'
                        const pendingTargetRoomId = pendingRoomMoves[member.userId]

                        return (
                          <Tooltip key={member.userId}>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className={`room-selector-member ${canDrag ? 'room-selector-member--draggable' : ''}`}
                                draggable={canDrag}
                                aria-label={canDrag ? `Drag ${member.username}` : member.username}
                                onDragStart={(event) => {
                                  if (!canDrag) {
                                    return
                                  }
                                  event.dataTransfer.setData('text/plain', member.userId)
                                  setDraggedUserId(member.userId)
                                }}
                                onDragEnd={() => setDraggedUserId(null)}
                              >
                                <AvatarOverlay
                                  username={member.characterName || member.username}
                                  avatarUrl={member.avatarUrl}
                                  roleLabel={member.roleLabel}
                                  presenceState={member.presenceState}
                                  isMuted={member.isMuted}
                                  isSpeaking={member.isSpeaking}
                                  condition={member.condition}
                                />
                                {pendingTargetRoomId === room.id ? (
                                  <span className="room-selector-member__pending">Moving…</span>
                                ) : null}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="room-selector-profile-tooltip">
                              <div className="room-selector-profile">
                                <div className="room-selector-profile__avatar" aria-hidden="true">
                                  {member.avatarUrl ? (
                                    <img src={member.avatarUrl} alt="" />
                                  ) : (
                                    (member.characterName || member.username)
                                      .charAt(0)
                                      .toUpperCase()
                                  )}
                                </div>
                                <div className="room-selector-profile__meta">
                                  <strong>{member.characterName || member.username}</strong>
                                  <span>{member.playerName || member.username}</span>
                                  <p>{formatProfileDetails(member)}</p>
                                  {getStatEntries(member).length > 0 ? (
                                    <div className="room-selector-profile__stats">
                                      {getStatEntries(member).map(([key, value]) => (
                                        <span key={key}>
                                          {key}: {String(value)}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                  <p>
                                    {member.roleLabel || 'PLAYER'} · {member.presenceState}
                                    {member.isSpeaking ? ' · Speaking' : ''}
                                    {member.isMuted ? ' · Muted' : ''}
                                  </p>
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        )
                      })
                    )}
                  </div>
                </section>
              )
            })
          )}
        </div>

        {moveError ? <p className="room-selector-error">{moveError}</p> : null}
      </section>
    </TooltipProvider>
  )
}
