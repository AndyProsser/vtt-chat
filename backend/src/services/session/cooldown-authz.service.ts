import { PresenceState, Role, SessionState } from '@shared'
import type { UUID } from '@shared'
import { getSessionPresence } from '@/services/room.service'
import { getSession, getSessionUsers } from '@/services/session.service'

interface CooldownControlParams {
  sessionId: UUID
  requesterUserId: UUID
}

interface CooldownControlResult {
  ok: boolean
  transitionActorUserId?: UUID
  message?: string
}

export async function resolveCooldownControlAuthorization(
  params: CooldownControlParams
): Promise<CooldownControlResult> {
  const session = await getSession(params.sessionId)
  if (!session) {
    return { ok: false, message: 'Session not found' }
  }

  if (session.state !== SessionState.ENDED) {
    return {
      ok: false,
      message: 'Cooldown controls are only available while session is ENDED.',
    }
  }

  if (session.dmId === params.requesterUserId) {
    return { ok: true, transitionActorUserId: session.dmId }
  }

  const members = await getSessionUsers(params.sessionId)
  const requesterMember = members.find((member) => member.id === params.requesterUserId)

  if (!requesterMember || requesterMember.role !== Role.PLAYER) {
    return {
      ok: false,
      message: 'Only DM or connected players may control cooldown.',
    }
  }

  const presence = await getSessionPresence(params.sessionId)
  const dmPresence = presence.find((entry) => entry.userId === session.dmId)
  const requesterPresence = presence.find((entry) => entry.userId === params.requesterUserId)

  const dmDisconnected = !dmPresence || dmPresence.state === PresenceState.OFFLINE
  const requesterConnected = Boolean(
    requesterPresence && requesterPresence.state !== PresenceState.OFFLINE
  )

  if (!requesterConnected) {
    return {
      ok: false,
      message: 'Only connected players may control cooldown.',
    }
  }

  if (!dmDisconnected) {
    return {
      ok: false,
      message: 'Players can control cooldown only while the DM is disconnected.',
    }
  }

  return { ok: true, transitionActorUserId: session.dmId }
}
