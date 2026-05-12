import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PresenceState, RoomType } from '@shared'
import type { UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../core-ui'
import {
  getVoiceGroupPresenceState,
  isGreenRoomName,
  RADIAL_MENU_COPY,
  ROOM_PRESENCE_COPY,
  ROOM_ROLE_LABELS,
} from '../../constants/roomPresence.constants'
import { CONDITION_PRESETS, DM_FLAVOR_LINES } from '../../constants/voiceGroup.constants'
import { STATUS_PILL_ICONS, STATUS_PILL_LABELS } from '../../constants/voiceGroupStatus.constants'
import { useStore } from '../../hooks/useStore'
import { Icon } from '../ui/Icon'
import { AvatarOverlay } from './AvatarOverlay'
import { RoomGroupCard } from './RoomGroupCard'
import { RoomHeaderActions } from './RoomHeaderActions'
import { WhisperDock } from './WhisperDock'
import {
  getDisplayRoomName,
  getParticipantMetaLine,
  getResolvedEnvironmentName,
  getStatEntries,
  waitForRoomDeleteReconciled,
} from './roomSelector.helpers'
import {
  isWhisperRoom,
  type RoomParticipantStatus,
  type RoomParticipantWithRoomId,
  type RoomSelectorProps,
  type RoomSelectorRoomWithParticipants,
} from './roomSelector.types'
import { useRoomMoves } from './useRoomMoves'
import { useWhisperFlow } from './useWhisperFlow'
import '../../styles/components/rooms/RoomSelector.css'

export type { RoomParticipantStatus, RoomSelectorRoom } from './roomSelector.types'

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
  dmAutoTargetOnFirstPlayerJoin = false,
  rooms,
  selectedRoomId,
  onSelectRoom,
}: RoomSelectorProps) {
  const [isMobileExpanded] = useState(true)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
  const [optimisticRooms, setOptimisticRooms] = useState<RoomSelectorRoomWithParticipants[]>([])
  const [pendingRoomDeletes, setPendingRoomDeletes] = useState<Record<UUID, true>>({})
  const [environmentPickerRoomId, setEnvironmentPickerRoomId] = useState<UUID | null>(null)
  const [touchFeedbackUserId, setTouchFeedbackUserId] = useState<UUID | null>(null)
  const [isDevResettingMocks, setIsDevResettingMocks] = useState(false)
  const createGroupWrapRef = useRef<HTMLDivElement | null>(null)
  const roomListRef = useRef<HTMLDivElement | null>(null)
  const environmentPickerLayerRef = useRef<HTMLDivElement | null>(null)
  const createRoom = useStore((state) => state.createRoom)
  const clearRoomEnvironmentName = useStore((state) => state.clearRoomEnvironmentName)
  const clearEnvironment = useStore((state) => state.clearEnvironment)
  const setRoomEnvironmentName = useStore((state) => state.setRoomEnvironmentName)
  const replaceSessionTopology = useStore((state) => state.replaceSessionTopology)
  const replaceSessionStatsSnapshot = useStore((state) => state.replaceSessionStatsSnapshot)
  const setDMOverride = useStore((state) => state.setDMOverride)

  const dmFlavorLine = useMemo(() => {
    const seed = `${dmUserId}:${sessionId}`
    let hash = 0
    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash << 5) - hash + seed.charCodeAt(index)
      hash |= 0
    }

    return DM_FLAVOR_LINES[Math.abs(hash) % DM_FLAVOR_LINES.length]
  }, [dmUserId, sessionId])

  const confirmedRoomIds = useMemo(() => new Set(rooms.map((room) => room.id)), [rooms])

  const allRooms = useMemo(() => {
    const byId = new Map<UUID, RoomSelectorRoomWithParticipants>()

    for (const room of rooms) {
      byId.set(room.id, room)
    }

    for (const room of optimisticRooms) {
      if (!confirmedRoomIds.has(room.id) && !byId.has(room.id)) {
        byId.set(room.id, room)
      }
    }

    return [...byId.values()]
  }, [confirmedRoomIds, optimisticRooms, rooms])

  const baseParticipants = useMemo<RoomParticipantWithRoomId[]>(
    () =>
      allRooms.flatMap((room) =>
        room.participants.map((participant) => ({
          ...participant,
          roomId: room.id,
        }))
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
  const isDenseRoomLayout =
    canManageRooms && !isGreenroom && (visibleParticipants.length >= 10 || allRooms.length >= 4)
  const activeEnvironmentPickerRoomId = isGreenroom ? null : environmentPickerRoomId
  const baseWhisperRoom = useMemo(
    () => allRooms.find((room) => room.type === RoomType.PRIVATE),
    [allRooms]
  )
  const baseWhisperPlayerCount = useMemo(
    () =>
      (baseWhisperRoom?.participants || []).filter((participant) => participant.userId !== dmUserId)
        .length,
    [baseWhisperRoom, dmUserId]
  )

  const syncSessionTopologyFromServer = useCallback(async () => {
    const [roomsResponse, presenceResponse] = await Promise.all([
      fetch(`${apiUrl}/api/v1/rooms/session/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`${apiUrl}/api/v1/presence/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
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
  }, [apiUrl, replaceSessionStatsSnapshot, replaceSessionTopology, sessionId, token])

  const getRoomMemberIdsFromServer = useCallback(
    async (roomId: UUID): Promise<UUID[] | null> => {
      const response = await fetch(`${apiUrl}/api/v1/presence/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        return null
      }

      const payload = (await response.json()) as {
        presence?: Array<{
          userId: UUID
          primaryRoomId?: UUID
        }>
      }

      return (payload.presence || [])
        .filter((entry) => entry.primaryRoomId === roomId)
        .map((entry) => entry.userId)
    },
    [apiUrl, sessionId, token]
  )

  const whisperEntryRef = useRef<(userId: UUID, fromRoomId: UUID) => void>(() => undefined)
  const lastWhisperPlayerMovedOutRef = useRef<(mainRoomId: UUID) => Promise<void>>(
    async () => undefined
  )

  const roomMoves = useRoomMoves({
    apiUrl,
    token,
    sessionId,
    dmUserId,
    allRooms,
    visibleParticipants,
    dmAutoTargetOnFirstPlayerJoin,
    broadcastModeEnabled,
    onToggleBroadcastMode,
    onSelectRoom,
    whisperRoomId: baseWhisperRoom?.id,
    whisperDisplayedPlayerCount: baseWhisperPlayerCount,
    onWhisperEntry: (userId, fromRoomId) => {
      whisperEntryRef.current(userId, fromRoomId)
    },
    onLastWhisperPlayerMovedOut: async (mainRoomId) =>
      lastWhisperPlayerMovedOutRef.current(mainRoomId),
    syncSessionTopologyFromServer,
  })

  const whisperFlow = useWhisperFlow({
    apiUrl,
    token,
    sessionId,
    dmUserId,
    allRooms,
    displayedParticipantsByRoom: roomMoves.displayedParticipantsByRoom,
    pendingRoomMoves: roomMoves.pendingRoomMoves,
    selectedRoomId,
    broadcastModeEnabled,
    canManageRooms,
    onToggleBroadcastMode,
    onSelectRoom,
    setMoveError,
    syncSessionTopologyFromServer,
    getRoomMemberIdsFromServer,
  })

  useEffect(() => {
    whisperEntryRef.current = whisperFlow.noteWhisperEntry
  }, [whisperFlow.noteWhisperEntry])

  useEffect(() => {
    lastWhisperPlayerMovedOutRef.current = async (mainRoomId: UUID) => {
      whisperFlow.setWhisperExitVoiceRoom(mainRoomId)
      await whisperFlow.handleEndWhisper()
    }
  }, [whisperFlow])

  const getResolvedPresenceState = useCallback((presenceState: PresenceState) => {
    if (presenceState === PresenceState.IDLE) {
      return PresenceState.OFFLINE
    }

    return getVoiceGroupPresenceState(presenceState)
  }, [])

  const getPresenceDotState = useCallback(
    (presenceState: PresenceState): 'online' | 'offline' =>
      getResolvedPresenceState(presenceState) === PresenceState.OFFLINE ? 'offline' : 'online',
    [getResolvedPresenceState]
  )

  const getParticipantMetaLineForRoom = useCallback(
    (member: RoomParticipantWithRoomId | RoomParticipantStatus) =>
      getParticipantMetaLine(member, dmFlavorLine),
    [dmFlavorLine]
  )

  useEffect(() => {
    if (!showCreateGroupModal && !activeEnvironmentPickerRoomId) {
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

      if (!activeEnvironmentPickerRoomId) {
        return
      }

      const currentTrigger = target.closest('[data-room-env-trigger]')
      const triggerRoomId = currentTrigger?.getAttribute('data-room-env-trigger') as UUID | null
      const isInsideOpenTrigger = triggerRoomId === activeEnvironmentPickerRoomId
      const isInsideOpenPicker = environmentPickerLayerRef.current?.contains(target) ?? false

      if (!isInsideOpenTrigger && !isInsideOpenPicker) {
        setEnvironmentPickerRoomId(null)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      if (activeEnvironmentPickerRoomId) {
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
  }, [activeEnvironmentPickerRoomId, showCreateGroupModal])

  useEffect(() => {
    if (!selectedRoomId || !roomListRef.current) {
      return
    }

    const selectedRoomNode = roomListRef.current.querySelector<HTMLElement>(
      `[data-room-id="${selectedRoomId}"]`
    )

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
    }, 5000)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [moveError])

  useEffect(() => {
    if (!activeEnvironmentPickerRoomId) {
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
  }, [activeEnvironmentPickerRoomId])

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

  const handleApplyEnvironment = useCallback(
    async (roomId: UUID, environmentName: string) => {
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
          body: JSON.stringify({ sessionId, roomId, environmentName }),
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || 'Failed to apply environment')
        }

        setRoomEnvironmentName(roomId, environmentName)
        setEnvironmentPickerRoomId(null)
      } catch (error) {
        setMoveError(error instanceof Error ? error.message : 'Failed to apply environment')
      }
    },
    [allRooms, apiUrl, sessionId, setRoomEnvironmentName, token]
  )

  const handleApplyMuteOverride = useCallback(
    async (targetUserId: UUID, muted: boolean) => {
      setMoveError(null)

      const previousOverride = useStore.getState().dmOverrides.get(targetUserId) || null

      setDMOverride(
        targetUserId,
        muted
          ? {
              userId: targetUserId,
              overrideType: 'MUTE',
              appliedAt: Date.now(),
            }
          : null
      )

      try {
        const response = await fetch(
          `${apiUrl}/api/v1/audio/dm-override/${muted ? 'apply' : 'remove'}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(
              muted
                ? {
                    sessionId,
                    targetUserId,
                    overrideType: 'MUTE',
                    parameters: {},
                  }
                : {
                    sessionId,
                    targetUserId,
                    overrideType: 'MUTE',
                  }
            ),
          }
        )

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || `Failed to ${muted ? 'mute' : 'unmute'} participant`)
        }
      } catch (error) {
        setDMOverride(targetUserId, previousOverride)
        setMoveError(error instanceof Error ? error.message : 'Failed to update mute override')
      }
    },
    [apiUrl, sessionId, setDMOverride, token]
  )

  const handleApplyConditionOverride = useCallback(
    async (targetUserId: UUID, conditionName: string) => {
      setMoveError(null)

      try {
        const removing = conditionName === RADIAL_MENU_COPY.none
        const response = await fetch(
          `${apiUrl}/api/v1/audio/dm-override/${removing ? 'remove' : 'apply'}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(
              removing
                ? {
                    sessionId,
                    targetUserId,
                    overrideType: 'CONDITION',
                  }
                : {
                    sessionId,
                    targetUserId,
                    overrideType: 'CONDITION',
                    parameters: { conditionName },
                  }
            ),
          }
        )

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || 'Failed to update condition')
        }
      } catch (error) {
        setMoveError(error instanceof Error ? error.message : 'Failed to update condition')
      }
    },
    [apiUrl, sessionId, token]
  )

  const handleBroadcastToggleClick = useCallback(async () => {
    if (whisperFlow.whisperModeLocked) {
      setMoveError('Broadcast is locked while whisper is active')
      return
    }

    try {
      if (broadcastModeEnabled) {
        await onToggleBroadcastMode(false)

        const previousRoomId = whisperFlow.getRememberedDmVoiceRoom()
        if (previousRoomId && allRooms.some((room) => room.id === previousRoomId)) {
          onSelectRoom(previousRoomId)
        }

        return
      }

      if (selectedRoomId) {
        whisperFlow.rememberDmVoiceRoom(selectedRoomId)
      }

      await onToggleBroadcastMode(true)
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : 'Failed to toggle broadcast mode')
    }
  }, [
    allRooms,
    broadcastModeEnabled,
    onSelectRoom,
    onToggleBroadcastMode,
    selectedRoomId,
    whisperFlow,
  ])

  const handleSetDmVoiceRoom = useCallback(
    async (roomId: UUID) => {
      if (
        whisperFlow.whisperModeLocked &&
        whisperFlow.whisperRoom &&
        roomId !== whisperFlow.whisperRoom.id
      ) {
        setMoveError('DM voice target is locked to whisper while whisper is active')
        return
      }

      const targetRoom = allRooms.find((room) => room.id === roomId)
      const localParticipantCount = Math.max(
        targetRoom?.participants.length || 0,
        roomMoves.displayedParticipantsByRoom[roomId]?.length || 0
      )

      if (targetRoom && localParticipantCount === 0) {
        const serverMemberIds = await getRoomMemberIdsFromServer(roomId)
        const serverParticipantCount = (serverMemberIds || []).length

        if (serverParticipantCount === 0) {
          setMoveError('Cannot set DM voice target to an empty room or group')
          return
        }
      }

      whisperFlow.rememberDmVoiceRoom(roomId)

      if (broadcastModeEnabled) {
        try {
          await onToggleBroadcastMode(false)
        } catch (error) {
          setMoveError(error instanceof Error ? error.message : 'Failed to toggle broadcast mode')
        }
      }

      onSelectRoom(roomId)
    },
    [
      allRooms,
      broadcastModeEnabled,
      getRoomMemberIdsFromServer,
      onSelectRoom,
      onToggleBroadcastMode,
      roomMoves.displayedParticipantsByRoom,
      whisperFlow,
    ]
  )

  const handleClearMemberEffects = useCallback(
    async (targetUserId: UUID) => {
      setMoveError(null)

      await Promise.all([
        handleApplyMuteOverride(targetUserId, false),
        handleApplyConditionOverride(targetUserId, RADIAL_MENU_COPY.none),
      ])
    },
    [handleApplyConditionOverride, handleApplyMuteOverride]
  )

  const handleDevResetMocks = useCallback(async () => {
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

      await syncSessionTopologyFromServer()
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : 'Failed to reroll mock players')
    } finally {
      setIsDevResettingMocks(false)
    }
  }, [apiUrl, sessionId, syncSessionTopologyFromServer, token])

  const handleCreateGroup = useCallback(
    async (name: string, type: RoomType) => {
      if (isGreenroom) {
        setMoveError('Groups can only be created during an active or paused session')
        return
      }

      setMoveError(null)

      const tempId = crypto.randomUUID() as UUID
      setOptimisticRooms((state) => [
        ...state,
        { id: tempId, name, type, memberCount: 0, participants: [] },
      ])

      try {
        const response = await fetch(`${apiUrl}/api/v1/rooms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sessionId, name, type }),
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

          onSelectRoom(payload.room.id)
        }
      } finally {
        setOptimisticRooms((state) => state.filter((room) => room.id !== tempId))
      }
    },
    [apiUrl, createRoom, dmUserId, isGreenroom, onSelectRoom, sessionId, token]
  )

  const clearPendingRoomDelete = useCallback(
    (roomId: UUID) => {
      setPendingRoomDeletes((state) => {
        const next = { ...state }
        delete next[roomId]
        return next
      })
      clearRoomEnvironmentName(roomId)
    },
    [clearRoomEnvironmentName]
  )

  const handleDeleteGroup = useCallback(
    async (room: RoomSelectorRoomWithParticipants) => {
      if (room.type === RoomType.MAIN || isGreenRoomName(room.name)) {
        return
      }

      setMoveError(null)
      setPendingRoomDeletes((state) => ({ ...state, [room.id]: true }))

      try {
        if (isWhisperRoom(room)) {
          await whisperFlow.handleEndWhisper()
          clearPendingRoomDelete(room.id)
          return
        }

        const serverMemberIds = await getRoomMemberIdsFromServer(room.id)
        const fallbackMemberIds = room.participants.map((participant) => participant.userId)
        const membersToEvacuate = [
          ...new Set([...fallbackMemberIds, ...(serverMemberIds || [])]),
        ].filter((userId) => userId !== dmUserId)

        if (membersToEvacuate.length > 0) {
          const mainRoom = allRooms.find((entry) => entry.type === RoomType.MAIN)
          if (!mainRoom) {
            throw new Error('Main room not found')
          }

          for (const memberId of membersToEvacuate) {
            await roomMoves.moveParticipantToRoom(memberId, mainRoom.id, {
              suppressSelection: true,
            })
          }

          await syncSessionTopologyFromServer()
          whisperFlow.rememberDmVoiceRoom(mainRoom.id)
          onSelectRoom(mainRoom.id)

          if (selectedRoomId === room.id) {
            clearEnvironment()
          }

          clearPendingRoomDelete(room.id)
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

        await waitForRoomDeleteReconciled({
          deletedRoomId: room.id,
          sessionId,
          syncSessionTopologyFromServer,
          getStoreState: () => {
            const storeState = useStore.getState()
            return {
              rooms: storeState.rooms as Record<UUID, Record<UUID, { id: UUID }>>,
              sessionPresence: storeState.sessionPresence as Record<
                UUID,
                Record<UUID, { primaryRoomId?: UUID }>
              >,
            }
          },
        })

        clearPendingRoomDelete(room.id)
      } catch (error) {
        clearPendingRoomDelete(room.id)
        setMoveError(error instanceof Error ? error.message : 'Failed to close group')
      }
    },
    [
      allRooms,
      apiUrl,
      clearEnvironment,
      clearPendingRoomDelete,
      dmUserId,
      getRoomMemberIdsFromServer,
      onSelectRoom,
      roomMoves,
      selectedRoomId,
      sessionId,
      syncSessionTopologyFromServer,
      token,
      whisperFlow,
    ]
  )

  useEffect(() => {
    if (!canManageRooms || !selectedRoomId) {
      return
    }

    const targetedRoom = allRooms.find((room) => room.id === selectedRoomId)
    if (!targetedRoom || targetedRoom.type !== RoomType.GROUP) {
      return
    }

    const targetedPlayers = (roomMoves.displayedParticipantsByRoom[selectedRoomId] || []).filter(
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
  }, [
    allRooms,
    canManageRooms,
    dmUserId,
    onSelectRoom,
    roomMoves.displayedParticipantsByRoom,
    selectedRoomId,
  ])

  const renderRoomCard = (room: RoomSelectorRoomWithParticipants) => (
    <RoomGroupCard
      key={room.id}
      room={room}
      selected={room.id === selectedRoomId}
      participants={roomMoves.displayedParticipantsByRoom[room.id] || []}
      canManageRooms={canManageRooms}
      isGreenroom={isGreenroom}
      isDenseRoomLayout={isDenseRoomLayout}
      draggedUserId={roomMoves.draggedUserId}
      broadcastModeEnabled={broadcastModeEnabled}
      whisperModeLocked={whisperFlow.whisperModeLocked}
      whisperRoomId={whisperFlow.whisperRoom?.id}
      whisperEndBlockedByPendingMoves={whisperFlow.whisperEndBlockedByPendingMoves}
      pendingDelete={Boolean(pendingRoomDeletes[room.id])}
      selectedRoomId={selectedRoomId}
      environmentPickerRoomId={activeEnvironmentPickerRoomId}
      environmentPickerLayerRef={environmentPickerLayerRef}
      touchFeedbackUserId={touchFeedbackUserId}
      setTouchFeedbackUserId={setTouchFeedbackUserId}
      dmUserId={dmUserId}
      onApplyEnvironment={(roomId, environmentName) => {
        void handleApplyEnvironment(roomId, environmentName)
      }}
      onToggleEnvironmentPicker={(roomId) => {
        if (isGreenroom) {
          return
        }
        setShowCreateGroupModal(false)
        setEnvironmentPickerRoomId((current) => (current === roomId ? null : roomId))
      }}
      onSelectRoom={onSelectRoom}
      onSetDmVoiceRoom={handleSetDmVoiceRoom}
      onDeleteGroup={handleDeleteGroup}
      onRoomDragOver={roomMoves.handleRoomDragOver}
      onRoomDrop={roomMoves.handleRoomDrop}
      conditionTargets={[...CONDITION_PRESETS, RADIAL_MENU_COPY.none]}
      onApplyConditionOverride={(userId, conditionName) => {
        void handleApplyConditionOverride(userId, conditionName)
      }}
      onApplyMuteOverride={(userId, nextMuted) => {
        void handleApplyMuteOverride(userId, nextMuted)
      }}
      onClearMemberEffects={(userId) => {
        void handleClearMemberEffects(userId)
      }}
      onMemberDragStart={roomMoves.handleMemberDragStart}
      onMemberDragEnd={roomMoves.handleMemberDragEnd}
      getDisplayRoomName={getDisplayRoomName}
      getResolvedEnvironmentName={getResolvedEnvironmentName}
      getParticipantMetaLine={getParticipantMetaLineForRoom}
      getResolvedPresenceState={getResolvedPresenceState}
      getPresenceDotState={getPresenceDotState}
      getStatEntries={getStatEntries}
    />
  )

  return (
    <TooltipProvider delayDuration={140}>
      <section className="room-selector room-selector--mobile-expanded" aria-label="Room Selector">
        <header className="room-selector-header">
          <h4>
            <Icon name="rooms" /> Voice Groups
          </h4>
          <RoomHeaderActions
            headerModeCopy={headerModeCopy}
            canManageRooms={canManageRooms}
            isGreenroom={isGreenroom}
            broadcastModeEnabled={broadcastModeEnabled}
            whisperModeLocked={whisperFlow.whisperModeLocked}
            whisperActive={whisperFlow.whisperActive}
            whisperEndBlockedByPendingMoves={whisperFlow.whisperEndBlockedByPendingMoves}
            isDevResettingMocks={isDevResettingMocks}
            showCreateGroupControl={showCreateGroupControl}
            showCreateGroupModal={showCreateGroupModal}
            canCreateGroups={canCreateGroups}
            createGroupWrapRef={createGroupWrapRef}
            onBroadcastToggle={() => {
              void handleBroadcastToggleClick()
            }}
            onDevReset={() => {
              void handleDevResetMocks()
            }}
            onToggleCreateGroupModal={() => {
              setEnvironmentPickerRoomId(null)
              setShowCreateGroupModal((current) => !current)
            }}
            onCloseCreateGroupModal={() => setShowCreateGroupModal(false)}
            onCreateGroup={handleCreateGroup}
            onEndWhisper={() => {
              void whisperFlow.handleEndWhisper()
            }}
          />
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
                      metaLine={getParticipantMetaLineForRoom(dmParticipant)}
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
                      <p>{getParticipantMetaLineForRoom(dmParticipant)}</p>
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
                  <section
                    className="room-selector-group-section"
                    aria-label={ROOM_PRESENCE_COPY.mainGroup}
                  >
                    {mainRooms.map(renderRoomCard)}
                  </section>
                  {otherRooms.length > 0 ? (
                    <section
                      className="room-selector-group-section room-selector-group-section--after-main"
                      aria-label={ROOM_PRESENCE_COPY.otherGroups}
                    >
                      {otherRooms.map(renderRoomCard)}
                    </section>
                  ) : null}
                </>
              )}
            </div>

            {!isGreenroom && whisperFlow.whisperRooms.length > 0 ? (
              <WhisperDock>
                <section className="room-selector-group-section" aria-label="Whisper">
                  <header className="room-selector-group-section__header room-selector-group-section__header--divider-only">
                    <span className="room-selector-group-section__divider" />
                  </header>
                  {whisperFlow.whisperRooms.map(renderRoomCard)}
                </section>
              </WhisperDock>
            ) : null}
          </div>
        </div>

        {moveError ? (
          <div className="room-selector-error">
            <p>{moveError}</p>
            <button
              type="button"
              className="room-selector-error-dismiss"
              onClick={() => setMoveError(null)}
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        ) : null}
      </section>
    </TooltipProvider>
  )
}
