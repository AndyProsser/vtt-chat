/**
 * Chat Command Routes
 * Handles slash commands that require server-side execution.
 * Currently handles /roll (dice rolling). Other commands (/me, /OOC, /dm, /whisper)
 * are translated client-side into standard message types before hitting /api/chat/message.
 *
 * All commands are re-validated server-side for role and session state regardless of
 * what the client claims.
 */

import { Router, Request, Response, NextFunction } from 'express'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { getSession } from '@/services/session/core.service'
import { sendMessage } from '@/services/chat.service'
import { getRoom, getSessionPresence } from '@/services/room.service'
import { resolveRoomAudience } from '@/services/chat-visibility.service'
import { resolveEffectiveSessionRole } from '@/services/session/authz.service'
import { resolveEffectiveActor } from '@/services/dev-mock/takeover.service'
import { rollDice } from '@/utils/dice'
import { isValidUUID } from '@shared'
import { ErrorCode } from '@shared'
import { MessageType, SessionState, Role, InventoryItemSource, InventoryItemCategory } from '@shared'
import type { UUID } from '@shared'
import type { EventEnvelope } from '@shared'
import type { WebSocketManager } from '@/ws'
import type { StoredMessage } from '@/types/chat.types'
import { findSessionById } from '@/repositories/session.repository'
import { listCampaignMembersForPresence } from '@/repositories/campaign.repository'
import { getPrismaClient } from '@/infra/db'
import {
  addInventoryItem,
  adjustCurrency,
  findItemByOwnerAndName,
  partialTransferInventoryItem,
  partialRemoveInventoryItem,
} from '@/services/inventory/inventory.service'
import { parseLootRandomArgs, generateLoot, buildLootSummaryMessage, formatCoins } from '@/services/inventory/loot-random.service'
import crypto from 'node:crypto'

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

function buildMessageSentEvent(
  message: StoredMessage,
  userId: UUID,
  userRole: string
): EventEnvelope {
  return {
    id: crypto.randomUUID() as UUID,
    type: 'CHAT:MESSAGE_SENT',
    version: 1,
    userId,
    userRole: userRole as any,
    sessionId: message.sessionId as UUID,
    roomId: message.roomId || null,
    timestamp: message.createdAt,
    payload: {
      messageId: message.id,
      roomId: message.roomId,
      authorId: message.authorId,
      authorUsername: message.authorUsername,
      content: message.content,
      type: message.type,
      isDmOnly: message.isDmOnly,
      isOffTheRecord: message.isOffTheRecord,
      visibleTo: message.visibleTo,
      targetIds: message.targetIds,
      metadata: message.metadata,
    },
  }
}

