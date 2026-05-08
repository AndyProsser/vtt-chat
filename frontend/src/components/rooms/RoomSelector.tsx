import { useEffect, useMemo, useRef, useState } from 'react'
import { RoomType } from '@shared'
import type { UUID } from '@shared'
import { PresenceState } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../core-ui'
import { AvatarOverlay } from './AvatarOverlay'
import { RadialMenu } from './RadialMenu'
import { Icon } from '../ui/Icon'
import { CreateGroupModal } from './CreateGroupModal'
import '../../styles/components/rooms/RoomSelector.css'

export interface RoomSelectorRoom {
  id: UUID
  name: string
  type: RoomType
  memberCount: number
  environmentName?: string
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
  isGreenroom?: boolean
  headerModeCopy?: string
  canManageRooms: boolean
  broadcastModeEnabled: boolean
  onToggleBroadcastMode: (enabled: boolean) => Promise<void>
  rooms: RoomSelectorRoomWithParticipants[]
  selectedRoomId?: UUID | ''
  onSelectRoom: (roomId: UUID) => void
}

function isGreenRoomName(name: string): boolean {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ')
  return normalized === 'green room' || normalized === 'green-room'
}

const CONDITION_PRESETS = ['Silenced', 'Poisoned', 'Bleeding', 'Exhausted']
const LONG_PRESS_OPEN_MS = 420
const LONG_PRESS_MOVE_CANCEL_PX = 12

type RadialActionMode = 'root' | 'move' | 'condition'

interface RadialMenuState {
  x: number
  y: number
  memberUserId: UUID
  memberRoomId: UUID
  mode: RadialActionMode
}

