import { formatCampaignSessionDate, normalizeCampaignSessionBaseName, type UUID } from '@shared'
import { getPrismaClient } from '@/infra/db'

const prisma = getPrismaClient()
const MAX_SESSION_NAME_LENGTH = 255

function trimToMaxLength(value: string): string {
  if (value.length <= MAX_SESSION_NAME_LENGTH) {
    return value
  }

  return value.slice(0, MAX_SESSION_NAME_LENGTH)
}

function withSuffix(baseName: string, suffix: string): string {
  const boundedBase = trimToMaxLength(baseName)
  const allowedBaseLength = Math.max(1, MAX_SESSION_NAME_LENGTH - suffix.length)
  const trimmedBase = boundedBase.slice(0, allowedBaseLength).trim()
  return `${trimmedBase || 'Session'}${suffix}`
}

async function campaignSessionNameExists(params: {
  campaignId: UUID
  name: string
  excludeSessionId?: UUID
}): Promise<boolean> {
  const existing = await prisma.session.findFirst({
    where: {
      campaignId: params.campaignId,
      name: params.name,
      ...(params.excludeSessionId
        ? {
            id: {
              not: params.excludeSessionId,
            },
          }
        : {}),
    },
    select: {
      id: true,
    },
  })

  return Boolean(existing)
}

async function countCampaignSessions(params: {
  campaignId: UUID
  excludeSessionId?: UUID
}): Promise<number> {
  return prisma.session.count({
    where: {
      campaignId: params.campaignId,
      ...(params.excludeSessionId
        ? {
            id: {
              not: params.excludeSessionId,
            },
          }
        : {}),
    },
  })
}

/**
 * Returns a unique session name within a campaign.
 * If a conflict exists, appends an ISO date suffix and numeric counter when needed.
 */
export async function ensureUniqueCampaignSessionName(params: {
  campaignId: UUID
  desiredName: string
  excludeSessionId?: UUID
}): Promise<string> {
  const baseName = trimToMaxLength(params.desiredName.trim() || 'Session')

  if (
    !(await campaignSessionNameExists({
      campaignId: params.campaignId,
      name: baseName,
      excludeSessionId: params.excludeSessionId,
    }))
  ) {
    return baseName
  }

  const normalizedBaseName = normalizeCampaignSessionBaseName(baseName)
  const sessionDateSuffix = ` - ${formatCampaignSessionDate()}`
  const existingSessionCount = await countCampaignSessions({
    campaignId: params.campaignId,
    excludeSessionId: params.excludeSessionId,
  })

  for (
    let sessionNumber = Math.max(2, existingSessionCount + 1);
    sessionNumber <= 999;
    sessionNumber += 1
  ) {
    const candidate = withSuffix(normalizedBaseName, ` #${sessionNumber}${sessionDateSuffix}`)
    if (
      !(await campaignSessionNameExists({
        campaignId: params.campaignId,
        name: candidate,
        excludeSessionId: params.excludeSessionId,
      }))
    ) {
      return candidate
    }
  }

  return withSuffix(baseName, ` (${Date.now()})`)
}
