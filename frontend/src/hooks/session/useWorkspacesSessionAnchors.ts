import { useCallback, useEffect, useRef } from 'react'
import { MessageType, RoomType, SessionState, type UUID } from '@shared'
import { generateClientId } from '@/utils/uuid'
import { useStore } from '@/hooks/useStore'
import type { Session as SessionRecord } from '@/types/session'
import type { Message } from '@/types/chat'
import type { Room as RoomRecord } from '@/types/room'
import type { ConnectionState } from '@/ws/client'
import {
  isGreenRoom,
  isSessionBookendMessage,
  normalizeSessionRecord,
  SESSION_TIMER_SYNC_POLL_MS,
} from '@/utils/session/workspaces'

const DISCONNECTED_ANCHOR_POLL_GRACE_MS = 1000

type UseWorkspacesSessionAnchorsParams = {
  apiUrl: string
  token: string
  currentSessionId: UUID | null
  currentSessionState: SessionState | null
  wsState: ConnectionState
  fetchWithAuthGuard: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  updateSession: (sessionId: UUID, session: SessionRecord) => void
  addMessage: (sessionId: UUID, message: Message) => void
}

/**
 * Owns periodic session-anchor refresh and boundary-bookend recovery for hydration.
 */
export function useWorkspacesSessionAnchors(params: UseWorkspacesSessionAnchorsParams) {
  const {
    apiUrl,
    token,
    currentSessionId,
    currentSessionState,
    wsState,
    fetchWithAuthGuard,
    updateSession,
    addMessage,
  } = params
  const previousWsStateRef = useRef<ConnectionState>(wsState)
  const previousSessionStateRef = useRef<SessionState | null>(currentSessionState)
  const disconnectedSinceRef = useRef<number | null>(null)
  const isSyncInFlightRef = useRef(false)

  useEffect(() => {
    if (!currentSessionId) {
      previousWsStateRef.current = wsState
      previousSessionStateRef.current = currentSessionState
      return
    }

    let cancelled = false
    if (wsState !== 'connected') {
      disconnectedSinceRef.current = disconnectedSinceRef.current ?? Date.now()
    } else {
      disconnectedSinceRef.current = null
    }

    const shouldPollWhileDisconnected = wsState !== 'connected'
    const enteredCooldownNow =
      previousSessionStateRef.current !== SessionState.COOLDOWN &&
      currentSessionState === SessionState.COOLDOWN
    const shouldRefreshImmediately =
      enteredCooldownNow || (previousWsStateRef.current !== 'connected' && wsState === 'connected')

    const syncSessionAnchors = async () => {
      if (isSyncInFlightRef.current) {
        return
      }

      isSyncInFlightRef.current = true
      try {
        const response = await fetchWithAuthGuard(`${apiUrl}/api/session/${currentSessionId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          return
        }

        const payload = (await response.json().catch(() => ({}))) as SessionRecord
        if (!payload?.id || cancelled) {
          return
        }

        updateSession(payload.id, normalizeSessionRecord(payload))
      } catch {
        // Timer drift correction polling is best-effort and should not disrupt session UX.
      } finally {
        isSyncInFlightRef.current = false
      }
    }

    previousWsStateRef.current = wsState
    previousSessionStateRef.current = currentSessionState

    if (shouldRefreshImmediately) {
      void syncSessionAnchors()
    }

    let intervalId: number | null = null
    let graceTimeoutId: number | null = null

    const startDisconnectedPolling = () => {
      if (cancelled) {
        return
      }

      void syncSessionAnchors()
      intervalId = window.setInterval(() => {
        void syncSessionAnchors()
      }, SESSION_TIMER_SYNC_POLL_MS)
    }

    if (shouldPollWhileDisconnected) {
      const disconnectedSince = disconnectedSinceRef.current
      const disconnectedForMs = disconnectedSince ? Date.now() - disconnectedSince : 0

      if (disconnectedForMs >= DISCONNECTED_ANCHOR_POLL_GRACE_MS) {
        startDisconnectedPolling()
      } else {
        graceTimeoutId = window.setTimeout(
          startDisconnectedPolling,
          DISCONNECTED_ANCHOR_POLL_GRACE_MS - disconnectedForMs
        )
      }
    }

    return () => {
      cancelled = true
      if (graceTimeoutId !== null) {
        window.clearTimeout(graceTimeoutId)
      }

      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }
    }
  }, [
    apiUrl,
    currentSessionId,
    currentSessionState,
    fetchWithAuthGuard,
    token,
    updateSession,
    wsState,
  ])

  const restoreSessionBookendsFromHistory = useCallback(
    async (sessionId: UUID, rooms: Array<Pick<RoomRecord, 'id' | 'type' | 'name'>>) => {
      const targetRoomIds = rooms
        .filter((room) => room.type === RoomType.MAIN || isGreenRoom(room))
        .map((room) => room.id)

      if (!targetRoomIds.length) {
        return
      }

      const historyByRoom = await Promise.all(
        targetRoomIds.map(async (roomId) => {
          try {
            const params = new URLSearchParams({
              roomId,
              sinceLatestStart: '1',
              systemOnly: '1',
              limit: '24',
            })
            const response = await fetchWithAuthGuard(
              `${apiUrl}/api/chat/messages/${sessionId}?${params.toString()}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            )

            if (!response.ok) {
              return [] as Message[]
            }

            const payload = (await response.json().catch(() => ({}))) as {
              messages?: Array<{
                id?: UUID
                roomId?: UUID
                authorId?: UUID
                authorUsername?: string
                content?: string
                type?: MessageType
                isDmOnly?: boolean
                createdAt?: number | string
                editedAt?: number
              }>
            }

            const rawMessages = Array.isArray(payload.messages) ? payload.messages : []

            return rawMessages
              .map((entry) => {
                const createdAtRaw = entry.createdAt
                const createdAt =
                  typeof createdAtRaw === 'number'
                    ? createdAtRaw
                    : typeof createdAtRaw === 'string'
                      ? new Date(createdAtRaw).getTime()
                      : Number.NaN

                if (
                  !entry.authorId ||
                  !entry.authorUsername ||
                  !entry.content ||
                  !entry.type ||
                  !Number.isFinite(createdAt)
                ) {
                  return null
                }

                return {
                  id: (entry.id || generateClientId('message')) as UUID,
                  roomId: (entry.roomId || roomId) as UUID,
                  authorId: entry.authorId,
                  authorUsername: entry.authorUsername,
                  content: entry.content,
                  type: entry.type,
                  isDmOnly: Boolean(entry.isDmOnly),
                  createdAt,
                  editedAt: entry.editedAt,
                } as Message
              })
              .filter((message): message is Message => Boolean(message))
          } catch {
            return [] as Message[]
          }
        })
      )

      const recoveredBookends = historyByRoom
        .flat()
        .filter(
          (message) =>
            message.type === MessageType.SYSTEM && isSessionBookendMessage(message.content)
        )
        .sort((left, right) => left.createdAt - right.createdAt)

      if (!recoveredBookends.length) {
        return
      }

      const sessionMessages = Object.values(
        (useStore.getState().messages as Record<UUID, Record<UUID, Message>>)[sessionId] || {}
      )

      const existingSignatures = new Set(
        sessionMessages
          .filter((message) => Boolean(message.roomId) && targetRoomIds.includes(message.roomId!))
          .map(
            (message) => `${message.roomId}:${message.authorId}:${message.type}:${message.content}`
          )
      )

      for (const message of recoveredBookends) {
        const roomId = message.roomId
        if (!roomId || !targetRoomIds.includes(roomId)) {
          continue
        }

        const roomSignature = `${roomId}:${message.authorId}:${message.type}:${message.content}`
        if (existingSignatures.has(roomSignature)) {
          continue
        }

        addMessage(sessionId, {
          ...message,
          id: generateClientId('message') as UUID,
        })
        existingSignatures.add(roomSignature)
      }
    },
    [addMessage, apiUrl, fetchWithAuthGuard, token]
  )

  return {
    restoreSessionBookendsFromHistory,
  }
}