/**
 * POST /api/chat/command
 * Execute a slash command that requires server-side processing.
 *
 * Body: { command: 'roll', args: string, sessionId: UUID, roomId: UUID }
 *
 * Currently supports:
 *   - roll: Parses dice notation, rolls server-side, persists as ROLL message.
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { command, args, sessionId, roomId } = req.body

    if (typeof command !== 'string' || !command) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Missing command' })
    }

    if (!isValidUUID(sessionId)) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid sessionId' })
    }

    if (!isValidUUID(roomId)) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid roomId' })
    }

    const session = await getSession(sessionId as UUID)
    if (!session) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Session not found' })
    }

    const effective = await resolveEffectiveActor({
      sessionId: sessionId as UUID,
      actorUserId: user.userId as UUID,
      actorUsername: user.username,
    })

    const authz = await resolveEffectiveSessionRole({
      sessionId: sessionId as UUID,
      userId: effective.userId,
    })
    if (!authz.ok) {
      return res.status(403).json({
        code: authz.code === 'SESSION_NOT_FOUND' ? ErrorCode.NOT_FOUND : ErrorCode.FORBIDDEN,
        message: authz.message,
      })
    }
    const requesterRole = authz.role

    const room = await getRoom(roomId as UUID)
    if (!room || room.sessionId !== (sessionId as UUID)) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Room not found' })
    }

    // Commands require an ACTIVE session
    if (session.state !== SessionState.ACTIVE) {
      return res.status(409).json({
        code: ErrorCode.INVALID_SESSION,
        message: `That action isn't available while the session is ${session.state.toLowerCase()}.`,
      })
    }

    // DM can target any room; players must be in the room they're posting to
    if (requesterRole !== Role.DM) {
      const presence = await getSessionPresence(sessionId as UUID)
      const requesterPresence = presence.find((entry) => entry.userId === effective.userId)
      if (!requesterPresence || requesterPresence.primaryRoomId !== (roomId as UUID)) {
        return res.status(403).json({
          code: ErrorCode.FORBIDDEN,
          message: 'You may only use commands in your current room',
        })
      }
    }

    const normalizedCommand = command.toLowerCase().replace(/^\//, '')

    if (normalizedCommand === 'roll') {
      return handleRollCommand({
        req,
        res,
        args: typeof args === 'string' ? args.trim() : '',
        sessionId: sessionId as UUID,
        roomId: roomId as UUID,
        session,
        effective,
        requesterRole,
      })
    }

    if (normalizedCommand === 'take') {
      return handleTakeCommand({
        req,
        res,
        args: typeof args === 'string' ? args.trim() : '',
        sessionId: sessionId as UUID,
        roomId: roomId as UUID,
        session,
        effective,
        requesterRole,
      })
    }

    if (normalizedCommand === 'give') {
      return handleGiveCommand({
        req,
        res,
        args: typeof args === 'string' ? args.trim() : '',
        sessionId: sessionId as UUID,
        roomId: roomId as UUID,
        session,
        effective,
        requesterRole,
      })
    }

    if (normalizedCommand === 'drop') {
      return handleDropCommand({
        req,
        res,
        args: typeof args === 'string' ? args.trim() : '',
        sessionId: sessionId as UUID,
        roomId: roomId as UUID,
        session,
        effective,
        requesterRole,
      })
    }

    if (normalizedCommand === 'loot') {
      return handleLootCommand({
        req,
        res,
        args: typeof args === 'string' ? args.trim() : '',
        sessionId: sessionId as UUID,
        roomId: roomId as UUID,
        session,
        effective,
        requesterRole,
      })
    }

    if (normalizedCommand === 'loot-random') {
      return handleLootRandomCommand({
        req,
        res,
        args: typeof args === 'string' ? args.trim() : '',
        sessionId: sessionId as UUID,
        roomId: roomId as UUID,
        session,
        effective,
        requesterRole,
      })
    }

    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: `Unknown command /${normalizedCommand}. Type / to see available commands.`,
    })
  } catch {
    return res.status(500).json({ code: ErrorCode.INTERNAL_ERROR, message: 'Internal server error' })
  }
})

interface CommandHandlerParams {
  req: Request
  res: Response
  args: string
  sessionId: UUID
  roomId: UUID
  session: { dmId: UUID; state: string }
  effective: { userId: UUID; username: string }
  requesterRole: string
}

async function handleRollCommand({
  req,
  res,
  args,
  sessionId,
  roomId,
  session,
  effective,
  requesterRole,
}: CommandHandlerParams) {
  // /roll is available to DM and PLAYER only
  if (requesterRole === Role.SPECTATOR) {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message: '/roll is not available to your role.',
    })
  }

  if (!args) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Usage: /roll [dice] — e.g. /roll 1d20+5',
    })
  }

  const result = rollDice(args)
  if (!result) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: `Invalid dice expression "${args}". Usage: /roll [NdX+M] — e.g. /roll 2d6+3`,
    })
  }

  const visibleTo = await resolveRoomAudience({
    sessionId,
    roomId,
    dmId: session.dmId,
  })

  const rollSummary =
    result.rolls.length === 1
      ? `${result.total}`
      : `${result.rolls.join(' + ')}${result.modifier !== 0 ? ` ${result.modifier > 0 ? '+' : ''}${result.modifier}` : ''} = ${result.total}`

  const content = `🎲 ${effective.username} rolled ${result.expression}: ${rollSummary}`

  const stored = await sendMessage({
    sessionId,
    roomId,
    authorId: effective.userId,
    authorUsername: effective.username,
    actorRole: requesterRole,
    dmId: session.dmId,
    content,
    type: MessageType.ROLL,
    visibleTo,
    metadata: {
      rollResult: {
        kind: 'ROLL_RESULT',
        expression: result.expression,
        rolls: result.rolls,
        keptIndex: result.keptIndex,
        modifier: result.modifier,
        total: result.total,
        advantage: result.advantage,
      },
    },
  })

  const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
  if (wsManager) {
    const event = buildMessageSentEvent(stored, effective.userId, requesterRole)
    wsManager.broadcastEventToSession(sessionId, event, stored.visibleTo)
  }

  return res.status(201).json({ message: stored })
}

const prisma = getPrismaClient()

/** Fetch allowPlayerGive/Take/Loot flags for a campaign. Returns nulls if campaign not found. */
async function getCampaignInventoryPolicy(campaignId: UUID) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { allowPlayerGive: true, allowPlayerTake: true, allowPlayerLoot: true },
  })
  return {
    allowPlayerGive: campaign?.allowPlayerGive ?? true,
    allowPlayerTake: campaign?.allowPlayerTake ?? true,
    allowPlayerLoot: campaign?.allowPlayerLoot ?? false,
  }
}

