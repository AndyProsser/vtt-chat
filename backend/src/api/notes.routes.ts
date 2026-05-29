import { Router, Request, Response, NextFunction } from 'express'
import {
  isValidUUID,
  isValidNoteTitle,
  isValidNoteContent,
  isValidNoteVisibility,
  ErrorCode,
  NoteVisibility,
  RoomType,
} from '@shared'
import type { EventEnvelope, UUID } from '@shared'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { getSession, getSessionUsers } from '@/services/session/core.service'
import {
  createNote,
  deleteNote,
  getNoteById,
  getVisibleCampaignNotes,
  getVisibleNotes,
  markNotePublished,
  updateNote,
} from '@/services/notes.service'
import { getCampaignForUser } from '@/repositories/campaign.repository'
import { listSessionsByCampaign } from '@/repositories/session.repository'
import { MessageType } from '@shared'
import { sendMessage } from '@/services/chat.service'
import type { WebSocketManager } from '@/ws'
import { logger } from '@/utils/logger'
import { resolveEffectiveSessionRole } from '@/services/session/authz.service'
import {
  appendSessionAuditEvent,
  type SessionAuditVisibilityClass,
} from '@/services/runtime/runtime-streams.service'
import {
  noteVisibleTo,
  parseCreateNoteRequest,
  parseUpdateNoteRequest,
} from '@/services/notes/route-helpers.service'
import { NOTE_PUBLISH_SNIPPET_MAX_LENGTH } from '@/constants/notes.constants'
import { createSessionLog } from '@/repositories/session-logs.repository'
import { getRoom, getRoomMemberIds } from '@/services/room.service'
import { isGreenRoomName } from '@/utils'

const router = Router()

function getSessionCampaignId(session: unknown): UUID | undefined {
  const candidate = session as { campaignId?: UUID } | null
  return candidate?.campaignId
}

function toNoteAuditVisibilityClass(visibility: NoteVisibility): SessionAuditVisibilityClass {
  switch (visibility) {
    case NoteVisibility.DM_ONLY:
      return 'PRIVATE'
    case NoteVisibility.CUSTOM:
      return 'ROLE_SCOPED'
    case NoteVisibility.PLAYERS_VISIBLE:
    default:
      return 'PUBLIC'
  }
}

function summarizeSharedWith(params: {
  visibility: NoteVisibility
  allowedUsers?: UUID[]
  sessionDmId: UUID
  sessionUsernamesById: Map<UUID, string>
}): string {
  if (params.visibility === NoteVisibility.DM_ONLY) {
    return 'DM only'
  }

  if (params.visibility === NoteVisibility.PLAYERS_VISIBLE) {
    return 'All players'
  }

  const allowed = (params.allowedUsers || []).filter((userId) => userId !== params.sessionDmId)
  if (allowed.length === 0) {
    return 'Custom share list (none selected)'
  }

  const names = allowed.map((userId) => params.sessionUsernamesById.get(userId) || userId)
  return names.join(', ')
}

