import { Router, Request, Response, NextFunction } from 'express'
import { Prisma } from '@prisma/client'
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
import { findSessionById } from '@/repositories/session.repository'
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
import { canViewNote } from '@/services/notes/shared'
import { NOTE_PUBLISH_SNIPPET_MAX_LENGTH } from '@/constants/notes.constants'
import { generateExcerpt } from '@/services/notes/excerpt.service'
import { createSessionLog } from '@/repositories/session-logs.repository'
import { getRoom, getRoomMemberIds, getRooms } from '@/services/room.service'
import { isGreenRoomName } from '@/utils'

const router = Router()

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
  try {
    const notes = await getVisibleCampaignNotes(
      campaignId as UUID,
      user.userId as UUID,
      requesterRole
    )
    return res.status(200).json({ notes })
  } catch (error) {
    logger.error('notes.routes', 'Failed to list campaign notes', {
      campaignId,
      userId: user.userId,
      error,
    })

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2022' &&
      String(error.message).includes('campaignId')
    ) {
      return res.status(503).json({
        code: ErrorCode.INTERNAL_ERROR,
        message:
          'Notes schema is out of date. Run backend Prisma migrations to add Note.campaignId.',
      })
    }

    return res.status(500).json({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Unable to load campaign notes',
    })
  }
})

/**
 * GET /api/notes/by-id/:noteId
 * Fetch a single note by its ID. Used by the pop-out note view.
 * Must be registered before the /:sessionId catch-all.
 */
