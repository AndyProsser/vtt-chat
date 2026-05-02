import { Router, Request, Response, NextFunction } from 'express'
import {
  isValidUUID,
  isValidNoteTitle,
  isValidNoteContent,
  isValidNoteVisibility,
  isValidTag,
  NoteVisibility,
  ErrorCode,
} from '@shared'
import type { EventEnvelope, UUID } from '@shared'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { getSession } from '@/services/session.service'
import {
  createNote,
  deleteNote,
  getNoteById,
  getVisibleNotes,
  markNotePublished,
  updateNote,
} from '@/services/notes.service'
import { MessageType } from '@shared'
import { sendMessage } from '@/services/chat.service'
import type { WebSocketManager } from '@/ws'
import { logger } from '@/utils/logger'

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

function sanitizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((tag): tag is string => isValidTag(tag))
}

function sanitizeAllowedUsers(value: unknown): UUID[] {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is UUID => isValidUUID(id))
}

function noteVisibleTo(note: {
  authorId: UUID
  visibility: NoteVisibility
  allowedUsers?: UUID[]
  dmId: UUID
}): UUID[] | undefined {
  if (note.visibility === NoteVisibility.PLAYERS_VISIBLE) {
    return undefined
  }

  const visible = new Set<UUID>([note.authorId, note.dmId])
  if (note.visibility === NoteVisibility.CUSTOM) {
    for (const userId of note.allowedUsers || []) {
      visible.add(userId)
    }
  }

  return Array.from(visible)
}

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

  const notes = await getVisibleNotes(session.id, user.userId as UUID, user.role)
  return res.status(200).json({ notes })
})

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { sessionId, title, content, visibility, tags, allowedUsers } = req.body

  if (!isValidUUID(sessionId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_SESSION, message: 'Invalid sessionId' })
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

  const session = await getSession(sessionId as UUID)
  if (!session) {
    return res.status(404).json({ code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found' })
  }

  if (visibility === NoteVisibility.DM_ONLY && user.role !== 'DM') {
    return res
      .status(403)
      .json({ code: ErrorCode.FORBIDDEN, message: 'Only DM may create DM-only notes' })
  }

  const note = await createNote({
    sessionId: session.id,
    authorId: user.userId as UUID,
    authorUsername: user.username,
    title,
    content,
    visibility,
    tags: sanitizeTags(tags),
    allowedUsers: visibility === NoteVisibility.CUSTOM ? sanitizeAllowedUsers(allowedUsers) : [],
  })

  const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
  if (wsManager) {
    const event: EventEnvelope = {
      id: crypto.randomUUID() as UUID,
      type: 'NOTES:CREATED',
      version: 1,
      userId: user.userId as UUID,
      userRole: user.role,
      sessionId: session.id,
      roomId: null,
      timestamp: note.createdAt,
      payload: {
        noteId: note.id,
        ownerId: note.authorId,
        ownerUsername: note.authorUsername,
        title: note.title,
        content: note.content,
        visibility: note.visibility,
        tags: note.tags,
        allowedUsers: note.allowedUsers,
      },
    }

    wsManager.broadcastEventToSession(
      session.id,
      event,
      noteVisibleTo({
        authorId: note.authorId,
        visibility: note.visibility,
        allowedUsers: note.allowedUsers,
        dmId: session.dmId,
      })
    )
  }

  return res.status(201).json({ note })
})

router.put('/:noteId', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { noteId } = req.params
  const { title, content, visibility, tags, allowedUsers } = req.body

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

  if (visibility === NoteVisibility.DM_ONLY && user.role !== 'DM') {
    return res
      .status(403)
      .json({ code: ErrorCode.FORBIDDEN, message: 'Only DM may set DM-only visibility' })
  }

  let note
  try {
    note = await updateNote(noteId as UUID, user.userId as UUID, user.role, {
      title,
      content,
      visibility,
      tags: tags !== undefined ? sanitizeTags(tags) : undefined,
      allowedUsers:
        visibility === NoteVisibility.CUSTOM || allowedUsers !== undefined
          ? sanitizeAllowedUsers(allowedUsers)
          : undefined,
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

  const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
  if (wsManager) {
    const event: EventEnvelope = {
      id: crypto.randomUUID() as UUID,
      type: 'NOTES:UPDATED',
      version: 1,
      userId: user.userId as UUID,
      userRole: user.role,
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

  if (!isValidUUID(noteId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_NOTE_ID, message: 'Invalid noteId' })
  }

  const note = await getNoteById(noteId as UUID)
  if (!note) {
    return res.status(404).json({ code: ErrorCode.NOTE_NOT_FOUND, message: 'Note not found' })
  }

  const visibleNotes = await getVisibleNotes(note.sessionId, user.userId as UUID, user.role)
  if (!visibleNotes.find((n) => n.id === note.id)) {
    return res.status(404).json({ code: ErrorCode.NOTE_NOT_FOUND, message: 'Note not found' })
  }

  const session = await getSession(note.sessionId)
  if (!session) {
    return res.status(404).json({ code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found' })
  }

  const published = await markNotePublished(note.id)
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
    actorRole: user.role,
    noteOwnerId: published.authorId,
    noteVisibility: published.visibility,
    publishedAt: published.publishedAt,
  })

  const snippet =
    published.content.length > 280 ? `${published.content.slice(0, 280)}...` : published.content
  const message = await sendMessage({
    sessionId: published.sessionId,
    authorId: user.userId as UUID,
    authorUsername: user.username,
    dmId: session.dmId,
    content: `[Note] ${published.title}: ${snippet}`,
    type: MessageType.SYSTEM,
  })

  const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
  if (wsManager) {
    const notesEvent: EventEnvelope = {
      id: crypto.randomUUID() as UUID,
      type: 'NOTES:UPDATED',
      version: 1,
      userId: user.userId as UUID,
      userRole: user.role,
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

    wsManager.broadcastEventToSession(
      published.sessionId,
      notesEvent,
      noteVisibleTo({
        authorId: published.authorId,
        visibility: published.visibility,
        allowedUsers: published.allowedUsers,
        dmId: session.dmId,
      })
    )

    const chatEvent: EventEnvelope = {
      id: crypto.randomUUID() as UUID,
      type: 'CHAT:MESSAGE_SENT',
      version: 1,
      userId: user.userId as UUID,
      userRole: user.role,
      sessionId: message.sessionId,
      roomId: null,
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
    wsManager.broadcastEventToSession(
      message.sessionId,
      chatEvent,
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

  const note = await deleteNote(noteId as UUID, user.userId as UUID, user.role)
  if (!note) {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message: 'Cannot delete note (not found or insufficient permissions)',
    })
  }

  const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
  if (wsManager) {
    const event: EventEnvelope = {
      id: crypto.randomUUID() as UUID,
      type: 'NOTES:DELETED',
      version: 1,
      userId: user.userId as UUID,
      userRole: user.role,
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