export function RoomSelector({
  apiUrl,
  token,
  sessionId,
  dmUserId,
  isGreenroom = false,
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
  const [pendingRoomDeletes, setPendingRoomDeletes] = useState<Record<UUID, true>>({})
  const [radialMenuState, setRadialMenuState] = useState<RadialMenuState | null>(null)
  const [touchFeedbackUserId, setTouchFeedbackUserId] = useState<UUID | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const touchFeedbackTimerRef = useRef<number | null>(null)
  const touchStartRef = useRef<{ x: number; y: number; userId: UUID } | null>(null)

  const confirmedRoomIds = useMemo(() => new Set(rooms.map((room) => room.id)), [rooms])

  const allRooms = useMemo(() => {
    const byId = new Map<UUID, RoomSelectorRoomWithParticipants>()

    for (const room of rooms) {
      byId.set(room.id, room)
    }

    for (const room of optimisticRooms) {
      if (confirmedRoomIds.has(room.id)) {
        continue
      }
      if (!byId.has(room.id)) {
        byId.set(room.id, room)
      }
    }

    return [...byId.values()].filter((room) => !pendingRoomDeletes[room.id])
  }, [rooms, optimisticRooms, pendingRoomDeletes, confirmedRoomIds])

  const formatRoomTypeLabel = (type: RoomType): string => {
    if (type === RoomType.MAIN) return ''
    if (type === RoomType.GROUP) return ''
    if (type === RoomType.PRIVATE) return 'Private'
    return type
  }

  const displayPresenceState = (state: PresenceState): PresenceState => {
    if (state === PresenceState.IDLE) {
      return PresenceState.ONLINE
    }
    return state
  }

  const getEnvironmentGlyph = (environmentName?: string): string => {
    const value = (environmentName || '').toLowerCase()

    if (value.includes('cave')) return 'mountain_flag'
    if (value.includes('forest') || value.includes('wood')) return 'forest'
    if (value.includes('tavern')) return 'local_bar'
    if (value.includes('city') || value.includes('street') || value.includes('market'))
      return 'location_city'
    if (value.includes('dungeon') || value.includes('crypt')) return 'lan'
    if (value.includes('night') || value.includes('moon')) return 'bedtime'
    if (value.includes('storm') || value.includes('rain')) return 'thunderstorm'

    return 'graphic_eq'
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

  const visibleParticipants = useMemo(
    () => (isGreenroom ? baseParticipants : baseParticipants.filter((p) => p.userId !== dmUserId)),
    [baseParticipants, dmUserId, isGreenroom]
  )

  const canCreateGroups = canManageRooms && !isGreenroom

  const displayedParticipantsByRoom = useMemo(() => {
    const next: Record<string, RoomParticipantStatus[]> = {}

    for (const room of allRooms) {
      next[room.id] = []
    }

    for (const participant of visibleParticipants) {
      const targetRoomId = pendingRoomMoves[participant.userId] || participant.roomId
      if (!next[targetRoomId]) {
        next[targetRoomId] = []
      }
      next[targetRoomId].push(participant)
    }

    return next
  }, [allRooms, visibleParticipants, pendingRoomMoves])

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

      const payload = (await response.json().catch(() => null)) as {
        room?: { id: UUID; name: string; type: RoomType }
      } | null

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

  const handleDeleteGroup = async (room: RoomSelectorRoomWithParticipants) => {
    if (room.type === RoomType.MAIN || isGreenRoomName(room.name)) {
      return
    }

    setMoveError(null)
    setPendingRoomDeletes((state) => ({ ...state, [room.id]: true }))

    try {
      const response = await fetch(`${apiUrl}/api/v1/rooms/${room.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to close group')
      }

      if (selectedRoomId === room.id) {
        const fallbackRoom = allRooms.find(
          (entry) => entry.type === RoomType.MAIN && entry.id !== room.id
        )
        if (fallbackRoom) {
          onSelectRoom(fallbackRoom.id)
        }
      }
    } catch (error) {
      setPendingRoomDeletes((state) => {
        const next = { ...state }
        delete next[room.id]
        return next
      })
      setMoveError(error instanceof Error ? error.message : 'Failed to close group')
    }
  }

  const handleApplyMuteOverride = async (targetUserId: UUID, muted: boolean) => {
    setMoveError(null)

    try {
      if (muted) {
        const response = await fetch(`${apiUrl}/api/v1/audio/dm-override/apply`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sessionId,
            targetUserId,
            overrideType: 'MUTE',
            parameters: {},
          }),
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || 'Failed to mute participant')
        }
      } else {
        const response = await fetch(`${apiUrl}/api/v1/audio/dm-override/remove`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sessionId,
            targetUserId,
            overrideType: 'MUTE',
          }),
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || 'Failed to unmute participant')
        }
      }
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : 'Failed to update mute override')
    }
  }

  const handleApplyConditionOverride = async (targetUserId: UUID, conditionName: string) => {
    setMoveError(null)

    try {
      if (conditionName === 'None') {
        const response = await fetch(`${apiUrl}/api/v1/audio/dm-override/remove`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sessionId,
            targetUserId,
            overrideType: 'CONDITION',
          }),
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || 'Failed to clear condition')
        }

        return
      }

      const response = await fetch(`${apiUrl}/api/v1/audio/dm-override/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          targetUserId,
          overrideType: 'CONDITION',
          parameters: { conditionName },
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to apply condition')
      }
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : 'Failed to update condition')
    }
  }

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const clearTouchFeedback = (delayMs = 0) => {
    if (touchFeedbackTimerRef.current !== null) {
      window.clearTimeout(touchFeedbackTimerRef.current)
      touchFeedbackTimerRef.current = null
    }

    if (delayMs <= 0) {
      setTouchFeedbackUserId(null)
      return
    }

    touchFeedbackTimerRef.current = window.setTimeout(() => {
      setTouchFeedbackUserId(null)
      touchFeedbackTimerRef.current = null
    }, delayMs)
  }

  const openRadialMenu = (params: {
    x: number
    y: number
    memberUserId: UUID
    memberRoomId: UUID
  }) => {
    if (!canManageRooms || params.memberUserId === dmUserId) {
      return
    }

    setRadialMenuState({ ...params, mode: 'root' })
    clearTouchFeedback()

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10)
    }
  }

  useEffect(() => {
    return () => {
      clearLongPressTimer()
      if (touchFeedbackTimerRef.current !== null) {
        window.clearTimeout(touchFeedbackTimerRef.current)
      }
    }
  }, [])

  const mainRooms = useMemo(
    () =>
      allRooms.filter(
        (room) => room.type === RoomType.MAIN || (isGreenroom && isGreenRoomName(room.name))
      ),
    [allRooms, isGreenroom]
  )

  const otherRooms = useMemo(
    () =>
      allRooms
        .filter((room) => room.type !== RoomType.MAIN && !isGreenRoomName(room.name))
        .sort((left, right) => {
          const leftIsPrivate = left.type === RoomType.PRIVATE
          const rightIsPrivate = right.type === RoomType.PRIVATE

          if (!leftIsPrivate && rightIsPrivate) return -1
          if (leftIsPrivate && !rightIsPrivate) return 1

          return left.name.localeCompare(right.name)
        }),
    [allRooms]
  )

  const selectedRadialMember = useMemo(
    () =>
      radialMenuState
        ? visibleParticipants.find((member) => member.userId === radialMenuState.memberUserId)
        : undefined,
    [radialMenuState, visibleParticipants]
  )

  const renderRoomSection = (
    sectionLabel: string,
    sectionRooms: RoomSelectorRoomWithParticipants[]
  ) => {
    if (sectionRooms.length === 0) {
      return null
    }

    return (
      <section className="room-selector-group-section" aria-label={sectionLabel}>
        <header className="room-selector-group-section__header">
          <h5>{sectionLabel}</h5>
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
                if (!canManageRooms || isGreenroom) {
                  return
                }
                event.preventDefault()
              }}
              onDrop={(event) => {
                if (!canManageRooms || isGreenroom) {
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
              <div className="room-selector-item__header">
                <span className="room-selector-item-heading-row">
                  <button
                    type="button"
                    className="room-selector-item__select"
                    aria-label={`Select group ${room.name}`}
                    aria-pressed={selected}
                    onClick={() => onSelectRoom(room.id)}
                  >
                    <span className="room-selector-item-name">
                      <Icon name="voice" />
                      {room.name}
                    </span>
                  </button>

                  <span className="room-selector-item-actions">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="room-selector-item__env-icon"
                          aria-label="Group environment"
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            {getEnvironmentGlyph(room.environmentName)}
                          </span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Environment: {room.environmentName || 'Default'}
                      </TooltipContent>
                    </Tooltip>

                    {canCreateGroups ? (
                      <button
                        type="button"
                        className="room-selector-item__icon-action"
                        aria-label="Create new group"
                        title="Create new group"
                        onClick={() => setShowCreateGroupModal(true)}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          add
                        </span>
                      </button>
                    ) : null}

                    {canManageRooms &&
                    room.type !== RoomType.MAIN &&
                    !isGreenRoomName(room.name) ? (
                      <button
                        type="button"
                        className="room-selector-item__icon-action"
                        aria-label={`Close group ${room.name}`}
                        title="Close group"
                        onClick={() => {
                          void handleDeleteGroup(room)
                        }}
                        disabled={Boolean(pendingRoomDeletes[room.id])}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          close
                        </span>
                      </button>
                    ) : null}
                  </span>
                </span>

                <span className="room-selector-item-meta">{formatRoomTypeLabel(room.type)}</span>
              </div>

              {canManageRooms && !isGreenroom ? (
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
                    const canDrag = canManageRooms && !isGreenroom && member.roleLabel !== 'DM'
                    const pendingTargetRoomId = pendingRoomMoves[member.userId]
                    const isMuted = Boolean(member.isMuted)
                    const condition = member.condition
                    const shownPresenceState = displayPresenceState(member.presenceState)

                    return (
                      <Tooltip key={member.userId}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className={`room-selector-member ${canDrag ? 'room-selector-member--draggable' : ''} ${touchFeedbackUserId === member.userId ? 'room-selector-member--touch-feedback' : ''}`}
                            draggable={canDrag}
                            aria-label={canDrag ? `Drag ${member.username}` : member.username}
                            onDragStart={(event) => {
                              if (!canDrag) {
                                return
                              }
                              event.dataTransfer.setData('text/plain', member.userId)
                              setDraggedUserId(member.userId)
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault()
                              openRadialMenu({
                                x: event.clientX,
                                y: event.clientY,
                                memberUserId: member.userId,
                                memberRoomId: room.id,
                              })
                            }}
                            onTouchStart={(event) => {
                              clearLongPressTimer()
                              clearTouchFeedback()
                              const touch = event.touches[0]
                              if (!touch) {
                                return
                              }

                              touchStartRef.current = {
                                x: touch.clientX,
                                y: touch.clientY,
                                userId: member.userId,
                              }
                              setTouchFeedbackUserId(member.userId)

                              longPressTimerRef.current = window.setTimeout(() => {
                                openRadialMenu({
                                  x: touch.clientX,
                                  y: touch.clientY,
                                  memberUserId: member.userId,
                                  memberRoomId: room.id,
                                })
                              }, LONG_PRESS_OPEN_MS)
                            }}
                            onTouchMove={(event) => {
                              const touch = event.touches[0]
                              const touchStart = touchStartRef.current

                              if (!touch || !touchStart || touchStart.userId !== member.userId) {
                                return
                              }

                              const deltaX = touch.clientX - touchStart.x
                              const deltaY = touch.clientY - touchStart.y
                              if (Math.hypot(deltaX, deltaY) > LONG_PRESS_MOVE_CANCEL_PX) {
                                clearLongPressTimer()
                                clearTouchFeedback(60)
                              }
                            }}
                            onTouchEnd={() => {
                              clearLongPressTimer()
                              clearTouchFeedback(80)
                            }}
                            onTouchCancel={() => {
                              clearLongPressTimer()
                              clearTouchFeedback()
                            }}
                            onDragEnd={() => setDraggedUserId(null)}
                          >
                            <AvatarOverlay
                              username={member.characterName || member.username}
                              avatarUrl={member.avatarUrl}
                              roleLabel={member.roleLabel}
                              presenceState={shownPresenceState}
                              isMuted={isMuted}
                              isSpeaking={member.isSpeaking}
                              condition={condition}
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
                                {member.roleLabel || 'PLAYER'} · {shownPresenceState}
                                {member.isSpeaking ? ' · Speaking' : ''}
                                {isMuted ? ' · Muted' : ''}
                              </p>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )
                  })
                )}
                {formatRoomTypeLabel(room.type) ? (
                  <span className="room-selector-item-meta">{formatRoomTypeLabel(room.type)}</span>
                ) : null}
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
            {headerModeCopy ? <span>{headerModeCopy}</span> : null}
            {canManageRooms && !isGreenroom ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={`room-selector-header__broadcast-icon ${
                      broadcastModeEnabled ? 'active' : ''
                    }`}
                    aria-label={
                      broadcastModeEnabled ? 'Disable broadcast mode' : 'Enable broadcast mode'
                    }
                    onClick={() => {
                      void onToggleBroadcastMode(!broadcastModeEnabled).catch((error) => {
                        setMoveError(
                          error instanceof Error ? error.message : 'Failed to toggle broadcast mode'
                        )
                      })
                    }}
                  >
                    <Icon name="signal" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {broadcastModeEnabled
                    ? 'Broadcast enabled (global)'
                    : 'Broadcast disabled (global)'}
                </TooltipContent>
              </Tooltip>
            ) : null}
            {canCreateGroups ? (
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
          {dmParticipant && !isGreenroom ? (
            <section className="room-selector-dm" aria-label="Dungeon Master voice controls">
              <div className="room-selector-dm__profile">
                <AvatarOverlay
                  username={dmParticipant.characterName || dmParticipant.username}
                  avatarUrl={dmParticipant.avatarUrl}
                  roleLabel="DM"
                  presenceState={displayPresenceState(dmParticipant.presenceState)}
                  isMuted={dmParticipant.isMuted}
                  isSpeaking={dmParticipant.isSpeaking}
                />
              </div>
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

        {radialMenuState ? (
          <RadialMenu
            x={radialMenuState.x}
            y={radialMenuState.y}
            mode={radialMenuState.mode}
            moveTargets={
              radialMenuState.mode === 'move'
                ? allRooms
                    .filter((room) => room.id !== radialMenuState.memberRoomId)
                    .map((room) => ({ id: room.id, label: room.name }))
                : []
            }
            conditionTargets={
              radialMenuState.mode === 'condition' ? [...CONDITION_PRESETS, 'None'] : []
            }
            currentMuted={Boolean(selectedRadialMember?.isMuted)}
            onMove={() =>
              setRadialMenuState((state) => (state ? { ...state, mode: 'move' } : state))
            }
            onCondition={() =>
              setRadialMenuState((state) => (state ? { ...state, mode: 'condition' } : state))
            }
            onMute={() => {
              const nextMuted = !Boolean(selectedRadialMember?.isMuted)
              void handleApplyMuteOverride(radialMenuState.memberUserId, nextMuted)
              setRadialMenuState(null)
            }}
            onClose={() => setRadialMenuState(null)}
            onMoveSelect={(roomId) => {
              void handleMoveParticipant(radialMenuState.memberUserId, roomId)
              setRadialMenuState(null)
            }}
            onConditionSelect={(conditionName) => {
              void handleApplyConditionOverride(radialMenuState.memberUserId, conditionName)
              setRadialMenuState(null)
            }}
            onBack={() =>
              setRadialMenuState((state) => (state ? { ...state, mode: 'root' } : state))
            }
          />
        ) : null}
      </section>
    </TooltipProvider>
  )
}
