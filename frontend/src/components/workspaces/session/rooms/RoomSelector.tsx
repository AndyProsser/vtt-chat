import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PresenceState, RoomType } from '@shared'
import type { UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import {
  getVoiceGroupPresenceState,
  isGreenRoomName,
  RADIAL_MENU_COPY,
  ROOM_PRESENCE_COPY,
  ROOM_ROLE_LABELS,
} from '@/constants/roomPresence.constants'
import { CONDITION_PRESETS } from '@/constants/voiceGroup.constants'
import { STATUS_PILL_ICONS, STATUS_PILL_LABELS } from '@/constants/voiceGroupStatus.constants'
import { DISTANCE_PRESETS, getRoomSelectorDmFlavorLine } from '@/constants/roomSelector.constants'
import { useStore } from '@/hooks/useStore'
import { Icon } from '@/components/ui/Icon'
import { AvatarOverlay } from './AvatarOverlay'
import { GroupCard } from './GroupCard'
import { GroupsHeaderActions } from './GroupsHeaderActions'
import { ParticipantDeviceList } from './ParticipantDeviceList'
import { WhisperDock } from './WhisperDock'
import {
  getDisplayGroupName,
  getGroupParticipantMetaLine,
  getResolvedGroupEnvironmentName,
  getGroupStatEntries,
  waitForGroupDeleteReconciled,
} from '@/utils/groupsPanel'
import {
  isWhisperGroup,
  type GroupPanelGroupWithParticipants,
  type GroupParticipantStatus,
  type GroupParticipantWithGroupId,
  type GroupsPanelProps,
} from '@/types/groupPanel'
import type { SessionPresence } from '@/types/room'
import { useRoomMoves } from '@/hooks/session/useRoomMoves'
import { useWhisperFlow } from '@/hooks/session/useWhisperFlow'
import { generateClientId } from '@/utils/uuid'
import '@/styles/components/workspaces/session/rooms/RoomSelector.css'

export type {
  GroupPanelGroup,
  GroupPanelGroupWithParticipants,
  GroupParticipantStatus,
  GroupsPanelProps,
  RoomParticipantStatus,
  RoomSelectorRoom,
} from '@/types/groupPanel'

const OPTIMISTIC_ROOM_MAX_AGE_MS = 15000
const EMPTY_SESSION_PRESENCE: Record<UUID, SessionPresence> = {}

interface OptimisticRoomEntry {
  room: GroupPanelGroupWithParticipants
  createdAt: number
}

function buildRoomSignature(room: { name: string; type: RoomType }): string {
  return `${room.type}:${room.name.trim().toLowerCase()}`
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
  dmAutoTargetOnFirstPlayerJoin = false,
  rooms,
  selectedRoomId,
  onSelectRoom,
}: GroupsPanelProps) {
  const [moveError, setMoveError] = useState<string | null>(null)
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
  const [optimisticRooms, setOptimisticRooms] = useState<OptimisticRoomEntry[]>([])
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
  const replaceDMOverrides = useStore((state) => state.replaceDMOverrides)
  const sessionPresenceByUser = useStore(
    (state) => state.sessionPresence[sessionId] || EMPTY_SESSION_PRESENCE
  )
  const currentUser = useStore((state) => state.currentUser)
  const activeTakeoverUserId = useStore((state) => state.mockTakeoverUserIdBySession[sessionId])
  const setMockTakeoverUserId = useStore((state) => state.setMockTakeoverUserId)

  const dmFlavorLine = useMemo(
    () => getRoomSelectorDmFlavorLine(dmUserId, sessionId),
    [dmUserId, sessionId]
  )

  const confirmedRoomIds = useMemo(() => new Set(rooms.map((room) => room.id)), [rooms])
  const confirmedRoomSignatures = useMemo(
    () => new Set(rooms.map((room) => buildRoomSignature(room))),
    [rooms]
  )

  useEffect(() => {
    setOptimisticRooms([])
    setPendingRoomDeletes({})
  }, [sessionId])

  useEffect(() => {
    if (optimisticRooms.length === 0) {
      return
    }

    const pruneExpiredOptimisticRooms = () => {
      const now = Date.now()
      setOptimisticRooms((state) =>
        state.filter((entry) => now - entry.createdAt < OPTIMISTIC_ROOM_MAX_AGE_MS)
      )
    }

    pruneExpiredOptimisticRooms()
    const intervalId = window.setInterval(pruneExpiredOptimisticRooms, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [optimisticRooms.length])

  const allRooms = useMemo(() => {
    const byId = new Map<UUID, GroupPanelGroupWithParticipants>()

    for (const room of rooms) {
      byId.set(room.id, room)
    }

    for (const entry of optimisticRooms) {
      const room = entry.room
      const roomSignature = buildRoomSignature(room)
      if (
        !confirmedRoomIds.has(room.id) &&
        !byId.has(room.id) &&
        !confirmedRoomSignatures.has(roomSignature)
      ) {
        byId.set(room.id, room)
      }
    }

    return [...byId.values()]
  }, [confirmedRoomIds, confirmedRoomSignatures, optimisticRooms, rooms])

  const baseParticipants = useMemo<GroupParticipantWithGroupId[]>(
    () =>
      allRooms.flatMap((room) =>
        room.participants.map((participant) => ({
          ...participant,
          roomId: room.id,
        }))
      ),
    [allRooms]
  )

  const getDeviceSessions = useCallback(
    (userId: UUID) => sessionPresenceByUser[userId]?.deviceSessions || [],
    [sessionPresenceByUser]
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
      fetch(`${apiUrl}/api/rooms/session/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`${apiUrl}/api/presence/${sessionId}`, {
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
        deviceSessions?: SessionPresence['deviceSessions']
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
      identity?: {
        active: boolean
        assumedUserId: UUID | null
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

    if (import.meta.env.DEV) {
      setMockTakeoverUserId(
        sessionId,
        presencePayload.identity?.active ? presencePayload.identity.assumedUserId || null : null
      )
    }
  }, [
    apiUrl,
    replaceSessionStatsSnapshot,
    replaceSessionTopology,
    sessionId,
    setMockTakeoverUserId,
    token,
  ])

  const getRoomMemberIdsFromServer = useCallback(
    async (roomId: UUID): Promise<UUID[] | null> => {
      const response = await fetch(`${apiUrl}/api/presence/${sessionId}`, {
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

  const syncAudioOverridesFromServer = useCallback(async () => {
    const response = await fetch(`${apiUrl}/api/audio/sessions/${sessionId}/state`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      return
    }

    const payload = (await response.json()) as {
      dmOverrides?: Array<{
        userId?: UUID
        targetUserId?: UUID
        overrideType:
          | 'MUTE'
          | 'UNMUTE'
          | 'GAIN'
          | 'GATE'
          | 'FILTER'
          | 'DISTANCE'
          | 'CONDITION'
          | 'VOICE'
          | 'VOICE_OF_GOD'
        parameters?: Record<string, unknown>
        appliedAt: number
      }>
    }

    const normalizedOverrides = (payload.dmOverrides || [])
      .filter((override): override is typeof override & { userId: UUID } =>
        Boolean(override.userId || override.targetUserId)
      )
      .map((override) => ({
        userId: (override.userId || override.targetUserId) as UUID,
        targetUserId: override.targetUserId,
        overrideType: override.overrideType,
        parameters: override.parameters,
        appliedAt: override.appliedAt,
      }))

    replaceDMOverrides(normalizedOverrides)
  }, [apiUrl, replaceDMOverrides, sessionId, token])

  const syncMockTakeoverStatus = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/api/dev/mock-players/takeover/status/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        return
      }

      const payload = (await response.json()) as {
        active?: boolean
        assumedUserId?: UUID | null
      }

      setMockTakeoverUserId(sessionId, payload.active ? payload.assumedUserId || null : null)
    } catch {
      // Best-effort DEV endpoint; ignore when unavailable.
    }
  }, [apiUrl, sessionId, setMockTakeoverUserId, token])

  const handleTakeOverPlayer = useCallback(
    async (targetUserId: UUID) => {
      try {
        const response = await fetch(`${apiUrl}/api/dev/mock-players/takeover/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sessionId,
            targetUserId,
          }),
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string }
          setMoveError(payload.error || 'Unable to enter takeover mode')
          return
        }

        setMockTakeoverUserId(sessionId, targetUserId)
      } catch {
        setMoveError('Unable to enter takeover mode')
      }
    },
    [apiUrl, sessionId, setMockTakeoverUserId, token]
  )

  const handleReturnToMyUser = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/api/dev/mock-players/takeover/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        setMoveError(payload.error || 'Unable to leave takeover mode')
        return
      }

      setMockTakeoverUserId(sessionId, null)
    } catch {
      setMoveError('Unable to leave takeover mode')
    }
  }, [apiUrl, sessionId, setMockTakeoverUserId, token])

  useEffect(() => {
    if (!import.meta.env.DEV || !currentUser?.id) {
      return
    }

    void syncMockTakeoverStatus()
  }, [currentUser?.id, syncMockTakeoverStatus])

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
    (member: GroupParticipantWithGroupId | GroupParticipantStatus) =>
      getGroupParticipantMetaLine(member, dmFlavorLine),
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
            room.type !== RoomType.MAIN && !isGreenRoomName(room.name) && !isWhisperGroup(room)
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [allRooms]
  )

  const displayedParticipantsByRoom = useMemo(() => {
    const next: Record<UUID, GroupParticipantWithGroupId[]> = {
      ...roomMoves.displayedParticipantsByRoom,
    }

    if (!canManageRooms || isGreenroom || !dmParticipant || !selectedRoomId) {
      return next
    }

    Object.keys(next).forEach((roomId) => {
      next[roomId as UUID] = (next[roomId as UUID] || []).filter(
        (participant) => participant.userId !== dmUserId
      )
    })

    const selectedParticipants = next[selectedRoomId] || []
    const dmInSelectedRoom: GroupParticipantWithGroupId = {
      ...dmParticipant,
      roomId: selectedRoomId,
    }
    next[selectedRoomId] = [dmInSelectedRoom, ...selectedParticipants]

    return next
  }, [
    canManageRooms,
    dmParticipant,
    dmUserId,
    isGreenroom,
    roomMoves.displayedParticipantsByRoom,
    selectedRoomId,
  ])

  const visibleMainRooms = useMemo(() => {
    if (canManageRooms) {
      return mainRooms
    }

    return mainRooms.filter((room) =>
      (displayedParticipantsByRoom[room.id] || []).some(
        (participant) => participant.userId !== dmUserId
      )
    )
  }, [canManageRooms, displayedParticipantsByRoom, dmUserId, mainRooms])

  const visibleOtherRooms = useMemo(() => {
    if (canManageRooms) {
      return otherRooms
    }

    return otherRooms.filter((room) =>
      (displayedParticipantsByRoom[room.id] || []).some(
        (participant) => participant.userId !== dmUserId
      )
    )
  }, [canManageRooms, displayedParticipantsByRoom, dmUserId, otherRooms])

  const handleApplyEnvironment = useCallback(
    async (roomId: UUID, environmentName: string) => {
      setMoveError(null)

      const targetRoom = allRooms.find((room) => room.id === roomId)
      if (targetRoom?.type === RoomType.PRIVATE) {
        setEnvironmentPickerRoomId(null)
        return
      }

      try {
        const response = await fetch(`${apiUrl}/api/audio/environments/apply`, {
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

      try {
        const response = await fetch(
          `${apiUrl}/api/audio/dm-override/${muted ? 'apply' : 'remove'}`,
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

        await syncAudioOverridesFromServer()
      } catch (error) {
        setMoveError(error instanceof Error ? error.message : 'Failed to update mute override')
      }
    },
    [apiUrl, sessionId, syncAudioOverridesFromServer, token]
  )

  const handleApplyDistanceOverride = useCallback(
    async (targetUserId: UUID, distanceName: string) => {
      setMoveError(null)
      const removing = distanceName === 'Default'

      try {
        const response = await fetch(
          `${apiUrl}/api/audio/dm-override/${removing ? 'remove' : 'apply'}`,
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
                    overrideType: 'DISTANCE',
                  }
                : {
                    sessionId,
                    targetUserId,
                    overrideType: 'DISTANCE',
                    parameters: {
                      presetCategory: 'DISTANCE',
                      presetName: distanceName,
                    },
                  }
            ),
          }
        )

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || 'Failed to update distance')
        }

        await syncAudioOverridesFromServer()
      } catch (error) {
        setMoveError(error instanceof Error ? error.message : 'Failed to update distance')
      }
    },
    [apiUrl, sessionId, syncAudioOverridesFromServer, token]
  )

  const handleApplyConditionOverride = useCallback(
    async (targetUserId: UUID, conditionName: string) => {
      setMoveError(null)

      try {
        const removing = conditionName === RADIAL_MENU_COPY.none
        const response = await fetch(
          `${apiUrl}/api/audio/dm-override/${removing ? 'remove' : 'apply'}`,
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
                    parameters: {
                      presetCategory: 'CONDITION',
                      presetName: conditionName,
                      conditionName,
                    },
                  }
            ),
          }
        )

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || 'Failed to update condition')
        }

        await syncAudioOverridesFromServer()
      } catch (error) {
        setMoveError(error instanceof Error ? error.message : 'Failed to update condition')
      }
    },
    [apiUrl, sessionId, syncAudioOverridesFromServer, token]
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
        handleApplyDistanceOverride(targetUserId, 'Default'),
        handleApplyConditionOverride(targetUserId, RADIAL_MENU_COPY.none),
      ])
    },
    [handleApplyConditionOverride, handleApplyDistanceOverride, handleApplyMuteOverride]
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
      setMoveError(null)

      const tempId = generateClientId('room') as UUID
      setOptimisticRooms((state) => [
        ...state,
        {
          createdAt: Date.now(),
          room: { id: tempId, name, type, memberCount: 0, participants: [] },
        },
      ])

      try {
        const response = await fetch(`${apiUrl}/api/rooms`, {
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
        setOptimisticRooms((state) => state.filter((entry) => entry.room.id !== tempId))
      }
    },
    [apiUrl, createRoom, dmUserId, onSelectRoom, sessionId, token]
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
    async (room: GroupPanelGroupWithParticipants) => {
      if (room.type === RoomType.MAIN || isGreenRoomName(room.name)) {
        return
      }

      setMoveError(null)
      setPendingRoomDeletes((state) => ({ ...state, [room.id]: true }))

      try {
        if (isWhisperGroup(room)) {
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

        const response = await fetch(`${apiUrl}/api/rooms/${room.id}`, {
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

        await waitForGroupDeleteReconciled({
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

  const renderRoomCard = (room: GroupPanelGroupWithParticipants) => (
    <GroupCard
      key={room.id}
      room={room}
      selected={room.id === selectedRoomId}
      participants={displayedParticipantsByRoom[room.id] || []}
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
        setShowCreateGroupModal(false)
        setEnvironmentPickerRoomId((current) => (current === roomId ? null : roomId))
      }}
      onSelectRoom={onSelectRoom}
      onSetDmVoiceRoom={handleSetDmVoiceRoom}
      onDeleteGroup={handleDeleteGroup}
      onRoomDragOver={roomMoves.handleRoomDragOver}
      onRoomDrop={roomMoves.handleRoomDrop}
      distanceTargets={[...DISTANCE_PRESETS]}
      conditionTargets={[...CONDITION_PRESETS, RADIAL_MENU_COPY.none]}
      activeTakeoverUserId={activeTakeoverUserId || null}
      onApplyDistanceOverride={(userId, distanceName) => {
        void handleApplyDistanceOverride(userId, distanceName)
      }}
      onApplyConditionOverride={(userId, conditionName) => {
        void handleApplyConditionOverride(userId, conditionName)
      }}
      onApplyMuteOverride={(userId, nextMuted) => {
        void handleApplyMuteOverride(userId, nextMuted)
      }}
      onClearMemberEffects={(userId) => {
        void handleClearMemberEffects(userId)
      }}
      onTakeOverPlayer={(userId) => {
        void handleTakeOverPlayer(userId)
      }}
      onMemberDragStart={roomMoves.handleMemberDragStart}
      onMemberDragEnd={roomMoves.handleMemberDragEnd}
      getDisplayRoomName={getDisplayGroupName}
      getResolvedEnvironmentName={getResolvedGroupEnvironmentName}
      getParticipantMetaLine={getParticipantMetaLineForRoom}
      getResolvedPresenceState={getResolvedPresenceState}
      getPresenceDotState={getPresenceDotState}
      getStatEntries={getGroupStatEntries}
      getDeviceSessions={getDeviceSessions}
    />
  )

  return (
    <TooltipProvider delayDuration={140}>
      <section className="room-selector" aria-label="Room Selector">
        <header className="room-selector-header">
          <h4>
            <Icon name="rooms" /> Groups
            {activeTakeoverUserId ? (
              <span
                className="room-selector-header__takeover-pill"
                role="status"
                aria-live="polite"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  swap_horiz
                </span>
                Takeover Active
              </span>
            ) : null}
          </h4>
          <GroupsHeaderActions
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
            apiUrl={apiUrl}
            token={token}
            sessionId={sessionId}
            activeTakeoverUserId={activeTakeoverUserId || null}
            onBroadcastToggle={() => {
              void handleBroadcastToggleClick()
            }}
            onDevReset={() => {
              void handleDevResetMocks()
            }}
            onReturnToUser={handleReturnToMyUser}
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
          <div className="room-selector-stack">
            <div
              className="room-selector-list"
              role="list"
              aria-label="Session groups"
              ref={roomListRef}
            >
              {visibleMainRooms.length === 0 && visibleOtherRooms.length === 0 ? (
                <p className="room-selector-empty">{ROOM_PRESENCE_COPY.noGroupsAvailable}</p>
              ) : (
                <>
                  <section
                    className="room-selector-group-section"
                    aria-label={ROOM_PRESENCE_COPY.mainGroup}
                  >
                    {visibleMainRooms.map(renderRoomCard)}
                  </section>
                  {visibleOtherRooms.length > 0 ? (
                    <section
                      className="room-selector-group-section room-selector-group-section--after-main"
                      aria-label={ROOM_PRESENCE_COPY.otherGroups}
                    >
                      {visibleOtherRooms.map(renderRoomCard)}
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
