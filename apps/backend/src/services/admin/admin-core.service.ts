import { getPrismaClient } from '@/infra/db'
import { hashPassword, verifyPassword } from '@/utils/auth'
import { isPasswordValid } from '@/utils/password'
import { AppError } from '@/types'
import type { AdminRole, Role } from '@prisma/client'

const prisma = getPrismaClient()

const ADMIN_ASSIGNABLE_ROLES: AdminRole[] = ['SUPER_ADMIN', 'ADMIN', 'CAMPAIGN_DM', 'READ_ONLY']

type AdminPrincipal = {
  id: string
  username: string
  email: string
  adminRole: AdminRole
}

function getEffectiveAdminRole(user: {
  role: Role
  adminRole: AdminRole | null
}): AdminRole | null {
  if (user.adminRole) {
    return user.adminRole
  }
  if (user.role === 'DM') {
    return 'CAMPAIGN_DM'
  }
  return null
}

// ─── AdminService ─────────────────────────────────────────────────────────────

export class AdminService {
  static async adminUsersExist(): Promise<boolean> {
    const count = await prisma.user.count({
      where: { adminRole: 'SUPER_ADMIN' },
    })
    return count > 0
  }

  static async createInitialAdmin(
    email: string,
    username: string,
    password: string
  ): Promise<{ id: string; email: string; username: string }> {
    const adminsExist = await this.adminUsersExist()
    if (adminsExist) {
      throw new AppError(403, 'Admin user already exists. Cannot create another.', 'ADMIN_EXISTS')
    }

    if (!isPasswordValid(password)) {
      throw new AppError(400, 'Password does not meet security requirements', 'INVALID_PASSWORD')
    }

    const existingByUsername = await prisma.user.findUnique({ where: { username } })
    const existingByEmail = await prisma.user.findFirst({ where: { email } })
    if (existingByUsername && existingByEmail && existingByUsername.id !== existingByEmail.id) {
      throw new AppError(
        409,
        'Email and username belong to different users. Resolve conflict before setup.',
        'SETUP_IDENTITY_CONFLICT'
      )
    }

    const targetUser = existingByUsername || existingByEmail
    const hashedPassword = await hashPassword(password)

    const admin = targetUser
      ? await prisma.user.update({
          where: { id: targetUser.id },
          data: {
            email,
            username,
            displayName: targetUser.displayName || username,
            password: hashedPassword,
            adminRole: 'SUPER_ADMIN',
            isActive: true,
          },
        })
      : await prisma.user.create({
          data: {
            email,
            username,
            displayName: username,
            password: hashedPassword,
            role: 'PLAYER',
            adminRole: 'SUPER_ADMIN',
            isActive: true,
          },
        })

    return {
      id: admin.id,
      email: admin.email || email,
      username: admin.username,
    }
  }

  static async authenticateAdmin(
    username: string,
    password: string
  ): Promise<{ id: string; username: string; email: string; adminRole: AdminRole }> {
    const user = await prisma.user.findUnique({ where: { username } })

    if (!user) {
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS')
    }

    const effectiveAdminRole = getEffectiveAdminRole(user)
    if (!effectiveAdminRole) {
      throw new AppError(403, 'User does not have admin access', 'ADMIN_ACCESS_REQUIRED')
    }

    if (!user.isActive) {
      throw new AppError(403, 'Admin account is deactivated', 'ACCOUNT_DEACTIVATED')
    }

    if (!user.password) {
      throw new AppError(
        403,
        'Account does not have a password set. Complete account setup first.',
        'PASSWORD_NOT_SET'
      )
    }

    const passwordValid = await verifyPassword(password, user.password)
    if (!passwordValid) {
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS')
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email || '',
      adminRole: effectiveAdminRole,
    }
  }

  static async getAdminById(adminId: string): Promise<{
    id: string
    username: string
    email: string
    adminRole: AdminRole
    isActive: boolean
    createdAt: Date
  } | null> {
    const admin = await prisma.user.findUnique({ where: { id: adminId } })

    if (!admin) {
      return null
    }

    const effectiveAdminRole = getEffectiveAdminRole(admin)
    if (!effectiveAdminRole) {
      return null
    }

    return {
      id: admin.id,
      username: admin.username,
      email: admin.email || '',
      adminRole: effectiveAdminRole,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
    }
  }

  static async updatePassword(
    adminId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const admin = await prisma.user.findUnique({ where: { id: adminId } })

    if (!admin) {
      throw new AppError(404, 'Admin user not found', 'NOT_FOUND')
    }

    if (!admin.password) {
      throw new AppError(400, 'Account does not have a password set', 'PASSWORD_NOT_SET')
    }

    const effectiveAdminRole = getEffectiveAdminRole(admin)
    if (!effectiveAdminRole) {
      throw new AppError(403, 'User does not have admin access', 'ADMIN_ACCESS_REQUIRED')
    }

    const currentPasswordValid = await verifyPassword(currentPassword, admin.password)
    if (!currentPasswordValid) {
      throw new AppError(401, 'Current password is incorrect', 'INVALID_PASSWORD')
    }

    if (!isPasswordValid(newPassword)) {
      throw new AppError(
        400,
        'New password does not meet security requirements',
        'INVALID_PASSWORD'
      )
    }

    const samePassword = await verifyPassword(newPassword, admin.password)
    if (samePassword) {
      throw new AppError(
        400,
        'New password cannot be the same as current password',
        'SAME_PASSWORD'
      )
    }

    const hashedPassword = await hashPassword(newPassword)
    await prisma.user.update({ where: { id: adminId }, data: { password: hashedPassword } })
  }

  static async promoteUserAdminRole(params: {
    actorUserId: string
    targetUserId: string
    adminRole: AdminRole
  }): Promise<AdminPrincipal> {
    const { actorUserId, targetUserId, adminRole } = params

    if (!ADMIN_ASSIGNABLE_ROLES.includes(adminRole)) {
      throw new AppError(400, 'Invalid admin role', 'INVALID_ADMIN_ROLE')
    }

    const actor = await prisma.user.findUnique({ where: { id: actorUserId } })
    if (!actor) {
      throw new AppError(404, 'Actor not found', 'NOT_FOUND')
    }

    const actorRole = getEffectiveAdminRole(actor)
    if (actorRole !== 'SUPER_ADMIN') {
      throw new AppError(403, 'Only SUPER_ADMIN can grant admin roles', 'FORBIDDEN')
    }

    const target = await prisma.user.findUnique({ where: { id: targetUserId } })
    if (!target) {
      throw new AppError(404, 'Target user not found', 'NOT_FOUND')
    }

    const updated = await prisma.user.update({ where: { id: target.id }, data: { adminRole } })

    return {
      id: updated.id,
      username: updated.username,
      email: updated.email || '',
      adminRole: getEffectiveAdminRole(updated) || adminRole,
    }
  }

  static async ensureDmAdminRole(userId: string): Promise<void> {
    await prisma.user.updateMany({
      where: { id: userId, role: 'DM', adminRole: null },
      data: { adminRole: 'CAMPAIGN_DM' },
    })
  }
}