/**
 * Parse "[item name] [qty?]" — last token is qty if it's a positive integer ≤ 9999.
 * Returns { itemName, qty } or { error } if args is empty.
 */
function parseItemArgs(args: string): { itemName: string; qty: number } | { error: string } {
  if (!args.trim()) return { error: 'Item name is required.' }
  const tokens = args.trim().split(/\s+/)
  let qty = 1
  let nameTokens = tokens
  const last = tokens[tokens.length - 1]
  if (tokens.length > 1 && /^\d+$/.test(last)) {
    const n = parseInt(last, 10)
    if (n >= 1 && n <= 9999) {
      qty = n
      nameTokens = tokens.slice(0, -1)
    }
  }
  const itemName = nameTokens.join(' ').trim()
  if (!itemName) return { error: 'Item name is required.' }
  return { itemName, qty }
}

/**
 * /take [item name] [qty?]
 * Player-only (or DM if allowPlayerLoot bypasses, but normally this is for players).
 * Takes qty of a named item from party inventory into the caller's character inventory.
 * Gated by campaign.allowPlayerTake.
 */
async function handleTakeCommand({
  req,
  res,
  args,
  sessionId,
  roomId,
  session,
  effective,
  requesterRole,
}: CommandHandlerParams) {
  if (requesterRole === Role.SPECTATOR) {
    return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: '/take is not available to spectators.' })
  }

  const parsed = parseItemArgs(args)
  if ('error' in parsed) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: `Usage: /take [item name] [qty?] — ${parsed.error}`,
    })
  }

  const rawSession = await findSessionById(sessionId)
  if (!rawSession?.campaignId) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: '/take requires a campaign-linked session.' })
  }
  const campaignId = rawSession.campaignId as UUID

  if (requesterRole === Role.PLAYER) {
    const policy = await getCampaignInventoryPolicy(campaignId)
    if (!policy.allowPlayerTake) {
      return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'The DM has disabled /take for players in this campaign.' })
    }
  }

  const item = await findItemByOwnerAndName({
    campaignId,
    ownerType: 'party',
    ownerId: null,
    name: parsed.itemName,
  })
  if (!item) {
    return res.status(404).json({
      code: ErrorCode.NOT_FOUND,
      message: `No "${parsed.itemName}" found in party inventory.`,
    })
  }
  if (parsed.qty > item.quantity) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: `Party only has ${item.quantity}× ${item.name}.`,
    })
  }

  const transferred = await partialTransferInventoryItem({
    item,
    qty: parsed.qty,
    campaignId,
    toOwnerType: 'character',
    toOwnerId: effective.userId,
    actorUserId: effective.userId,
    sessionId,
  })

  const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
  if (wsManager) {
    const event: EventEnvelope = {
      id: crypto.randomUUID() as UUID,
      type: 'INVENTORY:ITEM_TRANSFERRED',
      version: 1,
      userId: effective.userId,
      userRole: requesterRole as any,
      sessionId,
      roomId: null,
      timestamp: transferred.updatedAt,
      payload: {
        campaignId,
        itemId: transferred.id,
        name: transferred.name,
        quantity: parsed.qty,
        fromOwnerType: 'party',
        fromOwnerId: null,
        toOwnerType: 'character',
        toOwnerId: effective.userId,
        transferredByUserId: effective.userId,
        transferredAt: transferred.updatedAt,
      },
    }
    await wsManager.broadcastToCampaignMembers(campaignId, event)
  }

  const visibleTo = await resolveRoomAudience({ sessionId, roomId, dmId: session.dmId })
  const qtyLabel = parsed.qty > 1 ? ` ×${parsed.qty}` : ''
  const content = `[Inventory] ${effective.username} took ${item.name}${qtyLabel} from party inventory.`
  const chatMessage = await sendMessage({
    sessionId, roomId, authorId: effective.userId, authorUsername: effective.username,
    actorRole: requesterRole, dmId: session.dmId, content, type: MessageType.SYSTEM, visibleTo,
  })
  if (wsManager) {
    wsManager.broadcastEventToSession(sessionId, buildMessageSentEvent(chatMessage, effective.userId, requesterRole), chatMessage.visibleTo)
  }

  return res.status(201).json({ item: transferred, message: chatMessage })
}

