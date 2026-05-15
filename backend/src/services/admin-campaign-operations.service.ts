import { getPrismaClient } from '@/infra/db'
import {
  applyArchivedMarker,
  isCampaignArchived,
  removeArchivedMarker,
} from '@/services/admin-campaigns.service'
import type { AdminAuthToken } from '@/types'

const prisma = getPrismaClient()

function canManageCampaign(actor: AdminAuthToken, currentDmId: string): boolean {
  return actor.adminRole !== 'CAMPAIGN_DM' || actor.userId === currentDmId
}

export async function getAdminCampaignRoomsPayload(params: {
  actor: AdminAuthToken
  campaignId: string
  requestedSessionId: string | null
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: {
      id: true,
      name: true,
      currentDmId: true,
    },
  })

  if (!campaign) {
    return {
      status: 404,
      body: { error: 'Campaign not found', code: 'NOT_FOUND' },
    }
  }

  if (!canManageCampaign(params.actor, campaign.currentDmId)) {
    return {
      status: 403,
      body: { error: 'Insufficient permissions', code: 'FORBIDDEN' },
    }
  }

  const session = params.requestedSessionId
    ? await prisma.session.findFirst({
        where: {
          id: params.requestedSessionId,
          campaignId: params.campaignId,
        },
        select: {
          id: true,
          name: true,
          state: true,
          updatedAt: true,
        },
      })
    : await prisma.session.findFirst({
        where: {
          campaignId: params.campaignId,
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          state: true,
          updatedAt: true,
        },
      })

  if (!session) {
    return {
      status: 200,
      body: {
        campaign,
        session: null,
        rooms: [],
      },
    }
  }

  const [rooms, roomPresenceCounts] = await Promise.all([
    prisma.room.findMany({
      where: {
        sessionId: session.id,
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        type: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.presenceSnapshot.groupBy({
      by: ['primaryRoomId'],
      where: {
        sessionId: session.id,
        primaryRoomId: { not: null },
        state: { not: 'OFFLINE' },
      },
      _count: {
        _all: true,
      },
    }),
  ])

  const sessionMembers = await prisma.sessionMember.findMany({
    where: { sessionId: session.id },
    orderBy: [{ role: 'asc' }, { username: 'asc' }],
    select: {
      userId: true,
      username: true,
      role: true,
    },
  })

  const presenceRows = await prisma.presenceSnapshot.findMany({
    where: { sessionId: session.id },
    select: {
      userId: true,
      primaryRoomId: true,
      state: true,
    },
  })

  const presenceByUser = new Map(
    presenceRows.map((row) => [row.userId, { primaryRoomId: row.primaryRoomId, state: row.state }])
  )

  const roomOccupancy = new Map<string, number>()
  roomPresenceCounts.forEach((entry) => {
    if (entry.primaryRoomId) {
      roomOccupancy.set(entry.primaryRoomId, entry._count._all)
    }
  })

  return {
    status: 200,
    body: {
      campaign,
      session,
      rooms: rooms.map((room) => ({
        ...room,
        occupantCount: roomOccupancy.get(room.id) || 0,
      })),
      members: sessionMembers.map((member) => {
        const presence = presenceByUser.get(member.userId)
        return {
          userId: member.userId,
          username: member.username,
          role: member.role,
          primaryRoomId: presence?.primaryRoomId || null,
          presenceState: presence?.state || 'OFFLINE',
        }
      }),
    },
  }
}

export async function endAdminCampaignSession(params: {
  actor: AdminAuthToken
  campaignId: string
  sessionId: string
  reason?: string
}): Promise<{
  status: number
  body: Record<string, unknown>
  audit?: {
    action: 'SESSION_FORCE_END'
    targetType: 'SESSION'
    targetId: string
    reason?: string
    metadata: Record<string, unknown>
  }
}> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: { id: true, currentDmId: true, name: true },
  })

  if (!campaign) {
    return {
      status: 404,
      body: { error: 'Campaign not found', code: 'NOT_FOUND' },
    }
  }

  if (!canManageCampaign(params.actor, campaign.currentDmId)) {
    return {
      status: 403,
      body: { error: 'Insufficient permissions', code: 'FORBIDDEN' },
    }
  }

  const existingSession = await prisma.session.findUnique({
    where: { id: params.sessionId },
    select: {
      id: true,
      campaignId: true,
      name: true,
      state: true,
      endedAt: true,
    },
  })

  if (!existingSession || existingSession.campaignId !== campaign.id) {
    return {
      status: 404,
      body: { error: 'Session not found', code: 'NOT_FOUND' },
    }
  }

  if (existingSession.state === 'ENDED') {
    return {
      status: 200,
      body: {
        message: 'Session is already ended',
        session: existingSession,
      },
    }
  }

  const updatedSession = await prisma.session.update({
    where: { id: existingSession.id },
    data: {
      state: 'ENDED',
      endedAt: new Date(),
    },
    select: {
      id: true,
      name: true,
      state: true,
      endedAt: true,
      updatedAt: true,
      campaignId: true,
    },
  })

  return {
    status: 200,
    body: {
      message: 'Session ended successfully',
      session: updatedSession,
    },
    audit: {
      action: 'SESSION_FORCE_END',
      targetType: 'SESSION',
      targetId: updatedSession.id,
      reason: params.reason,
      metadata: {
        campaignId: campaign.id,
        campaignName: campaign.name,
        sessionName: updatedSession.name,
        previousState: existingSession.state,
        nextState: updatedSession.state,
      },
    },
  }
}