router.get('/by-id/:noteId', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { noteId } = req.params

  if (!isValidUUID(noteId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_NOTE_ID, message: 'Invalid noteId' })
  }

  const note = await getNoteById(noteId as UUID)
  if (!note) {
    return res.status(404).json({ code: ErrorCode.NOTE_NOT_FOUND, message: 'Note not found' })
  }

  const requesterRole = await resolveCampaignRole(note.campaignId, user.userId as UUID)
  if (!requesterRole) {
    return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a campaign member' })
  }

  if (!canViewNote(note, user.userId as UUID, requesterRole)) {
    return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Access denied' })
  }

  return res.status(200).json({ note })
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

  // Validate sessionId belongs to campaign if provided (used as WS broadcast target only)
  let broadcastSession = null as Awaited<ReturnType<typeof getSession>>
  if (sessionId && isValidUUID(sessionId)) {
    broadcastSession = await getSession(sessionId as UUID)
    const sessionRecord = await findSessionById(sessionId as string)
    if (!broadcastSession || !sessionRecord || sessionRecord.campaignId !== (campaignId as UUID)) {
      broadcastSession = null
    }
  }

  if (visibility === NoteVisibility.DM_ONLY && requesterRole !== 'DM') {
    return res
      .status(403)
      .json({ code: ErrorCode.FORBIDDEN, message: 'Only DM may create DM-only notes' })
  }

  const note = await createNote({
    campaignId: campaignId as UUID,
    sessionId: broadcastSession?.id,
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

  if (broadcastSession) {
    await appendSessionAuditEvent({
      sessionId: broadcastSession.id,
      campaignId: campaignId as UUID,
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
        sessionId: broadcastSession.id,
        roomId: null,
        timestamp: created ? note.createdAt : note.updatedAt,
        payload: {
          campaignId: note.campaignId,
          noteId: note.id,
          ownerId: note.authorId,
          ownerUsername: note.authorUsername,
          title: note.title,
          content: note.content,
          visibility: note.visibility,
          tags: note.tags,
          allowedUsers: note.allowedUsers,
          attachments: note.attachments,
          publishedAt: note.publishedAt,
        },
      }

      wsManager.broadcastEventToSession(
        broadcastSession.id,
        event,
        noteVisibleTo({
          authorId: note.authorId,
          visibility: note.visibility,
          allowedUsers: note.allowedUsers,
          dmId: broadcastSession.dmId,
        })
      )
    }
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

  const requesterRole = await resolveCampaignRole(existingNote.campaignId, user.userId as UUID)
  if (!requesterRole) {
    return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a campaign member' })
  }

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

  // Broadcast to session if note is session-linked
  const updateSession = note.sessionId ? await getSession(note.sessionId) : null

  if (updateSession) {
    await appendSessionAuditEvent({
      sessionId: updateSession.id,
      campaignId: note.campaignId,
      actorUserId: user.userId as UUID,
      actorRole: requesterRole,
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
        userRole: requesterRole as any,
        sessionId: updateSession.id,
        roomId: null,
        timestamp: note.updatedAt,
        payload: {
          campaignId: note.campaignId,
          noteId: note.id,
          title: note.title,
          content: note.content,
          visibility: note.visibility,
          tags: note.tags,
          allowedUsers: note.allowedUsers,
          attachments: note.attachments,
          publishedAt: note.publishedAt,
        },
      }

      wsManager.broadcastEventToSession(
        updateSession.id,
        event,
        noteVisibleTo({
          authorId: note.authorId,
          visibility: note.visibility,
          allowedUsers: note.allowedUsers,
          dmId: updateSession.dmId,
        })
      )
    }
  }

  return res.status(200).json({ note })
})

router.post('/:noteId/publish', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { noteId } = req.params
  const requestedRoomId = req.body?.roomId
  const publishAudience = req.body?.audience === 'ROOM' ? 'ROOM' : 'EVERYONE'
  const publishSessionId = req.body?.sessionId

  if (!isValidUUID(noteId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_NOTE_ID, message: 'Invalid noteId' })
  }

  if (!isValidUUID(publishSessionId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_SESSION, message: 'sessionId is required to publish a note' })
  }

  const note = await getNoteById(noteId as UUID)
  if (!note) {
    return res.status(404).json({ code: ErrorCode.NOTE_NOT_FOUND, message: 'Note not found' })
  }

  const session = await getSession(publishSessionId as UUID)
  if (!session) {
    return res.status(404).json({ code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found' })
  }
  const sessionRecord = await findSessionById(publishSessionId as string)
  const noteCampaignId = note.campaignId ?? (sessionRecord?.campaignId as UUID | null)
  if (!noteCampaignId) {
    return res.status(500).json({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Note is missing campaign context; cannot publish',
    })
  }

  // Auth via campaign membership — notes are campaign-scoped, not session-scoped
  const requesterRole = await resolveCampaignRole(noteCampaignId, user.userId as UUID)
  if (!requesterRole) {
    return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a campaign member' })
  }
  if (requesterRole !== 'DM') {
    return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Only DM may publish notes' })
  }

  // Validate that the provided session belongs to the same campaign as the note.
  if (!sessionRecord || sessionRecord.campaignId !== noteCampaignId) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Session does not belong to the same campaign as the note',
    })
  }

  const visibleNotes = await getVisibleCampaignNotes(
    noteCampaignId,
    user.userId as UUID,
    requesterRole
  )
  if (!visibleNotes.find((n) => n.id === note.id)) {
    return res.status(404).json({ code: ErrorCode.NOTE_NOT_FOUND, message: 'Note not found' })
  }

  const sessionUsersForAudienceCheck = await getSessionUsers(session.id)
  const playerIdsForAudienceCheck = new Set(
    sessionUsersForAudienceCheck
      .filter((sessionUser) => sessionUser.role === 'PLAYER')
      .map((entry) => entry.id)
  )
  const publishableRooms = (await getRooms(session.id)).filter(
    (room) =>
      room.type === RoomType.MAIN || (room.type === RoomType.GROUP && !isGreenRoomName(room.name))
  )

  const roomsWithPlayers: UUID[] = []
  for (const room of publishableRooms) {
    const roomMemberIds = await getRoomMemberIds(session.id, room.id)
    const playerCount = roomMemberIds.filter((memberId) =>
      playerIdsForAudienceCheck.has(memberId)
    ).length
    if (playerCount > 0) {
      roomsWithPlayers.push(room.id)
    }
  }

  if (publishAudience === 'EVERYONE' && roomsWithPlayers.length > 1) {
    return res.status(409).json({
      code: ErrorCode.CONFLICT,
      message: 'Multiple rooms currently contain players. Choose a room to publish this handout.',
    })
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
    if (!room || room.sessionId !== session.id) {
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

    const sessionUsers = await getSessionUsers(session.id)
    const playerIds = new Set(
      sessionUsers.filter((sessionUser) => sessionUser.role === 'PLAYER').map((entry) => entry.id)
    )
    const roomMemberIds = await getRoomMemberIds(session.id, room.id)
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
    sessionId: session.id,
    campaignId: noteCampaignId,
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

  const sessionUsers = await getSessionUsers(session.id)
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
    sessionId: session.id,
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
    sessionId: session.id,
    userId: user.userId as UUID,
    username: user.username,
    eventType: 'STATE_CHANGED',
    detail:
      `Note shared | Name: ${published.title} | Content: ${historyContentPreview} | ` +
      `Shared with: ${sharedWithSummary} | Hashtags: ${hashtagsSummary}`,
  })

  await appendSessionAuditEvent({
    sessionId: session.id,
    campaignId: noteCampaignId,
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
      sessionId: session.id,
      roomId: null,
      timestamp: published.updatedAt,
      payload: {
        campaignId: published.campaignId,
        noteId: published.id,
        title: published.title,
        content: published.content,
        visibility: published.visibility,
        tags: published.tags,
        allowedUsers: published.allowedUsers,
        publishedAt: published.publishedAt,
      },
    }

    wsManager.broadcastEventToSession(session.id, notesEvent, publishAudienceUsers)

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
    wsManager.broadcastEventToSession(message.sessionId as UUID, chatEvent, publishAudienceUsers)
  }

  return res.status(200).json({ ok: true, message })
})

