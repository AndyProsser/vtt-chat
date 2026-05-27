import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { UUID } from '@shared'
import type { Session as SessionRecord } from '@/types/session'
import type { Room as RoomRecord } from '@/types/room'
import { useStore } from '@/state/store'
import { isGreenRoom } from '@/utils/session/workspaces'

type UseWorkspacesGreenroomCarryLifecycleParams = {
  currentSession: SessionRecord | null
  currentRooms: RoomRecord[]
  pendingGreenroomCarryBySessionIdRef: MutableRefObject<Map<UUID, UUID>>
}

/**
 * Finalizes and clears pending greenroom carry context once the target session topology is available.
 */
export function useWorkspacesGreenroomCarryLifecycle({
  currentSession,
  currentRooms,
  pendingGreenroomCarryBySessionIdRef,
}: UseWorkspacesGreenroomCarryLifecycleParams) {
  useEffect(() => {
    if (!currentSession) {
      return
    }

    const fromSessionId = pendingGreenroomCarryBySessionIdRef.current.get(currentSession.id)
    if (!fromSessionId) {
      return
    }

    const targetGreenroom = currentRooms.find((room) => isGreenRoom(room))
    if (!targetGreenroom) {
      return
    }

    const fromRoomsBySession = useStore.getState().rooms as Record<UUID, Record<UUID, RoomRecord>>
    const fromRooms = Object.values(fromRoomsBySession[fromSessionId] || {})
    const fromGreenroom = fromRooms.find((room) => isGreenRoom(room))
    if (!fromGreenroom) {
      pendingGreenroomCarryBySessionIdRef.current.delete(currentSession.id)
      return
    }

    // Contract: session boundary markers are runtime-session only and must never
    // appear in Greenroom. We intentionally do not carry any boundary markers.
    void targetGreenroom
    void fromGreenroom

    pendingGreenroomCarryBySessionIdRef.current.delete(currentSession.id)
  }, [currentRooms, currentSession, pendingGreenroomCarryBySessionIdRef])
}
