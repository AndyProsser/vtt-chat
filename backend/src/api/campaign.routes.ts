import { Router, Request, Response, NextFunction } from 'express'
import { getPrismaClient } from '@/infra/db'
import { ErrorCode, isValidSessionName, isValidUUID } from '@shared'
import type { UUID } from '@shared'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { createSession } from '@/services/session.service'
import { listSessionsByCampaign } from '@/repositories/session.repository'
import {
  createCampaignForUser,
  createCharacterForCampaign,
  getCampaignForUser,
  isUserInCampaign,
  joinCampaignForUser,
  listCampaignsForUser,
} from '@/repositories/campaign.repository'
import {
  browseSpectatorCampaignsForUser,
  getSpectatorWaitlistStatus,
  validatePlayerInviteCode,
  validateSpectatorInviteCode,
} from '@/services/guest-auth.service'
import {
  listCampaignExternalLinks,
  upsertCampaignExternalLink,
} from '@/services/campaign-external-links.service'

const router = Router()
const prisma = getPrismaClient()

function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractTokenFromHeader(req.headers.authorization)
  if (!token) {
    return res
      .status(401)
      .json({ code: ErrorCode.UNAUTHORIZED, message: 'Missing Authorization header' })
  }

  const user = verifyToken(token)
  if (!user) {
    return res
      .status(401)
      .json({ code: ErrorCode.UNAUTHORIZED, message: 'Authentication required' })
  }

  ;(req as any).user = user
  next()
}

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const campaigns = await listCampaignsForUser(user.userId as UUID)
  res.status(200).json({ campaigns })
})

router.get('/invite/:code/validate', async (req: Request, res: Response) => {
  const code = String(req.params.code || '').trim()

  if (!code) {
    return res.status(400).json({
      valid: false,
      reason: 'INVITE_EXPIRED',
    })
  }

  const result = await validatePlayerInviteCode(code)
  return res.status(result.valid ? 200 : 404).json(result)
})

router.get('/watch/:code/validate', async (req: Request, res: Response) => {
  const code = String(req.params.code || '').trim()

  if (!code) {
    return res.status(400).json({
      valid: false,
      reason: 'INVITE_EXPIRED',
    })
  }

  const result = await validateSpectatorInviteCode(code)
  return res.status(result.valid ? 200 : 404).json(result)
})

router.get('/browse', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user

  try {
    const campaigns = await browseSpectatorCampaignsForUser({
      userId: user.userId as UUID,
    })
    return res.status(200).json({ campaigns })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found' })
      }
      if (error.message === 'FULL_ACCOUNT_REQUIRED') {
        return res.status(403).json({
          code: 'FULL_ACCOUNT_REQUIRED',
          message: 'Only full accounts may browse spectator campaigns',
        })
      }
    }

    return res.status(500).json({
      code: 'CAMPAIGN_BROWSE_FAILED',
      message: 'Failed to browse campaigns',
    })
  }
})

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { name, description } = req.body || {}

  if (user.authType && user.authType !== 'FULL') {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message: 'Only full-account users can create campaigns',
    })
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Campaign name is required', field: 'name' })
  }

  const campaign = await createCampaignForUser({
    name: name.trim(),
    description: typeof description === 'string' ? description.trim() : undefined,
    currentDmId: user.userId as UUID,
  })

  return res.status(201).json({ campaign })
})

router.get('/:campaignId/settings', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  const membership = await prisma.campaignMembership.findUnique({
    where: {
      campaignId_userId: {
        campaignId: campaignId as UUID,
        userId: user.userId as UUID,
      },
    },
    include: {
      campaign: true,
    },
  })

  if (!membership) {
    return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
  }

  if (membership.campaign.currentDmId !== (user.userId as UUID)) {
    return res
      .status(403)
      .json({ code: ErrorCode.FORBIDDEN, message: 'Only campaign DM can manage campaign settings' })
  }

  return res.status(200).json({
    campaign: {
      id: membership.campaign.id,
      name: membership.campaign.name,
      description: membership.campaign.description,
      inviteCode: membership.campaign.inviteCode,
      inviteActive: membership.campaign.inviteActive,
      spectatorInviteCode: membership.campaign.spectatorInviteCode,
      spectatorInviteActive: membership.campaign.spectatorInviteActive,
    },
  })
})

router.patch('/:campaignId/settings', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params
  const { name, description } = req.body || {}

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Campaign name is required', field: 'name' })
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId as UUID } })
  if (!campaign) {
    return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
  }

  if (campaign.currentDmId !== (user.userId as UUID)) {
    return res
      .status(403)
      .json({ code: ErrorCode.FORBIDDEN, message: 'Only campaign DM can manage campaign settings' })
  }

  const updated = await prisma.campaign.update({
    where: { id: campaignId as UUID },
    data: {
      name: name.trim(),
      description:
        typeof description === 'string' && description.trim().length > 0
          ? description.trim()
          : null,
    },
    select: {
      id: true,
      name: true,
      description: true,
      inviteCode: true,
      inviteActive: true,
      spectatorInviteCode: true,
      spectatorInviteActive: true,
    },
  })

  return res.status(200).json({ campaign: updated })
})

