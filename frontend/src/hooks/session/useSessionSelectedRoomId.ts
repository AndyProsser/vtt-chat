import { useMemo } from 'react'
import type { UUID } from '@shared'
import { RoomType, isGreenroomSessionState } from '@shared'
import { useStore } from '@/hooks/useStore'
import type { Room as RoomRecord } from '@/types/room'
import { isGreenRoom } from '@/utils/session/workspaces'

/**
 * Computes the selected room ID for a given session.
 * Prioritizes manual selection override; falls back to connected room; falls back to MAIN room.
 * Reads directly from Zustand so can be used by leaf components without prop threading.
 */
export function useSessionSelectedRoomId(sessionId: UUID | null): UUID | '' {
  const selectedRoomIdOverride = useStore((state) => {
    if (!sessionId) {
      return ''
    }

    return state.selectedRoomIdOverrideBySessionId[sessionId] ?? ''
  })
  const currentSessionRoomsById = useStore((state) => {
    if (!sessionId) {
      return null
    }

    return (state.rooms[sessionId] ?? null) as Record<UUID, RoomRecord> | null
  })
  const currentSessionState = useStore((state) => {
    if (!sessionId) {
      return null
    }

    return state.sessions[sessionId]?.state ?? null
  })
  const currentUserId = useStore((state) => state.currentUser?.id ?? ('' as UUID))
  const activeTakeoverUserId = useStore((state) => {
    if (!sessionId) {
      return null
    }

    return state.mockTakeoverUserIdBySession[sessionId] ?? null
  })
  const effectiveActorUserId = (activeTakeoverUserId || currentUserId) as UUID
  const effectiveActorPrimaryRoomId = useStore((state) => {
    if (!sessionId || !effectiveActorUserId) {
      return ''
    }

    return state.sessionPresence[sessionId]?.[effectiveActorUserId]?.primaryRoomId ?? ''
  })

  const visibleRoomsArray = useMemo<RoomRecord[]>(
    () => Object.values(currentSessionRoomsById ?? {}),
    [currentSessionRoomsById]
  )
  const isTakeoverActive = Boolean(activeTakeoverUserId)

  const selectedRoomId = useMemo<UUID | ''>(() => {
    if (!visibleRoomsArray.length) {
      return ''
    }

    const greenroom = visibleRoomsArray.find((room) => isGreenRoom(room))

    // Greenroom states must always win over stale manual room selections.
    // WS transition events can move the session back to greenroom before the
    // UI override map is cleared, and a refresh works only because it drops
    // that client-only override. Preserve the WS-driven transition locally by
    // preferring greenroom whenever the session state says we're there.
    if (isGreenroomSessionState(currentSessionState) && greenroom) {
      return greenroom.id
    }

    // Priority 1: Manual override (if valid)
    if (
      !isTakeoverActive &&
      selectedRoomIdOverride &&
      visibleRoomsArray.some((room) => room.id === selectedRoomIdOverride)
    ) {
      return selectedRoomIdOverride
    }

    // Priority 2: Connected room (if valid)
    if (
      effectiveActorPrimaryRoomId &&
      visibleRoomsArray.some((room) => room.id === effectiveActorPrimaryRoomId)
    ) {
      return effectiveActorPrimaryRoomId
    }

    // Priority 3: MAIN room fallback
    if (isGreenroomSessionState(currentSessionState) && greenroom) {
      return greenroom.id
    }

    const mainRoom = visibleRoomsArray.find((room) => room.type === RoomType.MAIN)
    return (mainRoom || visibleRoomsArray[0])?.id || ''
  }, [
    currentSessionState,
    effectiveActorPrimaryRoomId,
    isTakeoverActive,
    selectedRoomIdOverride,
    visibleRoomsArray,
  ])

  return selectedRoomId
}
