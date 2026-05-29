import { useEffect, useRef } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { ConnectionState } from '@/ws/client'
import type { Session as SessionRecord } from '@/types/session'
import type { Room as RoomRecord, SessionPresence as PresenceRecord } from '@/types/room'
import type {
  ApiAudioEnvironmentState,
  ApiBroadcastState,
  ApiPresence,
  ApiRoom,
  ApiSessionStats,
  ApiTakeoverIdentitySnapshot,
} from '@/types/session/workspaces'
import type { UUID } from '@shared'

type DmOverridePayload = {
  userId: UUID
  overrideType: 'MUTE' | 'UNMUTE' | 'GAIN' | 'GATE' | 'FILTER' | 'CONDITION' | 'VOICE_OF_GOD'
  parameters?: Record<string, unknown>
  appliedAt: number
}

type AudioStatePayload = {
  environment?: {
    id: UUID
    name: string
    reverbSend?: number
    lowpassFreq?: number
    roomGain?: number
  } | null
  environments?: ApiAudioEnvironmentState[]
  dmOverrides?: DmOverridePayload[]
  broadcast?: ApiBroadcastState
  voiceOfGod?: ApiBroadcastState
}

type UseWorkspacesHydrationLifecycleParams = {
  apiUrl: string
  token: string
  wsState: ConnectionState
  currentSession: SessionRecord | null
  fetchWithAuthGuard: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  setSelectedRoomIdOverride: Dispatch<SetStateAction<UUID | ''>>
  replaceSessionTopology: (sessionId: UUID, rooms: RoomRecord[], presence: PresenceRecord[]) => void
  replaceSessionStatsSnapshot: (sessionId: UUID, stats: ApiSessionStats) => void
  setMockTakeoverUserId: (sessionId: UUID, userId: UUID | null) => void
  restoreSessionBookendsFromHistory: (sessionId: UUID, nextRooms: RoomRecord[]) => Promise<void>
  resetSessionAudioState: () => void
  clearActiveEffects: () => void
  setEnvironment: (environment: {
    id: UUID
    name: string
    reverbSend: number
    lowpassFreq: number
    roomGain: number
  }) => void
  replaceRoomEnvironmentNames: (environmentNames: Record<UUID, string>) => void
  replaceDMOverrides: (overrides: DmOverridePayload[]) => void
  setBroadcastState: (state: {
    enabled: boolean
    broadcastRoomId?: string
    dmId?: UUID
    changedAt?: number
  }) => void
  lastHydratedSessionFingerprintRef: MutableRefObject<string | null>
  prevWsStateRef: MutableRefObject<ConnectionState>
}

const RECENT_SESSION_CHANGE_RECONNECT_SUPPRESS_MS = 500

/**
 * Rehydrates session topology and audio state whenever the active session changes
 * or the websocket reconnects, keeping local state aligned with backend authority.
 */