/**
 * POST /api/notes/:noteId/surface
 *
 * Surfaces a note as a one-time recipients-only handout card in chat.
 * Differs from /publish:
 *  - Uses excerpt (auto-generated or DM override) instead of full content.
 *  - Accepts a `scope` (PARTY | SELECTED) and optional `selectedUserIds`.
 *  - Broadcasts NOTES:HANDOUT_SURFACED (in addition to CHAT:MESSAGE_SENT) to resolved recipients only.
 *  - Updates note visibility to match scope before surfacing.
 */
router.post('/:noteId/surface', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { noteId } = req.params
  const rawScope = req.body?.scope
  const surfaceSessionId: string = req.body?.sessionId
  const selectedUserIds: string[] = Array.isArray(req.body?.selectedUserIds)
    ? req.body.selectedUserIds.filter((id: unknown) => isValidUUID(id as string))
    : []
  const manualExcerpt: string | undefined =
    typeof req.body?.manualExcerpt === 'string' && req.body.manualExcerpt.trim().length > 0
      ? req.body.manualExcerpt
      : undefined

  if (!isValidUUID(noteId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_NOTE_ID, message: 'Invalid noteId' })
  }

  if (!isValidUUID(surfaceSessionId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_SESSION, message: 'sessionId is required to surface a note' })
  }

  const scope = rawScope === 'PARTY' || rawScope === 'SELECTED' ? rawScope : null
  if (!scope) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'scope must be PARTY or SELECTED' })
  }

  if (scope === 'SELECTED' && selectedUserIds.length === 0) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'selectedUserIds required for SELECTED scope',
    })
  }

  const note = await getNoteById(noteId as UUID)
  if (!note) {
    return res.status(404).json({ code: ErrorCode.NOTE_NOT_FOUND, message: 'Note not found' })
  }

  const session = await getSession(surfaceSessionId as UUID)
  if (!session) {
    return res.status(404).json({ code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found' })
  }

  const sessionRecord = await findSessionById(surfaceSessionId)
  const noteCampaignId = note.campaignId ?? (sessionRecord?.campaignId as UUID | null)
  if (!noteCampaignId) {
    return res.status(500).json({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Note is missing campaign context; cannot surface',
    })
  }

  if (!sessionRecord || sessionRecord.campaignId !== noteCampaignId) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Session does not belong to the same campaign as the note',
    })
  }

  const requesterRole = await resolveCampaignRole(noteCampaignId, user.userId as UUID)
  if (!requesterRole) {
    return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a campaign member' })
  }
  if (requesterRole !== 'DM') {
    return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Only DM may surface notes' })
  }

  // Resolve recipient player IDs from scope
  const sessionUsers = await getSessionUsers(session.id)
  const allPlayerIds = sessionUsers.filter((u) => u.role === 'PLAYER').map((u) => u.id as UUID)

  let recipientIds: UUID[]
  if (scope === 'PARTY') {
    recipientIds = allPlayerIds
  } else {
    // SELECTED: intersect with actual session players for safety
    const playerIdSet = new Set(allPlayerIds)
    recipientIds = selectedUserIds.filter((id) => playerIdSet.has(id as UUID)) as UUID[]
  }

  if (recipientIds.length === 0) {
    return res.status(409).json({
      code: ErrorCode.CONFLICT,
      message: 'No eligible players to surface this handout to',
    })
  }

  // Update note visibility to match scope
  const nextVisibility = scope === 'PARTY' ? NoteVisibility.PLAYERS_VISIBLE : NoteVisibility.CUSTOM
  const nextAllowedUsers = scope === 'SELECTED' ? recipientIds : []

  let noteToSurface = note
  if (
    note.visibility !== nextVisibility ||
    (scope === 'SELECTED' &&
      JSON.stringify([...recipientIds].sort()) !==
        JSON.stringify([...(note.allowedUsers || [])].sort()))
  ) {
    const updated = await updateNote(noteId as UUID, user.userId as UUID, requesterRole, {
      visibility: nextVisibility,
      allowedUsers: nextAllowedUsers,
    })
    if (!updated) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'Unable to update note visibility for surfacing',
      })
    }
    noteToSurface = updated
  }

  const published = await markNotePublished(noteToSurface.id)
  if (!published) {
    return res.status(404).json({ code: ErrorCode.NOTE_NOT_FOUND, message: 'Note not found' })
  }

  // Generate excerpt
  const { excerpt, excerptSource } = generateExcerpt(published.content, {
    manualOverride: manualExcerpt,
    fallbackTitle: published.title,
  })

  // visibleTo: DM + recipients (for the chat message and WS broadcasts)
  const surfaceAudienceIds = Array.from(new Set([session.dmId, ...recipientIds]))

  // Persist system chat message so the handout card survives refresh
  const message = await sendMessage({
    sessionId: session.id,
    roomId: undefined,
    authorId: user.userId as UUID,
    authorUsername: user.username,
    dmId: session.dmId,
    visibleTo: surfaceAudienceIds,
    content: `[Handout] ${published.title}\n${excerpt}`,
    type: MessageType.SYSTEM,
    metadata: {
      noteHandout: {
        kind: 'NOTE_HANDOUT',
        noteId: published.id,
        title: published.title,
        excerpt,
        excerptSource,
        fullContent: published.content,
      },
    },
  })

  await createSessionLog({
    sessionId: session.id,
    userId: user.userId as UUID,
    username: user.username,
    eventType: 'STATE_CHANGED',
    detail: `Handout surfaced | Name: ${published.title} | Scope: ${scope} | Recipients: ${recipientIds.length}`,
  })

  await appendSessionAuditEvent({
    sessionId: session.id,
    campaignId: noteCampaignId,
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
      scope,
      recipientCount: recipientIds.length,
      excerptSource,
    },
  })

  const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
  if (wsManager) {
    const surfacedAt = Date.now()

    const handoutEvent: EventEnvelope = {
      id: crypto.randomUUID() as UUID,
      type: 'NOTES:HANDOUT_SURFACED',
      version: 1,
      userId: user.userId as UUID,
      userRole: requesterRole as any,
      sessionId: session.id,
      roomId: null,
      timestamp: surfacedAt,
      payload: {
        noteId: published.id,
        campaignId: noteCampaignId,
        authorId: user.userId as UUID,
        title: published.title,
        excerpt,
        excerptSource,
        scope,
        recipientIds,
        surfacedAt,
      },
    }
    wsManager.broadcastEventToSession(session.id, handoutEvent, surfaceAudienceIds)

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
    wsManager.broadcastEventToSession(message.sessionId as UUID, chatEvent, surfaceAudienceIds)

    // Also broadcast NOTES:UPDATED so the notes panel reflects new visibility/publishedAt
    const notesUpdateEvent: EventEnvelope = {
      id: crypto.randomUUID() as UUID,
      type: 'NOTES:UPDATED',
      version: 1,
      userId: user.userId as UUID,
      userRole: requesterRole as any,
      sessionId: session.id,
      roomId: null,
      timestamp: published.updatedAt,
      payload: {
        campaignId: noteCampaignId,
        noteId: published.id,
        title: published.title,
        content: published.content,
        visibility: published.visibility,
        tags: published.tags,
        allowedUsers: published.allowedUsers,
        publishedAt: published.publishedAt,
      },
    }
    wsManager.broadcastEventToSession(
      session.id,
      notesUpdateEvent,
      noteVisibleTo({
        authorId: published.authorId,
        visibility: published.visibility,
        allowedUsers: published.allowedUsers,
        dmId: session.dmId,
      })
    )
  }

  return res.status(200).json({ ok: true, message })
})

