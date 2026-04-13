import { PrismaClient, Room, RoomMember } from '@prisma/client'
import { NotFoundError, ValidationError, ForbiddenError } from '@/types'
import { validateUUID } from '@/utils/validation'
import { logger } from '@/utils/logger'

export class RoomService {
  constructor(private prisma: PrismaClient) { }

  async createRoom(
    sessionId: string,
    name: string,
    type: 'MAIN' | 'GROUP' | 'PRIVATE' = 'GROUP'
  ): Promise<Room> {
    logger.info('RoomService', 'Creating room', { sessionId, name, type })

    validateUUID(sessionId, 'sessionId')

    if (!name || name.length === 0 || name.length > 100) {
      throw new ValidationError('Room name must be 1-100 characters')
    }

    // Verify session exists
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    })
    if (!session) {
      throw new NotFoundError('Session')
    }

    // Can't create multiple main rooms
    if (type === 'MAIN') {
      const existing = await this.prisma.room.findFirst({
        where: {
          sessionId,
          type: 'MAIN',
        },
      })
      if (existing) {
        throw new ValidationError('Session already has a main room')
      }
    }

    // Create room
    const room = await this.prisma.room.create({
      data: {
        sessionId,
        name,
        type,
        isActive: true,
      },
    })

    logger.info('RoomService', 'Room created', { roomId: room.id })

    return room
  }

  async getRoom(sessionId: string, roomId: string): Promise<Room> {
    validateUUID(sessionId, 'sessionId')
    validateUUID(roomId, 'roomId')

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
    })

    if (!room || room.sessionId !== sessionId) {
      throw new NotFoundError('Room')
    }

    return room
  }

  async getSessionRooms(sessionId: string): Promise<Room[]> {
    validateUUID(sessionId, 'sessionId')

    // Verify session exists
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    })
    if (!session) {
      throw new NotFoundError('Session')
    }

    const rooms = await this.prisma.room.findMany({
      where: {
        sessionId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    return rooms
  }

  async getRoomMembers(sessionId: string, roomId: string): Promise<RoomMember[]> {
    validateUUID(sessionId, 'sessionId')
    validateUUID(roomId, 'roomId')

    // Verify room exists
    const room = await this.getRoom(sessionId, roomId)

    const members = await this.prisma.roomMember.findMany({
      where: {
        roomId: room.id,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            role: true,
          },
        },
      },
    })

    return members
  }

  async addUserToRoom(sessionId: string, roomId: string, userId: string): Promise<RoomMember> {
    logger.info('RoomService', 'Adding user to room', { sessionId, roomId, userId })

    validateUUID(sessionId, 'sessionId')
    validateUUID(roomId, 'roomId')
    validateUUID(userId, 'userId')

    // Verify room exists
    const room = await this.getRoom(sessionId, roomId)

    // Verify user is session member
    const member = await this.prisma.sessionMember.findFirst({
      where: {
        sessionId,
        userId,
      },
    })
    if (!member) {
      throw new ForbiddenError('User is not a member of this session')
    }

    // Check if already in room
    const existing = await this.prisma.roomMember.findFirst({
      where: {
        roomId: room.id,
        userId,
      },
    })
    if (existing) {
      throw new ValidationError('User is already a member of this room')
    }

    // Add to room
    const roomMember = await this.prisma.roomMember.create({
      data: {
        roomId: room.id,
        userId,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            role: true,
          },
        },
      },
    })

    logger.info('RoomService', 'User added to room', { roomId, userId })

    return roomMember
  }

  async removeUserFromRoom(
    sessionId: string,
    roomId: string,
    userId: string
  ): Promise<void> {
    logger.info('RoomService', 'Removing user from room', { sessionId, roomId, userId })

    validateUUID(sessionId, 'sessionId')
    validateUUID(roomId, 'roomId')
    validateUUID(userId, 'userId')

    // Verify room exists
    const room = await this.getRoom(sessionId, roomId)

    // Find room member
    const member = await this.prisma.roomMember.findFirst({
      where: {
        roomId: room.id,
        userId,
      },
    })
    if (!member) {
      throw new NotFoundError('User is not a member of this room')
    }

    await this.prisma.roomMember.delete({
      where: { id: member.id },
    })

    logger.info('RoomService', 'User removed from room', { roomId, userId })
  }

  async setRoomEnvironment(
    sessionId: string,
    roomId: string,
    environmentId: string
  ): Promise<Room> {
    logger.info('RoomService', 'Setting room environment', {
      sessionId,
      roomId,
      environmentId,
    })

    validateUUID(sessionId, 'sessionId')
    validateUUID(roomId, 'roomId')
    validateUUID(environmentId, 'environmentId')

    // Verify room exists
    const room = await this.getRoom(sessionId, roomId)

    // Verify environment exists
    const environment = await this.prisma.roomEnvironment.findUnique({
      where: { id: environmentId },
    })
    if (!environment) {
      throw new NotFoundError('Room environment')
    }

    // Update room
    const updated = await this.prisma.room.update({
      where: { id: room.id },
      data: {
        environmentId,
      },
    })

    logger.info('RoomService', 'Room environment set', { roomId })

    return updated
  }

  async deactivateRoom(sessionId: string, roomId: string): Promise<Room> {
    logger.info('RoomService', 'Deactivating room', { sessionId, roomId })

    validateUUID(sessionId, 'sessionId')
    validateUUID(roomId, 'roomId')

    // Verify room exists and is not main room
    const room = await this.getRoom(sessionId, roomId)

    if (room.type === 'MAIN') {
      throw new ValidationError('Cannot deactivate main room')
    }

    const updated = await this.prisma.room.update({
      where: { id: room.id },
      data: {
        isActive: false,
      },
    })

    logger.info('RoomService', 'Room deactivated', { roomId })

    return updated
  }
}
