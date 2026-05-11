import { useEffect, useMemo, useRef, useState } from 'react'
import { RoomType } from '@shared'
import type { UUID } from '@shared'
import { PresenceState } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../core-ui'
import {
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
  distanceLabel?: string
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
  dmAutoTargetOnFirstPlayerJoin: boolean
  rooms: RoomSelectorRoomWithParticipants[]
  selectedRoomId?: UUID | ''
  onSelectRoom: (roomId: UUID) => void
}

interface RoomSectionRenderOptions {
  dividerOnly?: boolean
  hideHeader?: boolean
  className?: string
}

function isWhisperRoom(room: RoomSelectorRoom): boolean {
  return room.type === RoomType.PRIVATE
}

interface WhisperContextSnapshot {
  previousDmVoiceRoomId: UUID | ''
  previousBroadcastEnabled: boolean
  memberPreviousRoomIds: Record<UUID, UUID>
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
  dmAutoTargetOnFirstPlayerJoin,
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
  const [isDevResettingMocks, setIsDevResettingMocks] = useState(false)
  const createGroupWrapRef = useRef<HTMLDivElement | null>(null)
  const roomListRef = useRef<HTMLDivElement | null>(null)
  const environmentPickerLayerRef = useRef<HTMLDivElement | null>(null)
  const roomSectionRefs = useRef(new Map<UUID, HTMLElement>())
  const longPressTimerRef = useRef<number | null>(null)
  const touchFeedbackTimerRef = useRef<number | null>(null)
  const draggedUserIdRef = useRef<UUID | null>(null)
  const endWhisperInFlightRef = useRef(false)
  const touchStartRef = useRef<{ x: number; y: number; userId: UUID } | null>(null)
  const previousDmVoiceRoomIdRef = useRef<UUID | ''>('')
  const whisperContextRef = useRef<WhisperContextSnapshot | null>(null)
  const createRoom = useStore((state) => state.createRoom)
  const deleteRoom = useStore((state) => state.deleteRoom)
  const clearRoomEnvironmentName = useStore((state) => state.clearRoomEnvironmentName)
  const clearEnvironment = useStore((state) => state.clearEnvironment)
  const setRoomEnvironmentName = useStore((state) => state.setRoomEnvironmentName)
  const replaceSessionTopology = useStore((state) => state.replaceSessionTopology)
  const replaceSessionStatsSnapshot = useStore((state) => state.replaceSessionStatsSnapshot)
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

  const canCreateGroups = canManageRooms && !isGreenroom
  const showCreateGroupControl = canManageRooms && !isGreenroom

  const whisperRoom = useMemo(
    () => allRooms.find((room) => room.type === RoomType.PRIVATE),
    [allRooms]
  )
  const whisperParticipantCount = whisperRoom?.participants.length || 0
  const whisperActive = whisperParticipantCount > 0
  const whisperModeLocked = whisperActive || Boolean(whisperContextRef.current)
  const isDenseRoomLayout =
    canManageRooms && !isGreenroom && (visibleParticipants.length >= 10 || allRooms.length >= 4)

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

  useEffect(() => {
    if (!whisperActive || !whisperRoom) {
      return
    }

    if (!whisperContextRef.current) {
      whisperContextRef.current = {
        previousDmVoiceRoomId: selectedRoomId || previousDmVoiceRoomIdRef.current || '',
        previousBroadcastEnabled: broadcastModeEnabled,
        memberPreviousRoomIds: {},
      }
    }

    if (broadcastModeEnabled) {
      void onToggleBroadcastMode(false).catch((error) => {
        setMoveError(error instanceof Error ? error.message : 'Failed to disable broadcast mode')
      })
    }

    if (selectedRoomId !== whisperRoom.id) {
      previousDmVoiceRoomIdRef.current = selectedRoomId || previousDmVoiceRoomIdRef.current
      onSelectRoom(whisperRoom.id)
    }
  }, [
    broadcastModeEnabled,
    onSelectRoom,
    onToggleBroadcastMode,
    selectedRoomId,
    whisperActive,
    whisperRoom,
  ])

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

    const targetRoom = allRooms.find((room) => room.id === roomId)
    if (targetRoom?.type === RoomType.PRIVATE) {
      setEnvironmentPickerRoomId(null)
      return
    }

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

