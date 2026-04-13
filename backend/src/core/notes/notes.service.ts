import { PrismaClient, Note } from '@prisma/client'
import { NotFoundError, ForbiddenError, ValidationError } from '@/types'
import { validateUUID } from '@/utils/validation'
import { logger } from '@/utils/logger'

export class NoteService {
  constructor(private prisma: PrismaClient) { }

  async createNote(
    sessionId: string,
    authorId: string,
    title: string,
    content: string,
    visibility: 'DM_ONLY' | 'PLAYERS_VISIBLE' | 'CUSTOM' = 'DM_ONLY',
    tags: string[] = []
  ): Promise<Note> {
    logger.info('NoteService', 'Creating note', { sessionId, visibility, title })

    validateUUID(sessionId, 'sessionId')
    validateUUID(authorId, 'authorId')

    if (!title || title.length === 0 || title.length > 255) {
      throw new ValidationError('Title must be 1-255 characters')
    }

    if (!content || content.length === 0 || content.length > 10000) {
      throw new ValidationError('Content must be 1-10000 characters')
    }

    // Verify session exists
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    })
    if (!session) {
      throw new NotFoundError('Session')
    }

    // Verify user is member
    const member = await this.prisma.sessionMember.findFirst({
      where: {
        sessionId,
        userId: authorId,
      },
      include: {
        user: true,
      },
    })
    if (!member) {
      throw new ForbiddenError('User is not a member of this session')
    }

    // Only DM can create notes
    if (session.dm !== member.user.username) {
      throw new ForbiddenError('Only DMs can create notes')
    }

    // Create note
    const note = await this.prisma.note.create({
      data: {
        sessionId,
        authorId,
        title,
        content,
        visibility,
      },
    })

    // Create tags
    if (tags.length > 0) {
      await this.prisma.tag.createMany({
        data: tags.map((tag) => ({
          noteId: note.id,
          name: tag,
        })),
      })
    }

    logger.info('NoteService', 'Note created', { noteId: note.id })

    return note
  }

  async getNote(sessionId: string, noteId: string, userId: string): Promise<Note> {
    validateUUID(sessionId, 'sessionId')
    validateUUID(noteId, 'noteId')
    validateUUID(userId, 'userId')

    // Get session to check role
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    })
    if (!session) {
      throw new NotFoundError('Session')
    }

    const note = await this.prisma.note.findUnique({
      where: { id: noteId },
      include: {
        tags: true,
      },
    })

    if (!note || note.sessionId !== sessionId) {
      throw new NotFoundError('Note')
    }

    // Check visibility
    const isSessionDm = session.dmId === userId
    if (!isSessionDm && note.visibility === 'DM_ONLY') {
      throw new ForbiddenError('You do not have access to this note')
    }

    return note
  }

  async getSessionNotes(
    sessionId: string,
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Note[]> {
    validateUUID(sessionId, 'sessionId')
    validateUUID(userId, 'userId')

    if (limit < 1 || limit > 100) {
      throw new ValidationError('Limit must be between 1 and 100')
    }

    // Verify session
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    })
    if (!session) {
      throw new NotFoundError('Session')
    }

    // Verify user is member
    const member = await this.prisma.sessionMember.findFirst({
      where: {
        sessionId,
        userId,
      },
    })
    if (!member) {
      throw new ForbiddenError('User is not a member of this session')
    }

    const isSessionDm = session.dmId === userId

    // Get notes filtered by visibility
    const notes = await this.prisma.note.findMany({
      where: {
        sessionId,
        OR: isSessionDm
          ? [
            { visibility: 'DM_ONLY' },
            { visibility: 'PLAYERS_VISIBLE' },
            { visibility: 'CUSTOM' },
          ]
          : [
            { visibility: 'PLAYERS_VISIBLE' },
          ],
      },
      include: {
        tags: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    })

    return notes
  }

  async updateNote(
    sessionId: string,
    noteId: string,
    userId: string,
    title?: string,
    content?: string,
    visibility?: 'DM_ONLY' | 'PLAYERS_VISIBLE' | 'CUSTOM'
  ): Promise<Note> {
    logger.info('NoteService', 'Updating note', { noteId, sessionId })

    validateUUID(sessionId, 'sessionId')
    validateUUID(noteId, 'noteId')
    validateUUID(userId, 'userId')

    // Get note and verify ownership
    const note = await this.prisma.note.findUnique({
      where: { id: noteId },
    })

    if (!note || note.sessionId !== sessionId) {
      throw new NotFoundError('Note')
    }

    if (note.authorId !== userId) {
      throw new ForbiddenError('Only creator can update note')
    }

    const updated = await this.prisma.note.update({
      where: { id: noteId },
      data: {
        title: title || note.title,
        content: content || note.content,
        visibility: visibility || note.visibility,
        updatedAt: new Date(),
      },
      include: {
        tags: true,
      },
    })

    logger.info('NoteService', 'Note updated', { noteId })

    return updated
  }

  async deleteNote(sessionId: string, noteId: string, userId: string): Promise<void> {
    logger.info('NoteService', 'Deleting note', { noteId, sessionId })

    validateUUID(sessionId, 'sessionId')
    validateUUID(noteId, 'noteId')
    validateUUID(userId, 'userId')

    // Get note and verify ownership
    const note = await this.prisma.note.findUnique({
      where: { id: noteId },
    })

    if (!note || note.sessionId !== sessionId) {
      throw new NotFoundError('Note')
    }

    if (note.authorId !== userId) {
      throw new ForbiddenError('Only creator can delete note')
    }

    await this.prisma.note.delete({
      where: { id: noteId },
    })

    logger.info('NoteService', 'Note deleted', { noteId })
  }
}