router.post('/:campaignId/invites/reissue', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params
  const inviteType = String(req.body?.type || '').toUpperCase()

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  if (!['PLAYER', 'SPECTATOR'].includes(inviteType)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'type must be PLAYER or SPECTATOR',
      field: 'type',
    })
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId as UUID } })
  if (!campaign) {
    return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
  }

  if (campaign.currentDmId !== (user.userId as UUID)) {
    return res
      .status(403)
      .json({ code: ErrorCode.FORBIDDEN, message: 'Only campaign DM can reissue invites' })
  }

  if (inviteType === 'PLAYER') {
    const updated = await prisma.campaign.update({
      where: { id: campaignId as UUID },
      data: {
        inviteCode: generateInviteCode(),
        inviteActive: true,
      },
      select: {
        id: true,
        inviteCode: true,
        inviteActive: true,
      },
    })

    return res.status(200).json({
      invite: {
        type: 'PLAYER',
        code: updated.inviteCode,
        active: updated.inviteActive,
      },
    })
  }

  const updated = await prisma.campaign.update({
    where: { id: campaignId as UUID },
    data: {
      spectatorInviteCode: generateInviteCode(),
      spectatorInviteActive: true,
    },
    select: {
      id: true,
      spectatorInviteCode: true,
      spectatorInviteActive: true,
    },
  })

  return res.status(200).json({
    invite: {
      type: 'SPECTATOR',
      code: updated.spectatorInviteCode,
      active: updated.spectatorInviteActive,
    },
  })
})

router.post('/:campaignId/dm/handoff', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params
  const targetUserId = String(req.body?.targetUserId || '').trim()

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  if (!isValidUUID(targetUserId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid targetUserId',
      field: 'targetUserId',
    })
  }

  if ((user.userId as UUID) === (targetUserId as UUID)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'targetUserId must be a different user',
      field: 'targetUserId',
    })
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId as UUID },
    include: {
      members: {
        select: {
          userId: true,
          role: true,
        },
      },
    },
  })

  if (!campaign) {
    return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
  }

  if (campaign.currentDmId !== (user.userId as UUID)) {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message: 'Only the current campaign DM can transfer ownership',
    })
  }

  const targetMembership = campaign.members.find((member) => member.userId === targetUserId)
  if (!targetMembership || targetMembership.role !== 'PLAYER') {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'targetUserId must belong to an existing player in this campaign',
      field: 'targetUserId',
    })
  }

  await prisma.$transaction(async (tx) => {
    await tx.campaign.update({
      where: { id: campaignId as UUID },
      data: {
        currentDmId: targetUserId as UUID,
      },
    })

    await tx.campaignMembership.update({
      where: {
        campaignId_userId: {
          campaignId: campaignId as UUID,
          userId: user.userId as UUID,
        },
      },
      data: {
        role: 'PLAYER',
      },
    })

    await tx.campaignMembership.update({
      where: {
        campaignId_userId: {
          campaignId: campaignId as UUID,
          userId: targetUserId as UUID,
        },
      },
      data: {
        role: 'DM',
      },
    })

    await tx.user.updateMany({
      where: {
        id: targetUserId as UUID,
      },
      data: {
        role: 'DM',
      },
    })

    await tx.user.updateMany({
      where: {
        id: targetUserId as UUID,
        adminRole: null,
      },
      data: {
        adminRole: 'CAMPAIGN_DM',
      },
    })
  })

  return res.status(200).json({
    campaign: {
      id: campaignId,
      previousDmId: user.userId as UUID,
      currentDmId: targetUserId as UUID,
      transferredAt: new Date().toISOString(),
    },
  })
})

router.get('/:campaignId', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  const campaign = await getCampaignForUser({
    campaignId: campaignId as UUID,
    userId: user.userId as UUID,
  })

  if (!campaign) {
    return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
  }

  return res.status(200).json({ campaign })
})

router.post('/:campaignId/join', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params
  const { inviteCode } = req.body || {}

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  if (!inviteCode || typeof inviteCode !== 'string') {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invite code is required',
      field: 'inviteCode',
    })
  }

  const joined = await joinCampaignForUser({
    campaignId: campaignId as UUID,
    userId: user.userId as UUID,
    inviteCode: inviteCode.trim().toUpperCase(),
    role: user.role === 'SPECTATOR' ? 'SPECTATOR' : 'PLAYER',
  })

  if (!joined) {
    return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Invalid invite code' })
  }

  return res.status(200).json({ ok: true })
})