    for (const room of allRooms) {
      const participants = next[room.id] || []
      participants.sort((left, right) => {
        const leftIsDm = left.userId === dmUserId
        const rightIsDm = right.userId === dmUserId

        // Keep the DM at the top of every room, then sort the rest alphabetically.
        if (leftIsDm !== rightIsDm) {
          return leftIsDm ? -1 : 1
        }

        const leftName = (left.characterName || left.username).trim().toLowerCase()
        const rightName = (right.characterName || right.username).trim().toLowerCase()
        return leftName.localeCompare(rightName)
      })
      next[room.id] = participants
    }

    return next
  }, [allRooms, visibleParticipants, pendingRoomMoves, dmUserId, isGreenroom])

  const handleMoveParticipant = async (userId: UUID, toRoomId: UUID) => {
    setMoveError(null)
    try {
      const targetRoom = allRooms.find((room) => room.id === toRoomId)
      const movedParticipant = visibleParticipants.find(
        (participant) => participant.userId === userId
      )
      const movedFromRoomId = movedParticipant?.roomId
      const targetPlayerCountBefore = (targetRoom?.participants || []).filter(
        (participant) => participant.userId !== dmUserId
      ).length
      const shouldAutoTargetOnFirstPlayerJoin =
        targetRoom?.type === RoomType.GROUP &&
        targetPlayerCountBefore === 0 &&
        dmAutoTargetOnFirstPlayerJoin

      if (
        whisperModeLocked &&
        whisperRoom &&
        movedFromRoomId === whisperRoom.id &&
        toRoomId !== whisperRoom.id
      ) {
        setMoveError('Whisper participants can only leave via End Whisper')
        return
      }

      setPendingRoomMoves((state) => ({ ...state, [userId]: toRoomId }))

      if (
        targetRoom?.type === RoomType.PRIVATE &&
        movedFromRoomId &&
        movedFromRoomId !== toRoomId
      ) {
        if (!whisperContextRef.current) {
          whisperContextRef.current = {
            previousDmVoiceRoomId: selectedRoomId || previousDmVoiceRoomIdRef.current || '',
            previousBroadcastEnabled: broadcastModeEnabled,
            memberPreviousRoomIds: {},
          }
        }

        whisperContextRef.current.memberPreviousRoomIds[userId] = movedFromRoomId
      }

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

      if (targetRoom?.type === RoomType.PRIVATE) {
        if (broadcastModeEnabled) {
          await onToggleBroadcastMode(false)
        }
        onSelectRoom(toRoomId)
      } else if (shouldAutoTargetOnFirstPlayerJoin) {
        onSelectRoom(toRoomId)
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

  useEffect(() => {
    setPendingRoomMoves((state) => {
      let changed = false
      const next = { ...state }

      for (const participant of visibleParticipants) {
        const pendingTarget = next[participant.userId]
        if (!pendingTarget) {
          continue
        }

        if (participant.roomId === pendingTarget) {
          delete next[participant.userId]
          changed = true
        }
      }

      return changed ? next : state
    })
  }, [visibleParticipants])

  useEffect(() => {
    if (!selectedRoomId) {
      return
    }

    const selectedRoomNode = roomSectionRefs.current.get(selectedRoomId as UUID)
    if (!selectedRoomNode || typeof selectedRoomNode.scrollIntoView !== 'function') {
      return
    }

    selectedRoomNode.scrollIntoView({ block: 'nearest' })
  }, [selectedRoomId])

  useEffect(() => {
    if (!moveError) {
      return
    }

    const timeout = window.setTimeout(() => {
      setMoveError(null)
    }, 1500)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [moveError])

  const syncSessionTopologyFromServer = async () => {
    const [roomsResponse, presenceResponse] = await Promise.all([
      fetch(`${apiUrl}/api/v1/rooms/session/${sessionId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      fetch(`${apiUrl}/api/v1/presence/${sessionId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
    ])

    if (!roomsResponse.ok || !presenceResponse.ok) {
      return
    }

    const roomsPayload = (await roomsResponse.json()) as {
      rooms?: Array<{
        id: UUID
        sessionId: UUID
        name: string
        type: RoomType
        createdBy: UUID
        createdAt: number
      }>
    }

    const presencePayload = (await presenceResponse.json()) as {
      presence?: Array<{
        sessionId: UUID
        userId: UUID
        username: string
        playerName?: string
        avatarUrl?: string | null
        characterName?: string | null
        characterClass?: string | null
        characterSubclass?: string | null
        characterRace?: string | null
        level?: number | null
        characterStats?: Record<string, unknown> | null
        primaryRoomId?: UUID
        privateRoomId?: UUID
        state: PresenceState
        lastSeenAt: number
      }>
      stats?: {
        connectedPlayersWithDm: number
        connectedPlayers: number
        connectedSpectators: number
        connectedTotal: number
        updatedAt: number
      }
    }

    replaceSessionTopology(
      sessionId,
      (roomsPayload.rooms || []).map((room) => ({
        id: room.id,
        sessionId: room.sessionId,
        name: room.name,
        type: room.type,
        createdAt: room.createdAt,
        createdBy: room.createdBy,
      })),
      presencePayload.presence || []
    )

    if (presencePayload.stats) {
      replaceSessionStatsSnapshot(sessionId, presencePayload.stats)
    }
  }

  const handleEndWhisper = async () => {
    if (!whisperRoom) {
      return
    }

    if (endWhisperInFlightRef.current) {
      return
    }

    endWhisperInFlightRef.current = true

    setMoveError(null)

    try {
      const response = await fetch(`${apiUrl}/api/v1/rooms/${whisperRoom.id}/end-whisper`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to end whisper')
      }

      await syncSessionTopologyFromServer()

      const snapshot = whisperContextRef.current
      whisperContextRef.current = null

      if (snapshot?.previousDmVoiceRoomId) {
        onSelectRoom(snapshot.previousDmVoiceRoomId)
      }

      if (snapshot?.previousBroadcastEnabled) {
        await onToggleBroadcastMode(true)
      }
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : 'Failed to end whisper')
    } finally {
      endWhisperInFlightRef.current = false
    }
  }

  const handleDevResetMocks = async () => {
    if (!import.meta.env.DEV) {
      return
    }

    setMoveError(null)
    setIsDevResettingMocks(true)

    try {
      const response = await fetch(`${apiUrl}/api/dev/mock-players/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || payload.error || 'Failed to reroll mock players')
      }

      // Ensure immediate UI consistency even if WS delivery is delayed.
      await syncSessionTopologyFromServer()
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : 'Failed to reroll mock players')
    } finally {
      setIsDevResettingMocks(false)
    }
  }

  const handleCreateGroup = async (name: string, type: RoomType) => {
    if (isGreenroom) {
      setMoveError('Groups can only be created during an active or paused session')
      return
    }

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
      if (isWhisperRoom(room)) {
        const whisperResponse = await fetch(`${apiUrl}/api/v1/rooms/${room.id}/end-whisper`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sessionId }),
        })

        if (!whisperResponse.ok) {
          const payload = await whisperResponse.json().catch(() => ({}))
          throw new Error(payload.message || 'Failed to end whisper')
        }

        await syncSessionTopologyFromServer()

        setPendingRoomDeletes((state) => {
          const next = { ...state }
          delete next[room.id]
          return next
        })
        return
      }

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
        .filter(
          (room) =>
            room.type !== RoomType.MAIN && !isGreenRoomName(room.name) && !isWhisperRoom(room)
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [allRooms]
  )

  const whisperRooms = useMemo(
    () =>
      allRooms
        .filter((room) => isWhisperRoom(room))
        .sort((left, right) => left.name.localeCompare(right.name)),
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
    sectionRooms: RoomSelectorRoomWithParticipants[],
    options?: RoomSectionRenderOptions
  ) => {
    if (sectionRooms.length === 0) {
      return null
    }

    return (
      <section
        className={`room-selector-group-section ${options?.className || ''}`.trim()}
        aria-label={sectionLabel}
      >
        {options?.hideHeader ? null : (
          <header
            className={`room-selector-group-section__header ${options?.dividerOnly ? 'room-selector-group-section__header--divider-only' : ''}`}
          >
            {options?.dividerOnly ? (
              <span className="room-selector-group-section__divider" />
            ) : (
              <h5>{sectionLabel}</h5>
            )}
          </header>
        )}

        {sectionRooms.map((room, index) => {
          const selected = room.id === selectedRoomId
          const participants = displayedParticipantsByRoom[room.id] || []
          const previousRoom = index > 0 ? sectionRooms[index - 1] : null
          const isPrivateDividerStart =
            room.type === RoomType.PRIVATE &&
            previousRoom !== null &&
            previousRoom.type !== RoomType.PRIVATE

          const isEmptyGroup =
            participants.length === 0 && room.type !== RoomType.MAIN && !isGreenRoomName(room.name)
          const isWhisperGroup = isWhisperRoom(room)
          const whisperRoomParticipantCount = participants.filter(
            (participant) => participant.userId !== dmUserId
          ).length
          const isEmptyWhisperGroup = isWhisperGroup && whisperRoomParticipantCount === 0
          const isEmptyTargetableGroup =
            room.type === RoomType.GROUP &&
            participants.filter((participant) => participant.userId !== dmUserId).length === 0
          const collapseForDrag = Boolean(draggedUserId) && !selected && !isWhisperGroup
          const isCompactGroup = isEmptyGroup || isWhisperGroup || collapseForDrag
          const memberListClassName = [
            'room-selector-members-list',
            isCompactGroup ? 'room-selector-members-list--hidden' : '',
            selected ? 'room-selector-members-list--selected' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <section
              key={room.id}
              className={`room-selector-item ${selected ? 'selected' : ''} ${
                isPrivateDividerStart ? 'room-selector-item--private-divider' : ''
              } ${isCompactGroup ? 'room-selector-item--collapsed' : ''} ${isEmptyWhisperGroup ? 'room-selector-item--whisper-empty' : ''} ${collapseForDrag ? 'room-selector-item--drag-collapsed' : ''} ${selected && isDenseRoomLayout ? 'room-selector-item--selected-focus' : ''}`}
              aria-label={`Group ${room.name}`}
              ref={(node) => {
                if (node) {
                  roomSectionRefs.current.set(room.id, node)
                  return
                }

                roomSectionRefs.current.delete(room.id)
              }}
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
                  draggedUserIdRef.current ||
                  draggedUserId ||
                  '') as UUID | ''

                if (droppedUserId) {
                  void handleMoveParticipant(droppedUserId, room.id)
                }

                setDraggedUserId(null)
                draggedUserIdRef.current = null
              }}
              onClick={(event) => {
                if (!canManageRooms || isGreenroom || isWhisperGroup) {
                  return
                }

                if (isEmptyTargetableGroup) {
                  return
                }

                const target = event.target
                if (!(target instanceof Element)) {
                  return
                }

                if (
                  target.closest('button, [role="button"], a, input, select, textarea, label') ||
                  target.closest('.room-selector-member') ||
                  target.closest('.room-selector-item__env-picker')
                ) {
                  return
                }

                void handleSetDmVoiceRoom(room.id)
              }}
            >
              <div className="room-selector-item__header">
                <span className="room-selector-item-heading-row">
                  <button
                    type="button"
                    className="room-selector-item__select"
                    aria-label={`Select group ${room.name}`}
                    aria-pressed={selected}
                    onClick={() => {
                      if (canManageRooms) {
                        void handleSetDmVoiceRoom(room.id)
                        return
                      }

                      onSelectRoom(room.id)
                    }}
                  >
                    <span className="room-selector-item-name">
                      {isWhisperGroup ? (
                        <span className="material-symbols-outlined" aria-hidden="true">
                          lock
                        </span>
                      ) : room.type === RoomType.GROUP ? (
                        <span className="material-symbols-outlined" aria-hidden="true">
                          groups
                        </span>
                      ) : (
                        <Icon name="voice" />
                      )}
                      {getDisplayRoomName(room)}
                    </span>
                  </button>

                  <span className="room-selector-item-actions">
                    {!isWhisperGroup ? (
                      <div className="room-selector-item__env-wrap">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="room-selector-item__env-icon"
                              aria-label="Change group environment"
                              data-room-env-trigger={room.id}
                              disabled={isGreenroom}
                              title={
                                isGreenroom
                                  ? 'Environment controls are disabled in greenroom'
                                  : 'Change group environment'
                              }
                              onClick={() => {
                                if (isGreenroom) {
                                  return
                                }
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
                    ) : null}

                    {canManageRooms ? (
                      <>
                        {!isWhisperGroup ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className={`room-selector-item__icon-action room-selector-item__voice-icon ${
                                  broadcastModeEnabled && !whisperModeLocked
                                    ? 'is-broadcast'
                                    : selectedRoomId === room.id
                                      ? 'active'
                                      : ''
                                }`}
                                aria-label={`Set DM voice to ${getDisplayRoomName(room)}`}
                                aria-pressed={broadcastModeEnabled || selectedRoomId === room.id}
                                disabled={
                                  isGreenroom ||
                                  isEmptyTargetableGroup ||
                                  (whisperModeLocked && whisperRoom
                                    ? room.id !== whisperRoom.id
                                    : false)
                                }
                                onClick={() => {
                                  if (isGreenroom) {
                                    return
                                  }
                                  void handleSetDmVoiceRoom(room.id)
                                }}
                              >
                                <span className="material-symbols-outlined" aria-hidden="true">
                                  record_voice_over
                                </span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {isEmptyTargetableGroup
                                ? 'Cannot target an empty group'
                                : whisperModeLocked && whisperRoom && room.id !== whisperRoom.id
                                  ? 'DM voice target is locked to whisper while whisper is active'
                                  : `Set DM voice to ${getDisplayRoomName(room)}`}
                            </TooltipContent>
                          </Tooltip>
                        ) : null}

                        {room.type !== RoomType.MAIN &&
                        !isGreenRoomName(room.name) &&
                        (!isWhisperGroup || !isEmptyWhisperGroup) ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="room-selector-item__icon-action room-selector-item__close-inline"
                                aria-label={`${isWhisperGroup ? 'End whisper' : 'Delete group'} ${getDisplayRoomName(room)}`}
                                disabled={Boolean(pendingRoomDeletes[room.id])}
                                onClick={() => {
                                  void handleDeleteGroup(room)
                                }}
                              >
                                <span className="material-symbols-outlined" aria-hidden="true">
                                  {isWhisperGroup ? 'exit_to_app' : 'close'}
                                </span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {isWhisperGroup ? 'End whisper' : 'Delete group'}
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                      </>
                    ) : null}
                  </span>
                </span>

                {!isWhisperGroup && environmentPickerRoomId === room.id ? (
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
              </div>

              <div className={memberListClassName}>
                {participants.length === 0
                  ? null
                  : participants.map((member) => {
                      const canDrag = canManageRooms && !isGreenroom && member.roleLabel !== 'DM'
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
                                draggedUserIdRef.current = member.userId
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
                              onDragEnd={() => {
                                window.setTimeout(() => {
                                  setDraggedUserId(null)
                                  draggedUserIdRef.current = null
                                }, 0)
                              }}
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
                                {isMuted ? (
                                  <span className="room-selector-profile__avatar-muted-badge">
                                    <span className="material-symbols-outlined" aria-hidden="true">
                                      mic_off
                                    </span>
                                  </span>
                                ) : null}
                              </div>
                              <div className="room-selector-profile__meta">
                                <div className="room-selector-profile__title-row">
                                  <span className="room-selector-profile__name-wrap">
                                    <strong>{member.characterName || member.username}</strong>
                                    <span className="room-selector-status-pill role compact">
                                      <span
                                        className="material-symbols-outlined"
                                        aria-hidden="true"
                                      >
                                        {STATUS_PILL_ICONS.role}
                                      </span>
                                      {member.roleLabel || ROOM_ROLE_LABELS.player}
                                    </span>
                                  </span>
                                  <span
                                    className="room-selector-presence-dot"
                                    data-state={getPresenceDotState(shownPresenceState)}
                                    role="status"
                                    aria-label={shownPresenceState}
                                  >
                                    <span
                                      className="room-selector-presence-dot__inner"
                                      aria-hidden="true"
                                    />
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
                                  <span className="room-selector-status-pill environment">
                                    <span className="material-symbols-outlined" aria-hidden="true">
                                      {STATUS_PILL_ICONS.environment}
                                    </span>
                                    Env: {getResolvedEnvironmentName(room)}
                                  </span>
                                  <span className="room-selector-status-pill distance">
                                    <span className="material-symbols-outlined" aria-hidden="true">
                                      {STATUS_PILL_ICONS.distance}
                                    </span>
                                    Distance:{' '}
                                    {member.distanceLabel || STATUS_PILL_LABELS.distanceDefault}
                                  </span>
                                  <span className="room-selector-status-pill condition">
                                    <span className="material-symbols-outlined" aria-hidden="true">
                                      {STATUS_PILL_ICONS.condition}
                                    </span>
                                    Condition:{' '}
                                    {member.condition || STATUS_PILL_LABELS.conditionNone}
                                  </span>
                                  {isMuted ? (
                                    <span className="room-selector-status-pill muted">
                                      <span
                                        className="material-symbols-outlined"
                                        aria-hidden="true"
                                      >
                                        {STATUS_PILL_ICONS.muted}
                                      </span>
                                      {STATUS_PILL_LABELS.muted}
                                    </span>
                                  ) : null}
                                  {member.isSpeaking ? (
                                    <span className="room-selector-status-pill speaking">
                                      <span
                                        className="material-symbols-outlined"
                                        aria-hidden="true"
                                      >
                                        {STATUS_PILL_ICONS.speaking}
                                      </span>
                                      {STATUS_PILL_LABELS.speaking}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )
                    })}
              </div>
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

    const typedStats = stats as Record<string, unknown>
    const ordered: Array<[string, unknown]> = [
      ['STR', typedStats.str],
      ['DEX', typedStats.dex],
      ['CON', typedStats.con],
      ['INT', typedStats.int],
      ['WIS', typedStats.wis],
      ['CHA', typedStats.cha],
    ]

    return ordered.filter(([, value]) => value !== null && value !== undefined)
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

  const getPresenceDotState = (presenceState: PresenceState): 'online' | 'offline' => {
    return getResolvedPresenceState(presenceState) === PresenceState.OFFLINE ? 'offline' : 'online'
  }

  const handleBroadcastToggleClick = async () => {
    if (whisperModeLocked) {
      setMoveError('Broadcast is locked while whisper is active')
      return
    }

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
    if (whisperModeLocked && whisperRoom && roomId !== whisperRoom.id) {
      setMoveError('DM voice target is locked to whisper while whisper is active')
      return
    }

    const targetRoom = allRooms.find((room) => room.id === roomId)
    if (targetRoom?.type === RoomType.GROUP) {
      const targetPlayers = (targetRoom.participants || []).filter(
        (participant) => participant.userId !== dmUserId
      )

      if (targetPlayers.length === 0) {
        setMoveError('Cannot set DM voice target to an empty group')
        return
      }
    }

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

  useEffect(() => {
    if (!canManageRooms || !whisperRoom) {
      return
    }

    if (!whisperModeLocked || whisperParticipantCount > 0) {
      return
    }

    void handleEndWhisper()
  }, [canManageRooms, whisperModeLocked, whisperParticipantCount, whisperRoom])

  useEffect(() => {
    if (!canManageRooms || !selectedRoomId) {
      return
    }

    const targetedRoom = allRooms.find((room) => room.id === selectedRoomId)
    if (!targetedRoom || targetedRoom.type !== RoomType.GROUP) {
      return
    }

    const targetedPlayers = (targetedRoom.participants || []).filter(
      (participant) => participant.userId !== dmUserId
    )
    if (targetedPlayers.length > 0) {
      return
    }

    const mainRoom = allRooms.find((room) => room.type === RoomType.MAIN)
    if (!mainRoom || mainRoom.id === targetedRoom.id) {
      return
    }

    onSelectRoom(mainRoom.id)
  }, [allRooms, canManageRooms, dmUserId, onSelectRoom, selectedRoomId])

  useEffect(() => {
    if (!environmentPickerRoomId) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      const listElement = roomListRef.current
      const pickerElement = environmentPickerLayerRef.current

      if (!listElement || !pickerElement) {
        return
      }

      const listRect = listElement.getBoundingClientRect()
      const pickerRect = pickerElement.getBoundingClientRect()

      const bottomOverflow = pickerRect.bottom - (listRect.bottom - 8)
      if (bottomOverflow > 0) {
        listElement.scrollBy({ top: bottomOverflow + 12, behavior: 'smooth' })
        return
      }

      const topOverflow = listRect.top + 8 - pickerRect.top
      if (topOverflow > 0) {
        listElement.scrollBy({ top: -(topOverflow + 12), behavior: 'smooth' })
      }
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [environmentPickerRoomId])

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
                      broadcastModeEnabled && !whisperModeLocked ? 'active' : ''
                    }`}
                    aria-label={
                      broadcastModeEnabled ? 'Disable broadcast mode' : 'Enable broadcast mode'
                    }
                    disabled={whisperModeLocked}
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
                  {whisperModeLocked
                    ? 'Broadcast locked while whisper is active'
                    : broadcastModeEnabled
                      ? 'Broadcast enabled (global)'
                      : 'Broadcast disabled (global)'}
                </TooltipContent>
              </Tooltip>
            ) : null}
            {canManageRooms && import.meta.env.DEV ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="room-selector-header__broadcast-icon"
                    aria-label="Reroll DEV mock players"
                    disabled={isDevResettingMocks}
                    onClick={() => {
                      void handleDevResetMocks()
                    }}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      shuffle
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Reroll DEV mock players</TooltipContent>
              </Tooltip>
            ) : null}
            {showCreateGroupControl ? (
              <div className="room-selector-header__create-wrap" ref={createGroupWrapRef}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={`room-selector-header__create-icon ${showCreateGroupModal ? 'active' : ''}`}
                      onClick={() => {
                        setEnvironmentPickerRoomId(null)
                        setShowCreateGroupModal((current) => !current)
                      }}
                      disabled={!canCreateGroups}
                      aria-label="Create group"
                      aria-haspopup="dialog"
                      aria-expanded={showCreateGroupModal}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        group_add
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {canCreateGroups ? 'Create group' : 'Create groups in greenroom'}
                  </TooltipContent>
                </Tooltip>
                {showCreateGroupModal ? (
                  <CreateGroupModal
                    onClose={() => setShowCreateGroupModal(false)}
                    onCreateGroup={handleCreateGroup}
                  />
                ) : null}
              </div>
            ) : null}
            {canManageRooms && whisperActive ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="room-selector-header__end-whisper"
                    onClick={() => {
                      void handleEndWhisper()
                    }}
                    aria-label="End whisper"
                    title="End whisper"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      exit_to_app
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">End whisper</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </header>

        <div className="room-selector-body">
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
                      {dmParticipant.isMuted ? (
                        <span className="room-selector-profile__avatar-muted-badge">
                          <span className="material-symbols-outlined" aria-hidden="true">
                            mic_off
                          </span>
                        </span>
                      ) : null}
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
                          className="room-selector-presence-dot"
                          data-state={getPresenceDotState(dmParticipant.presenceState)}
                          role="status"
                          aria-label={getResolvedPresenceState(dmParticipant.presenceState)}
                        >
                          <span className="room-selector-presence-dot__inner" aria-hidden="true" />
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
                      </div>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </section>
          ) : null}

          <div className="room-selector-stack">
            <div
              className={`room-selector-list${isMobileExpanded ? '' : ' room-selector-list--mobile-hidden'}`}
              role="list"
              aria-label="Session groups"
              ref={roomListRef}
            >
              {allRooms.length === 0 ? (
                <p className="room-selector-empty">{ROOM_PRESENCE_COPY.noGroupsAvailable}</p>
              ) : (
                <>
                  {renderRoomSection(ROOM_PRESENCE_COPY.mainGroup, mainRooms, {
                    hideHeader: true,
                  })}
                  {otherRooms.length > 0
                    ? renderRoomSection(ROOM_PRESENCE_COPY.otherGroups, otherRooms, {
                        hideHeader: true,
                        className: 'room-selector-group-section--after-main',
                      })
                    : null}
                </>
              )}
            </div>

            {!isGreenroom && whisperRooms.length > 0 ? (
              <div className="room-selector-whisper-dock">
                {renderRoomSection('Whisper', whisperRooms, {
                  dividerOnly: true,
                })}
              </div>
            ) : null}
          </div>
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
