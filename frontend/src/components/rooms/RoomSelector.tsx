import { useEffect, useMemo, useState } from 'react'
import { RoomType } from '@shared'
import type { UUID } from '@shared'
import { PresenceState } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../core-ui'
import { AvatarOverlay } from './AvatarOverlay'
import { Icon } from '../ui/Icon'
import { CreateGroupModal } from './CreateGroupModal'
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
  sessionId: UUID
  dmUserId: UUID
  headerModeCopy?: string
  canManageRooms: boolean
  broadcastModeEnabled: boolean
  onToggleBroadcastMode: (enabled: boolean) => Promise<void>
  rooms: RoomSelectorRoomWithParticipants[]
  selectedRoomId?: UUID | ''
  onSelectRoom: (roomId: UUID) => void
}

export function RoomSelector({
  apiUrl,
  token,
  sessionId,
  dmUserId,
  headerModeCopy,
  canManageRooms,
  broadcastModeEnabled,
  onToggleBroadcastMode,
  rooms,
  selectedRoomId,
  onSelectRoom,
}: RoomSelectorProps) {
  const [draggedUserId, setDraggedUserId] = useState<UUID | null>(null)
  const [pendingRoomMoves, setPendingRoomMoves] = useState<Record<UUID, UUID>>({})
  const [moveError, setMoveError] = useState<string | null>(null)
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
  const [optimisticRooms, setOptimisticRooms] = useState<RoomSelectorRoomWithParticipants[]>([])

  const allRooms = useMemo(() => {
    const byId = new Map<UUID, RoomSelectorRoomWithParticipants>()

    for (const room of rooms) {
      byId.set(room.id, room)
    }

    for (const room of optimisticRooms) {
      if (!byId.has(room.id)) {
        byId.set(room.id, room)
      }
    }

    return [...byId.values()]
  }, [rooms, optimisticRooms])

  useEffect(() => {
    if (optimisticRooms.length === 0) {
      return
    }

    const confirmedRoomIds = new Set(rooms.map((room) => room.id))
    setOptimisticRooms((state) => state.filter((room) => !confirmedRoomIds.has(room.id)))
  }, [rooms, optimisticRooms.length])

  const formatRoomTypeLabel = (type: RoomType): string => {
    if (type === RoomType.MAIN) return 'Main'
    if (type === RoomType.GROUP) return 'Breakout'
    if (type === RoomType.PRIVATE) return 'Private'
    return type
  }

  const baseParticipants = useMemo(
    () =>
      allRooms.flatMap((room) =>
        room.participants.map((participant) => ({ ...participant, roomId: room.id }))
      ),
    [allRooms]
  )

  const dmParticipant = useMemo(
    () => baseParticipants.find((participant) => participant.userId === dmUserId),
    [baseParticipants, dmUserId]
  )

  const nonDmParticipants = useMemo(
    () => baseParticipants.filter((participant) => participant.userId !== dmUserId),
    [baseParticipants, dmUserId]
  )

  const displayedParticipantsByRoom = useMemo(() => {
    const next: Record<string, RoomParticipantStatus[]> = {}

    for (const room of allRooms) {
      next[room.id] = []
    }

    for (const participant of nonDmParticipants) {
      const targetRoomId = pendingRoomMoves[participant.userId] || participant.roomId
      if (!next[targetRoomId]) {
        next[targetRoomId] = []
      }
      next[targetRoomId].push(participant)
    }

    return next
  }, [allRooms, nonDmParticipants, pendingRoomMoves])

  const handleMoveParticipant = async (userId: UUID, toRoomId: UUID) => {
    setMoveError(null)
    setPendingRoomMoves((state) => ({ ...state, [userId]: toRoomId }))

    try {
      const response = await fetch(`${apiUrl}/api/v1/rooms/${toRoomId}/members/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId, targetUserId: userId }),
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

  const handleCreateGroup = async (name: string, type: RoomType) => {
    setMoveError(null)

    const tempId = crypto.randomUUID() as UUID
    setOptimisticRooms((state) => [
      ...state,
      {
        id: tempId,
        name,
        type,
        memberCount: 0,
        participants: [],
      },
    ])

    try {
      const response = await fetch(`${apiUrl}/api/v1/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          name,
          type,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        const message = payload?.message || 'Failed to create group'
        setMoveError(message)
        throw new Error(message)
      }

      const payload = (await response.json().catch(() => null)) as
        | { room?: { id: UUID; name: string; type: RoomType } }
        | null

      if (payload?.room?.id) {
        setOptimisticRooms((state) =>
          state.map((room) =>
            room.id === tempId
              ? {
                  id: payload.room!.id,
                  name: payload.room!.name,
                  type: payload.room!.type,
                  memberCount: 0,
                  participants: [],
                }
              : room
          )
        )
      }
    } catch (error) {
      setOptimisticRooms((state) => state.filter((room) => room.id !== tempId))
      throw error
    }
  }

  const mainRooms = useMemo(
    () => allRooms.filter((room) => room.type === RoomType.MAIN),
    [allRooms]
  )

  const otherRooms = useMemo(
    () =>
      allRooms
        .filter((room) => room.type !== RoomType.MAIN)
        .sort((left, right) => {
          const leftIsPrivate = left.type === RoomType.PRIVATE
          const rightIsPrivate = right.type === RoomType.PRIVATE

          if (!leftIsPrivate && rightIsPrivate) return -1
          if (leftIsPrivate && !rightIsPrivate) return 1

          return left.name.localeCompare(right.name)
        }),
    [allRooms]
  )

  const renderRoomSection = (sectionLabel: string, sectionRooms: RoomSelectorRoomWithParticipants[]) => {
    if (sectionRooms.length === 0) {
      return null
    }

    return (
      <section className="room-selector-group-section" aria-label={sectionLabel}>
        <header className="room-selector-group-section__header">
          <h5>{sectionLabel}</h5>
          <span>{sectionRooms.length}</span>
        </header>

        {sectionRooms.map((room, index) => {
          const selected = room.id === selectedRoomId
          const participants = displayedParticipantsByRoom[room.id] || []
          const previousRoom = index > 0 ? sectionRooms[index - 1] : null
          const isPrivateDividerStart =
            room.type === RoomType.PRIVATE &&
            previousRoom !== null &&
            previousRoom.type !== RoomType.PRIVATE

          return (
            <section
              key={room.id}
              className={`room-selector-item ${selected ? 'selected' : ''} ${
                isPrivateDividerStart ? 'room-selector-item--private-divider' : ''
              }`}
              aria-label={`Group ${room.name}`}
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
                aria-label={`Select group ${room.name}`}
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

              {canManageRooms ? (
                <button
                  type="button"
                  className={`room-selector-item__voice-toggle ${
                    selectedRoomId === room.id && !broadcastModeEnabled ? 'active' : ''
                  }`}
                  onClick={() => {
                    if (broadcastModeEnabled) {
                      void onToggleBroadcastMode(false)
                    }
                    onSelectRoom(room.id)
                  }}
                  aria-pressed={selectedRoomId === room.id && !broadcastModeEnabled}
                >
                  <Icon name="voice" /> DM Voice Here
                </button>
              ) : null}

              <div className="room-selector-members-list">
                {participants.length === 0 ? (
                  <p className="room-selector-empty">No members in this group.</p>
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
                                (member.characterName || member.username).charAt(0).toUpperCase()
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
        })}
      </section>
    )
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
            <Icon name="rooms" /> Voice Groups
          </h4>
          <div className="room-selector-header__meta room-selector-header__meta--actions">
            <span>{headerModeCopy || allRooms.length}</span>
            {canManageRooms ? (
              <button
                type="button"
                className="room-selector-header__create"
                onClick={() => setShowCreateGroupModal(true)}
              >
                + Create Group
              </button>
            ) : null}
          </div>
        </header>

        <div className="room-selector-list" role="list" aria-label="Session groups">
          {dmParticipant ? (
            <section className="room-selector-dm" aria-label="Dungeon Master voice controls">
              <div className="room-selector-dm__profile">
                <AvatarOverlay
                  username={dmParticipant.characterName || dmParticipant.username}
                  avatarUrl={dmParticipant.avatarUrl}
                  roleLabel="DM"
                  presenceState={dmParticipant.presenceState}
                  isMuted={dmParticipant.isMuted}
                  isSpeaking={dmParticipant.isSpeaking}
                />
              </div>
              {canManageRooms ? (
                <div className="room-selector-dm__voice-controls">
                  <button
                    type="button"
                    className={`room-selector-dm__vog ${broadcastModeEnabled ? 'active' : ''}`}
                    onClick={() => {
                      void onToggleBroadcastMode(!broadcastModeEnabled).catch((error) => {
                        setMoveError(
                          error instanceof Error ? error.message : 'Failed to toggle DM Broadcast'
                        )
                      })
                    }}
                    aria-pressed={broadcastModeEnabled}
                    title="Project DM voice to all active groups."
                  >
                    <Icon name="signal" />
                    Broadcast Voice
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

          {allRooms.length === 0 ? (
            <p className="room-selector-empty">No groups available.</p>
          ) : (
            <>
              {renderRoomSection('Main Group', mainRooms)}
              {renderRoomSection('Other Groups', otherRooms)}
            </>
          )}
        </div>

        {moveError ? <p className="room-selector-error">{moveError}</p> : null}

        {showCreateGroupModal ? (
          <CreateGroupModal
            onClose={() => setShowCreateGroupModal(false)}
            onCreateGroup={handleCreateGroup}
          />
        ) : null}
      </section>
    </TooltipProvider>
  )
}
