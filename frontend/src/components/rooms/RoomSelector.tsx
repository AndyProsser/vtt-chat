import { useEffect, useMemo, useRef, useState } from 'react'
import { RoomType } from '@shared'
import type { UUID } from '@shared'
import { PresenceState } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../core-ui'
import {
  formatRoomTypeLabel,
  getVoiceGroupPresenceState,
  isGreenRoomName,
  RADIAL_MENU_COPY,
  ROOM_PRESENCE_COPY,
  ROOM_ROLE_LABELS,
} from '../../constants/roomPresence.constants'
import {
  CONDITION_PRESETS,
  DEFAULT_PLAYER_META_LINE,
  DM_FLAVOR_LINES,
  LONG_PRESS_MOVE_CANCEL_PX,
  LONG_PRESS_OPEN_MS,
  resolveEnvironmentGlyph,
} from '../../constants/voiceGroup.constants'
import { STATUS_PILL_ICONS, STATUS_PILL_LABELS } from '../../constants/voiceGroupStatus.constants'
import { AvatarOverlay } from './AvatarOverlay'
import { RadialMenu } from './RadialMenu'
import { Icon } from '../ui/Icon'
import { CreateGroupModal } from './CreateGroupModal'
import { useStore } from '../../hooks/useStore'
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

type RadialActionMode = 'root' | 'move' | 'condition'

interface RadialMenuState {
  x: number
  y: number
  memberUserId: UUID
  memberRoomId: UUID
  mode: RadialActionMode
}