/**
 * /give @{party|player} [item name] [qty?]
 * DM or PLAYER (player needs allowPlayerGive). Transfers an item from caller's inventory
 * (or party if DM) to the specified target.
 */
async function handleGiveCommand({
  req,
  res,
  args,
  sessionId,
  roomId,
  session,
  effective,
  requesterRole,
}: CommandHandlerParams) {
  if (requesterRole === Role.SPECTATOR) {
    return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: '/give is not available to spectators.' })
  }

  // Split @target from the rest
  const atMatch = args.match(/^(@\S+)\s+(.+)$/)
  if (!atMatch) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Usage: /give @{party|player} [item name] [qty?] — e.g. /give @party Torch 3',
    })
  }
  const targetHandle = atMatch[1].toLowerCase()
  const itemArgs = atMatch[2].trim()

  const parsed = parseItemArgs(itemArgs)
  if ('error' in parsed) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: `Usage: /give @target [item name] [qty?] — ${parsed.error}` })
  }

  const rawSession = await findSessionById(sessionId)
  if (!rawSession?.campaignId) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: '/give requires a campaign-linked session.' })
  }
  const campaignId = rawSession.campaignId as UUID

  if (requesterRole === Role.PLAYER) {
    const policy = await getCampaignInventoryPolicy(campaignId)
    if (!policy.allowPlayerGive) {
      return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'The DM has disabled /give for players in this campaign.' })
    }
  }

  // Resolve target owner
  let toOwnerType: 'party' | 'character'
  let toOwnerId: UUID | null

  if (targetHandle === '@party') {
    toOwnerType = 'party'
    toOwnerId = null
  } else {
    // Resolve @username to userId via campaign members
    const members = await listCampaignMembersForPresence(campaignId)
    const username = targetHandle.replace(/^@/, '')
    const member = members.find(
      (m) =>
        m.role === 'PLAYER' &&
        (m.username.toLowerCase() === username || m.playerName.toLowerCase() === username)
    )
    if (!member) {
      return res.status(404).json({
        code: ErrorCode.NOT_FOUND,
        message: `No player "${username}" found in this campaign. Use @party or a player's name.`,
      })
    }
    toOwnerType = 'character'
    toOwnerId = member.userId as UUID
  }

  // Players give from their own character inventory
  const fromOwnerType: 'party' | 'character' = requesterRole === Role.PLAYER ? 'character' : 'party'
  const fromOwnerId: UUID | null = requesterRole === Role.PLAYER ? effective.userId : null

  const item = await findItemByOwnerAndName({
    campaignId,
    ownerType: fromOwnerType,
    ownerId: fromOwnerId,
    name: parsed.itemName,
  })
  if (!item) {
    const sourceLabel = fromOwnerType === 'party' ? 'party inventory' : 'your inventory'
    return res.status(404).json({
      code: ErrorCode.NOT_FOUND,
      message: `No "${parsed.itemName}" found in ${sourceLabel}.`,
    })
  }
  if (parsed.qty > item.quantity) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: `You only have ${item.quantity}× ${item.name}.`,
    })
  }

  const transferred = await partialTransferInventoryItem({
    item,
    qty: parsed.qty,
    campaignId,
    toOwnerType,
    toOwnerId,
    actorUserId: effective.userId,
    sessionId,
  })

  const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
  if (wsManager) {
    const event: EventEnvelope = {
      id: crypto.randomUUID() as UUID,
      type: 'INVENTORY:ITEM_TRANSFERRED',
      version: 1,
      userId: effective.userId,
      userRole: requesterRole as any,
      sessionId,
      roomId: null,
      timestamp: transferred.updatedAt,
      payload: {
        campaignId,
        itemId: transferred.id,
        name: transferred.name,
        quantity: parsed.qty,
        fromOwnerType,
        fromOwnerId,
        toOwnerType,
        toOwnerId,
        transferredByUserId: effective.userId,
        transferredAt: transferred.updatedAt,
      },
    }
    await wsManager.broadcastToCampaignMembers(campaignId, event)
  }

  const visibleTo = await resolveRoomAudience({ sessionId, roomId, dmId: session.dmId })
  const qtyLabel = parsed.qty > 1 ? ` ×${parsed.qty}` : ''
  const destLabel = toOwnerType === 'party' ? 'party inventory' : `${targetHandle}'s inventory`
  const content = `[Inventory] ${effective.username} gave ${item.name}${qtyLabel} to ${destLabel}.`
  const chatMessage = await sendMessage({
    sessionId, roomId, authorId: effective.userId, authorUsername: effective.username,
    actorRole: requesterRole, dmId: session.dmId, content, type: MessageType.SYSTEM, visibleTo,
  })
  if (wsManager) {
    wsManager.broadcastEventToSession(sessionId, buildMessageSentEvent(chatMessage, effective.userId, requesterRole), chatMessage.visibleTo)
  }

  return res.status(201).json({ item: transferred, message: chatMessage })
}

