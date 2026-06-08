import { randomBytes } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { getPrismaClient } from '@/infra/db'
import { hashPassword } from '@/services/auth.service'
import { AdminService } from '@/services/admin.service'
import { consumeHandoffToken, issueHandoffToken } from '@/services/handoff.service'
import type { AdminAuthToken } from '@/types'
import { createAdminToken } from '@/utils/auth'
import { validatePassword } from '@/utils/password'
import { logger } from '@/utils/logger'

const prisma = getPrismaClient()

type AdminRole = AdminAuthToken['adminRole']

export interface AdminAuditWriteInput {
  actor?: AdminAuthToken
  action: string
  targetType: string
  targetId?: string
  reason?: string
  outcome?: 'SUCCESS' | 'DENIED' | 'FAILED'
  metadata?: unknown
}

interface AdminAccessServiceResult {
  status: number
  body: Record<string, unknown>
  audit?: AdminAuditWriteInput
}

function createInviteToken(): string {
  return randomBytes(24).toString('hex')
}

function normalizeInviteEmail(input: unknown): string {
  return String(input || '')
    .trim()
    .toLowerCase()
}

export async function writeAdminAudit(params: AdminAuditWriteInput): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      actorUserId: params.actor?.userId,
      actorName: params.actor?.username || 'system',
      actorRole: params.actor?.adminRole,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      reason: params.reason,
      outcome: params.outcome || 'SUCCESS',
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
    },
  })
}

export async function getAdminSetupStatusPayload(): Promise<AdminAccessServiceResult> {
  const adminExists = await AdminService.adminUsersExist()
  return {
    status: 200,
    body: {
      setupRequired: !adminExists,
      adminExists,
    },
  }
}

export async function createInitialAdminSetupPayload(params: {
  body: Record<string, unknown>
}): Promise<AdminAccessServiceResult> {
  const email = String(params.body.email || '')
  const username = String(params.body.username || '')
  const password = String(params.body.password || '')
  const passwordConfirm = String(params.body.passwordConfirm || '')

  if (!email || !username || !password) {
    return {
      status: 400,
      body: {
        error: 'Email, username, and password are required',
        code: 'MISSING_FIELDS',
      },
    }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return {
      status: 400,
      body: {
        error: 'Invalid email format',
        code: 'INVALID_EMAIL',
      },
    }
  }

  if (!/^[a-zA-Z0-9_-]{3,}$/.test(username)) {
    return {
      status: 400,
      body: {
        error:
          'Username must be at least 3 characters and contain only letters, numbers, underscores, and hyphens',
        code: 'INVALID_USERNAME',
      },
    }
  }

  if (password !== passwordConfirm) {
    return {
      status: 400,
      body: {
        error: 'Passwords do not match',
        code: 'PASSWORD_MISMATCH',
      },
    }
  }

  const passwordValidation = validatePassword(password)
  if (!passwordValidation.isValid) {
    return {
      status: 400,
      body: {
        error: 'Password does not meet security requirements',
        code: 'INVALID_PASSWORD',
        feedback: passwordValidation.feedback,
        suggestions: passwordValidation.suggestions,
      },
    }
  }

  const admin = await AdminService.createInitialAdmin(email, username, password)
  const token = createAdminToken(admin.id, admin.username, 'SUPER_ADMIN')

  logger.info('admin', 'Initial admin user created', {
    adminId: admin.id,
    username: admin.username,
    email: admin.email,
  })

  return {
    status: 201,
    body: {
      message: 'Admin account created successfully',
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
      },
      token,
    },
  }
}

export async function loginAdminPayload(params: {
  body: Record<string, unknown>
}): Promise<AdminAccessServiceResult> {
  const username = String(params.body.username || '')
  const password = String(params.body.password || '')

  if (!username || !password) {
    return {
      status: 400,
      body: {
        error: 'Username and password are required',
        code: 'MISSING_CREDENTIALS',
      },
    }
  }

  const admin = await AdminService.authenticateAdmin(username, password)
  const token = createAdminToken(admin.id, admin.username, admin.adminRole)

  logger.info('admin', 'Admin login successful', {
    adminId: admin.id,
    username: admin.username,
  })

  return {
    status: 200,
    body: {
      message: 'Login successful',
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        adminRole: admin.adminRole,
      },
      token,
    },
  }
}

