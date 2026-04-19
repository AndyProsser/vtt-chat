import { Router, Request, Response, NextFunction } from 'express'
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

const router = Router()

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

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { name, description } = req.body || {}

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

export default router
