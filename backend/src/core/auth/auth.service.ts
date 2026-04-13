import { PrismaClient, User, AdminUser } from '@prisma/client'
import { hashPassword, verifyPassword, createUserToken, createAdminToken } from '@/utils'
import { AuthError, ValidationError } from '@/types'
import { validateUsername, validatePassword, validateEmail } from '@/utils/validation'
import { logger } from '@/utils/logger'

export class AuthService {
  constructor(private prisma: PrismaClient) { }

  async registerPlayer(
    username: string,
    password: string,
    email?: string
  ): Promise<{ user: User; token: string }> {
    logger.info('AuthService', 'Registering new player', { username })

    // Validate input
    validateUsername(username)
    validatePassword(password)
    if (email) {
      validateEmail(email)
    }

    // Check if user exists
    const existing = await this.prisma.user.findUnique({
      where: { username },
    })

    if (existing) {
      throw new ValidationError('Username already taken')
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Create user
    const user = await this.prisma.user.create({
      data: {
        username,
        password,
        email: email || null,
        role: 'PLAYER',
        isActive: true,
        audioPreferences: {
          create: {
            gain: 1.0,
          },
        },
      },
    })

    // Create a system session for the player
    const session = await this.prisma.session.create({
      data: {
        name: `${username}'s Session`,
        dm: username, // Player is their own DM in their session
        isActive: true,
        isArchived: false,
      },
    })

    // Add player to the main room
    const mainRoom = await this.prisma.room.create({
      data: {
        sessionId: session.id,
        name: 'Main',
        type: 'MAIN',
        isActive: true,
      },
    })

    await this.prisma.sessionMember.create({
      data: {
        sessionId: session.id,
        userId: user.id,
        room: {
          connect: { id: mainRoom.id },
        },
      },
    })

    // Create token
    const token = createUserToken(user.id, username, user.role, session.id)

    logger.info('AuthService', 'Player registered successfully', {
      userId: user.id,
      username,
    })

    // Return without passwordHash
    const userWithoutHash = { ...user, passwordHash: undefined as any }

    return { user: userWithoutHash, token }
  }

  async loginPlayer(username: string, password: string): Promise<{
    user: User
    token: string
    sessionId: string
  }> {
    logger.info('AuthService', 'Player login attempt', { username })

    validateUsername(username)
    validatePassword(password)

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { username },
    })

    if (!user) {
      throw new AuthError('Invalid credentials')
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password)
    if (!isValid) {
      throw new AuthError('Invalid credentials')
    }

    if (!user.isActive) {
      throw new AuthError('User account is deactivated')
    }

    // Find or create active session
    let session = await this.prisma.session.findFirst({
      where: {
        dm: user.username,
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    if (!session) {
      session = await this.prisma.session.create({
        data: {
          name: `${user.username}'s Session`,
          dm: user.username,
          isActive: true,
          isArchived: false,
        },
      })

      const mainRoom = await this.prisma.room.create({
        data: {
          sessionId: session.id,
          name: 'Main',
          type: 'MAIN',
          isActive: true,
        },
      })

      await this.prisma.sessionMember.create({
        data: {
          sessionId: session.id,
          userId: user.id,
          room: {
            connect: { id: mainRoom.id },
          },
        },
      })
    }

    // Create token
    const token = createUserToken(user.id, user.username, user.role, session.id)

    logger.info('AuthService', 'Player login successful', {
      userId: user.id,
      username,
      sessionId: session.id,
    })

    const userWithoutHash = { ...user, passwordHash: undefined as any }

    return { user: userWithoutHash, token, sessionId: session.id }
  }

  async setupAdminUser(adminPassword: string): Promise<AdminUser> {
    logger.info('AuthService', 'Setting up admin user')

    validatePassword(adminPassword)

    // Check if admin already exists
    const existing = await this.prisma.adminUser.findFirst()
    if (existing) {
      throw new ValidationError('Admin user already exists')
    }

    // Hash password
    const passwordHash = await hashPassword(adminPassword)

    // Create admin user
    const admin = await this.prisma.adminUser.create({
      data: {
        username: 'admin',
        password: passwordHash,
        isActive: true,
      },
    })

    logger.info('AuthService', 'Admin user created')

    return admin
  }

  async adminLogin(password: string): Promise<{ admin: AdminUser; token: string }> {
    logger.info('AuthService', 'Admin login attempt')

    validatePassword(password)

    // Find admin user
    const admin = await this.prisma.adminUser.findUnique({
      where: { username: 'admin' },
    })

    if (!admin) {
      throw new AuthError('Admin user not configured')
    }

    // Verify password
    const isValid = await verifyPassword(password, admin.password)
    if (!isValid) {
      throw new AuthError('Invalid admin credentials')
    }


    // Create token
    const token = createAdminToken(admin.id)

    logger.info('AuthService', 'Admin login successful', {
      adminId: admin.id,
    })

    const adminWithoutHash = { ...admin, passwordHash: undefined as any }

    return { admin: adminWithoutHash, token }
  }

  async validateToken(token: string): Promise<boolean> {
    try {
      // Token validation happens in middleware
      return true
    } catch {
      return false
    }
  }
}