export function useWorkspacesHydrationLifecycle(
  params: UseWorkspacesHydrationLifecycleParams
): void {
  const {
    apiUrl,
    token,
    wsState,
    currentSession,
    fetchWithAuthGuard,
    setSelectedRoomIdOverride,
    replaceSessionTopology,
    replaceSessionStatsSnapshot,
    setMockTakeoverUserId,
    restoreSessionBookendsFromHistory,
    resetSessionAudioState,
    clearActiveEffects,
    setEnvironment,
    replaceRoomEnvironmentNames,
    replaceDMOverrides,
    setBroadcastState,
    lastHydratedSessionFingerprintRef,
    prevWsStateRef,
  } = params
  const inFlightHydrationFingerprintRef = useRef<string | null>(null)
  const recentSessionChangeHydratedAtRef = useRef<number | null>(null)

  useEffect(() => {
    const prev = prevWsStateRef.current
    prevWsStateRef.current = wsState

    if (!currentSession) {
      lastHydratedSessionFingerprintRef.current = null
      return
    }

    const sessionFingerprint = `${currentSession.id}:${currentSession.state}`
    const sessionChanged = lastHydratedSessionFingerprintRef.current !== sessionFingerprint
    const isReconnect = wsState === 'connected' && prev !== 'connected'

    if (!sessionChanged && !isReconnect) {
      return
    }

    if (!sessionChanged && isReconnect) {
      const recentSessionChangeHydratedAt = recentSessionChangeHydratedAtRef.current
      if (
        recentSessionChangeHydratedAt !== null &&
        Date.now() - recentSessionChangeHydratedAt < RECENT_SESSION_CHANGE_RECONNECT_SUPPRESS_MS
      ) {
        return
      }
    }

    if (inFlightHydrationFingerprintRef.current === sessionFingerprint) {
      return
    }

    lastHydratedSessionFingerprintRef.current = sessionFingerprint
    inFlightHydrationFingerprintRef.current = sessionFingerprint

    const hydrationTriggeredBySessionChange = sessionChanged

    const loadPresenceAndRooms = async () => {
      let hydrationApplied = false
      try {
        const [roomsResponse, presenceResponse, audioStateResponse] = await Promise.all([
          fetchWithAuthGuard(`${apiUrl}/api/rooms/session/${currentSession.id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          fetchWithAuthGuard(`${apiUrl}/api/presence/${currentSession.id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          fetchWithAuthGuard(`${apiUrl}/api/audio/sessions/${currentSession.id}/state`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
        ])

        if (!roomsResponse.ok || !presenceResponse.ok || !audioStateResponse.ok) {
          return
        }

        const roomsPayload = (await roomsResponse.json()) as { rooms?: ApiRoom[] }
        const presencePayload = (await presenceResponse.json()) as {
          presence?: ApiPresence[]
          stats?: ApiSessionStats
          identity?: ApiTakeoverIdentitySnapshot
        }
        const audioStatePayload = (await audioStateResponse.json()) as AudioStatePayload

        const nextRooms: RoomRecord[] = (roomsPayload.rooms || []).map((room) => ({
          id: room.id,
          sessionId: room.sessionId,
          name: room.name,
          type: room.type,
          createdAt: room.createdAt,
          createdBy: room.createdBy,
        }))

        const nextPresence: PresenceRecord[] = (presencePayload.presence || []).map((entry) => ({
          userId: entry.userId,
          username: entry.username,
          role: entry.role,
          playerName: entry.playerName,
          avatarUrl: entry.avatarUrl,
          characterName: entry.characterName,
          characterClass: entry.characterClass,
          characterSubclass: entry.characterSubclass,
          characterRace: entry.characterRace,
          level: entry.level,
          characterStats: entry.characterStats,
          state: entry.state,
          primaryRoomId: entry.primaryRoomId,
          privateRoomId: entry.privateRoomId,
          lastSeenAt: entry.lastSeenAt,
        }))

        setSelectedRoomIdOverride('')

        replaceSessionTopology(currentSession.id, nextRooms, nextPresence)
        if (presencePayload.stats) {
          replaceSessionStatsSnapshot(currentSession.id, presencePayload.stats)
        }

        if (import.meta.env.DEV) {
          const identity = presencePayload.identity
          setMockTakeoverUserId(
            currentSession.id,
            identity?.active ? identity.assumedUserId || null : null
          )
        }

        await restoreSessionBookendsFromHistory(currentSession.id, nextRooms)

        resetSessionAudioState()
        clearActiveEffects()

        const recoveredEnv = audioStatePayload.environment
        if (recoveredEnv) {
          setEnvironment({
            id: recoveredEnv.id,
            name: recoveredEnv.name,
            reverbSend: recoveredEnv.reverbSend ?? 0.3,
            lowpassFreq: recoveredEnv.lowpassFreq ?? 8000,
            roomGain: recoveredEnv.roomGain ?? 0,
          })
        }

        const nextEnvironmentNames: Record<UUID, string> = {}
        for (const environmentState of audioStatePayload.environments || []) {
          if (!nextEnvironmentNames[environmentState.roomId]) {
            nextEnvironmentNames[environmentState.roomId] = environmentState.environmentName
          }
        }
        replaceRoomEnvironmentNames(nextEnvironmentNames)

        const recoveredOverrides = audioStatePayload.dmOverrides
        if (recoveredOverrides && recoveredOverrides.length > 0) {
          replaceDMOverrides(recoveredOverrides)
        }

        const broadcastState = audioStatePayload.broadcast || audioStatePayload.voiceOfGod
        if (broadcastState) {
          setBroadcastState({
            enabled: Boolean(broadcastState.enabled),
            broadcastRoomId: broadcastState.broadcastRoomId,
            dmId: broadcastState.dmId,
            changedAt: broadcastState.changedAt,
          })
        }

        fetchWithAuthGuard(`${apiUrl}/api/presence/${currentSession.id}/recover`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {
          // Non-critical: snapshot recovery failure does not block UI updates.
        })

        hydrationApplied = true
      } catch {
        // Websocket updates can continue to converge state after hydration errors.
      } finally {
        inFlightHydrationFingerprintRef.current = null

        if (hydrationTriggeredBySessionChange && hydrationApplied) {
          recentSessionChangeHydratedAtRef.current = Date.now()
        }
      }
    }

    void loadPresenceAndRooms()
  }, [
    apiUrl,
    clearActiveEffects,
    currentSession,
    fetchWithAuthGuard,
    lastHydratedSessionFingerprintRef,
    prevWsStateRef,
    replaceDMOverrides,
    replaceRoomEnvironmentNames,
    replaceSessionStatsSnapshot,
    replaceSessionTopology,
    resetSessionAudioState,
    restoreSessionBookendsFromHistory,
    setBroadcastState,
    setEnvironment,
    setMockTakeoverUserId,
    setSelectedRoomIdOverride,
    token,
    wsState,
  ])
}
