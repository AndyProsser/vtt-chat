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
import { addInventoryItem, adjustCurrency } from '@/services/inventory/inventory.service'
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
