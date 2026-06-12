import { useCallback, useState } from 'react'
import { RoomType } from '@shared'
import type { UUID } from '@shared'
import { isGreenRoomName, RADIAL_MENU_COPY } from '@/constants/roomPresence.constants'
import { useStore } from '@/hooks/useStore'
import { generateClientId } from '@/utils/uuid'
import { waitForGroupDeleteReconciled } from '@/utils/groupsPanel'
import type { GroupPanelGroupWithParticipants } from '@/types/groupPanel'
import { isWhisperGroup } from '@/types/groupPanel'
import type { UseRoomSelectorSyncResult } from './useRoomSelectorSync'

interface UseRoomSelectorActionsOptions {
  apiUrl: string
  token: string
  sessionId: UUID
  dmUserId: UUID
  canManageRooms: boolean
  broadcastModeEnabled: boolean
  selectedRoomId: UUID | null | undefined
  allRooms: GroupPanelGroupWithParticipants[]
  onSelectRoom: (roomId: UUID) => void
  onToggleBroadcastMode: (enabled: boolean) => Promise<void>
  whisperModeLocked: boolean
  whisperRoom: GroupPanelGroupWithParticipants | null | undefined
  handleEndWhisper: () => Promise<void>
  rememberDmVoiceRoom: (roomId: UUID) => void
  getRememberedDmVoiceRoom: () => UUID | null
  setWhisperExitVoiceRoom: (roomId: UUID) => void
  sync: UseRoomSelectorSyncResult
}

export interface UseRoomSelectorActionsResult {
  moveError: string | null
  setMoveError: (err: string | null) => void
  optimisticRooms: Array<{ room: GroupPanelGroupWithParticipants; createdAt: number }>
  setOptimisticRooms: React.Dispatch<
    React.SetStateAction<Array<{ room: GroupPanelGroupWithParticipants; createdAt: number }>>
  >
  pendingRoomDeletes: Record<UUID, true>
  handleApplyEnvironment: (roomId: UUID, environmentName: string) => void
  handleApplyMuteOverride: (targetUserId: UUID, muted: boolean) => void
  handleApplyDistanceOverride: (targetUserId: UUID, distanceName: string) => void
  handleApplyConditionOverride: (targetUserId: UUID, conditionName: string) => void
  handleApplyAudioOverride: (
    targetUserId: UUID,
    overrideType: 'GAIN' | 'FILTER',
    parameters: Record<string, unknown> | null
  ) => void
  handleClearMemberEffects: (targetUserId: UUID) => void
  handleBroadcastToggleClick: () => Promise<void>
  handleSetDmVoiceRoom: (roomId: UUID) => Promise<void>
  handleSetDmVoicePreset: (presetName: string | null) => Promise<void>
  handleCreateGroup: (name: string, type: RoomType) => Promise<void>
  handleDeleteGroup: (room: GroupPanelGroupWithParticipants, roomMoves: any) => Promise<void>
}

/**
 * All async action handlers for RoomSelector: environment, overrides, voice,
 * group creation/deletion, and broadcast. Requires sync helpers from useRoomSelectorSync.
 */