router.post('/:campaignId/characters', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params
  const {
    name,
    status,
    race,
    class: characterClass,
    subclass,
    avatarUrl,
    metadata,
    isActive,
  } = req.body || {}

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Character name is required', field: 'name' })
  }

  if (
    status !== undefined &&
    !['ALIVE', 'DEAD', 'LEFT', 'UNKNOWN'].includes(String(status).toUpperCase())
  ) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid character status',
      field: 'status',
    })
  }

  const member = await isUserInCampaign({
    campaignId: campaignId as UUID,
    userId: user.userId as UUID,
  })
  if (!member) {
    return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a campaign member' })
  }

  const character = await createCharacterForCampaign({
    campaignId: campaignId as UUID,
    userId: user.userId as UUID,
    name: name.trim(),
    status:
      typeof status === 'string'
        ? (status.trim().toUpperCase() as 'ALIVE' | 'DEAD' | 'LEFT' | 'UNKNOWN')
        : undefined,
    race: typeof race === 'string' ? race.trim() : undefined,
    class: typeof characterClass === 'string' ? characterClass.trim() : undefined,
    subclass: typeof subclass === 'string' ? subclass.trim() : undefined,
    avatarUrl: typeof avatarUrl === 'string' ? avatarUrl.trim() : undefined,
    metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
    isActive: Boolean(isActive),
  })

  return res.status(201).json({ character })
})

router.post('/:campaignId/sessions/start', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params
  const { name, description } = req.body || {}

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  if (!isValidSessionName(name)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid session name', field: 'name' })
  }

  const campaign = await getCampaignForUser({
    campaignId: campaignId as UUID,
    userId: user.userId as UUID,
  })
  if (!campaign) {
    return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
  }

  if (campaign.currentDmId !== (user.userId as UUID) && user.role !== 'DM') {
    return res
      .status(403)
      .json({ code: ErrorCode.FORBIDDEN, message: 'Only DM can start sessions' })
  }

  const session = await createSession(
    name,
    user.userId as UUID,
    typeof description === 'string' ? description : undefined,
    campaignId as UUID
  )

  return res.status(201).json({ session })
})

router.get('/:campaignId/sessions', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  const campaign = await getCampaignForUser({
    campaignId: campaignId as UUID,
    userId: user.userId as UUID,
  })
  if (!campaign) {
    return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
  }

  const sessions = await listSessionsByCampaign(campaignId as UUID)
  return res.status(200).json({ sessions })
})

router.get('/:campaignId/spectator/waitlist-status', async (req: Request, res: Response) => {
  const campaignId = String(req.params.campaignId || '').trim()
  const waitlistToken = String(req.query.waitlistToken || '').trim()

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  if (!waitlistToken) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'waitlistToken is required',
      field: 'waitlistToken',
    })
  }

  const status = await getSpectatorWaitlistStatus({
    campaignId,
    waitlistToken,
  })

  return res.status(status.status === 'NOT_FOUND' ? 404 : 200).json(status)
})

router.get('/:campaignId/external-links', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params

  if (!isValidUUID(campaignId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid campaignId',
      field: 'campaignId',
    })
  }

  try {
    const result = await listCampaignExternalLinks({
      campaignId,
      requesterUserId: user.userId,
    })

    if (!result.ok) {
      if (result.code === 'CAMPAIGN_NOT_FOUND') {
        return res.status(404).json({
          code: ErrorCode.NOT_FOUND,
          message: 'Campaign not found',
        })
      }

      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the campaign DM can view external links',
      })
    }

    return res.status(200).json({ links: result.links })
  } catch {
    return res.status(500).json({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Failed to retrieve external links',
    })
  }
})

router.post('/:campaignId/external-links', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params
  const { externalSystem, externalId } = req.body || {}

  if (!isValidUUID(campaignId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid campaignId',
      field: 'campaignId',
    })
  }

  if (!externalSystem || typeof externalSystem !== 'string') {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'externalSystem is required',
      field: 'externalSystem',
    })
  }

  if (!externalId || typeof externalId !== 'string') {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'externalId is required',
      field: 'externalId',
    })
  }

  try {
    const result = await upsertCampaignExternalLink({
      campaignId,
      externalSystem,
      externalId,
      actor: {
        userId: user.userId,
        username: user.username,
        role: user.role,
        adminRole: user.adminRole,
      },
    })

    if (!result.ok) {
      if (result.code === 'CAMPAIGN_NOT_FOUND') {
        return res.status(404).json({
          code: ErrorCode.NOT_FOUND,
          message: 'Campaign not found',
        })
      }

      if (result.code === 'FORBIDDEN') {
        return res.status(403).json({
          code: ErrorCode.FORBIDDEN,
          message: result.message,
        })
      }

      return res.status(409).json({
        code: result.code,
        message: result.message,
      })
    }

    return res.status(result.status === 'created' ? 201 : 200).json({
      message: result.message,
      link: result.link,
    })
  } catch {
    return res.status(500).json({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Failed to create external link',
    })
  }
})

export default router
