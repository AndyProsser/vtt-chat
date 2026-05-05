import { getPrismaClient } from '@/infra/db'
import { createToken, hashPassword } from '@/services/auth.service'
import { validatePassword } from '@/utils/password'
import type { UUID } from '@shared'

const prisma = getPrismaClient()

export async function upgradeGuestAccount(params: { userId: string; password: string }): Promise<{
  token: string
  user: {
    id: string
    username: string
    role: 'DM' | 'PLAYER' | 'SPECTATOR'
    authType: 'FULL'
  }
}> {
  const passwordResult = validatePassword(params.password)
  if (!passwordResult.isValid) {
    throw new Error('INVALID_PASSWORD')
  }

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true,
      username: true,
      role: true,
      authType: true,
    },
  })

  if (!user) {
    throw new Error('USER_NOT_FOUND')
  }

  if (user.authType !== 'GUEST') {
    throw new Error('ACCOUNT_ALREADY_FULL')
  }

  const updated = await prisma.user.update({
    where: { id: params.userId },
    data: {
      authType: 'FULL',
      password: await hashPassword(params.password),
    },
    select: {
      id: true,
      username: true,
      role: true,
    },
  })

  if (!['DM', 'PLAYER', 'SPECTATOR'].includes(updated.role)) {
    throw new Error('INVALID_ROLE')
  }

  return {
    token: createToken({
      userId: updated.id as UUID,
      username: updated.username,
      role: updated.role as 'DM' | 'PLAYER' | 'SPECTATOR',
      authType: 'FULL',
    }),
    user: {
      id: updated.id,
      username: updated.username,
      role: updated.role as 'DM' | 'PLAYER' | 'SPECTATOR',
      authType: 'FULL',
    },
  }
}
