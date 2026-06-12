import { useCallback } from 'react'
import { PresenceState, RoomType } from '@shared'
import type { UUID } from '@shared'
import { useStore } from '@/hooks/useStore'
import type { SessionPresence } from '@/types/room'

interface UseRoomSelectorSyncOptions {
  apiUrl: string
  token: string
  sessionId: UUID
}

export interface UseRoomSelectorSyncResult {
  syncSessionTopologyFromServer: () => Promise<void>
  getRoomMemberIdsFromServer: (roomId: UUID) => Promise<UUID[] | null>
  syncAudioOverridesFromServer: () => Promise<void>
}

/**
 * Provides callbacks to re-sync room topology, presence, and audio overrides
 * from the server. Called after room moves, deletes, and whisper transitions.
 */
export function useRoomSelectorSync({
  apiUrl,
  token,
  sessionId,
}: UseRoomSelectorSyncOptions): UseRoomSelectorSyncResult {
  const replaceSessionTopology = useStore((state) => state.replaceSessionTopology)
  const replaceSessionStatsSnapshot = useStore((state) => state.replaceSessionStatsSnapshot)
  const replaceDMOverrides = useStore((state) => state.replaceDMOverrides)
  const setMockTakeoverUserId = useStore((state) => state.setMockTakeoverUserId)

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
        presence?: Array<{ userId: UUID; primaryRoomId?: UUID }>
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

  return {
    syncSessionTopologyFromServer,
    getRoomMemberIdsFromServer,
    syncAudioOverridesFromServer,
  }
}