export async function createAdminInvitePayload(params: {
  actor: AdminAuthToken
  body: Record<string, unknown>
  publicBase: string
}): Promise<AdminAccessServiceResult> {
  const email = normalizeInviteEmail(params.body.email)
  const adminRole = String(params.body.adminRole || 'ADMIN') as AdminRole
  const expiresInHoursRaw = Number(params.body.expiresInHours || 72)
  const expiresInHours = Math.max(1, Math.min(24 * 14, expiresInHoursRaw))

  if (!['ADMIN', 'CAMPAIGN_DM', 'READ_ONLY'].includes(adminRole)) {
    return {
      status: 400,
      body: {
        error: 'Invalid adminRole for invite',
        code: 'INVALID_ADMIN_ROLE',
      },
    }
  }

  const token = createInviteToken()
  const invite = await prisma.adminInvite.create({
    data: {
      token,
      invitedRole: adminRole,
      email: email || null,
      invitedByUserId: params.actor.userId,
      expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
    },
    select: {
      token: true,
      invitedRole: true,
      email: true,
      expiresAt: true,
    },
  })

  return {
    status: 201,
    body: {
      inviteToken: invite.token,
      invitedRole: invite.invitedRole,
      email: invite.email,
      expiresAt: invite.expiresAt,
      inviteUrl: `${params.publicBase}/admin/onboard?invite=${invite.token}`,
    },
    audit: {
      actor: params.actor,
      action: 'ADMIN_INVITE_CREATE',
      targetType: 'ADMIN_INVITE',
      targetId: token,
      metadata: {
        invitedRole: invite.invitedRole,
        email: invite.email,
        expiresAt: invite.expiresAt,
      },
    },
  }
}

export async function validateAdminInvitePayload(params: {
  token: string
}): Promise<AdminAccessServiceResult> {
  const token = String(params.token || '').trim()
  if (!token) {
    return {
      status: 400,
      body: { error: 'token is required', code: 'MISSING_TOKEN' },
    }
  }

  const invite = await prisma.adminInvite.findUnique({
    where: { token },
    select: {
      token: true,
      invitedRole: true,
      email: true,
      expiresAt: true,
      usedAt: true,
    },
  })

  if (!invite) {
    return {
      status: 404,
      body: { error: 'Invite not found', code: 'INVITE_NOT_FOUND' },
    }
  }

  if (invite.usedAt) {
    return {
      status: 410,
      body: { error: 'Invite already used', code: 'INVITE_USED' },
    }
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    return {
      status: 410,
      body: { error: 'Invite has expired', code: 'INVITE_EXPIRED' },
    }
  }

  return {
    status: 200,
    body: {
      valid: true,
      invitedRole: invite.invitedRole,
      email: invite.email,
      expiresAt: invite.expiresAt,
    },
  }
}

export async function redeemAdminInvitePayload(params: {
  body: Record<string, unknown>
}): Promise<AdminAccessServiceResult> {
  const token = String(params.body.token || '').trim()
  const username = String(params.body.username || '').trim()
  const email = normalizeInviteEmail(params.body.email)
  const password = String(params.body.password || '')
  const passwordConfirm = String(params.body.passwordConfirm || '')

  if (!token || !username || !password || !passwordConfirm) {
    return {
      status: 400,
      body: {
        error: 'token, username, password, and passwordConfirm are required',
        code: 'MISSING_FIELDS',
      },
    }
  }

  if (password !== passwordConfirm) {
    return {
      status: 400,
      body: {
        error: 'Passwords do not match',
        code: 'PASSWORD_MISMATCH',
      },
    }
  }

  const passwordValidation = validatePassword(password)
  if (!passwordValidation.isValid) {
    return {
      status: 400,
      body: {
        error: 'Password does not meet security requirements',
        code: 'INVALID_PASSWORD',
        feedback: passwordValidation.feedback,
        suggestions: passwordValidation.suggestions,
      },
    }
  }

  const invite = await prisma.adminInvite.findUnique({ where: { token } })
  if (!invite) {
    return {
      status: 404,
      body: { error: 'Invite not found', code: 'INVITE_NOT_FOUND' },
    }
  }
  if (invite.usedAt) {
    return {
      status: 410,
      body: { error: 'Invite already used', code: 'INVITE_USED' },
    }
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return {
      status: 410,
      body: { error: 'Invite has expired', code: 'INVITE_EXPIRED' },
    }
  }
  if (invite.email && invite.email.toLowerCase() !== email) {
    return {
      status: 400,
      body: {
        error: 'Invite is restricted to a different email',
        code: 'INVITE_EMAIL_MISMATCH',
      },
    }
  }

  const passwordHash = await hashPassword(password)
  const existingByEmail = email
    ? await prisma.user.findUnique({
        where: { email },
        select: { id: true, username: true },
      })
    : null
  const existingByUsername = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, email: true },
  })

  if (existingByEmail && existingByUsername && existingByEmail.id !== existingByUsername.id) {
    return {
      status: 409,
      body: {
        error: 'Email and username belong to different accounts',
        code: 'IDENTITY_CONFLICT',
      },
    }
  }

  let userId = existingByEmail?.id || existingByUsername?.id
  if (!userId) {
    const created = await prisma.user.create({
      data: {
        username,
        email: email || null,
        displayName: username,
        password: passwordHash,
        role: 'PLAYER',
        adminRole: invite.invitedRole,
        isActive: true,
      },
      select: { id: true },
    })
    userId = created.id
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: {
        username,
        email: email || null,
        password: passwordHash,
        adminRole: invite.invitedRole,
        isActive: true,
      },
    })
  }

  await prisma.adminInvite.update({
    where: { id: invite.id },
    data: {
      usedAt: new Date(),
      usedByUserId: userId,
    },
  })

  const adminToken = createAdminToken(userId, username, invite.invitedRole)

  return {
    status: 200,
    body: {
      message: 'Invite redeemed successfully',
      token: adminToken,
      admin: {
        id: userId,
        username,
        email,
        adminRole: invite.invitedRole,
      },
    },
    audit: {
      action: 'ADMIN_INVITE_REDEEM',
      targetType: 'ADMIN_INVITE',
      targetId: invite.id,
      metadata: {
        userId,
        username,
        invitedRole: invite.invitedRole,
      },
    },
  }
}