export async function archiveAdminCampaign(params: {
  actor: AdminAuthToken
  campaignId: string
  reason?: string
}): Promise<{
  status: number
  body: Record<string, unknown>
  audit?: {
    action: 'CAMPAIGN_ARCHIVE'
    targetType: 'CAMPAIGN'
    targetId: string
    reason?: string
    metadata: Record<string, unknown>
  }
}> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: {
      id: true,
      name: true,
      description: true,
      currentDmId: true,
    },
  })

  if (!campaign) {
    return {
      status: 404,
      body: { error: 'Campaign not found', code: 'NOT_FOUND' },
    }
  }

  if (!canManageCampaign(params.actor, campaign.currentDmId)) {
    return {
      status: 403,
      body: { error: 'Insufficient permissions', code: 'FORBIDDEN' },
    }
  }

  if (isCampaignArchived(campaign.description)) {
    return {
      status: 200,
      body: {
        message: 'Campaign is already archived',
        campaign: {
          ...campaign,
          isArchived: true,
        },
      },
    }
  }

  const [updatedCampaign, endedSessions] = await Promise.all([
    prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        description: applyArchivedMarker(campaign.description),
      },
      select: {
        id: true,
        name: true,
        description: true,
        currentDmId: true,
        updatedAt: true,
      },
    }),
    prisma.session.updateMany({
      where: {
        campaignId: campaign.id,
        state: { not: 'ENDED' },
      },
      data: {
        state: 'ENDED',
        endedAt: new Date(),
      },
    }),
  ])

  return {
    status: 200,
    body: {
      message: 'Campaign archived successfully',
      campaign: {
        ...updatedCampaign,
        isArchived: true,
      },
      endedSessionsCount: endedSessions.count,
    },
    audit: {
      action: 'CAMPAIGN_ARCHIVE',
      targetType: 'CAMPAIGN',
      targetId: campaign.id,
      reason: params.reason,
      metadata: {
        campaignName: campaign.name,
        endedSessionsCount: endedSessions.count,
      },
    },
  }
}

export async function restoreAdminCampaign(params: {
  actor: AdminAuthToken
  campaignId: string
  reason?: string
}): Promise<{
  status: number
  body: Record<string, unknown>
  audit?: {
    action: 'CAMPAIGN_RESTORE'
    targetType: 'CAMPAIGN'
    targetId: string
    reason?: string
    metadata: Record<string, unknown>
  }
}> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: {
      id: true,
      name: true,
      description: true,
      currentDmId: true,
    },
  })

  if (!campaign) {
    return {
      status: 404,
      body: { error: 'Campaign not found', code: 'NOT_FOUND' },
    }
  }

  if (!canManageCampaign(params.actor, campaign.currentDmId)) {
    return {
      status: 403,
      body: { error: 'Insufficient permissions', code: 'FORBIDDEN' },
    }
  }

  if (!isCampaignArchived(campaign.description)) {
    return {
      status: 200,
      body: {
        message: 'Campaign is not archived',
        campaign: {
          ...campaign,
          isArchived: false,
        },
      },
    }
  }

  const updatedCampaign = await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      description: removeArchivedMarker(campaign.description),
    },
    select: {
      id: true,
      name: true,
      description: true,
      currentDmId: true,
      updatedAt: true,
    },
  })

  return {
    status: 200,
    body: {
      message: 'Campaign restored successfully',
      campaign: {
        ...updatedCampaign,
        isArchived: false,
      },
    },
    audit: {
      action: 'CAMPAIGN_RESTORE',
      targetType: 'CAMPAIGN',
      targetId: campaign.id,
      reason: params.reason,
      metadata: {
        campaignName: campaign.name,
      },
    },
  }
}