function summarizeHashtags(tags: string[]): string {
  if (tags.length === 0) {
    return 'None'
  }

  return tags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(', ')
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

async function resolveCampaignRole(
  campaignId: UUID,
  userId: UUID
): Promise<'DM' | 'PLAYER' | 'SPECTATOR' | null> {
  const campaign = await getCampaignForUser({ campaignId, userId })
  if (!campaign) {
    return null
  }

  if (campaign.currentDmId === userId || campaign.memberRole === 'DM') {
    return 'DM'
  }

  if (campaign.memberRole === 'PLAYER') {
    return 'PLAYER'
  }

  if (campaign.memberRole === 'SPECTATOR') {
    return 'SPECTATOR'
  }

  return null
}

router.get('/campaign/:campaignId', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params

  if (!isValidUUID(campaignId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId' })
  }

  const requesterRole = await resolveCampaignRole(campaignId as UUID, user.userId as UUID)
  if (!requesterRole) {
    return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a campaign member' })
  }

  const notes = await getVisibleCampaignNotes(
    campaignId as UUID,
    user.userId as UUID,
    requesterRole
  )
  return res.status(200).json({ notes })
})

router.get('/:sessionId', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { sessionId } = req.params

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_SESSION, message: 'Invalid sessionId' })
  }

  const session = await getSession(sessionId as UUID)
  if (!session) {
    return res.status(404).json({ code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found' })
  }

  const authz = await resolveEffectiveSessionRole({
    sessionId: session.id,
    userId: user.userId as UUID,
  })
  if (!authz.ok) {
    return res.status(authz.code === 'SESSION_NOT_FOUND' ? 404 : 403).json({
      code: authz.code === 'SESSION_NOT_FOUND' ? ErrorCode.SESSION_NOT_FOUND : ErrorCode.FORBIDDEN,
      message: authz.message,
    })
  }

  const notes = await getVisibleNotes(session.id, user.userId as UUID, authz.role)
  return res.status(200).json({ notes })
})

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId, sessionId, title, content, visibility, tags, allowedUsers, attachments } =
    parseCreateNoteRequest(req.body)

  if (!isValidUUID(campaignId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId' })
  }
  if (!isValidNoteTitle(title)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid note title' })
  }
  if (!isValidNoteContent(content)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid note content' })
  }
  if (!isValidNoteVisibility(visibility)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid note visibility' })
  }

  const requesterRole = await resolveCampaignRole(campaignId as UUID, user.userId as UUID)
  if (!requesterRole) {
    return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a campaign member' })
  }

  let noteSession = null as Awaited<ReturnType<typeof getSession>>
  if (sessionId) {
    if (!isValidUUID(sessionId)) {
      return res.status(400).json({ code: ErrorCode.INVALID_SESSION, message: 'Invalid sessionId' })
    }

    noteSession = await getSession(sessionId as UUID)
    if (!noteSession) {
      return res
        .status(404)
        .json({ code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found' })
    }

    if (getSessionCampaignId(noteSession) !== (campaignId as UUID)) {
      return res.status(400).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'Session does not belong to campaign',
      })
    }
  }

  if (!noteSession) {
    const sessions = await listSessionsByCampaign(campaignId)
    noteSession = sessions[0] ? await getSession(sessions[0].id as UUID) : null
  }

  if (!noteSession) {
    return res.status(409).json({
      code: ErrorCode.CONFLICT,
      message: 'Create a session first to anchor campaign notes',
    })
  }

  if (visibility === NoteVisibility.DM_ONLY && requesterRole !== 'DM') {
    return res
      .status(403)
      .json({ code: ErrorCode.FORBIDDEN, message: 'Only DM may create DM-only notes' })
  }

  const note = await createNote({
    campaignId: campaignId as UUID,
    sessionId: noteSession.id,
    authorId: user.userId as UUID,
    authorUsername: user.username,
    title,
    content,
    visibility,
    tags,
    allowedUsers: visibility === NoteVisibility.CUSTOM ? allowedUsers : [],
    attachments,
  })
  const created = note.created

  await appendSessionAuditEvent({
    sessionId: noteSession.id,
    campaignId: getSessionCampaignId(noteSession),
    actorUserId: user.userId as UUID,
    actorRole: requesterRole,
    actionType: created ? 'NOTES.CREATED' : 'NOTES.UPDATED',
    targetType: 'NOTE',
    targetId: note.id,
    visibilityClass: toNoteAuditVisibilityClass(note.visibility),
    timestamp: created ? note.createdAt : note.updatedAt,
    metadata: {
      noteVisibility: note.visibility,
      tagCount: note.tags.length,
      allowedUserCount: note.allowedUsers?.length ?? 0,
      attachmentCount: note.attachments?.length ?? 0,
      published: Boolean((note as { publishedAt?: number | null }).publishedAt),
    },
  })

  const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
  if (wsManager) {
    const event: EventEnvelope = {
      id: crypto.randomUUID() as UUID,
      type: created ? 'NOTES:CREATED' : 'NOTES:UPDATED',
      version: 1,
      userId: user.userId as UUID,
      userRole: requesterRole as any,
      sessionId: noteSession.id,
      roomId: null,
      timestamp: created ? note.createdAt : note.updatedAt,
      payload: {
        noteId: note.id,
        ownerId: note.authorId,
        ownerUsername: note.authorUsername,
        title: note.title,
        content: note.content,
        visibility: note.visibility,
        tags: note.tags,
        allowedUsers: note.allowedUsers,
        attachments: note.attachments,
      },
    }

    wsManager.broadcastEventToSession(
      noteSession.id,
      event,
      noteVisibleTo({
        authorId: note.authorId,
        visibility: note.visibility,
        allowedUsers: note.allowedUsers,
        dmId: noteSession.dmId,
      })
    )
  }

  return res.status(created ? 201 : 200).json({ note })
})

