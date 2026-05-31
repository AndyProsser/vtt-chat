import { useMemo } from 'react'
import type { UUID } from '@shared'
import { RoomType } from '@shared'
import { useStore } from '@/hooks/useStore'

/**
 * Computes the selected room ID for a given session.
 * Prioritizes manual selection override; falls back to connected room; falls back to MAIN room.
 * Reads directly from Zustand so can be used by leaf components without prop threading.
 */
export function useSessionSelectedRoomId(sessionId: UUID | null): UUID | '' {
  const selectedRoomIdOverride = useStore((state) => {
    if (!sessionId) return ''
    return state.selectedRoomIdOverrideBySessionId[sessionId] ?? ''
  })

  const currentSessionRoomsById = useStore((state) => {
    if (!sessionId) return {}
    const roomsBySession = state.rooms as Record<UUID, Record<UUID, { id: UUID; type: string }>>
    return roomsBySession[sessionId] ?? {}
  })

  const currentPresence = useStore((state) => {
    if (!sessionId) return []
    const presenceBySession = state.sessionPresence as Record<UUID, Record<UUID, { userId: UUID; primaryRoomId: UUID | '' }>>
    return Object.values(presenceBySession[sessionId] ?? {})
  })

  const effectiveActorUserId = useStore((state) => {
    // Use user ID if not in takeover; otherwise use takeover user ID
    if (!state.currentSessionId) return state.user?.id ?? ('' as UUID)
    const takeoverUserId = state.mockTakeoverUserIdBySession[state.currentSessionId]
    return (takeoverUserId || state.user?.id) ?? ('' as UUID)
  })

  const isTakeoverActive = useStore((state) => {
    if (!state.currentSessionId) return false
    return !!state.mockTakeoverUserIdBySession[state.currentSessionId]
  })

  const selectedRoomId = useMemo<UUID | ''>(() => {
    const visibleRoomsArray = Object.values(currentSessionRoomsById)
    if (!visibleRoomsArray.length) {
      return ''
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
    const ownPresence = currentPresence.find(
      (presence) => presence.userId === effectiveActorUserId
    )
    if (
      ownPresence?.primaryRoomId &&
      visibleRoomsArray.some((room) => room.id === ownPresence.primaryRoomId)
    ) {
      return ownPresence.primaryRoomId
    }

    // Priority 3: MAIN room fallback
    const mainRoom = visibleRoomsArray.find((room) => room.type === RoomType.MAIN)
    return (mainRoom || visibleRoomsArray[0])?.id || ''
  }, [
    currentSessionRoomsById,
    selectedRoomIdOverride,
    isTakeoverActive,
    currentPresence,
    effectiveActorUserId,
  ])

  return selectedRoomId
}
