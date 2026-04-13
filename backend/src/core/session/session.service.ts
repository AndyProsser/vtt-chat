import { PrismaClient, Session, SessionMember, SessionBoundary } from '@prisma/client'
import { NotFoundError, ValidationError } from '@/types'
import { validateSessionName, validateUUID } from '@/utils/validation'
import { logger } from '@/utils/logger'

export class SessionService {
  constructor(private prisma: PrismaClient) { }

  async createSession(dmUsername: string, name: string, description?: string): Promise<Session> {
    logger.info('SessionService', 'Creating session', { dmUsername, name })

    validateSessionName(name)

    // Verify DM exists
    const dm = await this.prisma.user.findUnique({
      where: { username: dmUsername },
    })

    if (!dm) {
      throw new NotFoundError('User')
    }

    // Create session
    const session = await this.prisma.session.create({
      data: {
        name,
        description: description || null,
        dm: dmUsername,
        isActive: true,
        isArchived: false,
      },
    })

    // Create main room
    await this.prisma.room.create({
      data: {
        sessionId: session.id,
        name: 'Main',
        type: 'MAIN',
        isActive: true,
      },
    })

    logger.info('SessionService', 'Session created', { sessionId: session.id })

    return session
  }

  async getSession(sessionId: string): Promise<Session> {
    validateUUID(sessionId, 'sessionId')

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    })

    if (!session) {
      throw new NotFoundError('Session')
    }

    return session
  }

  async getSessionMembers(sessionId: string): Promise<SessionMember[]> {
    validateUUID(sessionId, 'sessionId')

    const session = await this.getSession(sessionId)

    const members = await this.prisma.sessionMember.findMany({
      where: { sessionId: session.id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            role: true,
          },
        },
        room: true,
      },
    })

    return members
  }

  async addMemberToSession(
    sessionId: string,
    userId: string,
    roomId: string
  ): Promise<SessionMember> {
    logger.info('SessionService', 'Adding member to session', {
      sessionId,
      userId,
      roomId,
    })

    validateUUID(sessionId, 'sessionId')
    validateUUID(userId, 'userId')
    validateUUID(roomId, 'roomId')

    // Verify session, user, and room exist
    const session = await this.getSession(sessionId)

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    })
    if (!user) {
      throw new NotFoundError('User')
    }

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
    })
    if (!room || room.sessionId !== session.id) {
      throw new NotFoundError('Room')
    }

    // Check if already a member
    const existing = await this.prisma.sessionMember.findFirst({
      where: {
        sessionId,
        userId,
      },
    })

    if (existing) {
      throw new ValidationError('User is already a member of this session')
    }

    // Create session member
    const member = await this.prisma.sessionMember.create({
      data: {
        sessionId,
        userId,
        roomId,
      },
      include: {
        user: true,
        room: true,
      },
    })

    logger.info('SessionService', 'Member added to session', {
      sessionId,
      userId,
    })

    return member
  }

  async removeMemberFromSession(sessionId: string, userId: string): Promise<void> {
    logger.info('SessionService', 'Removing member from session', {
      sessionId,
      userId,
    })

    validateUUID(sessionId, 'sessionId')
    validateUUID(userId, 'userId')

    const member = await this.prisma.sessionMember.findFirst({
      where: {
        sessionId,
        userId,
      },
    })

    if (!member) {
      throw new NotFoundError('Session member')
    }

    // Clean up player conditions for this user in this session
    await this.prisma.playerCondition.deleteMany({
      where: {
        userId,
        session: {
          id: sessionId,
        },
      },
    })

    await this.prisma.sessionMember.delete({
      where: { id: member.id },
    })

    logger.info('SessionService', 'Member removed from session', {
      sessionId,
      userId,
    })
  }

  async endSession(sessionId: string): Promise<Session> {
    logger.info('SessionService', 'Ending session', { sessionId })

    validateUUID(sessionId, 'sessionId')

    const session = await this.getSession(sessionId)

    // Create session boundary for lazy-loading
    await this.prisma.sessionBoundary.create({
      data: {
        sessionId,
        endedAt: new Date(),
      },
    })

    // Update session
    const updated = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        isActive: false,
        endedAt: new Date(),
      },
    })

    // Deactivate rooms
    await this.prisma.room.updateMany({
      where: { sessionId },
      data: { isActive: false },
    })

    logger.info('SessionService', 'Session ended', { sessionId })

    return updated
  }

  async archiveSession(sessionId: string): Promise<Session> {
    logger.info('SessionService', 'Archiving session', { sessionId })

    validateUUID(sessionId, 'sessionId')

    const updated = await this.prisma.session.update({
      where: { id: sessionId },
      data: { isArchived: true },
    })

    logger.info('SessionService', 'Session archived', { sessionId })

    return updated
  }

  async getUserSessions(userId: string, includeArchived: boolean = false): Promise<Session[]> {
    validateUUID(userId, 'userId')

    const sessions = await this.prisma.session.findMany({
      where: {
        OR: [
          {
            dmId: userId,
          },
          {
            members: {
              some: {
                userId,
              },
            },
          },
        ],
        isArchived: includeArchived ? undefined : false,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return sessions
  }
}
