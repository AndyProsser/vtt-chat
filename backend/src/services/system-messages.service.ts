import { getPlayerPerspectiveJournalRoast, MessageType } from '@shared'
import type { Role } from '@shared'
import type { EventEnvelope, UUID } from '@shared'
import type { SessionBoundaryType } from '@/types/session-boundary.types'
import type { WebSocketManager } from '@/ws'
import { sendMessage } from './chat.service'
import { getPrismaClient } from '@/infra/db'
import { logger } from '@/infra/logging/logger'

/**
 * Prefixes used to identify recap system messages in the chat timeline.
 * Frontend uses these to render the recap card with the right context label.
 */
export const SESSION_RECAP_PREFIX = '[Last Session]'
export const CAMPAIGN_BRIEF_PREFIX = '[Campaign Brief]'

/**
 * Truncates journal content to a readable recap length.
 * Returns the first two sentences, capped at 300 characters.
 */
function truncateJournalContent(content: string): string {
  const trimmed = content.trim()
  // Match first two sentences (end on . ! or ?)
  const twoSentences = trimmed.match(/^.+?[.!?](?:\s+.+?[.!?]|$)?/s)
  const excerpt = twoSentences ? twoSentences[0].trim() : trimmed
  return excerpt.length > 300 ? `${excerpt.slice(0, 297)}…` : excerpt
}

/**
 * Looks up the most recent ENDED session for the same campaign, finds its journal
 * note (tagged `_journal`), and emits a recap SYSTEM message into the new session.
 * Falls back to a sarcastic placeholder when no journal entry is found.
 *
 * Called after SESSION_STARTED boundary emission for campaign-scoped sessions.
 */
export async function emitSessionRecapMessage(params: {
  sessionId: UUID
  mainRoomId: UUID
  dmId: UUID
  dmUsername: string
  wsManager?: WebSocketManager
}): Promise<void> {
  const prisma = getPrismaClient()

  // Step 1: Find current session + campaign context.
  const currentSession = await prisma.session.findUnique({
    where: { id: params.sessionId },
    select: {
      campaignId: true,
      campaign: {
        select: {
          name: true,
          description: true,
        },
      },
    },
  })
  if (!currentSession?.campaignId) return

  // Step 2: Find the most recent ENDED session for the same campaign
  const previousSession = await prisma.session.findFirst({
    where: {
      campaignId: currentSession.campaignId,
      state: { in: ['ENDED', 'CLEANUP'] },
      NOT: { id: params.sessionId },
    },
    orderBy: [{ endedAt: 'desc' }, { startedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, name: true },
  })
  const campaignName = currentSession.campaign?.name?.trim() || 'This campaign'
  const campaignDescription = currentSession.campaign?.description?.trim() || ''

  if (!previousSession) {
    const firstSessionRecapBody = campaignDescription
      ? `${campaignName}: ${truncateJournalContent(campaignDescription)}`
      : `${campaignName}: The DM left the campaign description blank, so we'll call this a bold commitment to improvisation.`

    const content = `${CAMPAIGN_BRIEF_PREFIX} ${firstSessionRecapBody}`

    const stored = await sendMessage({
      sessionId: params.sessionId,
      roomId: params.mainRoomId,
      authorId: params.dmId,
      authorUsername: params.dmUsername,
      dmId: params.dmId,
      content,
      type: MessageType.SYSTEM,
    })

    if (params.wsManager) {
      if (!stored.sessionId) {
        logger.warn('System message stored without sessionId', { messageId: stored.id })
        return
      }
      const event = buildSystemChatEvent(stored)
      params.wsManager.broadcastEventToSession(params.sessionId, event)
    }

    return
  }

  // Step 3: Find the journal note for that session
  const notes = await prisma.note.findMany({
    where: { sessionId: previousSession.id },
    select: { title: true, content: true, tags: true },
    orderBy: { updatedAt: 'desc' },
  })

  const journalNote = notes.find((n) => {
    if (Array.isArray(n.tags) && (n.tags as string[]).includes('_journal')) return true
    if (n.title === 'Session Journal') return true
    return false
  })

  const recapBody = journalNote?.content
    ? truncateJournalContent(journalNote.content)
    : getPlayerPerspectiveJournalRoast(previousSession.id, previousSession.name)

  const content = `${SESSION_RECAP_PREFIX} ${recapBody}`

  const stored = await sendMessage({
    sessionId: params.sessionId,
    roomId: params.mainRoomId,
    authorId: params.dmId,
    authorUsername: params.dmUsername,
    dmId: params.dmId,
    content,
    type: MessageType.SYSTEM,
  })

  if (params.wsManager) {
    if (!stored.sessionId) {
      logger.warn('System message stored without sessionId', { messageId: stored.id })
      return
    }
    const event = buildSystemChatEvent(stored)
    params.wsManager.broadcastEventToSession(params.sessionId, event)
  }
}

const boundaryTemplates: Record<SessionBoundaryType, (sessionName: string) => string> = {
  SESSION_STARTED: (sessionName) => `[Session Started] ${sessionName}`,
  SESSION_PAUSED: (sessionName) => `[Session Paused] ${sessionName}`,
  SESSION_RESUMED: (sessionName) => `[Session Resumed] ${sessionName}`,
  SESSION_COOLDOWN: (sessionName) => `[Session Cooldown] ${sessionName}`,
  SESSION_ENDED: (sessionName) => `[Session Ended] ${sessionName}`,
}

function buildSessionBoundaryMessage(
  boundaryType: SessionBoundaryType,
  sessionName: string
): string {
  return boundaryTemplates[boundaryType](sessionName)
}

function buildSystemChatEvent(message: {
  id: UUID
  sessionId?: UUID
  roomId?: UUID
  authorId: UUID
  authorUsername: string
  content: string
  type: MessageType
  isDmOnly: boolean
  createdAt: number
  metadata?: Record<string, unknown>
}): EventEnvelope {
  return {
    id: crypto.randomUUID() as UUID,
    type: 'CHAT:MESSAGE_SENT',
    version: 1,
    userId: message.authorId,
    userRole: 'DM' as Role,
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
      isOffTheRecord: false,
      metadata: message.metadata,
    },
  }
}