router.put('/:noteId', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { noteId } = req.params
  const { title, content, visibility, tags, allowedUsers, attachments } = parseUpdateNoteRequest(
    req.body
  )

  if (!isValidUUID(noteId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_NOTE_ID, message: 'Invalid noteId' })
  }

  if (title !== undefined && !isValidNoteTitle(title)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid note title' })
  }
  if (content !== undefined && !isValidNoteContent(content)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid note content' })
  }
  if (visibility !== undefined && !isValidNoteVisibility(visibility)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid note visibility' })
  }

  const existingNote = await getNoteById(noteId as UUID)
  if (!existingNote) {
    return res.status(404).json({ code: ErrorCode.NOTE_NOT_FOUND, message: 'Note not found' })
  }

  const noteSession = await getSession(existingNote.sessionId)
  if (!noteSession) {
    return res.status(404).json({ code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found' })
  }

  const authz = await resolveEffectiveSessionRole({
    sessionId: noteSession.id,
    userId: user.userId as UUID,
  })
  if (!authz.ok) {
    return res.status(authz.code === 'SESSION_NOT_FOUND' ? 404 : 403).json({
      code: authz.code === 'SESSION_NOT_FOUND' ? ErrorCode.SESSION_NOT_FOUND : ErrorCode.FORBIDDEN,
      message: authz.message,
    })
  }

  const requesterRole = authz.role

  if (visibility === NoteVisibility.DM_ONLY && requesterRole !== 'DM') {
    return res
      .status(403)
      .json({ code: ErrorCode.FORBIDDEN, message: 'Only DM may set DM-only visibility' })
  }

  let note
  try {
    note = await updateNote(noteId as UUID, user.userId as UUID, requesterRole, {
      title,
      content,
      visibility,
      tags,
      allowedUsers:
        visibility === NoteVisibility.CUSTOM || allowedUsers !== undefined
          ? allowedUsers
          : undefined,
      attachments,
    })
  } catch (err: any) {
    if (err?.code === 'VISIBILITY_CONSTRAINT') {
      return res.status(409).json({
        code: ErrorCode.CONFLICT,
        message: err.message,
      })
    }
    return res.status(500).json({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Unable to update note',
    })
  }

  if (!note) {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message: 'Cannot update note (not found or insufficient permissions)',
    })
  }

  const session = await getSession(note.sessionId)
  if (!session) {
    return res.status(404).json({ code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found' })
  }

  const eventRole = authz.role

  await appendSessionAuditEvent({
    sessionId: note.sessionId,
    campaignId: getSessionCampaignId(session),
    actorUserId: user.userId as UUID,
    actorRole: eventRole,
    actionType: 'NOTES.UPDATED',
    targetType: 'NOTE',
    targetId: note.id,
    visibilityClass: toNoteAuditVisibilityClass(note.visibility),
    timestamp: note.updatedAt,
    metadata: {
      noteVisibility: note.visibility,
      tagCount: note.tags.length,
      allowedUserCount: note.allowedUsers?.length ?? 0,
      attachmentCount: note.attachments?.length ?? 0,
      published: Boolean((note as { publishedAt?: number | null }).publishedAt),
    },
  })

  const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
  if (wsManager) {
    const event: EventEnvelope = {
      id: crypto.randomUUID() as UUID,
      type: 'NOTES:UPDATED',
      version: 1,
      userId: user.userId as UUID,
      userRole: eventRole as any,
      sessionId: note.sessionId,
      roomId: null,
      timestamp: note.updatedAt,
      payload: {
        noteId: note.id,
        title: note.title,
        content: note.content,
        visibility: note.visibility,
        tags: note.tags,
        allowedUsers: note.allowedUsers,
        attachments: note.attachments,
      },
    }

    wsManager.broadcastEventToSession(
      note.sessionId,
      event,
      noteVisibleTo({
        authorId: note.authorId,
        visibility: note.visibility,
        allowedUsers: note.allowedUsers,
        dmId: session.dmId,
      })
    )
  }

  return res.status(200).json({ note })
})

