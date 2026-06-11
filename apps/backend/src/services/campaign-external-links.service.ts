import { getPrismaClient } from '@/infra/db'

const prisma = getPrismaClient()

type CampaignExternalLinkSummary = {
  id: string
  externalSystem: string
  externalId: string
  linkedAt: Date
  linkedByUser?: {
    id: string
    username: string
    displayName: string
  }
}

type ListCampaignExternalLinksResult =
  | {
      ok: true
      links: CampaignExternalLinkSummary[]
    }
  | {
      ok: false
      code: 'CAMPAIGN_NOT_FOUND' | 'FORBIDDEN'
    }

type UpsertCampaignExternalLinkResult =
  | {
      ok: true
      status: 'created' | 'updated'
      message: string
      link: CampaignExternalLinkSummary
    }
  | {
      ok: false
      code: 'CAMPAIGN_NOT_FOUND' | 'FORBIDDEN' | 'LINK_ALREADY_EXISTS'
      message: string
    }

export async function listCampaignExternalLinks(params: {
  campaignId: string
  requesterUserId: string
}): Promise<ListCampaignExternalLinksResult> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: { currentDmId: true },
  })

  if (!campaign) {
    return {
      ok: false,
      code: 'CAMPAIGN_NOT_FOUND',
    }
  }

  if (campaign.currentDmId !== params.requesterUserId) {
    return {
      ok: false,
      code: 'FORBIDDEN',
    }
  }

  const links = await prisma.campaignExternalLink.findMany({
    where: { campaignId: params.campaignId },
    select: {
      id: true,
      externalSystem: true,
      externalId: true,
      linkedAt: true,
      linkedByUser: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
    },
    orderBy: { linkedAt: 'desc' },
  })

  return {
    ok: true,
    links,
  }
}

export async function upsertCampaignExternalLink(params: {
  campaignId: string
  externalSystem: string
  externalId: string
  actor: {
    userId: string
    username: string
    role?: string
    adminRole?: string
  }
}): Promise<UpsertCampaignExternalLinkResult> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: { currentDmId: true },
  })

  if (!campaign) {
    return {
      ok: false,
      code: 'CAMPAIGN_NOT_FOUND',
      message: 'Campaign not found',
    }
  }

  if (campaign.currentDmId !== params.actor.userId) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: 'Only the campaign DM can link external systems',
    }
  }

  const existingLink = await prisma.campaignExternalLink.findFirst({
    where: {
      campaignId: params.campaignId,
      externalSystem: params.externalSystem,
    },
  })

  if (existingLink && existingLink.externalId === params.externalId) {
    return {
      ok: false,
      code: 'LINK_ALREADY_EXISTS',
      message: `Campaign is already linked to ${params.externalSystem} campaign ${params.externalId}`,
    }
  }

  if (existingLink && existingLink.externalId !== params.externalId) {
    const updated = await prisma.campaignExternalLink.update({
      where: { id: existingLink.id },
      data: {
        externalId: params.externalId,
        linkedAt: new Date(),
      },
      select: {
        id: true,
        externalSystem: true,
        externalId: true,
        linkedAt: true,
      },
    })

    await prisma.adminAuditLog.create({
      data: {
        actorUserId: params.actor.userId,
        actorName: params.actor.username,
        actorRole: params.actor.role || params.actor.adminRole,
        action: 'campaign_external_link_update',
        targetType: 'CampaignExternalLink',
        targetId: updated.id,
        outcome: 'SUCCESS',
        metadata: {
          externalSystem: params.externalSystem,
          previousExternalId: existingLink.externalId,
          newExternalId: params.externalId,
        },
      },
    })

    return {
      ok: true,
      status: 'updated',
      message: 'External link updated',
      link: updated,
    }
  }

  const link = await prisma.campaignExternalLink.create({
    data: {
      campaignId: params.campaignId,
      externalSystem: params.externalSystem,
      externalId: params.externalId,
      linkedBy: params.actor.userId,
    },
    select: {
      id: true,
      externalSystem: true,
      externalId: true,
      linkedAt: true,
    },
  })

  await prisma.adminAuditLog.create({
    data: {
      actorUserId: params.actor.userId,
      actorName: params.actor.username,
      actorRole: params.actor.role || params.actor.adminRole,
      action: 'campaign_external_link_create',
      targetType: 'CampaignExternalLink',
      targetId: link.id,
      outcome: 'SUCCESS',
      metadata: {
        externalSystem: params.externalSystem,
        externalId: params.externalId,
      },
    },
  })

  return {
    ok: true,
    status: 'created',
    message: 'External link created',
    link,
  }
}
