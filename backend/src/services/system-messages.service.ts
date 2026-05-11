import { MessageType } from '@shared'
import type { Role } from '@shared'
import type { EventEnvelope, UUID } from '@shared'
import type { SessionBoundaryType } from '@/types/session-boundary.types'
import type { WebSocketManager } from '@/ws'
import { sendMessage } from './chat.service'

const boundaryTemplates: Record<SessionBoundaryType, (sessionName: string) => string> = {
  SESSION_STARTED: (sessionName) => `[Session Started] ${sessionName}`,
  SESSION_PAUSED: (sessionName) => `[Session Paused] ${sessionName}`,
  SESSION_RESUMED: (sessionName) => `[Session Resumed] ${sessionName}`,
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
  sessionId: UUID
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
    sessionId: message.sessionId,
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
      const event = buildSystemChatEvent(stored)
      params.wsManager.broadcastEventToSession(params.sessionId, event)
    }
  }
}
