import { useCallback, useMemo, useState } from 'react'
import { RoomType } from '@shared'
import type { UUID } from '@shared'
import type {
  GroupPanelGroupWithParticipants,
  GroupParticipantWithGroupId,
} from './groupPanel.types'

interface UseRoomMovesOptions {
  apiUrl: string
  token: string
  sessionId: UUID
  dmUserId: UUID
  allRooms: GroupPanelGroupWithParticipants[]
  visibleParticipants: GroupParticipantWithGroupId[]
  dmAutoTargetOnFirstPlayerJoin: boolean
  broadcastModeEnabled: boolean
  onToggleBroadcastMode: (enabled: boolean) => Promise<void>
  onSelectRoom: (roomId: UUID) => void
  whisperRoomId?: UUID
  whisperDisplayedPlayerCount: number
  onWhisperEntry: (userId: UUID, fromRoomId: UUID) => void
  onLastWhisperPlayerMovedOut: (mainRoomId: UUID) => Promise<void>
  syncSessionTopologyFromServer: () => Promise<void>
}

export function useRoomMoves({
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
  whisperRoomId,
  whisperDisplayedPlayerCount,
  onWhisperEntry,
  onLastWhisperPlayerMovedOut,
  syncSessionTopologyFromServer,
}: UseRoomMovesOptions) {
  const [pendingRoomMoves, setPendingRoomMoves] = useState<Record<UUID, UUID>>({})
  const [draggedUserId, setDraggedUserId] = useState<UUID | null>(null)

  const activePendingRoomMoves = useMemo(() => {
    const next = { ...pendingRoomMoves }

    for (const participant of visibleParticipants) {
      if (next[participant.userId] === participant.roomId) {
        delete next[participant.userId]
      }
    }

    return next
  }, [pendingRoomMoves, visibleParticipants])

  const displayedParticipantsByRoom = useMemo(() => {
    const next: Record<string, GroupParticipantWithGroupId[]> = {}

    for (const room of allRooms) {
      next[room.id] = []
    }

    for (const participant of visibleParticipants) {
      const targetRoomId = activePendingRoomMoves[participant.userId] || participant.roomId
      if (!next[targetRoomId]) {
        next[targetRoomId] = []
      }
      next[targetRoomId].push(participant)
    }

    for (const room of allRooms) {
      next[room.id] = (next[room.id] || []).slice().sort((left, right) => {
        const leftIsDm = left.userId === dmUserId
        const rightIsDm = right.userId === dmUserId

        if (leftIsDm !== rightIsDm) {
          return leftIsDm ? -1 : 1
        }

        const leftName = (left.characterName || left.username).trim().toLowerCase()
        const rightName = (right.characterName || right.username).trim().toLowerCase()
        return leftName.localeCompare(rightName)
      })
    }

    return next
  }, [activePendingRoomMoves, allRooms, dmUserId, visibleParticipants])

  const clearPendingRoomMove = useCallback((userId: UUID) => {
    setPendingRoomMoves((state) => {
      if (!state[userId]) {
        return state
      }

      const next = { ...state }
      delete next[userId]
      return next
    })
  }, [])

  const moveParticipantToRoom = useCallback(
    async (userId: UUID, toRoomId: UUID, options?: { suppressSelection?: boolean }) => {
      const targetRoom = allRooms.find((room) => room.id === toRoomId)
      const movedParticipant = visibleParticipants.find(
        (participant) => participant.userId === userId
      )
      const movedFromRoomId = movedParticipant?.roomId
      const targetPlayerCountBefore = (displayedParticipantsByRoom[toRoomId] || []).filter(
        (participant) => participant.userId !== dmUserId
      ).length
      const shouldAutoTargetOnFirstPlayerJoin =
        targetRoom?.type === RoomType.GROUP &&
        targetPlayerCountBefore === 0 &&
        dmAutoTargetOnFirstPlayerJoin
      const mainRoomId = allRooms.find((room) => room.type === RoomType.MAIN)?.id
      const movingLastWhisperPlayer =
        Boolean(whisperRoomId) &&
        movedFromRoomId === whisperRoomId &&
        toRoomId !== whisperRoomId &&
        whisperDisplayedPlayerCount <= 1

      setPendingRoomMoves((state) => ({ ...state, [userId]: toRoomId }))

      if (
        targetRoom?.type === RoomType.PRIVATE &&
        movedFromRoomId &&
        movedFromRoomId !== toRoomId
      ) {
        onWhisperEntry(userId, movedFromRoomId)
      }

      try {
        const response = await fetch(`${apiUrl}/api/rooms/${toRoomId}/members/move`, {
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

        if (!options?.suppressSelection && targetRoom?.type === RoomType.PRIVATE) {
          if (broadcastModeEnabled) {
            await onToggleBroadcastMode(false)
          }
          onSelectRoom(toRoomId)
        } else if (!options?.suppressSelection && shouldAutoTargetOnFirstPlayerJoin) {
          onSelectRoom(toRoomId)
        }

        try {
          await syncSessionTopologyFromServer()
        } catch {
          // Keep move success resilient even if topology refresh is temporarily unavailable.
        }

        if (movingLastWhisperPlayer && mainRoomId) {
          await onLastWhisperPlayerMovedOut(mainRoomId)
        }

        clearPendingRoomMove(userId)
        return true
      } catch (error) {
        clearPendingRoomMove(userId)
        throw error instanceof Error ? error : new Error('Failed to move participant')
      }
    },
    [
      allRooms,
      apiUrl,
      broadcastModeEnabled,
      clearPendingRoomMove,
      displayedParticipantsByRoom,
      dmAutoTargetOnFirstPlayerJoin,
      dmUserId,
      onSelectRoom,
      onLastWhisperPlayerMovedOut,
      onToggleBroadcastMode,
      onWhisperEntry,
      sessionId,
      syncSessionTopologyFromServer,
      token,
      visibleParticipants,
      whisperDisplayedPlayerCount,
      whisperRoomId,
    ]
  )

  const handleMoveParticipant = useCallback(
    async (userId: UUID, toRoomId: UUID) => moveParticipantToRoom(userId, toRoomId),
    [moveParticipantToRoom]
  )

  const handleRoomDrop = useCallback(
    (event: React.DragEvent<HTMLElement>, roomId: UUID, disabled: boolean) => {
      if (disabled) {
        return
      }

      event.preventDefault()
      const droppedUserId = (event.dataTransfer.getData('text/plain') || draggedUserId || '') as
        | UUID
        | ''

      if (droppedUserId) {
        void handleMoveParticipant(droppedUserId, roomId)
      }

      setDraggedUserId(null)
    },
    [draggedUserId, handleMoveParticipant]
  )

  const handleRoomDragOver = useCallback(
    (event: React.DragEvent<HTMLElement>, disabled: boolean) => {
      if (disabled) {
        return
      }

      event.preventDefault()
    },
    []
  )

  const handleMemberDragStart = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, userId: UUID, canDrag: boolean) => {
      if (!canDrag) {
        return
      }

      event.dataTransfer.setData('text/plain', userId)
      setDraggedUserId(userId)
    },
    []
  )

  const handleMemberDragEnd = useCallback(() => {
    window.setTimeout(() => {
      setDraggedUserId(null)
    }, 0)
  }, [])

  return {
    pendingRoomMoves: activePendingRoomMoves,
    displayedParticipantsByRoom,
    draggedUserId,
    setDraggedUserId,
    moveParticipantToRoom,
    handleMoveParticipant,
    handleRoomDrop,
    handleRoomDragOver,
    handleMemberDragStart,
    handleMemberDragEnd,
  }
}