/**
 * /drop [item name] [qty?]
 * DM or PLAYER. Removes an item from the caller's own inventory (character for players,
 * party for DM). DM can also pass --party or --character flags; for simplicity the
 * initial implementation assumes: players drop from their character, DM drops from party.
 */
async function handleDropCommand({
  req,
  res,
  args,
  sessionId,
  roomId,
  session,
  effective,
  requesterRole,
}: CommandHandlerParams) {
  if (requesterRole === Role.SPECTATOR) {
    return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: '/drop is not available to spectators.' })
  }

  const parsed = parseItemArgs(args)
  if ('error' in parsed) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: `Usage: /drop [item name] [qty?] — ${parsed.error}`,
    })
  }

  const rawSession = await findSessionById(sessionId)
  if (!rawSession?.campaignId) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: '/drop requires a campaign-linked session.' })
  }
  const campaignId = rawSession.campaignId as UUID

  const ownerType: 'party' | 'character' = requesterRole === Role.PLAYER ? 'character' : 'party'
  const ownerId: UUID | null = requesterRole === Role.PLAYER ? effective.userId : null

  const item = await findItemByOwnerAndName({ campaignId, ownerType, ownerId, name: parsed.itemName })
  if (!item) {
    const label = ownerType === 'party' ? 'party inventory' : 'your inventory'
    return res.status(404).json({
      code: ErrorCode.NOT_FOUND,
      message: `No "${parsed.itemName}" found in ${label}.`,
    })
  }
  if (parsed.qty > item.quantity) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: `You only have ${item.quantity}× ${item.name}.`,
    })
  }

  const removed = await partialRemoveInventoryItem({
    item,
    qty: parsed.qty,
    campaignId,
    actorUserId: effective.userId,
    sessionId,
  })

  const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
  if (wsManager) {
    const event: EventEnvelope = {
      id: crypto.randomUUID() as UUID,
      type: 'INVENTORY:ITEM_REMOVED',
      version: 1,
      userId: effective.userId,
      userRole: requesterRole as any,
      sessionId,
      roomId: null,
      timestamp: Date.now(),
      payload: {
        campaignId,
        itemId: item.id,
        ownerType,
        ownerId,
        name: item.name,
        quantity: parsed.qty,
        removedByUserId: effective.userId,
        removedAt: Date.now(),
      },
    }
    await wsManager.broadcastToCampaignMembers(campaignId, event)
  }

  const visibleTo = await resolveRoomAudience({ sessionId, roomId, dmId: session.dmId })
  const qtyLabel = parsed.qty > 1 ? ` ×${parsed.qty}` : ''
  const content = `[Inventory] ${effective.username} dropped ${item.name}${qtyLabel}.`
  const chatMessage = await sendMessage({
    sessionId, roomId, authorId: effective.userId, authorUsername: effective.username,
    actorRole: requesterRole, dmId: session.dmId, content, type: MessageType.SYSTEM, visibleTo,
  })
  if (wsManager) {
    wsManager.broadcastEventToSession(sessionId, buildMessageSentEvent(chatMessage, effective.userId, requesterRole), chatMessage.visibleTo)
  }

  return res.status(200).json({ item: removed, message: chatMessage })
}

