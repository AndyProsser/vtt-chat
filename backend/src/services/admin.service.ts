import { getPrismaClient } from '@/infra/db'
import { hashPassword, verifyPassword } from '@/utils/auth'
import { isPasswordValid } from '@/utils/password'
import { AppError } from '@/types'

const prisma = getPrismaClient()

/**
 * Admin user service for managing admin accounts
 */

export class AdminService {
  /**
   * Check if any admin users exist in the system
   */
  static async adminUsersExist(): Promise<boolean> {
    const count = await prisma.adminUser.count()
    return count > 0
  }

  /**
   * Create the initial admin user (setup)
   * Only allowed if no admin users exist yet
   */
  static async createInitialAdmin(
    email: string,
    username: string,
    password: string
  ): Promise<{ id: string; email: string; username: string }> {
    // Check if admin users already exist
    const adminsExist = await this.adminUsersExist()
    if (adminsExist) {
      throw new AppError(403, 'Admin user already exists. Cannot create another.', 'ADMIN_EXISTS')
    }

    // Validate password
    if (!isPasswordValid(password)) {
      throw new AppError(400, 'Password does not meet security requirements', 'INVALID_PASSWORD')
    }

    // Check if email or username already exists
    const existingEmail = await prisma.adminUser.findUnique({
      where: { email },
    })

    if (existingEmail) {
      throw new AppError(409, 'Email already in use', 'EMAIL_IN_USE')
    }

    const existingUsername = await prisma.adminUser.findUnique({
      where: { username },
    })

    if (existingUsername) {
      throw new AppError(409, 'Username already in use', 'USERNAME_IN_USE')
    }

    // Hash password
    const hashedPassword = await hashPassword(password)

    // Create admin user
    const admin = await prisma.adminUser.create({
      data: {
        email,
        username,
        password: hashedPassword,
      },
    })

    return {
      id: admin.id,
      email: admin.email,
      username: admin.username,
    }
  }

  /**
   * Authenticate an admin user
   */
  static async authenticateAdmin(
    username: string,
    password: string
  ): Promise<{ id: string; username: string; email: string }> {
    const admin = await prisma.adminUser.findUnique({
      where: { username },
    })

    if (!admin) {
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS')
    }

    if (!admin.isActive) {
      throw new AppError(403, 'Admin account is deactivated', 'ACCOUNT_DEACTIVATED')
    }

    const passwordValid = await verifyPassword(password, admin.password)
    if (!passwordValid) {
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS')
    }

    return {
      id: admin.id,
      username: admin.username,
      email: admin.email,
    }
  }

  /**
   * Get admin user by ID
   */
  static async getAdminById(adminId: string): Promise<{
    id: string
    username: string
    email: string
    isActive: boolean
    createdAt: Date
  } | null> {
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
    })

    if (!admin) {
      return null
    }

    return {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
    }
  }

  /**
   * Update admin password
   */
  static async updatePassword(
    adminId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
    })

    if (!admin) {
      throw new AppError(404, 'Admin user not found', 'NOT_FOUND')
    }

    // Verify current password
    const currentPasswordValid = await verifyPassword(currentPassword, admin.password)
    if (!currentPasswordValid) {
      throw new AppError(401, 'Current password is incorrect', 'INVALID_PASSWORD')
    }

    // Validate new password
    if (!isPasswordValid(newPassword)) {
      throw new AppError(
        400,
        'New password does not meet security requirements',
        'INVALID_PASSWORD'
      )
    }

    // Prevent reuse of same password
    const samePassword = await verifyPassword(newPassword, admin.password)
    if (samePassword) {
      throw new AppError(
        400,
        'New password cannot be the same as current password',
        'SAME_PASSWORD'
      )
    }

    const hashedPassword = await hashPassword(newPassword)

    await prisma.adminUser.update({
      where: { id: adminId },
      data: { password: hashedPassword },
    })
  }
}