router.post('/:noteId/publish', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { noteId } = req.params
  const requestedRoomId = req.body?.roomId
  const publishAudience = req.body?.audience === 'ROOM' ? 'ROOM' : 'EVERYONE'

  if (!isValidUUID(noteId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_NOTE_ID, message: 'Invalid noteId' })
  }

  const note = await getNoteById(noteId as UUID)
  if (!note) {
    return res.status(404).json({ code: ErrorCode.NOTE_NOT_FOUND, message: 'Note not found' })
  }

  const session = await getSession(note.sessionId)
  if (!session) {
    return res.status(404).json({ code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found' })
  }

  const authz = await resolveEffectiveSessionRole({
    sessionId: session.id,
    userId: user.userId as UUID,
  })
  if (!authz.ok) {
    return res.status(authz.code === 'SESSION_NOT_FOUND' ? 404 : 403).json({
      code: authz.code === 'SESSION_NOT_FOUND' ? ErrorCode.SESSION_NOT_FOUND : ErrorCode.FORBIDDEN,
      message: authz.message,
    })
  }

  const requesterRole = authz.role
  const visibleNotes = await getVisibleNotes(note.sessionId, user.userId as UUID, requesterRole)
  if (!visibleNotes.find((n) => n.id === note.id)) {
    return res.status(404).json({ code: ErrorCode.NOTE_NOT_FOUND, message: 'Note not found' })
  }

  let noteToPublish = note
  let publishRoomId: UUID | undefined

  if (publishAudience === 'ROOM') {
    if (!isValidUUID(requestedRoomId)) {
      return res.status(400).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'Room publish requires a valid roomId',
      })
    }

    const room = await getRoom(requestedRoomId as UUID)
    if (!room || room.sessionId !== note.sessionId) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Room not found' })
    }

    if (
      room.type === RoomType.PRIVATE ||
      (room.type === RoomType.GROUP && isGreenRoomName(room.name))
    ) {
      return res.status(400).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'Handouts may only be posted to MAIN or active GROUP rooms',
      })
    }

    const sessionUsers = await getSessionUsers(note.sessionId)
    const playerIds = new Set(
      sessionUsers.filter((sessionUser) => sessionUser.role === 'PLAYER').map((entry) => entry.id)
    )
    const roomMemberIds = await getRoomMemberIds(note.sessionId, room.id)
    const targetPlayerIds = roomMemberIds.filter((memberId) => playerIds.has(memberId))

    if (targetPlayerIds.length === 0) {
      return res.status(409).json({
        code: ErrorCode.CONFLICT,
        message: 'Selected room has no players to share this handout with',
      })
    }

    publishRoomId = room.id

    if (note.visibility !== NoteVisibility.PLAYERS_VISIBLE) {
      const mergedAllowedUsers = Array.from(
        new Set([...(note.allowedUsers || []), ...targetPlayerIds])
      )
      const nextVisibility = mergedAllowedUsers.length
        ? NoteVisibility.CUSTOM
        : NoteVisibility.DM_ONLY

      const sharedNote = await updateNote(note.id, user.userId as UUID, requesterRole, {
        visibility: nextVisibility,
        allowedUsers: mergedAllowedUsers,
      })

      if (!sharedNote) {
        return res.status(403).json({
          code: ErrorCode.FORBIDDEN,
          message: 'Unable to share note with the selected room',
        })
      }

      noteToPublish = sharedNote
    }
  } else if (note.visibility !== NoteVisibility.PLAYERS_VISIBLE) {
    const sharedNote = await updateNote(note.id, user.userId as UUID, requesterRole, {
      visibility: NoteVisibility.PLAYERS_VISIBLE,
      allowedUsers: [],
    })

    if (!sharedNote) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'Unable to share note with everyone',
      })
    }

    noteToPublish = sharedNote
  }

  const published = await markNotePublished(noteToPublish.id)
  if (!published) {
    return res.status(404).json({ code: ErrorCode.NOTE_NOT_FOUND, message: 'Note not found' })
  }

  logger.info('ADMIN:NOTE_PUBLISHED', 'Note published to chat', {
    action: 'NOTE_PUBLISHED',
    noteId: published.id,
    sessionId: published.sessionId,
    campaignId: (session as any).campaignId ?? null,
    actorUserId: user.userId,
    actorUsername: user.username,
    actorRole: requesterRole,
    noteOwnerId: published.authorId,
    noteVisibility: published.visibility,
    publishedAt: published.publishedAt,
  })

  const snippet =
    published.content.length > NOTE_PUBLISH_SNIPPET_MAX_LENGTH
      ? `${published.content.slice(0, NOTE_PUBLISH_SNIPPET_MAX_LENGTH)}...`
      : published.content

  const sessionUsers = await getSessionUsers(published.sessionId)
  const sessionUsernamesById = new Map(
    sessionUsers.map((sessionUser) => [sessionUser.id as UUID, sessionUser.username] as const)
  )
  const sharedWithSummary = summarizeSharedWith({
    visibility: published.visibility,
    allowedUsers: published.allowedUsers,
    sessionDmId: session.dmId,
    sessionUsernamesById,
  })
  const hashtagsSummary = summarizeHashtags(published.tags || [])

  const historyContentPreview =
    published.content.length > NOTE_PUBLISH_SNIPPET_MAX_LENGTH
      ? `${published.content.slice(0, NOTE_PUBLISH_SNIPPET_MAX_LENGTH)}...`
      : published.content

  const publishAudienceUsers = noteVisibleTo({
    authorId: published.authorId,
    visibility: published.visibility,
    allowedUsers: published.allowedUsers,
    dmId: session.dmId,
  })

  const message = await sendMessage({
    sessionId: published.sessionId,
    roomId: publishRoomId,
    authorId: user.userId as UUID,
    authorUsername: user.username,
    dmId: session.dmId,
    visibleTo: publishAudienceUsers,
    content:
      `[Note Shared] ${published.title}\n` +
      `Shared with: ${sharedWithSummary}\n` +
      `Hashtags: ${hashtagsSummary}\n` +
      `${snippet}`,
    type: MessageType.SYSTEM,
    metadata: {
      noteShared: {
        kind: 'NOTE_SHARED',
        noteId: published.id,
        title: published.title,
        markdown: published.content,
        sharedWith: sharedWithSummary,
        hashtags: hashtagsSummary,
      },
    },
  })

  await createSessionLog({
    sessionId: published.sessionId,
    userId: user.userId as UUID,
    username: user.username,
    eventType: 'STATE_CHANGED',
    detail:
      `Note shared | Name: ${published.title} | Content: ${historyContentPreview} | ` +
      `Shared with: ${sharedWithSummary} | Hashtags: ${hashtagsSummary}`,
  })

  await appendSessionAuditEvent({
    sessionId: published.sessionId,
    campaignId: getSessionCampaignId(session),
    actorUserId: user.userId as UUID,
    actorRole: requesterRole,
    actionType: 'NOTES.PUBLISHED',
    targetType: 'NOTE',
    targetId: published.id,
    visibilityClass: toNoteAuditVisibilityClass(published.visibility),
    timestamp: published.publishedAt ?? Date.now(),
    metadata: {
      noteVisibility: published.visibility,
      allowedUserCount: published.allowedUsers?.length ?? 0,
      chatMessageId: message.id,
      snippetLength: snippet.length,
    },
  })

  const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
  if (wsManager) {
    const notesEvent: EventEnvelope = {
      id: crypto.randomUUID() as UUID,
      type: 'NOTES:UPDATED',
      version: 1,
      userId: user.userId as UUID,
      userRole: requesterRole as any,
      sessionId: published.sessionId,
      roomId: null,
      timestamp: published.updatedAt,
      payload: {
        noteId: published.id,
        title: published.title,
        content: published.content,
        visibility: published.visibility,
        tags: published.tags,
        allowedUsers: published.allowedUsers,
      },
    }

    wsManager.broadcastEventToSession(published.sessionId, notesEvent, publishAudienceUsers)

    const chatEvent: EventEnvelope = {
      id: crypto.randomUUID() as UUID,
      type: 'CHAT:MESSAGE_SENT',
      sessionId: message.sessionId as UUID,
      version: 1,
      userId: user.userId as UUID,
      userRole: requesterRole as any,
      roomId: message.roomId || null,
      timestamp: message.createdAt,
      payload: {
        messageId: message.id,
        authorId: message.authorId,
        authorUsername: message.authorUsername,
        content: message.content,
        type: message.type,
        isDmOnly: message.isDmOnly,
      },
    }
    wsManager.broadcastEventToSession(message.sessionId as UUID, chatEvent, publishAudienceUsers)
  }

  return res.status(200).json({ ok: true, message })
})