export async function suspendAdminUserPayload(params: {
  actor: AdminAuthToken
  userId: string
  reason?: string
}): Promise<AdminAccessServiceResult> {
  const userId = String(params.userId || '')
  if (!userId) {
    return {
      status: 400,
      body: { error: 'userId is required', code: 'INVALID_USER_ID' },
    }
  }

  if (userId === params.actor.userId) {
    return {
      status: 400,
      body: {
        error: 'You cannot suspend your own account',
        code: 'SELF_ACTION_NOT_ALLOWED',
      },
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive: false, tokenInvalidBefore: new Date() },
    select: { id: true, username: true, isActive: true },
  })

  return {
    status: 200,
    body: {
      message: 'User suspended successfully',
      user: updated,
    },
    audit: {
      actor: params.actor,
      action: 'USER_SUSPEND',
      targetType: 'USER',
      targetId: updated.id,
      reason: params.reason,
      metadata: { targetUsername: updated.username },
    },
  }
}

export async function restoreAdminUserPayload(params: {
  actor: AdminAuthToken
  userId: string
  reason?: string
}): Promise<AdminAccessServiceResult> {
  const userId = String(params.userId || '')
  if (!userId) {
    return {
      status: 400,
      body: { error: 'userId is required', code: 'INVALID_USER_ID' },
    }
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, bannedAt: true },
  })

  if (!existing) {
    return { status: 404, body: { error: 'User not found', code: 'NOT_FOUND' } }
  }

  if (existing.bannedAt) {
    return {
      status: 400,
      body: {
        error: 'User is permanently banned and cannot be restored. Use the Unban action instead.',
        code: 'USER_IS_BANNED',
      },
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive: true },
    select: { id: true, username: true, isActive: true },
  })

  return {
    status: 200,
    body: {
      message: 'User restored successfully',
      user: updated,
    },
    audit: {
      actor: params.actor,
      action: 'USER_RESTORE',
      targetType: 'USER',
      targetId: updated.id,
      reason: params.reason,
      metadata: { targetUsername: updated.username },
    },
  }
}

export async function banAdminUserPayload(params: {
  actor: AdminAuthToken
  userId: string
  reason?: string
}): Promise<AdminAccessServiceResult> {
  const userId = String(params.userId || '')
  if (!userId) {
    return { status: 400, body: { error: 'userId is required', code: 'INVALID_USER_ID' } }
  }

  if (userId === params.actor.userId) {
    return {
      status: 400,
      body: { error: 'You cannot ban your own account', code: 'SELF_ACTION_NOT_ALLOWED' },
    }
  }

  const now = new Date()
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive: false, bannedAt: now, tokenInvalidBefore: now },
    select: { id: true, username: true, isActive: true, bannedAt: true },
  })

  return {
    status: 200,
    body: { message: 'User permanently banned', user: updated },
    audit: {
      actor: params.actor,
      action: 'USER_BAN',
      targetType: 'USER',
      targetId: updated.id,
      reason: params.reason,
      metadata: { targetUsername: updated.username, bannedAt: updated.bannedAt },
    },
  }
}