/**
 * /loot [item name] [qty?]
 * DM-only. Adds a named item to the party inventory. The last token is treated
 * as quantity if it is a whole positive number; everything else is the item name.
 * Produces INVENTORY:ITEM_ADDED WS event + system chat message.
 */
async function handleLootCommand({
  req,
  res,
  args,
  sessionId,
  roomId,
  session,
  effective,
  requesterRole,
}: CommandHandlerParams) {
  const rawSession = await findSessionById(sessionId)

  if (requesterRole !== Role.DM) {
    if (rawSession?.campaignId) {
      const policy = await getCampaignInventoryPolicy(rawSession.campaignId as UUID)
      if (!policy.allowPlayerLoot) {
        return res.status(403).json({
          code: ErrorCode.FORBIDDEN,
          message: '/loot is restricted to the DM in this campaign.',
        })
      }
    } else {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: '/loot is only available to the DM.',
      })
    }
  }

  if (!args) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Usage: /loot [item name] [qty?] — e.g. /loot Potion of Healing 2',
    })
  }

  // Split off trailing integer token as quantity if present
  const tokens = args.trim().split(/\s+/)
  let quantity = 1
  let nameTokens = tokens
  const lastToken = tokens[tokens.length - 1]
  if (tokens.length > 1 && /^\d+$/.test(lastToken)) {
    const parsed = parseInt(lastToken, 10)
    if (parsed >= 1 && parsed <= 9999) {
      quantity = parsed
      nameTokens = tokens.slice(0, -1)
    }
  }
  const itemName = nameTokens.join(' ').trim()
  if (!itemName) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Usage: /loot [item name] [qty?] — item name is required.',
    })
  }
  if (!rawSession?.campaignId) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: '/loot requires a campaign-linked session.' })
  }
  const campaignId = rawSession.campaignId as UUID

  const item = await addInventoryItem({
    campaignId,
    ownerType: 'party',
    ownerId: null,
    name: itemName,
    quantity,
    source: InventoryItemSource.CUSTOM,
    srdCategory: InventoryItemCategory.EQUIPMENT,
    addedByUserId: effective.userId,
    sessionId,
  })

  const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
  if (wsManager) {
    const event: EventEnvelope = {
      id: crypto.randomUUID() as UUID,
      type: 'INVENTORY:ITEM_ADDED',
      version: 1,
      userId: effective.userId,
      userRole: requesterRole as any,
      sessionId,
      roomId: null,
      timestamp: item.createdAt,
      payload: {
        campaignId: item.campaignId,
        itemId: item.id,
        ownerType: item.ownerType,
        ownerId: item.ownerId,
        name: item.name,
        quantity: item.quantity,
        source: item.source,
        srdKey: item.srdKey,
        srdCategory: item.srdCategory,
        notes: item.notes,
        addedByUserId: item.addedByUserId,
        addedAt: item.createdAt,
      },
    }
    await wsManager.broadcastToCampaignMembers(campaignId, event)
  }

  const visibleTo = await resolveRoomAudience({ sessionId, roomId, dmId: session.dmId })
  const content = `[Loot] ${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ''} added to party inventory.`
  const chatMessage = await sendMessage({
    sessionId,
    roomId,
    authorId: effective.userId,
    authorUsername: effective.username,
    actorRole: requesterRole,
    dmId: session.dmId,
    content,
    type: MessageType.SYSTEM,
    visibleTo,
  })

  if (wsManager) {
    const msgEvent = buildMessageSentEvent(chatMessage, effective.userId, requesterRole)
    wsManager.broadcastEventToSession(sessionId, msgEvent, chatMessage.visibleTo)
  }

  return res.status(201).json({ item, message: chatMessage })
}