export function useRoomSelectorActions({
  apiUrl,
  token,
  sessionId,
  dmUserId,
  canManageRooms,
  broadcastModeEnabled,
  selectedRoomId,
  allRooms,
  onSelectRoom,
  onToggleBroadcastMode,
  whisperModeLocked,
  whisperRoom,
  handleEndWhisper,
  rememberDmVoiceRoom,
  getRememberedDmVoiceRoom,
  setWhisperExitVoiceRoom,
  sync,
}: UseRoomSelectorActionsOptions): UseRoomSelectorActionsResult {
  const [moveError, setMoveError] = useState<string | null>(null)
  const [optimisticRooms, setOptimisticRooms] = useState<
    Array<{ room: GroupPanelGroupWithParticipants; createdAt: number }>
  >([])
  const [pendingRoomDeletes, setPendingRoomDeletes] = useState<Record<UUID, true>>({})

  const setRoomEnvironmentName = useStore((state) => state.setRoomEnvironmentName)
  const clearRoomEnvironmentName = useStore((state) => state.clearRoomEnvironmentName)
  const clearEnvironment = useStore((state) => state.clearEnvironment)
  const createRoom = useStore((state) => state.createRoom)

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

  const handleApplyEnvironmentAsync = useCallback(
    async (roomId: UUID, environmentName: string) => {
      setMoveError(null)

      const targetRoom = allRooms.find((room) => room.id === roomId)
      if (targetRoom?.type === RoomType.PRIVATE) {
        return
      }

      try {
        const response = await fetch(`${apiUrl}/api/audio/environments/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sessionId, roomId, environmentName }),
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || 'Failed to apply environment')
        }

        setRoomEnvironmentName(roomId, environmentName)
      } catch (error) {
        setMoveError(error instanceof Error ? error.message : 'Failed to apply environment')
      }
    },
    [allRooms, apiUrl, sessionId, setRoomEnvironmentName, token]
  )

  const handleApplyMuteOverrideAsync = useCallback(
    async (targetUserId: UUID, muted: boolean) => {
      setMoveError(null)

      try {
        const response = await fetch(
          `${apiUrl}/api/audio/dm-override/${muted ? 'apply' : 'remove'}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(
              muted
                ? { sessionId, targetUserId, overrideType: 'MUTE', parameters: {} }
                : { sessionId, targetUserId, overrideType: 'MUTE' }
            ),
          }
        )

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || `Failed to ${muted ? 'mute' : 'unmute'} participant`)
        }

        await sync.syncAudioOverridesFromServer()
      } catch (error) {
        setMoveError(error instanceof Error ? error.message : 'Failed to update mute override')
      }
    },
    [apiUrl, sessionId, sync, token]
  )

  const handleApplyDistanceOverrideAsync = useCallback(
    async (targetUserId: UUID, distanceName: string) => {
      setMoveError(null)
      const removing = distanceName === 'Default'

      try {
        const response = await fetch(
          `${apiUrl}/api/audio/dm-override/${removing ? 'remove' : 'apply'}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(
              removing
                ? { sessionId, targetUserId, overrideType: 'DISTANCE' }
                : {
                    sessionId,
                    targetUserId,
                    overrideType: 'DISTANCE',
                    parameters: { presetCategory: 'DISTANCE', presetName: distanceName },
                  }
            ),
          }
        )

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || 'Failed to update distance')
        }

        await sync.syncAudioOverridesFromServer()
      } catch (error) {
        setMoveError(error instanceof Error ? error.message : 'Failed to update distance')
      }
    },
    [apiUrl, sessionId, sync, token]
  )

  const handleApplyConditionOverrideAsync = useCallback(
    async (targetUserId: UUID, conditionName: string) => {
      setMoveError(null)

      try {
        const removing = conditionName === RADIAL_MENU_COPY.none
        const response = await fetch(
          `${apiUrl}/api/audio/dm-override/${removing ? 'remove' : 'apply'}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(
              removing
                ? { sessionId, targetUserId, overrideType: 'CONDITION' }
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

        await sync.syncAudioOverridesFromServer()
      } catch (error) {
        setMoveError(error instanceof Error ? error.message : 'Failed to update condition')
      }
    },
    [apiUrl, sessionId, sync, token]
  )

  const handleApplyAudioOverrideAsync = useCallback(
    async (
      targetUserId: UUID,
      overrideType: 'GAIN' | 'FILTER',
      parameters: Record<string, unknown> | null
    ) => {
      setMoveError(null)
      const removing = parameters === null

      try {
        const response = await fetch(
          `${apiUrl}/api/audio/dm-override/${removing ? 'remove' : 'apply'}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(
              removing
                ? { sessionId, targetUserId, overrideType }
                : { sessionId, targetUserId, overrideType, parameters }
            ),
          }
        )

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || `Failed to adjust audio (${overrideType})`)
        }

        await sync.syncAudioOverridesFromServer()
      } catch (error) {
        setMoveError(error instanceof Error ? error.message : 'Failed to adjust audio')
      }
    },
    [apiUrl, sessionId, sync, token]
  )

  const handleClearMemberEffectsAsync = useCallback(
    async (targetUserId: UUID) => {
      setMoveError(null)
      await Promise.all([
        handleApplyMuteOverrideAsync(targetUserId, false),
        handleApplyDistanceOverrideAsync(targetUserId, 'Default'),
        handleApplyConditionOverrideAsync(targetUserId, RADIAL_MENU_COPY.none),
      ])
    },
    [
      handleApplyConditionOverrideAsync,
      handleApplyDistanceOverrideAsync,
      handleApplyMuteOverrideAsync,
    ]
  )

  const handleBroadcastToggleClick = useCallback(async () => {
    if (whisperModeLocked) {
      setMoveError('Broadcast is locked while whisper is active')
      return
    }

    try {
      if (broadcastModeEnabled) {
        await onToggleBroadcastMode(false)

        const previousRoomId = getRememberedDmVoiceRoom()
        if (previousRoomId && allRooms.some((room) => room.id === previousRoomId)) {
          onSelectRoom(previousRoomId)
        }

        return
      }

      if (selectedRoomId) {
        rememberDmVoiceRoom(selectedRoomId)
      }

      await onToggleBroadcastMode(true)
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : 'Failed to toggle broadcast mode')
    }
  }, [
    allRooms,
    broadcastModeEnabled,
    getRememberedDmVoiceRoom,
    onSelectRoom,
    onToggleBroadcastMode,
    rememberDmVoiceRoom,
    selectedRoomId,
    whisperModeLocked,
  ])

  const handleSetDmVoiceRoom = useCallback(
    async (roomId: UUID) => {
      if (!canManageRooms) return

      setMoveError(null)

      if (whisperModeLocked && whisperRoom && roomId !== whisperRoom.id) {
        setMoveError('DM voice target is locked to whisper while whisper is active')
        return
      }

      const targetRoom = allRooms.find((room) => room.id === roomId)
      if (targetRoom && targetRoom.type !== RoomType.MAIN) {
        const localCount = Math.max(
          targetRoom?.participants.length || 0,
          0 // displayedParticipantsByRoom not available here; caller must validate
        )

        if (localCount === 0) {
          const serverMemberIds = await sync.getRoomMemberIdsFromServer(roomId)
          if ((serverMemberIds || []).length === 0) {
            setMoveError('Cannot set DM voice target to an empty room or group')
            return
          }
        }
      }

      if (broadcastModeEnabled) {
        try {
          await onToggleBroadcastMode(false)
        } catch (error) {
          setMoveError(error instanceof Error ? error.message : 'Failed to toggle broadcast mode')
          return
        }
      }

      try {
        const dmBackgroundVolume = useStore.getState().dmBackgroundVolume
        const response = await fetch(`${apiUrl}/api/audio/voice-mode`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            sessionId,
            voiceMode: 'TARGET_GROUP',
            targetGroupId: roomId,
            backgroundVolume: dmBackgroundVolume,
          }),
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { message?: string }
          throw new Error(payload.message || 'Failed to set DM voice target')
        }
      } catch (error) {
        setMoveError(error instanceof Error ? error.message : 'Failed to set DM voice target')
        return
      }

      rememberDmVoiceRoom(roomId)
      onSelectRoom(roomId)
    },
    [
      allRooms,
      apiUrl,
      broadcastModeEnabled,
      canManageRooms,
      onSelectRoom,
      onToggleBroadcastMode,
      rememberDmVoiceRoom,
      sessionId,
      sync,
      token,
      whisperModeLocked,
      whisperRoom,
    ]
  )

  const handleSetDmVoicePreset = useCallback(
    async (presetName: string | null) => {
      if (!canManageRooms) return

      setMoveError(null)

      try {
        const response = await fetch(`${apiUrl}/api/audio/voice-preset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sessionId, presetName }),
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { message?: string }
          throw new Error(payload.message || 'Failed to set voice preset')
        }
      } catch (error) {
        setMoveError(error instanceof Error ? error.message : 'Failed to set voice preset')
      }
    },
    [apiUrl, canManageRooms, sessionId, token]
  )

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
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

  const handleDeleteGroup = useCallback(
    async (room: GroupPanelGroupWithParticipants, roomMoves: any) => {
      if (room.type === RoomType.MAIN || isGreenRoomName(room.name)) {
        return
      }

      setMoveError(null)
      setPendingRoomDeletes((state) => ({ ...state, [room.id]: true }))

      try {
        if (isWhisperGroup(room)) {
          await handleEndWhisper()
          clearPendingRoomDelete(room.id)
          return
        }

        const serverMemberIds = await sync.getRoomMemberIdsFromServer(room.id)
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

          await sync.syncSessionTopologyFromServer()
          rememberDmVoiceRoom(mainRoom.id)
          onSelectRoom(mainRoom.id)

          if (selectedRoomId === room.id) {
            clearEnvironment()
          }

          clearPendingRoomDelete(room.id)
          return
        }

        const response = await fetch(`${apiUrl}/api/rooms/${room.id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
          syncSessionTopologyFromServer: sync.syncSessionTopologyFromServer,
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
      handleEndWhisper,
      onSelectRoom,
      rememberDmVoiceRoom,
      selectedRoomId,
      sessionId,
      sync,
      token,
    ]
  )

  // Stable public wrappers — useCallback so callers with memo comparators
  // see the same reference between renders when the async impl hasn't changed.
  const handleApplyEnvironment = useCallback(
    (roomId: UUID, environmentName: string) => {
      void handleApplyEnvironmentAsync(roomId, environmentName)
    },
    [handleApplyEnvironmentAsync]
  )
  const handleApplyMuteOverride = useCallback(
    (targetUserId: UUID, muted: boolean) => {
      void handleApplyMuteOverrideAsync(targetUserId, muted)
    },
    [handleApplyMuteOverrideAsync]
  )
  const handleApplyDistanceOverride = useCallback(
    (targetUserId: UUID, distanceName: string) => {
      void handleApplyDistanceOverrideAsync(targetUserId, distanceName)
    },
    [handleApplyDistanceOverrideAsync]
  )
  const handleApplyConditionOverride = useCallback(
    (targetUserId: UUID, conditionName: string) => {
      void handleApplyConditionOverrideAsync(targetUserId, conditionName)
    },
    [handleApplyConditionOverrideAsync]
  )
  const handleApplyAudioOverride = useCallback(
    (
      targetUserId: UUID,
      overrideType: 'GAIN' | 'FILTER',
      parameters: Record<string, unknown> | null
    ) => {
      void handleApplyAudioOverrideAsync(targetUserId, overrideType, parameters)
    },
    [handleApplyAudioOverrideAsync]
  )
  const handleClearMemberEffects = useCallback(
    (targetUserId: UUID) => {
      void handleClearMemberEffectsAsync(targetUserId)
    },
    [handleClearMemberEffectsAsync]
  )

  return {
    moveError,
    setMoveError,
    optimisticRooms,
    setOptimisticRooms,
    pendingRoomDeletes,
    handleApplyEnvironment,
    handleApplyMuteOverride,
    handleApplyDistanceOverride,
    handleApplyConditionOverride,
    handleApplyAudioOverride,
    handleClearMemberEffects,
    handleBroadcastToggleClick,
    handleSetDmVoiceRoom,
    handleSetDmVoicePreset,
    handleCreateGroup,
    handleDeleteGroup,
  }
}
