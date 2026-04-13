import { PrismaClient, Metadata } from '@prisma/client'
import { NotFoundError, ForbiddenError, ValidationError } from '@/types'
import { validateUUID } from '@/utils/validation'
import { logger } from '@/utils/logger'

export class MetadataService {
  constructor(private prisma: PrismaClient) { }

  async createMetadata(
    sessionId: string,
    roomId: string,
    authorId: string,
    type: string,
    title: string,
    description?: string,
    tags: string[] = []
  ): Promise<Metadata> {
    logger.info('MetadataService', 'Creating metadata', {
      sessionId,
      roomId,
      type,
      title,
    })

    validateUUID(sessionId, 'sessionId')
    validateUUID(roomId, 'roomId')
    validateUUID(authorId, 'authorId')

    if (!title || title.length === 0 || title.length > 255) {
      throw new ValidationError('Title must be 1-255 characters')
    }

    // Verify session and room
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    })
    if (!session) {
      throw new NotFoundError('Session')
    }

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
    })
    if (!room || room.sessionId !== sessionId) {
      throw new NotFoundError('Room')
    }

    // Verify user is member and is DM
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

    if (session.dm !== member.user.username) {
      throw new ForbiddenError('Only DMs can create metadata')
    }

    // Create metadata
    const metadata = await this.prisma.metadata.create({
      data: {
        sessionId,
        roomId,
        authorId,
        type,
        title,
        description: description || null,
      },
    })

    // Create tags
    if (tags.length > 0) {
      await this.prisma.tag.createMany({
        data: tags.map((tag) => ({
          metadataId: metadata.id,
          name: tag,
        })),
      })
    }

    logger.info('MetadataService', 'Metadata created', { metadataId: metadata.id })

    return metadata
  }

  async getMetadata(sessionId: string, metadataId: string): Promise<Metadata> {
    validateUUID(sessionId, 'sessionId')
    validateUUID(metadataId, 'metadataId')

    const metadata = await this.prisma.metadata.findUnique({
      where: { id: metadataId },
      include: {
        tags: true,
      },
    })

    if (!metadata || metadata.sessionId !== sessionId) {
      throw new NotFoundError('Metadata')
    }

    return metadata
  }

  async getRoomMetadata(
    sessionId: string,
    roomId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Metadata[]> {
    validateUUID(sessionId, 'sessionId')
    validateUUID(roomId, 'roomId')

    if (limit < 1 || limit > 100) {
      throw new ValidationError('Limit must be between 1 and 100')
    }

    // Verify room exists
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
    })
    if (!room || room.sessionId !== sessionId) {
      throw new NotFoundError('Room')
    }

    const metadata = await this.prisma.metadata.findMany({
      where: {
        sessionId,
        roomId,
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

    return metadata
  }

  async updateMetadata(
    sessionId: string,
    metadataId: string,
    userId: string,
    title?: string,
    description?: string
  ): Promise<Metadata> {
    logger.info('MetadataService', 'Updating metadata', { metadataId, sessionId })

    validateUUID(sessionId, 'sessionId')
    validateUUID(metadataId, 'metadataId')
    validateUUID(userId, 'userId')

    // Get metadata and verify ownership
    const metadata = await this.getMetadata(sessionId, metadataId)
    if (metadata.authorId !== userId) {
      throw new ForbiddenError('Only creator can update metadata')
    }

    const updated = await this.prisma.metadata.update({
      where: { id: metadataId },
      data: {
        title: title || metadata.title,
        description: description ?? metadata.description,
        updatedAt: new Date(),
      },
      include: {
        tags: true,
      },
    })

    logger.info('MetadataService', 'Metadata updated', { metadataId })

    return updated
  }

  async deleteMetadata(
    sessionId: string,
    metadataId: string,
    userId: string
  ): Promise<void> {
    logger.info('MetadataService', 'Deleting metadata', { metadataId, sessionId })

    validateUUID(sessionId, 'sessionId')
    validateUUID(metadataId, 'metadataId')
    validateUUID(userId, 'userId')

    // Get metadata and verify ownership
    const metadata = await this.getMetadata(sessionId, metadataId)
    if (metadata.authorId !== userId) {
      throw new ForbiddenError('Only creator can delete metadata')
    }

    await this.prisma.metadata.delete({
      where: { id: metadataId },
    })

    logger.info('MetadataService', 'Metadata deleted', { metadataId })
  }
}
