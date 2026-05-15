import { getPrismaClient } from '@/infra/db'
import type {
  AdminCampaignRepositoryRow,
  AdminCampaignsListRequest,
} from '@/types/admin-campaigns.types'
import type { Prisma } from '@prisma/client'

const prisma = getPrismaClient()

function buildCampaignsWhere(params: {
  search: string
  statusFilter: AdminCampaignsListRequest['statusFilter']
}): Prisma.CampaignWhereInput | undefined {
  const andClauses: Prisma.CampaignWhereInput[] = []

  if (params.search) {
    andClauses.push({
      OR: [
        { name: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
        { inviteCode: { contains: params.search, mode: 'insensitive' } },
        { currentDm: { username: { contains: params.search, mode: 'insensitive' } } },
      ],
    })
  }

  if (params.statusFilter === 'active') {
    andClauses.push({ sessions: { some: { state: 'ACTIVE' } } })
  } else if (params.statusFilter === 'idle') {
    andClauses.push({ sessions: { some: { state: { in: ['IDLE', 'PAUSED'] } } } })
  } else if (params.statusFilter === 'ended') {
    andClauses.push({ sessions: { some: { state: 'ENDED' } } })
  } else if (params.statusFilter === 'no_session') {
    andClauses.push({ sessions: { none: {} } })
  }

  return andClauses.length > 0 ? { AND: andClauses } : undefined
}

export async function listAdminCampaigns(params: AdminCampaignsListRequest): Promise<{
  total: number
  campaigns: AdminCampaignRepositoryRow[]
}> {
  const where = buildCampaignsWhere({
    search: params.search,
    statusFilter: params.statusFilter,
  })

  const [total, campaigns] = await Promise.all([
    prisma.campaign.count({ where }),
    prisma.campaign.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: {
        id: true,
        name: true,
        description: true,
        inviteCode: true,
        currentDmId: true,
        createdAt: true,
        updatedAt: true,
        currentDm: {
          select: {
            id: true,
            username: true,
          },
        },
        _count: {
          select: {
            members: true,
            sessions: true,
          },
        },
        sessions: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            name: true,
            state: true,
            createdAt: true,
            startedAt: true,
            endedAt: true,
            updatedAt: true,
            _count: {
              select: {
                rooms: true,
                members: true,
              },
            },
          },
        },
      },
    }),
  ])

  return {
    total,
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      inviteCode: campaign.inviteCode,
      currentDmId: campaign.currentDmId,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
      currentDm: campaign.currentDm,
      _count: campaign._count,
      sessions: campaign.sessions,
    })),
  }
}
