import { createHash, randomBytes } from 'crypto'
import type { UUID } from '@shared'
import { isValidUsername } from '@shared'
import { getPrismaClient } from '@/infra/db'
import { createToken, hashPassword } from '@/services/auth.service'
import { sendPasswordResetEmail } from '@/services/email.service'
import { validatePassword } from '@/utils/password'
import { logger } from '@/utils/logger'

const prisma = getPrismaClient()

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function normalizePreferredUsername(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[^\w\s]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32) || 'user'
  )
}

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function generateResetToken(): string {
  return randomBytes(24).toString('base64url')
}

function validateEmailFormat(email: string): boolean {
  return EMAIL_REGEX.test(email)
}

async function ensureUniqueUsername(baseValue: string): Promise<string> {
  const normalizedBase = normalizePreferredUsername(baseValue)

  const existing = await prisma.user.findUnique({
    where: { username: normalizedBase },
    select: { id: true },
  })

  if (!existing) {
    return normalizedBase
  }

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const suffix = `${Math.floor(1000 + Math.random() * 9000)}`
    const trimmedBase = normalizedBase.slice(0, Math.max(3, 32 - suffix.length - 1))
    const candidate = `${trimmedBase}_${suffix}`

    const duplicate = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    })

    if (!duplicate) {
      return candidate
    }
  }

  return `${normalizedBase.slice(0, 24)}_${Date.now().toString().slice(-7)}`
}

export async function suggestAvailableUsername(params: {
  displayName?: string
  requestedUsername?: string
}): Promise<string> {
  const source = String(params.requestedUsername || params.displayName || '').trim()
  const normalized = normalizePreferredUsername(source)

  if (!isValidUsername(normalized)) {
    return ensureUniqueUsername('user')
  }

  return ensureUniqueUsername(normalized)
}

export async function registerFullAccount(params: {
  displayName: string
  email: string
  requestedUsername?: string
  password: string
}): Promise<{
  token: string
  user: {
    id: string
    username: string
    role: 'PLAYER'
    authType: 'FULL'
  }
}> {
  const displayName = String(params.displayName || '').trim()
  const email = normalizeEmail(params.email)
  const passwordResult = validatePassword(params.password)

  if (!displayName) {
    throw new Error('DISPLAY_NAME_REQUIRED')
  }
  if (!validateEmailFormat(email)) {
    throw new Error('INVALID_EMAIL')
  }
  if (!passwordResult.isValid) {
    throw new Error('INVALID_PASSWORD')
  }

  const emailOwner = await prisma.user.findFirst({
    where: { email },
    select: { id: true },
  })

  if (emailOwner) {
    throw new Error('EMAIL_IN_USE')
  }

  const username = await suggestAvailableUsername({
    displayName,
    requestedUsername: params.requestedUsername,
  })

  const passwordHash = await hashPassword(params.password)

  const created = await prisma.user.create({
    data: {
      email,
      username,
      displayName,
      password: passwordHash,
      role: 'PLAYER',
      authType: 'FULL',
      isActive: true,
    },
    select: {
      id: true,
      username: true,
      role: true,
      authType: true,
    },
  })

  return {
    token: createToken({
      userId: created.id as UUID,
      username: created.username,
      role: 'PLAYER',
      authType: 'FULL',
      accessMode: 'USER',
    }),
    user: {
      id: created.id,
      username: created.username,
      role: 'PLAYER',
      authType: 'FULL',
    },
  }
}

export async function requestPasswordReset(params: {
  identifier: string
  appBaseUrl: string
  isDevelopment: boolean
}): Promise<{
  accountFound: boolean
  delivery: 'email' | 'passwordless' | 'none'
  resetToken?: string
  email?: string | null
}> {
  const identifier = String(params.identifier || '')
    .trim()
    .toLowerCase()

  if (!identifier) {
    throw new Error('IDENTIFIER_REQUIRED')
  }

  const isEmailIdentifier = identifier.includes('@')
  const user = await prisma.user.findFirst({
    where: {
      ...(isEmailIdentifier ? { email: identifier } : { username: identifier }),
      authType: 'FULL',
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
    },
  })

  if (!user || !user.email) {
    return {
      accountFound: false,
      delivery: 'none',
    }
  }

  await prisma.passwordResetToken.deleteMany({
    where: {
      userId: user.id,
      usedAt: null,
    },
  })

  const rawToken = generateResetToken()
  const tokenHash = hashResetToken(rawToken)
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS)

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  })

  if (params.isDevelopment) {
    return {
      accountFound: true,
      delivery: 'passwordless',
      resetToken: rawToken,
      email: user.email,
    }
  }

  const normalizedBaseUrl = String(params.appBaseUrl || '').replace(/\/$/, '')
  const resetUrl = `${normalizedBaseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`

  await sendPasswordResetEmail({
    toEmail: user.email,
    toName: user.displayName,
    resetUrl,
  })

  logger.info('auth', 'Password reset email sent', {
    userId: user.id,
    email: user.email,
  })

  return {
    accountFound: true,
    delivery: 'email',
    email: user.email,
  }
}

export async function verifyPasswordResetToken(token: string): Promise<{
  valid: boolean
  email?: string | null
  username?: string
}> {
  const tokenHash = hashResetToken(String(token || '').trim())

  const record = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      user: {
        select: {
          email: true,
          username: true,
        },
      },
    },
  })

  if (!record) {
    return { valid: false }
  }

  return {
    valid: true,
    email: record.user.email,
    username: record.user.username,
  }
}

export async function completePasswordReset(params: {
  token: string
  password: string
}): Promise<void> {
  const tokenHash = hashResetToken(String(params.token || '').trim())
  const passwordResult = validatePassword(params.password)

  if (!passwordResult.isValid) {
    throw new Error('INVALID_PASSWORD')
  }

  const record = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      userId: true,
    },
  })

  if (!record) {
    throw new Error('INVALID_RESET_TOKEN')
  }

  const passwordHash = await hashPassword(params.password)

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: {
        password: passwordHash,
        tokenInvalidBefore: new Date(),
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ])
}