router.delete('/:noteId', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { noteId } = req.params

  if (!isValidUUID(noteId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_NOTE_ID, message: 'Invalid noteId' })
  }

  const existingNote = await getNoteById(noteId as UUID)
  if (!existingNote) {
    return res.status(404).json({ code: ErrorCode.NOTE_NOT_FOUND, message: 'Note not found' })
  }

  const authz = await resolveEffectiveSessionRole({
    sessionId: existingNote.sessionId,
    userId: user.userId as UUID,
  })
  if (!authz.ok) {
    return res.status(authz.code === 'SESSION_NOT_FOUND' ? 404 : 403).json({
      code: authz.code === 'SESSION_NOT_FOUND' ? ErrorCode.SESSION_NOT_FOUND : ErrorCode.FORBIDDEN,
      message: authz.message,
    })
  }

  const note = await deleteNote(noteId as UUID, user.userId as UUID, authz.role)
  if (!note) {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message: 'Cannot delete note (not found or insufficient permissions)',
    })
  }

  await appendSessionAuditEvent({
    sessionId: note.sessionId,
    campaignId: getSessionCampaignId(existingNote),
    actorUserId: user.userId as UUID,
    actorRole: authz.role,
    actionType: 'NOTES.DELETED',
    targetType: 'NOTE',
    targetId: note.id,
    visibilityClass: 'SYSTEM',
    timestamp: Date.now(),
    metadata: {
      deletedBy: user.userId as UUID,
    },
  })

  const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
  if (wsManager) {
    const event: EventEnvelope = {
      id: crypto.randomUUID() as UUID,
      type: 'NOTES:DELETED',
      version: 1,
      userId: user.userId as UUID,
      userRole: authz.role as any,
      sessionId: note.sessionId,
      roomId: null,
      timestamp: Date.now(),
      payload: {
        noteId: note.id,
      },
    }
    wsManager.broadcastEventToSession(note.sessionId, event)
  }

  return res.status(200).json({ ok: true })
})

export default router