export async function unbanAdminUserPayload(params: {
  actor: AdminAuthToken
  userId: string
  reason?: string
}): Promise<AdminAccessServiceResult> {
  const userId = String(params.userId || '')
  if (!userId) {
    return { status: 400, body: { error: 'userId is required', code: 'INVALID_USER_ID' } }
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, bannedAt: true },
  })

  if (!existing) {
    return { status: 404, body: { error: 'User not found', code: 'NOT_FOUND' } }
  }

  if (!existing.bannedAt) {
    return {
      status: 400,
      body: { error: 'User is not banned', code: 'USER_NOT_BANNED' },
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive: true, bannedAt: null },
    select: { id: true, username: true, isActive: true, bannedAt: true },
  })

  return {
    status: 200,
    body: { message: 'User unbanned successfully', user: updated },
    audit: {
      actor: params.actor,
      action: 'USER_UNBAN',
      targetType: 'USER',
      targetId: updated.id,
      reason: params.reason,
      metadata: { targetUsername: updated.username },
    },
  }
}

export async function forceLogoutAdminUserPayload(params: {
  actor: AdminAuthToken
  userId: string
  reason?: string
}): Promise<AdminAccessServiceResult> {
  const userId = String(params.userId || '')
  if (!userId) {
    return {
      status: 400,
      body: { error: 'userId is required', code: 'INVALID_USER_ID' },
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { tokenInvalidBefore: new Date() },
    select: { id: true, username: true, tokenInvalidBefore: true },
  })

  return {
    status: 200,
    body: {
      message: 'User sessions invalidated successfully',
      user: updated,
    },
    audit: {
      actor: params.actor,
      action: 'USER_FORCE_LOGOUT',
      targetType: 'USER',
      targetId: updated.id,
      reason: params.reason,
      metadata: {
        targetUsername: updated.username,
        tokenInvalidBefore: updated.tokenInvalidBefore,
      },
    },
  }
}

export function issueAppHandoffPayload(params: {
  actor: AdminAuthToken
}): AdminAccessServiceResult {
  const { handoffToken, expiresInSec } = issueHandoffToken({
    userId: params.actor.userId,
    username: params.actor.username,
    target: 'app',
  })

  return {
    status: 200,
    body: {
      handoffToken,
      expiresInSec,
      redirectUrl: `/launch?handoff=${handoffToken}`,
    },
  }
}

export async function exchangeAdminHandoffPayload(params: {
  handoffToken: string
}): Promise<AdminAccessServiceResult> {
  const handoffToken = String(params.handoffToken || '').trim()
  if (!handoffToken) {
    return {
      status: 400,
      body: {
        error: 'handoffToken is required',
        code: 'MISSING_HANDOFF_TOKEN',
      },
    }
  }

  const consumed = consumeHandoffToken(handoffToken, 'admin')
  if (!consumed) {
    return {
      status: 401,
      body: {
        error: 'Handoff token is invalid, expired, or already used',
        code: 'INVALID_HANDOFF_TOKEN',
      },
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: consumed.userId },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      adminRole: true,
      password: true,
      isActive: true,
    },
  })
  if (!user || !user.isActive) {
    return {
      status: 403,
      body: {
        error: 'Account is unavailable for admin access',
        code: 'ACCOUNT_NOT_ALLOWED',
      },
    }
  }

  const effectiveAdminRole = user.adminRole || (user.role === 'DM' ? 'CAMPAIGN_DM' : null)
  if (!effectiveAdminRole) {
    return {
      status: 403,
      body: {
        error: 'User does not have admin access',
        code: 'ADMIN_ACCESS_REQUIRED',
      },
    }
  }

  if (!user.password) {
    return {
      status: 403,
      body: {
        error: 'Upgrade to a full account before accessing admin',
        code: 'GUEST_UPGRADE_REQUIRED',
      },
    }
  }

  const token = createAdminToken(user.id, user.username, effectiveAdminRole)

  return {
    status: 200,
    body: {
      token,
      admin: {
        id: user.id,
        username: user.username,
        email: user.email || '',
        adminRole: effectiveAdminRole,
      },
    },
  }
}
