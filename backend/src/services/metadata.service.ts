import { getPrismaClient } from '@/infra/db'
import {
  buildSessionMetadataTags,
  getMetadataTemplates,
  mapSessionLogEventToAction,
} from '@/services/metadata-templates.service'
import type {
  MetadataAccessResult,
  MetadataTemplate,
  MetadataTimelineEntry,
  SessionMetadataSnapshot,
} from '@/types/metadata.types'
import type { TokenPayload } from '@/services/auth.service'
import { SessionState, normalizeSessionState, toPublicSessionState } from '@shared'

const prisma = getPrismaClient()

type MetadataAccessSession = Extract<MetadataAccessResult, { ok: true }>['session']

function toSharedSessionState(state: string): SessionState {
  const normalized = normalizeSessionState(state as any) ?? SessionState.IDLE
  return (toPublicSessionState(normalized) ?? normalized) as SessionState
}

async function requireMetadataSessionAccess(
  sessionId: string,
  user: Pick<TokenPayload, 'userId'>
): Promise<MetadataAccessResult> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      name: true,
      description: true,
      state: true,
      dmId: true,
      createdAt: true,
      updatedAt: true,
      campaign: {
        select: {
          id: true,
          name: true,
        },
      },
      members: {
        where: { userId: user.userId },
        select: { id: true },
        take: 1,
      },
      _count: {
        select: {
          messages: true,
          notes: true,
          members: true,
          rooms: true,
          presence: true,
          logs: true,
        },
      },
    },
  })

  if (!session) {
    return { ok: false, code: 'SESSION_NOT_FOUND' }
  }

  const canAccess = session.dmId === user.userId || session.members.length > 0
  if (!canAccess) {
    return { ok: false, code: 'FORBIDDEN' }
  }

  const mappedSession: MetadataAccessSession = {
    id: session.id,
    name: session.name,
    description: session.description,
    state: toSharedSessionState(session.state),
    dmId: session.dmId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    campaign: session.campaign,
    _count: session._count,
  }

  return { ok: true, session: mappedSession }
}

export async function getSessionMetadataSnapshot(params: {
  sessionId: string
  user: Pick<TokenPayload, 'userId'>
}): Promise<{ ok: true; snapshot: SessionMetadataSnapshot } | { ok: false; code: string }> {
  const access = await requireMetadataSessionAccess(params.sessionId, params.user)
  if (!access.ok) {
    return access
  }

  const { session } = access
  const tags = buildSessionMetadataTags({
    state: session.state,
    campaignName: session.campaign?.name || null,
  })

  return {
    ok: true,
    snapshot: {
      sessionId: session.id,
      title: session.name,
      description: session.description,
      state: session.state,
      dmId: session.dmId,
      campaign: session.campaign,
      tags,
      stats: {
        messageCount: session._count.messages,
        noteCount: session._count.notes,
        memberCount: session._count.members,
        roomCount: session._count.rooms,
        presenceCount: session._count.presence,
        eventCount: session._count.logs,
      },
      createdAt: session.createdAt.getTime(),
      updatedAt: session.updatedAt.getTime(),
    },
  }
}

export async function getSessionMetadataTimeline(params: {
  sessionId: string
  user: Pick<TokenPayload, 'userId'>
  limit?: number
  offset?: number
}): Promise<
  | {
      ok: true
      timeline: MetadataTimelineEntry[]
      total: number
      limit: number
      offset: number
    }
  | { ok: false; code: string }
> {
  const access = await requireMetadataSessionAccess(params.sessionId, params.user)
  if (!access.ok) {
    return access
  }

  const limit = Math.min(Math.max(params.limit || 50, 1), 200)
  const offset = Math.max(params.offset || 0, 0)

  const [rows, total] = await Promise.all([
    prisma.sessionLog.findMany({
      where: { sessionId: params.sessionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.sessionLog.count({
      where: { sessionId: params.sessionId },
    }),
  ])

  return {
    ok: true,
    timeline: rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      actorId: row.userId,
      actorUsername: row.username,
      eventType: row.eventType,
      action: mapSessionLogEventToAction(row.eventType),
      detail: row.detail,
      timestamp: row.createdAt.getTime(),
    })),
    total,
    limit,
    offset,
  }
}

export function listMetadataTemplates(): MetadataTemplate[] {
  return getMetadataTemplates()
}
