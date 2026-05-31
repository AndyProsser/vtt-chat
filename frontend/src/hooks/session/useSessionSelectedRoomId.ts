import { useMemo } from 'react'
import type { UUID } from '@shared'
import { RoomType } from '@shared'
import { useStore } from '@/hooks/useStore'
import type { Room as RoomRecord, SessionPresence as PresenceRecord } from '@/types/room'

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
  const currentSessionPresenceByUser = useStore((state) => {
    if (!sessionId) {
      return null
    }

    return (state.sessionPresence[sessionId] ?? null) as Record<UUID, PresenceRecord> | null
  })
  const currentUserId = useStore((state) => state.currentUser?.id ?? ('' as UUID))
  const activeTakeoverUserId = useStore((state) => {
    if (!sessionId) {
      return null
    }

    return state.mockTakeoverUserIdBySession[sessionId] ?? null
  })

  const visibleRoomsArray = useMemo<RoomRecord[]>(
    () => Object.values(currentSessionRoomsById ?? {}),
    [currentSessionRoomsById]
  )
  const currentPresence = useMemo<PresenceRecord[]>(
    () => Object.values(currentSessionPresenceByUser ?? {}),
    [currentSessionPresenceByUser]
  )
  const effectiveActorUserId = (activeTakeoverUserId || currentUserId) as UUID
  const isTakeoverActive = Boolean(activeTakeoverUserId)

  const selectedRoomId = useMemo<UUID | ''>(() => {
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
    const ownPresence = currentPresence.find((presence) => presence.userId === effectiveActorUserId)
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
    currentPresence,
    effectiveActorUserId,
    isTakeoverActive,
    selectedRoomIdOverride,
    visibleRoomsArray,
  ])

  return selectedRoomId
}
