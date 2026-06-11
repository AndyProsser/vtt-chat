import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SessionState } from '@shared'
import type { UUID } from '@shared'
import type {
  GroupPanelGroupWithParticipants,
  GroupParticipantWithGroupId,
  WhisperGroupContextSnapshot,
} from '@/types/groupPanel'
import { isWhisperGroup } from '@/types/groupPanel'

interface UseWhisperFlowOptions {
  apiUrl: string
  token: string
  sessionId: UUID
  sessionState: SessionState
  dmUserId: UUID
  allRooms: GroupPanelGroupWithParticipants[]
  displayedParticipantsByRoom: Record<string, GroupParticipantWithGroupId[]>
  pendingRoomMoves: Record<UUID, UUID>
  selectedRoomId?: UUID | ''
  broadcastModeEnabled: boolean
  canManageRooms: boolean
  onToggleBroadcastMode: (enabled: boolean) => Promise<void>
  onSelectRoom: (roomId: UUID) => void
  setMoveError: (message: string | null) => void
  syncSessionTopologyFromServer: () => Promise<void>
  getRoomMemberIdsFromServer: (roomId: UUID) => Promise<UUID[] | null>
}

export function useWhisperFlow({
  apiUrl,
  token,
  sessionId,
  sessionState,
  dmUserId,
  allRooms,
  displayedParticipantsByRoom,
  pendingRoomMoves,
  selectedRoomId,
  broadcastModeEnabled,
  canManageRooms,
  onToggleBroadcastMode,
  onSelectRoom,
  setMoveError,
  syncSessionTopologyFromServer,
  getRoomMemberIdsFromServer,
}: UseWhisperFlowOptions) {
  const [hasWhisperContext, setHasWhisperContext] = useState(false)
  const whisperContextRef = useRef<WhisperGroupContextSnapshot | null>(null)
  const previousDmVoiceRoomIdRef = useRef<UUID | ''>('')
  const endWhisperInFlightRef = useRef(false)
  const sessionStateRef = useRef(sessionState)

  useEffect(() => {
    sessionStateRef.current = sessionState
  }, [sessionState])

  const whisperRoom = useMemo(() => allRooms.find((room) => isWhisperGroup(room)), [allRooms])
  const whisperRooms = useMemo(
    () =>
      allRooms
        .filter((room) => isWhisperGroup(room))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [allRooms]
  )
  const whisperParticipantCount = whisperRoom?.participants.length || 0
  const whisperActive = whisperParticipantCount > 0
  const whisperDisplayedPlayerCount = whisperRoom
    ? (displayedParticipantsByRoom[whisperRoom.id] || []).filter(
        (participant) => participant.userId !== dmUserId
      ).length
    : 0
  const pendingMovesToWhisperCount = useMemo(() => {
    if (!whisperRoom) {
      return 0
    }

    return Object.values(pendingRoomMoves).filter((targetRoomId) => targetRoomId === whisperRoom.id)
      .length
  }, [pendingRoomMoves, whisperRoom])
  const whisperEndBlockedByPendingMoves = pendingMovesToWhisperCount > 0
  const whisperModeLocked = whisperActive || hasWhisperContext
  const canAutoReconcileWhisper = sessionState === SessionState.ACTIVE

  const rememberDmVoiceRoom = useCallback((roomId: UUID | '') => {
    previousDmVoiceRoomIdRef.current = roomId
  }, [])

  const getRememberedDmVoiceRoom = useCallback((): UUID | '' => {
    return previousDmVoiceRoomIdRef.current
  }, [])

  const setWhisperExitVoiceRoom = useCallback(
    (roomId: UUID) => {
      if (!whisperContextRef.current) {
        whisperContextRef.current = {
          previousDmVoiceRoomId: roomId,
          previousBroadcastEnabled: broadcastModeEnabled,
          memberPreviousRoomIds: {},
        }
        setHasWhisperContext(true)
        return
      }

      whisperContextRef.current.previousDmVoiceRoomId = roomId
    },
    [broadcastModeEnabled]
  )

  const noteWhisperEntry = useCallback(
    (userId: UUID, fromRoomId: UUID) => {
      if (!whisperContextRef.current) {
        whisperContextRef.current = {
          previousDmVoiceRoomId: selectedRoomId || previousDmVoiceRoomIdRef.current || '',
          previousBroadcastEnabled: broadcastModeEnabled,
          memberPreviousRoomIds: {},
        }
      }

      whisperContextRef.current.memberPreviousRoomIds[userId] = fromRoomId
      setHasWhisperContext(true)
    },
    [broadcastModeEnabled, selectedRoomId]
  )

  useEffect(() => {
    if (!broadcastModeEnabled && selectedRoomId) {
      previousDmVoiceRoomIdRef.current = selectedRoomId
    }
  }, [broadcastModeEnabled, selectedRoomId])

  useEffect(() => {
    if (!whisperActive || !whisperRoom || whisperEndBlockedByPendingMoves) {
      return
    }

    if (!whisperContextRef.current) {
      whisperContextRef.current = {
        previousDmVoiceRoomId: selectedRoomId || previousDmVoiceRoomIdRef.current || '',
        previousBroadcastEnabled: broadcastModeEnabled,
        memberPreviousRoomIds: {},
      }
      setHasWhisperContext(true)
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
    setMoveError,
    whisperActive,
    whisperEndBlockedByPendingMoves,
    whisperRoom,
  ])

  const endWhisperWithReconcile = useCallback(
    async (whisperRoomId: UUID) => {
      const pendingMovesToWhisper = Object.values(pendingRoomMoves).filter(
        (targetRoomId) => targetRoomId === whisperRoomId
      ).length

      if (pendingMovesToWhisper > 0) {
        throw new Error('Please wait for players to finish moving into whisper, then try again.')
      }

      const endWhisperOnce = async () => {
        if (
          sessionStateRef.current !== SessionState.ACTIVE &&
          sessionStateRef.current !== SessionState.PAUSED
        ) {
          return
        }

        const response = await fetch(`${apiUrl}/api/rooms/${whisperRoomId}/end-whisper`, {
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
      }

      await endWhisperOnce()
      await syncSessionTopologyFromServer()

      for (let retry = 0; retry < 2; retry += 1) {
        const serverMemberIds = await getRoomMemberIdsFromServer(whisperRoomId)
        const remainingPlayers = (serverMemberIds || []).filter((userId) => userId !== dmUserId)

        if (remainingPlayers.length === 0) {
          return
        }

        await endWhisperOnce()
        await syncSessionTopologyFromServer()
      }

      const finalServerMemberIds = await getRoomMemberIdsFromServer(whisperRoomId)
      const finalRemainingPlayers = (finalServerMemberIds || []).filter(
        (userId) => userId !== dmUserId
      )

      if (finalRemainingPlayers.length > 0) {
        throw new Error('Whisper is still reconciling. Try End whisper again in a moment.')
      }
    },
    [
      apiUrl,
      dmUserId,
      getRoomMemberIdsFromServer,
      pendingRoomMoves,
      sessionId,
      syncSessionTopologyFromServer,
      token,
    ]
  )

  const handleEndWhisper = useCallback(async () => {
    if (!whisperRoom || endWhisperInFlightRef.current) {
      return
    }

    endWhisperInFlightRef.current = true
    setMoveError(null)

    try {
      await endWhisperWithReconcile(whisperRoom.id)

      const snapshot = whisperContextRef.current
      whisperContextRef.current = null
      setHasWhisperContext(false)

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
  }, [endWhisperWithReconcile, onSelectRoom, onToggleBroadcastMode, setMoveError, whisperRoom])

  useEffect(() => {
    if (!canManageRooms || !whisperRoom || !canAutoReconcileWhisper) {
      return
    }

    if (!whisperModeLocked || whisperParticipantCount > 0 || whisperEndBlockedByPendingMoves) {
      return
    }

    const timer = window.setTimeout(() => {
      void handleEndWhisper()
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [
    canManageRooms,
    canAutoReconcileWhisper,
    handleEndWhisper,
    whisperEndBlockedByPendingMoves,
    whisperModeLocked,
    whisperParticipantCount,
    whisperRoom,
  ])

  return useMemo(
    () => ({
      whisperRoom,
      whisperRooms,
      whisperActive,
      whisperModeLocked,
      whisperDisplayedPlayerCount,
      whisperEndBlockedByPendingMoves,
      noteWhisperEntry,
      handleEndWhisper,
      rememberDmVoiceRoom,
      getRememberedDmVoiceRoom,
      setWhisperExitVoiceRoom,
    }),
    [
      getRememberedDmVoiceRoom,
      handleEndWhisper,
      noteWhisperEntry,
      rememberDmVoiceRoom,
      setWhisperExitVoiceRoom,
      whisperActive,
      whisperDisplayedPlayerCount,
      whisperEndBlockedByPendingMoves,
      whisperModeLocked,
      whisperRoom,
      whisperRooms,
    ]
  )
}
