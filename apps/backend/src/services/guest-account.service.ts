import { getPrismaClient } from '@/infra/db'
import { slugify } from '@/utils/guest-auth.helpers'

const prisma = getPrismaClient()

type GuestRole = 'DM' | 'PLAYER' | 'SPECTATOR'

type FullAccountPolicy = 'reject' | 'allow-existing'

type GuestAccountRecord = {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  authType: 'GUEST' | 'FULL'
}

export async function generateUniqueGuestUsername(
  displayName: string,
  email: string
): Promise<string> {
  const emailBase = email.split('@')[0] || 'guest'
  const base = slugify(displayName || emailBase || 'guest').slice(0, 24) || 'guest'

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 6)
    const candidate = attempt === 0 ? `${base}-${suffix}` : `${base}-${attempt}${suffix}`
    const existing = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    })

    if (!existing) {
      return candidate
    }
  }

  return `${base}-${Date.now().toString(36)}`
}

export async function findOrCreateGuestAccount(params: {
  email: string
  displayName: string
  avatarUrl?: string
  role: GuestRole
  fullAccountPolicy: FullAccountPolicy
}): Promise<GuestAccountRecord> {
  const existing = await prisma.user.findFirst({
    where: { email: params.email },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      authType: true,
      adminRole: true,
    },
  })

  if (existing?.authType === 'FULL') {
    if (params.fullAccountPolicy === 'reject') {
      throw new Error('FULL_ACCOUNT_EXISTS')
    }

    return {
      id: existing.id,
      username: existing.username,
      displayName: existing.displayName,
      avatarUrl: existing.avatarUrl,
      authType: 'FULL',
    }
  }

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        displayName: params.displayName,
        avatarUrl: params.avatarUrl ?? undefined,
        role: params.role,
        authType: 'GUEST',
        isActive: true,
        adminRole: params.role === 'DM' ? existing.adminRole || 'CAMPAIGN_DM' : existing.adminRole,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        authType: true,
      },
    })
  }

  if (
    params.fullAccountPolicy === 'reject' &&
    (process.env.NODE_ENV || '').toLowerCase() === 'development'
  ) {
    // DEV guard: avoid creating a second guest identity when a likely matching
    // full account already exists (common with passwordless dev usernames like
    // "andy-qw3x" while invite email is "andy@...").
    const emailLocalPart = (params.email.split('@')[0] || '').trim().toLowerCase()
    if (emailLocalPart) {
      const likelyFullAccount = await prisma.user.findFirst({
        where: {
          authType: 'FULL',
          isActive: true,
          OR: [{ username: emailLocalPart }, { username: { startsWith: `${emailLocalPart}-` } }],
        },
        select: { id: true },
      })

      if (likelyFullAccount) {
        throw new Error('FULL_ACCOUNT_EXISTS')
      }
    }
  }

  return prisma.user.create({
    data: {
      email: params.email,
      username: await generateUniqueGuestUsername(params.displayName, params.email),
      displayName: params.displayName,
      avatarUrl: params.avatarUrl,
      role: params.role,
      authType: 'GUEST',
      adminRole: params.role === 'DM' ? 'CAMPAIGN_DM' : null,
      isActive: true,
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      authType: true,
    },
  })
}