export async function emitSessionBoundarySystemMessage(params: {
  sessionId: UUID
  roomId?: UUID
  roomIds?: UUID[]
  sessionName: string
  boundaryType: SessionBoundaryType
  dmId: UUID
  dmUsername: string
  wsManager?: WebSocketManager
}): Promise<void> {
  const resolvedRoomIds = Array.from(
    new Set((params.roomIds?.length ? params.roomIds : [params.roomId]).filter(Boolean))
  ) as UUID[]

  const roomIds = resolvedRoomIds.length ? resolvedRoomIds : [undefined]

  for (const roomId of roomIds) {
    const stored = await sendMessage({
      sessionId: params.sessionId,
      roomId,
      authorId: params.dmId,
      authorUsername: params.dmUsername,
      dmId: params.dmId,
      content: buildSessionBoundaryMessage(params.boundaryType, params.sessionName),
      type: MessageType.SYSTEM,
    })

    if (params.wsManager) {
      if (!stored.sessionId) {
        logger.warn('System message stored without sessionId', { messageId: stored.id })
        continue
      }
      const event = buildSystemChatEvent(stored)
      params.wsManager.broadcastEventToSession(params.sessionId, event)
    }
  }
}

/**
 * Emits a system message when the DM applies or clears a condition/distance override
 * on a player. Message is posted to the session's MAIN room so all players see it.
 * Best-effort — if the DB lookups fail (e.g. race on session teardown) the error is
 * swallowed so the calling route still succeeds.
 */
