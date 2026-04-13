import { PrismaClient, Message, MessageType } from '@prisma/client'
import { NotFoundError, ValidationError, ForbiddenError } from '@/types'
import { validateUUID, validateMessageContent } from '@/utils/validation'
import { logger } from '@/utils/logger'

export class ChatService {
  constructor(private prisma: PrismaClient) { }

  async sendMessage(
    sessionId: string,
    roomId: string,
    authorId: string,
    content: string,
    isDmOnly: boolean = false,
    type: MessageType = 'TEXT'
  ): Promise<Message> {
    logger.info('ChatService', 'Sending message', {
      sessionId,
      roomId,
      authorId,
      isDmOnly,
    })

    validateUUID(sessionId, 'sessionId')
    validateUUID(roomId, 'roomId')
    validateUUID(authorId, 'authorId')
    validateMessageContent(content)

    // Verify session exists
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    })
    if (!session) {
      throw new NotFoundError('Session')
    }

    // Verify room exists and belongs to session
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
    })
    if (!room || room.sessionId !== sessionId) {
      throw new NotFoundError('Room')
    }

    // Verify user is member of session
    const member = await this.prisma.sessionMember.findFirst({
      where: {
        sessionId,
        userId: authorId,
      },
    })
    if (!member) {
      throw new ForbiddenError('User is not a member of this session')
    }

    // Get author info
    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
    })
    if (!author) {
      throw new NotFoundError('User')
    }

    // For DM-only messages, verify sender is DM
    if (isDmOnly && session.dm !== author.username) {
      throw new ForbiddenError('Only DMs can send DM-only messages')
    }

    // Create message
    const message = await this.prisma.message.create({
      data: {
        sessionId,
        roomId,
        authorId,
        content,
        isDmOnly,
        type,
        isSystemMessage: type === 'SYSTEM',
      },
    })

    logger.info('ChatService', 'Message sent', {
      messageId: message.id,
      sessionId,
      roomId,
    })

    return message
  }

  async getRoomMessages(
    sessionId: string,
    roomId: string,
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Message[]> {
    validateUUID(sessionId, 'sessionId')
    validateUUID(roomId, 'roomId')
    validateUUID(userId, 'userId')

    if (limit < 1 || limit > 100) {
      throw new ValidationError('Limit must be between 1 and 100')
    }

    // Verify user is member and can access room
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    })
    if (!session) {
      throw new NotFoundError('Session')
    }

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

    // Get messages, filtering DM-only if user is not DM
    const messages = await this.prisma.message.findMany({
      where: {
        sessionId,
        roomId,
        OR: isSessionDm
          ? [
            { isDmOnly: true },
            { isDmOnly: false },
          ]
          : [
            { isDmOnly: false },
            { isSystemMessage: true },
          ],
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    })

    return messages.reverse()
  }

  async getSessionMessages(
    sessionId: string,
    userId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<Message[]> {
    validateUUID(sessionId, 'sessionId')
    validateUUID(userId, 'userId')

    if (limit < 1 || limit > 100) {
      throw new ValidationError('Limit must be between 1 and 100')
    }

    // Verify user is member
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    })
    if (!session) {
      throw new NotFoundError('Session')
    }

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

    // Get all messages in session, filtering by visibility
    const messages = await this.prisma.message.findMany({
      where: {
        sessionId,
        OR: isSessionDm
          ? [
            { isDmOnly: true },
            { isDmOnly: false },
          ]
          : [
            { isDmOnly: false },
            { isSystemMessage: true },
          ],
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    })

    return messages.reverse()
  }

  async deleteMessage(sessionId: string, messageId: string, userId: string): Promise<void> {
    logger.info('ChatService', 'Deleting message', { messageId, sessionId, userId })

    validateUUID(sessionId, 'sessionId')
    validateUUID(messageId, 'messageId')
    validateUUID(userId, 'userId')

    // Get session and message
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    })
    if (!session) {
      throw new NotFoundError('Session')
    }

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    })
    if (!message || message.sessionId !== sessionId) {
      throw new NotFoundError('Message')
    }

    // Only author or DM can delete
    if (message.authorId !== userId && session.dmId !== userId) {
      throw new ForbiddenError('Only message author or DM can delete messages')
    }

    await this.prisma.message.delete({
      where: { id: messageId },
    })

    logger.info('ChatService', 'Message deleted', { messageId })
  }

  async sendSystemMessage(
    sessionId: string,
    roomId: string,
    content: string
  ): Promise<Message> {
    logger.info('ChatService', 'Sending system message', { sessionId, roomId })

    return this.sendMessage(sessionId, roomId, '', content, false, 'SYSTEM')
  }
}