router.delete('/:noteId', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { noteId } = req.params

  if (!isValidUUID(noteId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_NOTE_ID, message: 'Invalid noteId' })
  }

  try {
    const existingNote = await getNoteById(noteId as UUID)
    if (!existingNote) {
      return res.status(404).json({ code: ErrorCode.NOTE_NOT_FOUND, message: 'Note not found' })
    }

    let noteCampaignId: UUID | undefined = existingNote.campaignId ?? undefined
    if (!noteCampaignId && existingNote.sessionId) {
      const noteSessionRecord = await findSessionById(existingNote.sessionId as string)
      noteCampaignId = (noteSessionRecord?.campaignId as UUID | null) ?? undefined
    }
    if (!noteCampaignId) {
      logger.error('notes.routes', 'DELETE /:noteId — note has no campaignId', { noteId })
      return res.status(500).json({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Note is missing campaign context; cannot delete',
      })
    }

    const deleteRole = await resolveCampaignRole(noteCampaignId, user.userId as UUID)
    if (!deleteRole) {
      return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a campaign member' })
    }

    const note = await deleteNote(noteId as UUID, user.userId as UUID, deleteRole)
    if (!note) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'Cannot delete note (not found or insufficient permissions)',
      })
    }

    // Only emit session-scoped events if the note was linked to a session
    const deleteSession = note.sessionId ? await getSession(note.sessionId) : null

    if (deleteSession) {
      await appendSessionAuditEvent({
        sessionId: deleteSession.id,
        campaignId: noteCampaignId,
        actorUserId: user.userId as UUID,
        actorRole: deleteRole,
        actionType: 'NOTES.DELETED',
        targetType: 'NOTE',
        targetId: note.id,
        visibilityClass: 'SYSTEM',
        timestamp: Date.now(),
        metadata: {
          deletedBy: user.userId as UUID,
        },
      })
    }

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager && deleteSession) {
      const event: EventEnvelope = {
        id: crypto.randomUUID() as UUID,
        type: 'NOTES:DELETED',
        version: 1,
        userId: user.userId as UUID,
        userRole: deleteRole as any,
        sessionId: deleteSession.id,
        roomId: null,
        timestamp: Date.now(),
        payload: {
          campaignId: noteCampaignId,
          noteId: note.id,
        },
      }
      wsManager.broadcastEventToSession(deleteSession.id, event)
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    logger.error('notes.routes', 'DELETE /:noteId — unexpected error', { noteId, err })
    return res
      .status(500)
      .json({ code: ErrorCode.INTERNAL_ERROR, message: 'Unable to delete note' })
  }
})

export default router