export async function emitConditionSystemMessage(params: {
  sessionId: UUID
  targetUserId: UUID
  dmId: UUID
  overrideType: 'CONDITION' | 'DISTANCE'
  presetName: string | null
  isRemoval: boolean
}): Promise<void> {
  const prisma = getPrismaClient()

  try {
    const [targetUser, dmUser, mainRoom] = await Promise.all([
      prisma.user.findUnique({ where: { id: params.targetUserId }, select: { username: true } }),
      prisma.user.findUnique({ where: { id: params.dmId }, select: { username: true } }),
      prisma.room.findFirst({
        where: { sessionId: params.sessionId, type: 'MAIN' },
        select: { id: true },
      }),
    ])

    if (!targetUser || !mainRoom) return

    const playerName = targetUser.username
    const dmUsername = dmUser?.username ?? 'DM'

    let content: string
    if (params.isRemoval) {
      content =
        params.overrideType === 'CONDITION'
          ? `[${playerName}'s condition was cleared]`
          : `[${playerName} has returned to the party]`
    } else {
      content = `[${playerName} is ${params.presetName}]`
    }

    const stored = await sendMessage({
      sessionId: params.sessionId,
      roomId: mainRoom.id as UUID,
      authorId: params.dmId,
      authorUsername: dmUsername,
      dmId: params.dmId,
      content,
      type: MessageType.SYSTEM,
      metadata: {
        conditionMessage: {
          kind: 'CONDITION',
          targetUserId: params.targetUserId,
          presetName: params.isRemoval ? undefined : (params.presetName ?? undefined),
          isRemoval: params.isRemoval,
          overrideType: params.overrideType,
        },
      },
    })

    if (stored.sessionId) {
      const event = buildSystemChatEvent(stored)
      const { default: eventBroadcaster } = await import('@/ws/event-broadcaster')
      eventBroadcaster.broadcastToSession(params.sessionId, event)
    }
  } catch (err) {
    logger.warn('Failed to emit condition system message', { err, ...params })
  }
}

/** Prefix used to identify session summary cards in the chat timeline. */
export const SESSION_SUMMARY_PREFIX = '[Session Summary]'

const SURVIVAL_QUIPS = [
  'The party survived. Historians are baffled.',
  'All PCs accounted for. The dice gods were merciful, or bored.',
  'Nobody died. The DM is taking this personally.',
  'The adventure continues. Against all probability.',
  'Clerics earned their gold piece.',
  'The party lives to roll again. The dungeon is deeply disappointed.',
  'No total-party kills. The tavern breathes a sigh of relief.',
  "They made it. The dungeon's HR department has filed a complaint.",
  'Another session. Another inexplicable series of natural 20s.',
  "Everyone survived. Even the rogue who 'just wanted to check for traps'.",
]

/**
 * Emits a session summary SYSTEM message to the greenroom after a session moves to COOLDOWN.
 * Encodes stats as JSON following the prefix so the frontend can render a summary card.
 *
 * Stats included: session name, startedAt, total duration, cumulativePauseMs, pauseCount,
 * and the total number of unique non-spectator users who joined the session.
 */
export async function emitSessionSummaryMessage(params: {
  session: {
    id: UUID
    name: string
    startedAt?: number
    endedAt?: number
    cumulativePauseMs?: number
    pauseCount?: number
  }
  users: Array<{ id: string; role?: string }>
  greenRoomId: UUID
  dmId: UUID
  dmUsername: string
  wsManager?: WebSocketManager
}): Promise<void> {
  const { session, users, greenRoomId, dmId, dmUsername, wsManager } = params

  const playerCount = users.filter((u) => u.role !== 'SPECTATOR' && u.role !== 'SYSTEM').length

  const quipIndex =
    session.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % SURVIVAL_QUIPS.length

  const stats = {
    sessionName: session.name,
    startedAt: session.startedAt ?? null,
    endedAt: session.endedAt ?? null,
    cumulativePauseMs: session.cumulativePauseMs ?? 0,
    pauseCount: session.pauseCount ?? 0,
    playerCount,
    quip: SURVIVAL_QUIPS[quipIndex],
  }

  const content = `${SESSION_SUMMARY_PREFIX} ${JSON.stringify(stats)}`

  const stored = await sendMessage({
    sessionId: session.id,
    roomId: greenRoomId,
    authorId: dmId,
    authorUsername: dmUsername,
    dmId,
    content,
    type: MessageType.SYSTEM,
  })

  if (wsManager) {
    if (!stored.sessionId) {
      logger.warn('Session summary message stored without sessionId', { messageId: stored.id })
      return
    }
    const event = buildSystemChatEvent(stored)
    wsManager.broadcastEventToSession(session.id, event)
  }
}