/**
 * /loot-random [CR] [Rarity?] [hoard?]
 * DM-only. Generates coins (DMG tables) and items (SRD) based on CR, connected
 * player count, and average character level. Adds everything to the party inventory
 * and broadcasts the INVENTORY events + a system chat message.
 */
async function handleLootRandomCommand({
  req,
  res,
  args,
  sessionId,
  roomId,
  session,
  effective,
  requesterRole,
}: CommandHandlerParams) {
  if (requesterRole !== Role.DM) {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message: '/loot-random is only available to the DM.',
    })
  }

  const parsed = parseLootRandomArgs(args)
  if ('message' in parsed) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: parsed.message })
  }

  // Get campaignId — getSession() strips it, so we hit the repo directly
  const rawSession = await findSessionById(sessionId)
  if (!rawSession?.campaignId) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: '/loot-random requires a campaign-linked session.',
    })
  }
  const campaignId = rawSession.campaignId as UUID

  // Resolve connected players and their average character level
  const presenceEntries = await getSessionPresence(sessionId)
  const connectedUserIds = new Set(presenceEntries.map((p) => p.userId))

  const members = await listCampaignMembersForPresence(campaignId)
  const connectedPlayers = members.filter(
    (m) => m.role === 'PLAYER' && connectedUserIds.has(m.userId as UUID)
  )

  const playerCount = Math.max(1, connectedPlayers.length)
  const levels = connectedPlayers.filter((m) => m.level != null).map((m) => m.level!)
  const avgLevel =
    levels.length > 0
      ? Math.ceil(levels.reduce((a, b) => a + b, 0) / levels.length)
      : parsed.cr // fallback: treat avg level = CR (fair fight)

  const loot = generateLoot({
    cr: parsed.cr,
    maxRarity: parsed.maxRarity,
    hoard: parsed.hoard,
    playerCount,
    avgLevel,
  })

  const wsManager: WebSocketManager | undefined = req.app.locals.wsManager

  // Persist + broadcast each item
  const addedItems = await Promise.all(
    loot.items.map((item) =>
      addInventoryItem({
        campaignId,
        ownerType: 'party',
        ownerId: null,
        name: item.name,
        quantity: 1,
        source: InventoryItemSource.SRD,
        srdKey: item.srdKey,
        srdCategory:
          item.rarity === 'mundane' ? InventoryItemCategory.EQUIPMENT : InventoryItemCategory.MAGIC_ITEM,
        addedByUserId: effective.userId,
        sessionId,
      })
    )
  )

  if (wsManager) {
    for (const item of addedItems) {
      const event: EventEnvelope = {
        id: crypto.randomUUID() as UUID,
        type: 'INVENTORY:ITEM_ADDED',
        version: 1,
        userId: effective.userId,
        userRole: requesterRole as any,
        sessionId,
        roomId: null,
        timestamp: item.createdAt,
        payload: {
          campaignId: item.campaignId,
          itemId: item.id,
          ownerType: item.ownerType,
          ownerId: item.ownerId,
          name: item.name,
          quantity: item.quantity,
          source: item.source,
          srdKey: item.srdKey,
          srdCategory: item.srdCategory,
          notes: item.notes,
          addedByUserId: item.addedByUserId,
          addedAt: item.createdAt,
        },
      }
      await wsManager.broadcastToCampaignMembers(campaignId, event)
    }
  }

  // Persist + broadcast coins (only if any)
  const hasCoin = loot.cp > 0 || loot.sp > 0 || loot.ep > 0 || loot.gp > 0 || loot.pp > 0
  if (hasCoin) {
    const delta = { cp: loot.cp, sp: loot.sp, ep: loot.ep, gp: loot.gp, pp: loot.pp }
    const updatedWallet = await adjustCurrency({
      campaignId,
      ownerType: 'party',
      ownerId: null,
      delta,
      actorUserId: effective.userId,
      sessionId,
    })

    if (wsManager) {
      const coinEvent: EventEnvelope = {
        id: crypto.randomUUID() as UUID,
        type: 'INVENTORY:CURRENCY_CHANGED',
        version: 1,
        userId: effective.userId,
        userRole: requesterRole as any,
        sessionId,
        roomId: null,
        timestamp: updatedWallet.updatedAt,
        payload: {
          campaignId: updatedWallet.campaignId,
          walletId: updatedWallet.id,
          ownerType: updatedWallet.ownerType,
          ownerId: updatedWallet.ownerId,
          delta,
          newBalance: {
            cp: updatedWallet.cp,
            sp: updatedWallet.sp,
            ep: updatedWallet.ep,
            gp: updatedWallet.gp,
            pp: updatedWallet.pp,
          },
          changedByUserId: effective.userId,
          changedAt: updatedWallet.updatedAt,
        },
      }
      await wsManager.broadcastToCampaignMembers(campaignId, coinEvent)
    }
  }

  // Single system chat message summarising everything
  const content = buildLootSummaryMessage(parsed.cr, loot)
  const visibleTo = await resolveRoomAudience({ sessionId, roomId, dmId: session.dmId })
  const chatMessage = await sendMessage({
    sessionId,
    roomId,
    authorId: effective.userId,
    authorUsername: effective.username,
    actorRole: requesterRole,
    dmId: session.dmId,
    content,
    type: MessageType.SYSTEM,
    visibleTo,
  })

  if (wsManager) {
    const msgEvent = buildMessageSentEvent(chatMessage, effective.userId, requesterRole)
    wsManager.broadcastEventToSession(sessionId, msgEvent, chatMessage.visibleTo)
  }

  return res.status(201).json({
    items: addedItems,
    coins: { cp: loot.cp, sp: loot.sp, ep: loot.ep, gp: loot.gp, pp: loot.pp },
    coinSummary: formatCoins(loot.cp, loot.sp, loot.ep, loot.gp, loot.pp),
    playerCount,
    avgLevel,
    message: chatMessage,
  })
}

export default router
