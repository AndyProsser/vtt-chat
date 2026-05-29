import { Role, type UUID } from '@shared'
import { getPrismaClient } from '@/infra/db'
import { getSession, getSessionUsers } from '@/services/session/core.service'

const prisma = getPrismaClient()

type EffectiveSessionRole = Role.DM | Role.PLAYER | Role.SPECTATOR

type SessionAuthzFailureCode = 'SESSION_NOT_FOUND' | 'FORBIDDEN'

export type EffectiveSessionRoleResult =
  | {
      ok: true
      session: Awaited<ReturnType<typeof getSession>> extends infer T ? Exclude<T, null> : never
      role: EffectiveSessionRole
    }
  | {
      ok: false
      code: SessionAuthzFailureCode
      message: string
    }

export function normalizePlayerFacingRole(role: string): EffectiveSessionRole {
  const normalized = toEffectiveRole(role)
  return normalized || Role.PLAYER
}

export function deriveCampaignJoinRole(role: string): Role.PLAYER | Role.SPECTATOR {
  return role === Role.SPECTATOR ? Role.SPECTATOR : Role.PLAYER
}

function toEffectiveRole(role: string): EffectiveSessionRole | null {
  if (role === Role.DM) {
    return Role.DM
  }
  if (role === Role.PLAYER) {
    return Role.PLAYER
  }
  if (role === Role.SPECTATOR) {
    return Role.SPECTATOR
  }

  return null
}

export async function resolveEffectiveSessionRole(params: {
  sessionId: UUID
  userId: UUID
  requireMembershipForDm?: boolean
}): Promise<EffectiveSessionRoleResult> {
  const session = await getSession(params.sessionId)
  if (!session) {
    return {
      ok: false,
      code: 'SESSION_NOT_FOUND',
      message: 'Session not found',
    }
  }

  // Campaign-backed sessions are campaign-authoritative for conversation access.
  // Session membership remains required for room assignment/routing.
  const sessionCampaign = await prisma.session.findUnique({
    where: { id: params.sessionId },
    select: { campaignId: true },
  })

  if (sessionCampaign?.campaignId) {
    const campaignMembership = await prisma.campaignMembership.findUnique({
      where: {
        campaignId_userId: {
          campaignId: sessionCampaign.campaignId,
          userId: params.userId,
        },
      },
      select: { role: true },
    })

    const campaignRole = campaignMembership?.role ? toEffectiveRole(campaignMembership.role) : null

    if (!campaignRole) {
      return {
        ok: false,
        code: 'FORBIDDEN',
        message: 'You are not a member of this campaign',
      }
    }
  }

  const isSessionDm = session.dmId === params.userId
  if (isSessionDm && !params.requireMembershipForDm) {
    return {
      ok: true,
      session,
      role: Role.DM,
    }
  }

  const members = await getSessionUsers(params.sessionId)
  const member = members.find((entry) => entry.id === params.userId)
  if (!member) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: 'You are not a member of this session',
    }
  }

  if (isSessionDm) {
    return {
      ok: true,
      session,
      role: Role.DM,
    }
  }

  const role = toEffectiveRole(member.role)
  if (!role) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: 'You are not allowed to access this session',
    }
  }

  return {
    ok: true,
    session,
    role,
  }
}

export async function resolveRoleForSessionJoin(params: { sessionId: UUID; userId: UUID }): Promise<
  | {
      ok: true
      role: Role
      sessionDmId: UUID
    }
  | {
      ok: false
      code: SessionAuthzFailureCode
      message: string
    }
> {
  const session = await getSession(params.sessionId)
  if (!session) {
    return {
      ok: false,
      code: 'SESSION_NOT_FOUND',
      message: 'Session not found',
    }
  }

  if (session.dmId === params.userId) {
    return {
      ok: true,
      role: Role.DM,
      sessionDmId: session.dmId,
    }
  }

  const sessionRecord = await prisma.session.findUnique({
    where: { id: params.sessionId },
    select: { campaignId: true },
  })

  if (sessionRecord?.campaignId) {
    const campaignMembership = await prisma.campaignMembership.findUnique({
      where: {
        campaignId_userId: {
          campaignId: sessionRecord.campaignId,
          userId: params.userId,
        },
      },
      select: { role: true },
    })

    const role = campaignMembership?.role ? toEffectiveRole(campaignMembership.role) : null
    if (!role) {
      return {
        ok: false,
        code: 'FORBIDDEN',
        message: 'You are not a member of this campaign',
      }
    }

    return {
      ok: true,
      role,
      sessionDmId: session.dmId,
    }
  }

  return {
    ok: true,
    role: Role.PLAYER,
    sessionDmId: session.dmId,
  }
}
