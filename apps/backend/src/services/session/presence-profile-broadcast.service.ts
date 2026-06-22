import { Role } from '@shared'
import type { EventEnvelope, UUID } from '@shared'
import { getSessionParticipantProfiles } from '@/repositories/session.repository'
import { getSessionPresence } from '@/services/room.service'
import type { WebSocketManager } from '@/ws'

/**
 * Broadcasts the effective session-visible profile for a user after a profile or
 * character mutation. This keeps live clients aligned with the same participant
 * profile shape used by session hydration and avoids leaking inactive-character edits.
 */
export async function broadcastPresenceProfileUpdate(params: {
  wsManager: Pick<WebSocketManager, 'broadcastEventToSession'>
  sessionIds: UUID[]
  userId: UUID
  username: string
  userRole: Role
  updatedAt?: number
}): Promise<void> {
  const updatedAt = params.updatedAt ?? Date.now()
  const sessionIds = [...new Set(params.sessionIds)]

  for (const sessionId of sessionIds) {
    const [presence, profilesByUserId] = await Promise.all([
      getSessionPresence(sessionId),
      getSessionParticipantProfiles(sessionId),
    ])

    const activePresence = presence.find((entry) => entry.userId === params.userId)
    if (!activePresence) {
      continue
    }

    const participantProfile = profilesByUserId[params.userId]

    const event: EventEnvelope = {
      id: crypto.randomUUID() as UUID,
      type: 'PRESENCE:PROFILE_UPDATED',
      version: 1,
      userId: params.userId,
      userRole: params.userRole,
      sessionId,
      roomId: activePresence.primaryRoomId || null,
      timestamp: updatedAt,
      payload: {
        userId: params.userId,
        username: participantProfile?.username || activePresence.username || params.username,
        updatedAt,
        roomId: activePresence.primaryRoomId || null,
        previousGroupId: activePresence.previousGroupId || null,
        playerName: participantProfile?.playerName || activePresence.username || params.username,
        avatarUrl: participantProfile?.avatarUrl ?? null,
        characterName: participantProfile?.characterName ?? null,
        characterClass: participantProfile?.characterClass ?? null,
        characterClasses: participantProfile?.characterClasses ?? null,
        multiclass: participantProfile?.multiclass ?? false,
        characterRace: participantProfile?.characterRace ?? null,
        level: participantProfile?.level ?? null,
        characterStats: participantProfile?.characterStats ?? null,
      },
    }

    params.wsManager.broadcastEventToSession(sessionId, event)
  }
}