const ENVIRONMENT_OPTIONS = [
  'Default',
  'Forest',
  'Cave',
  'Tavern',
  'City',
  'Dungeon',
  'Night',
  'Storm',
] as const

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
  const [isMobileExpanded] = useState(true)
  const [draggedUserId, setDraggedUserId] = useState<UUID | null>(null)
  const [pendingRoomMoves, setPendingRoomMoves] = useState<Record<UUID, UUID>>({})
  const [moveError, setMoveError] = useState<string | null>(null)
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
  const [optimisticRooms, setOptimisticRooms] = useState<RoomSelectorRoomWithParticipants[]>([])
  const [pendingRoomDeletes, setPendingRoomDeletes] = useState<Record<UUID, true>>({})
  const [radialMenuState, setRadialMenuState] = useState<RadialMenuState | null>(null)
  const [environmentPickerRoomId, setEnvironmentPickerRoomId] = useState<UUID | null>(null)
  const [environmentOverrides, setEnvironmentOverrides] = useState<Record<UUID, string>>({})
  const [touchFeedbackUserId, setTouchFeedbackUserId] = useState<UUID | null>(null)
  const createGroupWrapRef = useRef<HTMLDivElement | null>(null)
  const environmentPickerLayerRef = useRef<HTMLDivElement | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const touchFeedbackTimerRef = useRef<number | null>(null)
  const touchStartRef = useRef<{ x: number; y: number; userId: UUID } | null>(null)
  const previousDmVoiceRoomIdRef = useRef<UUID | ''>('')
  const createRoom = useStore((state) => state.createRoom)
  const deleteRoom = useStore((state) => state.deleteRoom)
  const clearRoomEnvironmentName = useStore((state) => state.clearRoomEnvironmentName)
  const clearEnvironment = useStore((state) => state.clearEnvironment)
  const setRoomEnvironmentName = useStore((state) => state.setRoomEnvironmentName)
  const dmFlavorLine = useMemo(() => {
    const seed = `${dmUserId}:${sessionId}`
    let hash = 0
    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash << 5) - hash + seed.charCodeAt(index)
      hash |= 0
    }

    const itemIndex = Math.abs(hash) % DM_FLAVOR_LINES.length
    return DM_FLAVOR_LINES[itemIndex]
  }, [dmUserId, sessionId])

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

  const canCreateGroups = canManageRooms

  useEffect(() => {
    if (!broadcastModeEnabled && selectedRoomId) {
      previousDmVoiceRoomIdRef.current = selectedRoomId
    }
  }, [broadcastModeEnabled, selectedRoomId])

  useEffect(() => {
    if (!showCreateGroupModal && !environmentPickerRoomId) {
      return
    }

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      if (
        showCreateGroupModal &&
        createGroupWrapRef.current &&
        !createGroupWrapRef.current.contains(target)
      ) {
        setShowCreateGroupModal(false)
      }

      if (!environmentPickerRoomId) {
        return
      }

      const currentTrigger = target.closest('[data-room-env-trigger]')
      const triggerRoomId = currentTrigger?.getAttribute('data-room-env-trigger') as UUID | null
      const isInsideOpenTrigger = triggerRoomId === environmentPickerRoomId
      const isInsideOpenPicker = environmentPickerLayerRef.current?.contains(target) ?? false

      if (!isInsideOpenTrigger && !isInsideOpenPicker) {
        setEnvironmentPickerRoomId(null)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      if (environmentPickerRoomId) {
        setEnvironmentPickerRoomId(null)
      }

      if (showCreateGroupModal) {
        setShowCreateGroupModal(false)
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [environmentPickerRoomId, showCreateGroupModal])

  const getDisplayRoomName = (room: RoomSelectorRoomWithParticipants): string => {
    if (room.type === RoomType.MAIN && room.name.trim().toLowerCase() === 'main room') {
      return 'Main'
    }
    return room.name
  }

  const getResolvedEnvironmentName = (room: RoomSelectorRoomWithParticipants): string => {
    return room.environmentName || 'Default'
  }

  const handleApplyEnvironment = async (roomId: UUID, environmentName: string) => {
    setMoveError(null)

    try {
      const response = await fetch(`${apiUrl}/api/v1/audio/environments/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          roomId,
          environmentName,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to apply environment')
      }

      setEnvironmentOverrides((state) => ({ ...state, [roomId]: environmentName }))
      setRoomEnvironmentName(roomId, environmentName)
      setEnvironmentPickerRoomId(null)
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : 'Failed to apply environment')
    }
  }

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
        createRoom(sessionId, {
          id: payload.room.id,
          sessionId,
          name: payload.room.name,
          type: payload.room.type,
          createdAt: Date.now(),
          createdBy: dmUserId,
        })

        setOptimisticRooms((state) => state.filter((room) => room.id !== tempId))

        // Keep DM voice target aligned to the newly created persisted room.
        previousDmVoiceRoomIdRef.current = payload.room.id
        onSelectRoom(payload.room.id)
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

        clearEnvironment()
      }

      deleteRoom(sessionId, room.id)
      clearRoomEnvironmentName(room.id)
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
      if (conditionName === RADIAL_MENU_COPY.none) {
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

  useEffect(() => {
    if (!isGreenroom) {
      return
    }

    if (environmentPickerRoomId) {
      setEnvironmentPickerRoomId(null)
    }
  }, [environmentPickerRoomId, isGreenroom])

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

          const isEmptyGroup =
            canManageRooms &&
            participants.length === 0 &&
            room.type !== RoomType.MAIN &&
            !isGreenRoomName(room.name)

          return (
            <section
              key={room.id}
              className={`room-selector-item ${selected ? 'selected' : ''} ${
                isPrivateDividerStart ? 'room-selector-item--private-divider' : ''
              } ${isEmptyGroup ? 'room-selector-item--collapsed' : ''}`}
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
                      {getDisplayRoomName(room)}
                    </span>
                  </button>

                  <span className="room-selector-item-actions">
                    <div className="room-selector-item__env-wrap">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="room-selector-item__env-icon"
                            aria-label="Change group environment"
                            data-room-env-trigger={room.id}
                            disabled={false}
                            title={'Change group environment'}
                            onClick={() => {
                              setShowCreateGroupModal(false)
                              setEnvironmentPickerRoomId((current) =>
                                current === room.id ? null : room.id
                              )
                            }}
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">
                              {resolveEnvironmentGlyph(getResolvedEnvironmentName(room))}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          Environment: {getResolvedEnvironmentName(room)}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    {canManageRooms && !isGreenroom ? (
                      isEmptyGroup ? (
                        <button
                          type="button"
                          className="room-selector-item__icon-action room-selector-item__close-inline"
                          aria-label={`Delete group ${getDisplayRoomName(room)}`}
                          title="Delete group"
                          disabled={Boolean(pendingRoomDeletes[room.id])}
                          onClick={() => {
                            void handleDeleteGroup(room)
                          }}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            close
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`room-selector-item__icon-action room-selector-item__voice-icon ${
                            broadcastModeEnabled
                              ? 'is-broadcast'
                              : selectedRoomId === room.id
                                ? 'active'
                                : ''
                          }`}
                          aria-label={`Set DM voice to ${getDisplayRoomName(room)}`}
                          title={`Set DM voice to ${getDisplayRoomName(room)}`}
                          aria-pressed={broadcastModeEnabled || selectedRoomId === room.id}
                          onClick={() => {
                            void handleSetDmVoiceRoom(room.id)
                          }}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            record_voice_over
                          </span>
                        </button>
                      )
                    ) : null}
                  </span>
                </span>

                {environmentPickerRoomId === room.id ? (
                  <div
                    className="room-selector-item__env-picker"
                    role="dialog"
                    aria-label="Group environment picker"
                    ref={environmentPickerLayerRef}
                  >
                    <p className="room-selector-item__env-picker-title">Choose environment</p>
                    <div className="room-selector-item__env-picker-list">
                      {ENVIRONMENT_OPTIONS.map((option) => {
                        const isSelected =
                          getResolvedEnvironmentName(room).toLowerCase() === option.toLowerCase()
                        return (
                          <button
                            key={option}
                            type="button"
                            className={isSelected ? 'is-active' : ''}
                            aria-pressed={isSelected}
                            onClick={() => {
                              void handleApplyEnvironment(room.id, option)
                            }}
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">
                              {resolveEnvironmentGlyph(option)}
                            </span>
                            <span>{option}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                <span className="room-selector-item-meta">{formatRoomTypeLabel(room.type)}</span>
              </div>

              <div
                className={`room-selector-members-list ${isEmptyGroup ? 'room-selector-members-list--hidden' : ''}`}
              >
                {participants.length === 0 ? (
                  <p className="room-selector-empty">{ROOM_PRESENCE_COPY.noMembersInGroup}</p>
                ) : (
                  participants.map((member) => {
                    const canDrag = canManageRooms && !isGreenroom && member.roleLabel !== 'DM'
                    const pendingTargetRoomId = pendingRoomMoves[member.userId]
                    const isMuted = Boolean(member.isMuted)
                    const shownPresenceState = getResolvedPresenceState(member.presenceState)

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
                              metaLine={getParticipantMetaLine(member)}
                              presenceState={shownPresenceState}
                              isMuted={isMuted}
                              isSpeaking={member.isSpeaking}
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
                              <div className="room-selector-profile__title-row">
                                <span className="room-selector-profile__name-wrap">
                                  <strong>{member.characterName || member.username}</strong>
                                  <span className="room-selector-status-pill role compact">
                                    <span className="material-symbols-outlined" aria-hidden="true">
                                      {STATUS_PILL_ICONS.role}
                                    </span>
                                    {member.roleLabel || ROOM_ROLE_LABELS.player}
                                  </span>
                                </span>
                                <span
                                  className={`room-selector-status-pill presence ${shownPresenceState.toLowerCase()}`}
                                >
                                  <span className="material-symbols-outlined" aria-hidden="true">
                                    {STATUS_PILL_ICONS.presence}
                                  </span>
                                  {shownPresenceState}
                                </span>
                              </div>
                              {member.playerName &&
                              member.playerName !== (member.characterName || member.username) ? (
                                <span className="room-selector-profile__player-name">
                                  {member.playerName}
                                </span>
                              ) : null}
                              <p>{getParticipantMetaLine(member)}</p>
                              {getStatEntries(member).length > 0 ? (
                                <div className="room-selector-profile__stats">
                                  {getStatEntries(member).map(([key, value]) => (
                                    <span key={key}>
                                      {key}: {String(value)}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              <div className="room-selector-profile__status-pills">
                                {member.isSpeaking ? (
                                  <span className="room-selector-status-pill speaking">
                                    <span className="material-symbols-outlined" aria-hidden="true">
                                      {STATUS_PILL_ICONS.speaking}
                                    </span>
                                    {STATUS_PILL_LABELS.speaking}
                                  </span>
                                ) : null}
                                {isMuted ? (
                                  <span className="room-selector-status-pill muted">
                                    <span className="material-symbols-outlined" aria-hidden="true">
                                      mic_off
                                    </span>
                                    {STATUS_PILL_LABELS.muted}
                                  </span>
                                ) : null}
                                {member.condition ? (
                                  <span className="room-selector-status-pill condition">
                                    <span className="material-symbols-outlined" aria-hidden="true">
                                      {STATUS_PILL_ICONS.condition}
                                    </span>
                                    {member.condition}
                                  </span>
                                ) : null}
                              </div>
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

              {canManageRooms &&
              room.type !== RoomType.MAIN &&
              !isGreenRoomName(room.name) &&
              !isEmptyGroup ? (
                <footer className="room-selector-item__footer">
                  <button
                    type="button"
                    className="room-selector-item__close-btn"
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
                    Close
                  </button>
                </footer>
              ) : null}
            </section>
          )
        })}
      </section>
    )
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

  const getParticipantMetaLine = (member: RoomParticipantStatus): string => {
    if (member.roleLabel === 'DM') {
      return dmFlavorLine
    }

    const parts = [
      member.characterClass?.trim(),
      typeof member.level === 'number' ? `Level ${member.level}` : undefined,
      member.characterRace?.trim(),
    ].filter((value): value is string => Boolean(value))

    return parts.length > 0 ? parts.join(' | ') : DEFAULT_PLAYER_META_LINE
  }

  const getResolvedPresenceState = (presenceState: PresenceState): PresenceState => {
    if (presenceState === PresenceState.IDLE) {
      return PresenceState.OFFLINE
    }

    return getVoiceGroupPresenceState(presenceState)
  }

  const handleBroadcastToggleClick = async () => {
    try {
      if (broadcastModeEnabled) {
        await onToggleBroadcastMode(false)

        const previousRoomId = previousDmVoiceRoomIdRef.current
        if (previousRoomId && allRooms.some((room) => room.id === previousRoomId)) {
          onSelectRoom(previousRoomId)
        }
        return
      }

      if (selectedRoomId) {
        previousDmVoiceRoomIdRef.current = selectedRoomId
      }

      await onToggleBroadcastMode(true)
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : 'Failed to toggle broadcast mode')
    }
  }

  const handleSetDmVoiceRoom = async (roomId: UUID) => {
    previousDmVoiceRoomIdRef.current = roomId

    if (broadcastModeEnabled) {
      try {
        await onToggleBroadcastMode(false)
      } catch (error) {
        setMoveError(error instanceof Error ? error.message : 'Failed to toggle broadcast mode')
      }
    }

    onSelectRoom(roomId)
  }

  return (
    <TooltipProvider delayDuration={140}>
      <section className="room-selector room-selector--mobile-expanded" aria-label="Room Selector">
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
                      void handleBroadcastToggleClick()
                    }}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      campaign
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {broadcastModeEnabled
                    ? 'Broadcast enabled (global)'
                    : 'Broadcast disabled (global)'}
                </TooltipContent>
              </Tooltip>
            ) : null}
            {canManageRooms ? (
              <div className="room-selector-header__create-wrap" ref={createGroupWrapRef}>
                <button
                  type="button"
                  className="room-selector-header__create"
                  onClick={() => {
                    setEnvironmentPickerRoomId(null)
                    setShowCreateGroupModal((current) => !current)
                  }}
                  disabled={!canCreateGroups}
                  aria-haspopup="dialog"
                >
                  Create Group
                </button>
                {showCreateGroupModal ? (
                  <CreateGroupModal
                    onClose={() => setShowCreateGroupModal(false)}
                    onCreateGroup={handleCreateGroup}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        <div
          className={`room-selector-list${isMobileExpanded ? '' : ' room-selector-list--mobile-hidden'}`}
          role="list"
          aria-label="Session groups"
        >
          {dmParticipant && !isGreenroom ? (
            <section className="room-selector-dm" aria-label="Dungeon Master voice controls">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="room-selector-dm__profile"
                    aria-label={dmParticipant.characterName || dmParticipant.username}
                  >
                    <AvatarOverlay
                      username={dmParticipant.characterName || dmParticipant.username}
                      avatarUrl={dmParticipant.avatarUrl}
                      roleLabel={ROOM_ROLE_LABELS.dm}
                      metaLine={getParticipantMetaLine(dmParticipant)}
                      presenceState={getResolvedPresenceState(dmParticipant.presenceState)}
                      isMuted={dmParticipant.isMuted}
                      isSpeaking={dmParticipant.isSpeaking}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="room-selector-profile-tooltip">
                  <div className="room-selector-profile">
                    <div className="room-selector-profile__avatar" aria-hidden="true">
                      {dmParticipant.avatarUrl ? (
                        <img src={dmParticipant.avatarUrl} alt="" />
                      ) : (
                        (dmParticipant.characterName || dmParticipant.username)
                          .charAt(0)
                          .toUpperCase()
                      )}
                    </div>
                    <div className="room-selector-profile__meta">
                      <div className="room-selector-profile__title-row">
                        <span className="room-selector-profile__name-wrap">
                          <strong>{dmParticipant.characterName || dmParticipant.username}</strong>
                          <span className="room-selector-status-pill role compact">
                            <span className="material-symbols-outlined" aria-hidden="true">
                              {STATUS_PILL_ICONS.role}
                            </span>
                            {ROOM_ROLE_LABELS.dm}
                          </span>
                        </span>
                        <span
                          className={`room-selector-status-pill presence ${getResolvedPresenceState(dmParticipant.presenceState).toLowerCase()}`}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            {STATUS_PILL_ICONS.presence}
                          </span>
                          {getResolvedPresenceState(dmParticipant.presenceState)}
                        </span>
                      </div>
                      {dmParticipant.playerName &&
                      dmParticipant.playerName !==
                        (dmParticipant.characterName || dmParticipant.username) ? (
                        <span className="room-selector-profile__player-name">
                          {dmParticipant.playerName}
                        </span>
                      ) : null}
                      <p>{getParticipantMetaLine(dmParticipant)}</p>
                      <div className="room-selector-profile__status-pills">
                        {dmParticipant.isSpeaking ? (
                          <span className="room-selector-status-pill speaking">
                            <span className="material-symbols-outlined" aria-hidden="true">
                              {STATUS_PILL_ICONS.speaking}
                            </span>
                            {STATUS_PILL_LABELS.speaking}
                          </span>
                        ) : null}
                        {dmParticipant.isMuted ? (
                          <span className="room-selector-status-pill muted">
                            <span className="material-symbols-outlined" aria-hidden="true">
                              mic_off
                            </span>
                            {STATUS_PILL_LABELS.muted}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </section>
          ) : null}

          {allRooms.length === 0 ? (
            <p className="room-selector-empty">{ROOM_PRESENCE_COPY.noGroupsAvailable}</p>
          ) : (
            <>
              {renderRoomSection(ROOM_PRESENCE_COPY.mainGroup, mainRooms)}
              {!isGreenroom ? renderRoomSection(ROOM_PRESENCE_COPY.otherGroups, otherRooms) : null}
            </>
          )}
        </div>

        {moveError ? <p className="room-selector-error">{moveError}</p> : null}

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
              radialMenuState.mode === 'condition'
                ? [...CONDITION_PRESETS, RADIAL_MENU_COPY.none]
                : []
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
