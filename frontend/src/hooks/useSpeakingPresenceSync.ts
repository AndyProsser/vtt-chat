/**
 * useSpeakingPresenceSync
 *
 * Watches device.isSpeaking and sends PRESENCE:STATE_CHANGED (SPEAKING / ONLINE)
 * to the backend WS whenever the speaking bit flips. The backend relays it to all
 * connected clients so remote avatars show the speaking ring.
 *
 * Only sends on actual state changes — the device layer already debounces the bit.
 */
import { useEffect, useRef } from 'react'
import { PresenceState } from '@shared'
import type { EventEnvelope, UUID, Role } from '@shared'
import { useStore } from '@/state/store'

interface UseSpeakingPresenceSyncParams {
  sessionId: UUID | null
  userId: UUID
  username: string
  userRole: Role
  send: (event: EventEnvelope) => void
}

export function useSpeakingPresenceSync({
  sessionId,
  userId,
  username,
  userRole,
  send,
}: UseSpeakingPresenceSyncParams) {
  const isSpeaking = useStore((state) => state.device.isSpeaking)
  const primaryRoomId = useStore((state) =>
    sessionId ? (state.sessionPresence[sessionId]?.[userId]?.primaryRoomId ?? null) : null
  )

  const lastSentRef = useRef<boolean | null>(null)

  useEffect(() => {
    if (!sessionId || lastSentRef.current === isSpeaking) {
      return
    }

    lastSentRef.current = isSpeaking

    const now = Date.now()
    send({
      id: crypto.randomUUID() as UUID,
      type: 'PRESENCE:STATE_CHANGED',
      version: 1,
      sessionId,
      userId,
      userRole,
      roomId: primaryRoomId,
      timestamp: now,
      payload: {
        userId,
        username,
        newState: isSpeaking ? PresenceState.SPEAKING : PresenceState.ONLINE,
        roomId: primaryRoomId,
        changedAt: now,
      },
    })
  }, [isSpeaking, sessionId, userId, username, userRole, primaryRoomId, send])
}
