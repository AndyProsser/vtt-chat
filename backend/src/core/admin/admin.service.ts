import { PrismaClient, User, Session } from '@prisma/client'
import { NotFoundError, ValidationError } from '@/types'
import { validateUUID } from '@/utils/validation'
import { logger } from '@/utils/logger'

export class AdminService {
  constructor(private prisma: PrismaClient) { }

  // ============================================================================
  // User Management
  // ============================================================================

  async getAllUsers(limit: number = 50, offset: number = 0): Promise<{
    users: User[]
    total: number
  }> {
    logger.info('AdminService', 'Fetching all users', { limit, offset })

    if (limit < 1 || limit > 100) {
      throw new ValidationError('Limit must be between 1 and 100')
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isAdmin: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        skip: offset,
      }),
      this.prisma.user.count(),
    ])

    return { users: users as any, total }
  }

  async getUserDetails(userId: string): Promise<any> {
    validateUUID(userId, 'userId')

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            sessions: true,
            messages: true,
            notes: true,
            metadata: true,
          },
        },
      },
    })

    if (!user) {
      throw new NotFoundError('User')
    }

    return user
  }

  async toggleUserActive(userId: string, isActive: boolean): Promise<User> {
    logger.info('AdminService', 'Toggling user active status', { userId, isActive })

    validateUUID(userId, 'userId')

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    })
    if (!user) {
      throw new NotFoundError('User')
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
    })

    logger.info('AdminService', 'User active status updated', { userId, isActive })

    return updated
  }

  // ============================================================================
  // Campaign Management
  // ============================================================================

  async getAllSessions(limit: number = 50, offset: number = 0): Promise<{
    sessions: any[]
    total: number
  }> {
    logger.info('AdminService', 'Fetching all sessions', { limit, offset })

    if (limit < 1 || limit > 100) {
      throw new ValidationError('Limit must be between 1 and 100')
    }

    const [sessions, total] = await Promise.all([
      this.prisma.session.findMany({
        include: {
          dm: {
            select: { id: true, username: true },
          },
          _count: {
            select: { members: true, rooms: true, messages: true },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        skip: offset,
      }),
      this.prisma.session.count(),
    ])

    return { sessions, total }
  }

  async getSessionDetails(sessionId: string): Promise<any> {
    validateUUID(sessionId, 'sessionId')

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        dm: {
          select: { id: true, username: true, email: true },
        },
        members: {
          select: {
            userId: true,
            user: {
              select: { id: true, username: true },
            },
          },
        },
        rooms: {
          select: {
            id: true,
            name: true,
            type: true,
            isActive: true,
          },
        },
        _count: {
          select: { messages: true, notes: true, metadata: true },
        },
      },
    })

    if (!session) {
      throw new NotFoundError('Session')
    }

    return session
  }

  async deleteSession(sessionId: string): Promise<void> {
    logger.info('AdminService', 'Deleting session', { sessionId })

    validateUUID(sessionId, 'sessionId')

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    })
    if (!session) {
      throw new NotFoundError('Session')
    }

    // Cascade delete - Prisma will handle onDelete: Cascade
    await this.prisma.session.delete({
      where: { id: sessionId },
    })

    logger.info('AdminService', 'Session deleted', { sessionId })
  }

  // ============================================================================
  // Export & Analytics
  // ============================================================================

  async getSessionExportData(sessionId: string): Promise<any> {
    logger.info('AdminService', 'Exporting session data', { sessionId })

    validateUUID(sessionId, 'sessionId')

    const session = await this.getSessionDetails(sessionId)

    const [messages, metadata, notes] = await Promise.all([
      this.prisma.message.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.metadata.findMany({
        where: { sessionId },
        include: { tags: true },
      }),
      this.prisma.note.findMany({
        where: { sessionId },
        include: { tags: true },
      }),
    ])

    return {
      session,
      messages,
      metadata,
      notes,
      exportedAt: new Date().toISOString(),
    }
  }

  async getAnalytics(): Promise<any> {
    logger.info('AdminService', 'Fetching analytics data')

    const [
      totalUsers,
      activeSessions,
      archivedSessions,
      totalMessages,
      totalMetadata,
      totalNotes,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.session.count({ where: { isActive: true } }),
      this.prisma.session.count({ where: { isArchived: true } }),
      this.prisma.message.count(),
      this.prisma.metadata.count(),
      this.prisma.note.count(),
    ])

    // Get last 7 days of data
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const [
      newUsersLastWeek,
      newSessionsLastWeek,
      messagesLastWeek,
    ] = await Promise.all([
      this.prisma.user.count({
        where: { createdAt: { gte: sevenDaysAgo } },
      }),
      this.prisma.session.count({
        where: { createdAt: { gte: sevenDaysAgo } },
      }),
      this.prisma.message.count({
        where: { createdAt: { gte: sevenDaysAgo } },
      }),
    ])

    return {
      totalUsers,
      activeSessions,
      archivedSessions,
      totalMessages,
      totalMetadata,
      totalNotes,
      lastWeek: {
        newUsers: newUsersLastWeek,
        newSessions: newSessionsLastWeek,
        messages: messagesLastWeek,
      },
      generatedAt: new Date().toISOString(),
    }
  }

  // ============================================================================
  // Platform Status
  // ============================================================================

  async getPlatformStatus(): Promise<any> {
    logger.info('AdminService', 'Fetching platform status')

    const [
      userCount,
      sessionCount,
      messageCount,
      activeConnections,
      uptime,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.session.count({ where: { isActive: true } }),
      this.prisma.message.count(),
      this.getActiveConnections(),
      Promise.resolve(process.uptime()),
    ])

    return {
      status: 'operational',
      database: {
        users: userCount,
        activeSessions: sessionCount,
        messages: messageCount,
      },
      service: {
        activeConnections,
        uptime: Math.floor(uptime),
        timestamp: new Date().toISOString(),
      },
      backend: {
        version: process.env.npm_package_version || 'unknown',
        environment: process.env.NODE_ENV || 'unknown',
      },
    }
  }

  private async getActiveConnections(): Promise<number> {
    // TODO: Integrate with actual connection tracking
    // For now, return a placeholder
    return 0
  }
}
