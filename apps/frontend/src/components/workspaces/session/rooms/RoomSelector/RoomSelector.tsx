import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RoomType, SessionState } from '@shared'
import type { UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import {
  isGreenRoomName,
  RADIAL_MENU_COPY,
  ROOM_PRESENCE_COPY,
  ROOM_ROLE_LABELS,
} from '@/constants/roomPresence.constants'
import { CONDITION_PRESETS } from '@/constants/voiceGroup.constants'
import { DISTANCE_PRESETS, getRoomSelectorDmFlavorLine } from '@/constants/roomSelector.constants'
import { useStore } from '@/hooks/useStore'
import { Icon } from '@/components/ui/Icon'
import { AvatarOverlay } from '../AvatarOverlay'
import { GroupCard } from '../GroupCard'
import { GroupMemberProfileCard } from '../GroupMemberProfileCard'
import { GroupsHeaderActions } from '../GroupsHeaderActions'
import { WhisperDock } from '../WhisperDock'
import {
  getDisplayGroupName,
  getGroupParticipantMetaLine,
  getResolvedGroupEnvironmentName,
  getGroupStatEntries,
} from '@/utils/groupsPanel'
import {
  isWhisperGroup,
  type GroupPanelGroupWithParticipants,
  type GroupParticipantStatus,
  type GroupParticipantWithGroupId,
  type GroupsPanelProps,
} from '@/types/groupPanel'
import { DmVoiceTargetIndicator } from '../DmVoiceTargetIndicator'
import { useRoomMoves } from '@/hooks/session/useRoomMoves'
import { useWhisperFlow } from '@/hooks/session/useWhisperFlow'
import { useRoomSelectorSync } from '@/hooks/session/useRoomSelectorSync'
import { useRoomSelectorActions } from '@/hooks/session/useRoomSelectorActions'
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
const GROUP_CARD_DISTANCE_TARGETS = [...DISTANCE_PRESETS]
const GROUP_CARD_CONDITION_TARGETS = [...CONDITION_PRESETS, RADIAL_MENU_COPY.none]
const EMPTY_PARTICIPANTS: GroupParticipantWithGroupId[] = []

export function RoomSelector({
  apiUrl,
  token,
  sessionId,
  sessionState,
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
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
  const [environmentPickerRoomId, setEnvironmentPickerRoomId] = useState<UUID | null>(null)
  const [touchFeedbackUserId, setTouchFeedbackUserId] = useState<UUID | null>(null)
  const [isDevResettingMocks, setIsDevResettingMocks] = useState(false)
  // Component-owned optimistic rooms state; synced from the actions hook each render.
  const [optimisticRooms, setOptimisticRooms] = useState<
    Array<{ room: GroupPanelGroupWithParticipants; createdAt: number }>
  >([])
  const createGroupWrapRef = useRef<HTMLDivElement | null>(null)
  const roomListRef = useRef<HTMLDivElement | null>(null)
  const environmentPickerLayerRef = useRef<HTMLDivElement | null>(null)

  const currentUser = useStore((state) => state.currentUser)
  const dmSelfPresence = useStore((state) => {
    const uid = state.currentUser?.id
    return uid ? (state.sessionPresence[sessionId]?.[uid] ?? null) : null
  })
  const activeTakeoverUserId = useStore((state) => state.mockTakeoverUserIdBySession[sessionId])
  const setMockTakeoverUserId = useStore((state) => state.setMockTakeoverUserId)
  const dmVoicePreset = useStore((state) => state.dmVoicePreset)

  const dmFlavorLine = useMemo(
    () => getRoomSelectorDmFlavorLine(dmUserId, sessionId),
    [dmUserId, sessionId]
  )

  const confirmedRoomIds = useMemo(() => new Set(rooms.map((r) => r.id)), [rooms])
  const confirmedRoomSignatures = useMemo(
    () => new Set(rooms.map((r) => `${r.type}:${r.name.trim().toLowerCase()}`)),
    [rooms]
  )

  const buildAllRooms = useCallback(
    (pending: Array<{ room: GroupPanelGroupWithParticipants; createdAt: number }>) => {
      const byId = new Map<UUID, GroupPanelGroupWithParticipants>()
      for (const r of rooms) byId.set(r.id, r)
      for (const entry of pending) {
        const r = entry.room
        const sig = `${r.type}:${r.name.trim().toLowerCase()}`
        if (!confirmedRoomIds.has(r.id) && !byId.has(r.id) && !confirmedRoomSignatures.has(sig)) {
          byId.set(r.id, r)
        }
      }
      return [...byId.values()]
    },
    [confirmedRoomIds, confirmedRoomSignatures, rooms]
  )

  const allRooms = useMemo(() => buildAllRooms(optimisticRooms), [buildAllRooms, optimisticRooms])

  const baseParticipants = useMemo<GroupParticipantWithGroupId[]>(
    () => allRooms.flatMap((room) => room.participants.map((p) => ({ ...p, roomId: room.id }))),
    [allRooms]
  )
  const visibleParticipants = useMemo(
    () => (isGreenroom ? baseParticipants : baseParticipants.filter((p) => p.userId !== dmUserId)),
    [baseParticipants, dmUserId, isGreenroom]
  )
  const baseWhisperRoom = useMemo(
    () => allRooms.find((r) => r.type === RoomType.PRIVATE),
    [allRooms]
  )
  const baseWhisperPlayerCount = useMemo(
    () => (baseWhisperRoom?.participants || []).filter((p) => p.userId !== dmUserId).length,
    [baseWhisperRoom, dmUserId]
  )

  const sync = useRoomSelectorSync({ apiUrl, token, sessionId })

  // Refs break circular deps: roomMoves is initialized before whisperFlow, but needs its callbacks.
  const noteWhisperEntryRef = useRef<(userId: UUID, fromRoomId: UUID) => void>(() => undefined)
  const lastWhisperPlayerMovedOutRef = useRef<(mainRoomId: UUID) => Promise<void>>(
    async () => undefined
  )
  // setMoveErrorRef is wired after actions is initialized; whisperFlow calls it via the ref.
  const setMoveErrorRef = useRef<(err: string | null) => void>(() => undefined)

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
    onWhisperEntry: (userId, fromRoomId) => noteWhisperEntryRef.current(userId, fromRoomId),
    onLastWhisperPlayerMovedOut: (mainRoomId) => lastWhisperPlayerMovedOutRef.current(mainRoomId),
    syncSessionTopologyFromServer: sync.syncSessionTopologyFromServer,
  })

  const whisperFlow = useWhisperFlow({
    apiUrl,
    token,
    sessionId,
    sessionState,
    dmUserId,
    allRooms,
    displayedParticipantsByRoom: roomMoves.displayedParticipantsByRoom,
    pendingRoomMoves: roomMoves.pendingRoomMoves,
    selectedRoomId,
    broadcastModeEnabled,
    canManageRooms,
    onToggleBroadcastMode,
    onSelectRoom,
    setMoveError: (err) => setMoveErrorRef.current(err),
    syncSessionTopologyFromServer: sync.syncSessionTopologyFromServer,
    getRoomMemberIdsFromServer: sync.getRoomMemberIdsFromServer,
  })

  const {
    whisperRoom,
    whisperRooms,
    whisperActive,
    whisperModeLocked,
    whisperEndBlockedByPendingMoves,
    noteWhisperEntry,
    handleEndWhisper,
    rememberDmVoiceRoom,
    getRememberedDmVoiceRoom,
    setWhisperExitVoiceRoom,
  } = whisperFlow

  const actions = useRoomSelectorActions({
    apiUrl,
    token,
    sessionId,
    dmUserId,
    canManageRooms,
    broadcastModeEnabled,
    // GroupsPanelProps uses `'' | undefined`; actions hook expects `null | undefined`.
    selectedRoomId: selectedRoomId || null,
    allRooms,
    onSelectRoom,
    onToggleBroadcastMode,
    whisperModeLocked,
    whisperRoom,
    handleEndWhisper,
    rememberDmVoiceRoom,
    // useWhisperFlow returns `UUID | ''`; actions hook expects `UUID | null`.
    getRememberedDmVoiceRoom: () => getRememberedDmVoiceRoom() || null,
    setWhisperExitVoiceRoom,
    sync,
  })

  // Wire setMoveErrorRef so whisperFlow's indirect calls land in actions.setMoveError.
  useEffect(() => {
    setMoveErrorRef.current = actions.setMoveError
  })

  // Keep whisperFlow entry refs current so roomMoves can invoke them.
  useEffect(() => {
    noteWhisperEntryRef.current = noteWhisperEntry
  }, [noteWhisperEntry])

  useEffect(() => {
    lastWhisperPlayerMovedOutRef.current = async (mainRoomId: UUID) => {
      setWhisperExitVoiceRoom(mainRoomId)
      await handleEndWhisper()
    }
  }, [handleEndWhisper, setWhisperExitVoiceRoom])

  // Sync actions-internal optimistic rooms back into component state (one-render delay is fine).
  useEffect(() => {
    setOptimisticRooms(actions.optimisticRooms)
  }, [actions.optimisticRooms])

  useEffect(() => {
    if (optimisticRooms.length === 0) return
    const prune = () => {
      const now = Date.now()
      setOptimisticRooms((state) =>
        state.filter((e) => now - e.createdAt < OPTIMISTIC_ROOM_MAX_AGE_MS)
      )
    }
    prune()
    const id = window.setInterval(prune, 1000)
    return () => window.clearInterval(id)
  }, [optimisticRooms.length])

  // DEV-only: handlers come after actions so they can call actions.setMoveError directly.
  const syncMockTakeoverStatus = useCallback(async () => {
    if (!import.meta.env.DEV) return
    try {
      const res = await fetch(`${apiUrl}/api/dev/mock-players/takeover/status/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const payload = (await res.json()) as { active?: boolean; assumedUserId?: UUID | null }
      setMockTakeoverUserId(sessionId, payload.active ? payload.assumedUserId || null : null)
    } catch {
      // Best-effort DEV endpoint.
    }
  }, [apiUrl, sessionId, setMockTakeoverUserId, token])

  const handleTakeOverPlayer = useCallback(
    async (targetUserId: UUID) => {
      try {
        const res = await fetch(`${apiUrl}/api/dev/mock-players/takeover/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sessionId, targetUserId }),
        })
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string }
          actions.setMoveError(payload.error || 'Unable to enter takeover mode')
          return
        }
        setMockTakeoverUserId(sessionId, targetUserId)
      } catch {
        actions.setMoveError('Unable to enter takeover mode')
      }
    },
    [actions, apiUrl, sessionId, setMockTakeoverUserId, token]
  )

  const handleReturnToMyUser = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/dev/mock-players/takeover/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string }
        actions.setMoveError(payload.error || 'Unable to leave takeover mode')
        return
      }
      setMockTakeoverUserId(sessionId, null)
    } catch {
      actions.setMoveError('Unable to leave takeover mode')
    }
  }, [actions, apiUrl, sessionId, setMockTakeoverUserId, token])

  const handleDevResetMocks = useCallback(async () => {
    if (!import.meta.env.DEV) return
    actions.setMoveError(null)
    setIsDevResettingMocks(true)
    try {
      const res = await fetch(`${apiUrl}/api/dev/mock-players/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.message || payload.error || 'Failed to reroll mock players')
      }
      await sync.syncSessionTopologyFromServer()
    } catch (error) {
      actions.setMoveError(error instanceof Error ? error.message : 'Failed to reroll mock players')
    } finally {
      setIsDevResettingMocks(false)
    }
  }, [actions, apiUrl, sessionId, sync, token])

  useEffect(() => {
    if (!import.meta.env.DEV || !currentUser?.id) return
    void syncMockTakeoverStatus()
  }, [currentUser?.id, syncMockTakeoverStatus])

  useEffect(() => {
    if (!actions.moveError) return
    const timeout = window.setTimeout(() => actions.setMoveError(null), 5000)
    return () => window.clearTimeout(timeout)
  }, [actions, actions.moveError, actions.setMoveError])

  useEffect(() => {
    if (!showCreateGroupModal && !environmentPickerRoomId) return
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (
        showCreateGroupModal &&
        createGroupWrapRef.current &&
        !createGroupWrapRef.current.contains(target)
      ) {
        setShowCreateGroupModal(false)
      }
      if (!environmentPickerRoomId) return
      const currentTrigger = target.closest('[data-room-env-trigger]')
      const triggerRoomId = currentTrigger?.getAttribute('data-room-env-trigger') as UUID | null
      const isInsideOpenPicker = environmentPickerLayerRef.current?.contains(target) ?? false
      if (triggerRoomId !== environmentPickerRoomId && !isInsideOpenPicker)
        setEnvironmentPickerRoomId(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (environmentPickerRoomId) setEnvironmentPickerRoomId(null)
      if (showCreateGroupModal) setShowCreateGroupModal(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [environmentPickerRoomId, showCreateGroupModal])

  useEffect(() => {
    if (!selectedRoomId || !roomListRef.current) return
    const node = roomListRef.current.querySelector<HTMLElement>(
      `[data-room-id="${selectedRoomId}"]`
    )
    if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' })
  }, [selectedRoomId])

  useEffect(() => {
    if (!environmentPickerRoomId) return
    const id = window.requestAnimationFrame(() => {
      const listEl = roomListRef.current
      const pickerEl = environmentPickerLayerRef.current
      if (!listEl || !pickerEl) return
      const listRect = listEl.getBoundingClientRect()
      const pickerRect = pickerEl.getBoundingClientRect()
      const bottomOverflow = pickerRect.bottom - (listRect.bottom - 8)
      if (bottomOverflow > 0) {
        listEl.scrollBy({ top: bottomOverflow + 12, behavior: 'smooth' })
        return
      }
      const topOverflow = listRect.top + 8 - pickerRect.top
      if (topOverflow > 0) listEl.scrollBy({ top: -(topOverflow + 12), behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(id)
  }, [environmentPickerRoomId])

  const displayedParticipantsByRoom = roomMoves.displayedParticipantsByRoom
  const isDenseRoomLayout =
    canManageRooms && !isGreenroom && (visibleParticipants.length >= 10 || allRooms.length >= 4)
  const activeEnvironmentPickerRoomId = isGreenroom ? null : environmentPickerRoomId

  // Stable reference guard: prevents GroupMemberList re-renders when other rooms' participants
  // change and the full map recomputes, but this room's array content is unchanged.
  const stableParticipantsByRoomRef = useRef<Record<UUID, GroupParticipantWithGroupId[]>>({})

  const visibleNonDmParticipantsByRoom = useMemo(() => {
    const next: Record<UUID, GroupParticipantWithGroupId[]> = {}
    const prev = stableParticipantsByRoomRef.current
    for (const [roomId, participants] of Object.entries(displayedParticipantsByRoom) as Array<
      [UUID, GroupParticipantWithGroupId[]]
    >) {
      const nonDm = participants.filter(
        (p) => p.userId !== dmUserId && p.roleLabel !== ROOM_ROLE_LABELS.dm
      )
      let roomArray: GroupParticipantWithGroupId[]
      if (isGreenroom) {
        const dm = participants.find(
          (p) => p.userId === dmUserId || p.roleLabel === ROOM_ROLE_LABELS.dm
        )
        roomArray = dm ? [dm, ...nonDm] : nonDm
      } else {
        roomArray = nonDm
      }
      const prevArray = prev[roomId as UUID]
      next[roomId as UUID] =
        prevArray !== undefined &&
        prevArray.length === roomArray.length &&
        roomArray.every((p, i) => p === prevArray[i])
          ? prevArray
          : roomArray
    }
    stableParticipantsByRoomRef.current = next
    return next
  }, [displayedParticipantsByRoom, dmUserId, isGreenroom])

  const dmParticipant = useMemo(
    () => baseParticipants.find((p) => p.userId === dmUserId),
    [baseParticipants, dmUserId]
  )

  const dmVoiceTargetRoom = useMemo(() => {
    const targetId = canManageRooms ? selectedRoomId : dmParticipant?.roomId
    return targetId ? allRooms.find((r) => r.id === targetId) || null : null
  }, [allRooms, canManageRooms, dmParticipant?.roomId, selectedRoomId])

  const dmDetachedParticipant = useMemo((): GroupParticipantWithGroupId | null => {
    if (isGreenroom) return null
    const fallbackRoomId = allRooms.find((r) => r.type === RoomType.MAIN)?.id
    const resolvedRoomId = dmVoiceTargetRoom?.id || fallbackRoomId
    if (!resolvedRoomId) return null
    if (dmParticipant) return { ...dmParticipant, roomId: resolvedRoomId }
    if (!currentUser) return null
    return {
      userId: currentUser.id,
      username: currentUser.username,
      avatarUrl: dmSelfPresence?.avatarUrl || null,
      characterName: currentUser.displayName || currentUser.username,
      playerName: currentUser.username,
      characterClass: dmSelfPresence?.characterClass || null,
      characterSubclass: dmSelfPresence?.characterSubclass || null,
      characterRace: dmSelfPresence?.characterRace || null,
      level: dmSelfPresence?.level || null,
      characterStats: dmSelfPresence?.characterStats || null,
      roleLabel: ROOM_ROLE_LABELS.dm,
      roomId: resolvedRoomId,
    }
  }, [allRooms, currentUser, dmParticipant, dmSelfPresence, dmVoiceTargetRoom, isGreenroom])

  const dmDetachedEnvironmentName = useMemo(
    () => (dmVoiceTargetRoom ? getResolvedGroupEnvironmentName(dmVoiceTargetRoom) : 'Default'),
    [dmVoiceTargetRoom]
  )

  const mainRooms = useMemo(
    () =>
      allRooms.filter((r) => r.type === RoomType.MAIN || (isGreenroom && isGreenRoomName(r.name))),
    [allRooms, isGreenroom]
  )
  const otherRooms = useMemo(
    () =>
      allRooms
        .filter((r) => r.type !== RoomType.MAIN && !isGreenRoomName(r.name) && !isWhisperGroup(r))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allRooms]
  )

  const visibleMainRooms = useMemo(
    () =>
      canManageRooms
        ? mainRooms
        : mainRooms.filter((r) => (visibleNonDmParticipantsByRoom[r.id] || []).length > 0),
    [canManageRooms, mainRooms, visibleNonDmParticipantsByRoom]
  )
  const visibleOtherRooms = useMemo(
    () =>
      canManageRooms
        ? otherRooms
        : otherRooms.filter((r) => (visibleNonDmParticipantsByRoom[r.id] || []).length > 0),
    [canManageRooms, otherRooms, visibleNonDmParticipantsByRoom]
  )

  useEffect(() => {
    if (!canManageRooms || !selectedRoomId) return
    const targeted = allRooms.find((r) => r.id === selectedRoomId)
    if (!targeted || targeted.type !== RoomType.GROUP) return
    if ((visibleNonDmParticipantsByRoom[selectedRoomId] || []).length > 0) return
    const mainRoom = allRooms.find((r) => r.type === RoomType.MAIN)
    if (mainRoom && mainRoom.id !== targeted.id) onSelectRoom(mainRoom.id)
  }, [allRooms, canManageRooms, onSelectRoom, visibleNonDmParticipantsByRoom, selectedRoomId])

  const getParticipantMetaLine = useCallback(
    (member: GroupParticipantWithGroupId | GroupParticipantStatus) =>
      getGroupParticipantMetaLine(member, dmFlavorLine),
    [dmFlavorLine]
  )

  const handleToggleCreateGroupModal = useCallback(() => {
    setEnvironmentPickerRoomId(null)
    setShowCreateGroupModal((cur) => !cur)
  }, [])

  const handleCloseCreateGroupModal = useCallback(() => setShowCreateGroupModal(false), [])

  const renderRoomCard = (room: GroupPanelGroupWithParticipants) => (
    <GroupCard
      key={room.id}
      room={room}
      selected={room.id === selectedRoomId}
      participants={visibleNonDmParticipantsByRoom[room.id] ?? EMPTY_PARTICIPANTS}
      sessionId={sessionId}
      currentUserId={currentUser?.id ?? ('' as UUID)}
      canManageRooms={canManageRooms}
      isSessionActive={sessionState === SessionState.ACTIVE}
      isGreenroom={isGreenroom}
      isDenseRoomLayout={isDenseRoomLayout}
      draggedUserId={roomMoves.draggedUserId}
      broadcastModeEnabled={broadcastModeEnabled}
      whisperModeLocked={whisperModeLocked}
      whisperRoomId={whisperRoom?.id}
      whisperEndBlockedByPendingMoves={whisperEndBlockedByPendingMoves}
      pendingDelete={Boolean(actions.pendingRoomDeletes[room.id])}
      selectedRoomId={selectedRoomId}
      environmentPickerRoomId={activeEnvironmentPickerRoomId}
      environmentPickerLayerRef={environmentPickerLayerRef}
      touchFeedbackUserId={touchFeedbackUserId}
      setTouchFeedbackUserId={setTouchFeedbackUserId}
      dmUserId={dmUserId}
      onApplyEnvironment={actions.handleApplyEnvironment}
      onToggleEnvironmentPicker={(roomId) => {
        setShowCreateGroupModal(false)
        setEnvironmentPickerRoomId((cur) => (cur === roomId ? null : roomId))
      }}
      onSelectRoom={onSelectRoom}
      onSetDmVoiceRoom={actions.handleSetDmVoiceRoom}
      onDeleteGroup={(r) => {
        void actions.handleDeleteGroup(r, roomMoves)
      }}
      onRoomDragOver={roomMoves.handleRoomDragOver}
      onRoomDrop={roomMoves.handleRoomDrop}
      distanceTargets={GROUP_CARD_DISTANCE_TARGETS}
      conditionTargets={GROUP_CARD_CONDITION_TARGETS}
      activeTakeoverUserId={activeTakeoverUserId || null}
      onApplyDistanceOverride={actions.handleApplyDistanceOverride}
      onApplyConditionOverride={actions.handleApplyConditionOverride}
      onApplyMuteOverride={actions.handleApplyMuteOverride}
      onApplyAudioOverride={actions.handleApplyAudioOverride}
      onClearMemberEffects={actions.handleClearMemberEffects}
      onTakeOverPlayer={handleTakeOverPlayer}
      onMemberDragStart={roomMoves.handleMemberDragStart}
      onMemberDragEnd={roomMoves.handleMemberDragEnd}
      getDisplayRoomName={getDisplayGroupName}
      getResolvedEnvironmentName={getResolvedGroupEnvironmentName}
      getParticipantMetaLine={getParticipantMetaLine}
      getStatEntries={getGroupStatEntries}
    />
  )

  return (
    <section className="room-selector" aria-label="Room Selector">
      <header className="room-selector-header">
        <h4>
          <Icon name="rooms" /> Groups
          {activeTakeoverUserId ? (
            <span className="room-selector-header__takeover-pill" role="status" aria-live="polite">
              <Icon name="swap_horiz" />
              Takeover Active
            </span>
          ) : null}
        </h4>
        <GroupsHeaderActions
          headerModeCopy={headerModeCopy}
          canManageRooms={canManageRooms}
          isGreenroom={isGreenroom}
          broadcastModeEnabled={broadcastModeEnabled}
          whisperModeLocked={whisperModeLocked}
          whisperActive={whisperActive}
          whisperEndBlockedByPendingMoves={whisperEndBlockedByPendingMoves}
          isDevResettingMocks={isDevResettingMocks}
          showCreateGroupControl={canManageRooms && !isGreenroom}
          showCreateGroupModal={showCreateGroupModal}
          canCreateGroups={canManageRooms && !isGreenroom}
          createGroupWrapRef={createGroupWrapRef}
          apiUrl={apiUrl}
          token={token}
          sessionId={sessionId}
          activeTakeoverUserId={activeTakeoverUserId || null}
          dmVoicePreset={dmVoicePreset}
          onBroadcastToggle={actions.handleBroadcastToggleClick}
          onDevReset={handleDevResetMocks}
          onReturnToUser={handleReturnToMyUser}
          onToggleCreateGroupModal={handleToggleCreateGroupModal}
          onCloseCreateGroupModal={handleCloseCreateGroupModal}
          onCreateGroup={actions.handleCreateGroup}
          onEndWhisper={handleEndWhisper}
          onSelectVoicePreset={actions.handleSetDmVoicePreset}
        />
      </header>

      <div className="room-selector-body">
        <div className="room-selector-stack">
          {dmDetachedParticipant ? (
            <section
              className="room-selector-group-section room-selector-group-section--dm-detached-dock"
              aria-label="Dungeon Master"
            >
              <div className="room-selector-dm" data-ui-component="RoomSelectorDmDetached">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="room-selector-dm__profile"
                      onClick={() => {
                        if (!canManageRooms || !dmVoiceTargetRoom) return
                        void actions.handleSetDmVoiceRoom(dmVoiceTargetRoom.id)
                      }}
                    >
                      <AvatarOverlay
                        username={dmDetachedParticipant.username}
                        avatarUrl={dmDetachedParticipant.avatarUrl}
                        roleLabel={ROOM_ROLE_LABELS.dm}
                        metaLine={dmFlavorLine}
                        presence={{
                          sessionId,
                          userId: dmDetachedParticipant.userId as UUID,
                          isSelf: dmDetachedParticipant.userId === currentUser?.id,
                        }}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="room-selector-profile-tooltip">
                    <GroupMemberProfileCard
                      sessionId={sessionId}
                      isSelf={dmDetachedParticipant.userId === currentUser?.id}
                      member={dmDetachedParticipant}
                      metaLine={dmFlavorLine}
                      statEntries={getGroupStatEntries(dmDetachedParticipant)}
                      environmentName={dmDetachedEnvironmentName}
                    />
                  </TooltipContent>
                </Tooltip>
                <DmVoiceTargetIndicator allRooms={allRooms} />
              </div>
            </section>
          ) : null}

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

          {!isGreenroom && whisperRooms.length > 0 ? (
            <WhisperDock>
              <section className="room-selector-group-section" aria-label="Whisper">
                <header className="room-selector-group-section__header room-selector-group-section__header--divider-only">
                  <span className="room-selector-group-section__divider" />
                </header>
                {whisperRooms.map(renderRoomCard)}
              </section>
            </WhisperDock>
          ) : null}
        </div>
      </div>

      {actions.moveError ? (
        <div className="room-selector-error">
          <p>{actions.moveError}</p>
          <button
            type="button"
            className="room-selector-error-dismiss"
            onClick={() => actions.setMoveError(null)}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      ) : null}
    </section>
  )
}
