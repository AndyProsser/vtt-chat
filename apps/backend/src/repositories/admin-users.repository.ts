import { getPrismaClient } from '@/infra/db'
import type {
  AdminUsersListRequest,
  AdminUsersRepositoryRow,
  AdminUsersRoleFilter,
  AdminUsersStatusFilter,
} from '@/types/admin-users.types'
import type { Prisma } from '@prisma/client'

const prisma = getPrismaClient()

function buildUsersWhere(params: {
  search: string
  roleFilter: AdminUsersRoleFilter
  statusFilter: AdminUsersStatusFilter
}): Prisma.UserWhereInput | undefined {
  const andClauses: Prisma.UserWhereInput[] = []

  if (params.search) {
    andClauses.push({
      OR: [
        { username: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
        { displayName: { contains: params.search, mode: 'insensitive' } },
      ],
    })
  }

  if (params.statusFilter === 'active') {
    andClauses.push({ isActive: true })
  } else if (params.statusFilter === 'suspended') {
    andClauses.push({ isActive: false, bannedAt: null })
  } else if (params.statusFilter === 'banned') {
    andClauses.push({ bannedAt: { not: null } })
  }

  if (params.roleFilter === 'dm') {
    andClauses.push({ role: 'DM' })
  } else if (params.roleFilter === 'player') {
    andClauses.push({ role: 'PLAYER' })
  } else if (params.roleFilter === 'spectator') {
    andClauses.push({ role: 'SPECTATOR' })
  } else if (params.roleFilter === 'admin') {
    andClauses.push({ OR: [{ adminRole: { not: null } }, { role: 'DM' }] })
  }

  return andClauses.length > 0 ? { AND: andClauses } : undefined
}

export async function listAdminUsers(params: AdminUsersListRequest): Promise<{
  total: number
  users: AdminUsersRepositoryRow[]
}> {
  const where = buildUsersWhere({
    search: params.search,
    roleFilter: params.roleFilter,
    statusFilter: params.statusFilter,
  })

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        role: true,
        adminRole: true,
        isActive: true,
        bannedAt: true,
        createdAt: true,
        updatedAt: true,
        tokenInvalidBefore: true,
      },
    }),
  ])

  return {
    total,
    users: users.map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      adminRole: user.adminRole,
      isActive: user.isActive,
      bannedAt: user.bannedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      tokenInvalidBefore: user.tokenInvalidBefore,
    })),
  }
}

export async function listAdminUsersForExport(): Promise<AdminUsersRepositoryRow[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      username: true,
      email: true,
      displayName: true,
      role: true,
      adminRole: true,
      isActive: true,
      bannedAt: true,
      createdAt: true,
      updatedAt: true,
      tokenInvalidBefore: true,
    },
  })

  return users.map((user) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    adminRole: user.adminRole,
    isActive: user.isActive,
    bannedAt: user.bannedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    tokenInvalidBefore: user.tokenInvalidBefore,
  }))
}

export async function findExistingUsernames(usernames: string[]): Promise<string[]> {
  if (usernames.length === 0) {
    return []
  }

  const rows = await prisma.user.findMany({
    where: { username: { in: usernames } },
    select: { username: true },
  })

  return rows.map((row) => row.username)
}
