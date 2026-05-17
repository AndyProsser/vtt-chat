import { MessageType } from '@shared'
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
 * Sarcastic fallback recaps shown when the DM hasn't written a journal entry.
 * Each entry is 1–2 sentences and gently roasts the DM's record-keeping habits.
 */
const SARCASTIC_RECAPS: readonly string[] = [
  "Last session's official recap: 'stuff happened.' Thanks, DM. Really painting a picture there.",
  "The DM, in their infinite wisdom, left no journal entry. We'll assume the party probably fought something and someone nearly died. Classic.",
  "No journal was submitted. Our magical record-keepers have filed this under 'The Session That Apparently Never Happened.'",
  "According to the DM's meticulous record-keeping: [cricket sounds]. We've reconstructed events from interpretive dance.",
  "The DM swore they'd write up the session 'right after.' That was last week. We present: nothing.",
  'In lieu of an actual recap, please enjoy this haiku: / Party did some things. / DM forgot to write it. / Someone probably died.',
  "The official session record consists of seventeen question marks and a drawing of a dragon. We're doing our best.",
  "Last session existed. Beyond that, the historical record is tragically silent — much like the DM's journal.",
  'A note from your record-keepers: the DM has once again exercised their creative license to not recap anything. Historians weep.',
  "No journal entry detected. Based on the emotional damage to the party, we estimate it was 'a rough one.'",
  "The DM's journal entry for last session reads: [blank]. We've dispatched a search party for the missing words.",
  'Legend has it the party went on a grand adventure last session. Legend also says the DM would write about it. One of those is true.',
  'Last time on our campaign: honestly who knows. The DM is a mystery wrapped in a dungeon wrapped in an excuse.',
  "Previous session summary: skipped. Much like the DM's journaling habit. What a shocking development.",
  'Scholars have searched the archives. No record of last session exists. The DM has achieved the impossible: erasing history.',
  'The DM was definitely going to write a recap. They had the doc open and everything. Then… nothing. Absolute nothing.',
  "Our enchanted quill dutifully waited for the DM's recap. It is still waiting. Please send supplies.",
  "Last session's recap has been classified MISSING IN ACTION. The DM was seen in the vicinity of the journal and left no evidence.",
  "Without a journal entry, we can only assume the party: (a) saved the world, (b) nearly killed each other, or (c) spent an hour buying rope. Given the DM's track record, probably (c).",
  "The DM promised a recap 'soon.' In DM time, that means we'll have it by the campaign finale.",
  "What happened last session? The DM knows. The DM won't say. The DM is now immune to Zone of Truth, apparently.",
  'No notes, no recap, no remorse. The DM has perfected the art of narrative amnesia.',
  "The bards have no songs to sing of last session's deeds. Mostly because the DM didn't tell them what happened.",
  'Imagine a session happened. Now imagine someone wrote it down. Now imagine the DM. Notice anything missing?',
  "The DM's journaling streak stands at a proud zero. Consistency is a virtue, apparently, just not in documentation.",
]

function pickSarcasticRecap(): string {
  return SARCASTIC_RECAPS[Math.floor(Math.random() * SARCASTIC_RECAPS.length)]
}

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
    where: { campaignId: currentSession.campaignId, state: 'ENDED', NOT: { id: params.sessionId } },
    orderBy: { endedAt: 'desc' },
    select: { id: true },
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
  })

  const journalNote = notes.find((n) => {
    if (Array.isArray(n.tags) && (n.tags as string[]).includes('_journal')) return true
    if (n.title === 'Session Journal') return true
    return false
  })

  const recapBody = journalNote?.content
    ? truncateJournalContent(journalNote.content)
    : pickSarcasticRecap()

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
