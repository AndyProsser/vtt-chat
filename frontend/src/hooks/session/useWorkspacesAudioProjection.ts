import { useEffect } from 'react'
import { RoomType, type UUID } from '@shared'
import type { Session as SessionRecord } from '@/types/session'
import type { Room as RoomRecord, SessionPresence as PresenceRecord } from '@/types/room'
import type { EnvironmentPreset } from '@/types/audio'
import { buildRoomEnvironmentPreset, isGreenRoom } from '@/utils/session/workspaces'

type UseWorkspacesAudioProjectionParams = {
  currentSession: SessionRecord | null
  currentPresence: PresenceRecord[]
  effectiveActorUserId: UUID
  currentRooms: RoomRecord[]
  setPrivateRoomCleanMode: (cleanMode: boolean) => void
  connectedRoomId: UUID | ''
  currentEnvironment: EnvironmentPreset | null | undefined
  clearEnvironment: () => void
  roomEnvironmentNames: Record<UUID, string>
  setEnvironment: (preset: EnvironmentPreset) => void
}

/**
 * Projects private-room clean mode and active room environment from authoritative room connection state.
 */
export function useWorkspacesAudioProjection({
  currentSession,
  currentPresence,
  effectiveActorUserId,
  currentRooms,
  setPrivateRoomCleanMode,
  connectedRoomId,
  currentEnvironment,
  clearEnvironment,
  roomEnvironmentNames,
  setEnvironment,
}: UseWorkspacesAudioProjectionParams) {
  useEffect(() => {
    if (!currentSession) {
      setPrivateRoomCleanMode(false)
      return
    }

    const ownPresence = currentPresence.find((presence) => presence.userId === effectiveActorUserId)
    const ownRoomType = ownPresence?.primaryRoomId
      ? currentRooms.find((room) => room.id === ownPresence.primaryRoomId)?.type
      : undefined

    setPrivateRoomCleanMode(ownRoomType === RoomType.PRIVATE)
  }, [currentPresence, currentRooms, currentSession, effectiveActorUserId, setPrivateRoomCleanMode])

  useEffect(() => {
    if (!currentSession || !connectedRoomId) {
      if (currentEnvironment) {
        clearEnvironment()
      }
      return
    }

    const connectedRoom = currentRooms.find((room) => room.id === connectedRoomId)
    if (!connectedRoom) {
      if (currentEnvironment) {
        clearEnvironment()
      }
      return
    }

    if (connectedRoom && (isGreenRoom(connectedRoom) || connectedRoom.type === RoomType.PRIVATE)) {
      if (currentEnvironment) {
        clearEnvironment()
      }
      return
    }

    const hasSelectedRoomEnvironment = Object.prototype.hasOwnProperty.call(
      roomEnvironmentNames,
      connectedRoomId
    )
    if (!hasSelectedRoomEnvironment) {
      if (currentEnvironment) {
        clearEnvironment()
      }
      return
    }

    const roomEnvironmentName = roomEnvironmentNames[connectedRoomId]
    if (!roomEnvironmentName || roomEnvironmentName.trim().toLowerCase() === 'default') {
      if (currentEnvironment) {
        clearEnvironment()
      }
      return
    }

    if (
      currentEnvironment?.name?.trim().toLowerCase() === roomEnvironmentName.trim().toLowerCase()
    ) {
      return
    }

    setEnvironment(buildRoomEnvironmentPreset(connectedRoomId, roomEnvironmentName))
  }, [
    clearEnvironment,
    connectedRoomId,
    currentEnvironment,
    currentRooms,
    currentSession,
    roomEnvironmentNames,
    setEnvironment,
  ])
}
