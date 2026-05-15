import { getPrismaClient } from '@/infra/db'
import type { AdminAuthToken } from '@/types'

const prisma = getPrismaClient()

type AdminRole = AdminAuthToken['adminRole']

export async function createAdminInviteRecord(params: {
  token: string
  invitedRole: AdminRole
  email: string | null
  invitedByUserId: string
  expiresAt: Date
}) {
  return prisma.adminInvite.create({
    data: {
      token: params.token,
      invitedRole: params.invitedRole,
      email: params.email,
      invitedByUserId: params.invitedByUserId,
      expiresAt: params.expiresAt,
    },
    select: {
      token: true,
      invitedRole: true,
      email: true,
      expiresAt: true,
    },
  })
}

export async function getAdminInviteForValidation(token: string) {
  return prisma.adminInvite.findUnique({
    where: { token },
    select: {
      token: true,
      invitedRole: true,
      email: true,
      expiresAt: true,
      usedAt: true,
    },
  })
}

export async function getAdminInviteForRedeem(token: string) {
  return prisma.adminInvite.findUnique({ where: { token } })
}

export async function getUserByEmailForInvite(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, username: true },
  })
}

export async function getUserByUsernameForInvite(username: string) {
  return prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, email: true },
  })
}

export async function createUserFromInvite(params: {
  username: string
  email: string | null
  passwordHash: string
  invitedRole: AdminRole
}) {
  return prisma.user.create({
    data: {
      username: params.username,
      email: params.email,
      displayName: params.username,
      password: params.passwordHash,
      role: 'PLAYER',
      adminRole: params.invitedRole,
      isActive: true,
    },
    select: { id: true },
  })
}

export async function updateUserFromInvite(params: {
  userId: string
  username: string
  email: string | null
  passwordHash: string
  invitedRole: AdminRole
}) {
  return prisma.user.update({
    where: { id: params.userId },
    data: {
      username: params.username,
      email: params.email,
      password: params.passwordHash,
      adminRole: params.invitedRole,
      isActive: true,
    },
  })
}

export async function markAdminInviteUsed(params: { inviteId: string; userId: string }) {
  return prisma.adminInvite.update({
    where: { id: params.inviteId },
    data: {
      usedAt: new Date(),
      usedByUserId: params.userId,
    },
  })
}

export async function suspendAdminManagedUser(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { isActive: false, tokenInvalidBefore: new Date() },
    select: { id: true, username: true, isActive: true },
  })
}

export async function restoreAdminManagedUser(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { isActive: true },
    select: { id: true, username: true, isActive: true },
  })
}

export async function invalidateAdminManagedUserSessions(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { tokenInvalidBefore: new Date() },
    select: { id: true, username: true, tokenInvalidBefore: true },
  })
}

export async function getAdminHandoffUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
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
}
