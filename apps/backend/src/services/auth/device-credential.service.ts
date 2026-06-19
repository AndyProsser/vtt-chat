/**
 * Device Credential Service
 *
 * Implements the "Extension Device Credential Contract" (docs/CONTRACTS.md).
 * A device credential is a per-user, per-browser opaque token that lets the
 * extension reconnect (obtain a fresh JWT) without re-running the invite-code
 * flow. It replaces the invite URL as the reconnection mechanism.
 *
 * Lives under services/auth/ rather than services/guest-auth/ because
 * credentials are not guest-specific — they are preserved automatically
 * across the guest -> full upgrade (same userId, same row) and continue to
 * be exchanged after upgrade.
 */
import { createHash, randomBytes } from 'node:crypto'
import { getPrismaClient } from '@/infra/db'
import { createToken } from '@/services/auth.service'
import { DEVICE_CREDENTIAL_TTL_MS } from '@/constants/auth.constants'
import type { PlayerFacingRole } from '@/types/auth.types'
import type { UUID } from '@shared'

const prisma = getPrismaClient()

function hashCredential(rawCredential: string): string {
  return createHash('sha256').update(rawCredential).digest('hex')
}

function generateRawCredential(): string {
  return randomBytes(24).toString('base64url')
}

/**
 * Issues (or rotates, if one already exists for this user+device) a device
 * credential. Called after a successful extension guest-login when the
 * request included a deviceId, and internally by exchangeDeviceCredential
 * on every successful exchange. The raw credential is returned exactly once
 * — only its salted hash is persisted.
 */
export async function issueDeviceCredential(params: {
  userId: string
  deviceId: string
}): Promise<{ credential: string; expiresAt: Date }> {
  const rawCredential = generateRawCredential()
  const credentialHash = hashCredential(rawCredential)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + DEVICE_CREDENTIAL_TTL_MS)

  await prisma.deviceCredential.upsert({
    where: {
      userId_deviceId: {
        userId: params.userId,
        deviceId: params.deviceId,
      },
    },
    create: {
      userId: params.userId,
      deviceId: params.deviceId,
      credentialHash,
      lastUsedAt: now,
      expiresAt,
    },
    update: {
      credentialHash,
      lastUsedAt: now,
      expiresAt,
      revokedAt: null,
    },
  })

  return { credential: rawCredential, expiresAt }
}

/**
 * Exchanges a device credential for a fresh short-lived JWT, rotating the
 * credential in the same operation (old hash is immediately invalidated).
 * Throws 'CREDENTIAL_INVALID' if not found, already rotated, or revoked.
 * Throws 'CREDENTIAL_EXPIRED_GUEST' / 'CREDENTIAL_EXPIRED_FULL' if the
 * 90-day rolling window has elapsed, depending on the account's current type.
 */
export async function exchangeDeviceCredential(params: {
  credential: string
  deviceId: string
}): Promise<{ token: string; credential: string }> {
  const credentialHash = hashCredential(params.credential)

  const record = await prisma.deviceCredential.findFirst({
    where: {
      credentialHash,
      deviceId: params.deviceId,
      revokedAt: null,
    },
    select: {
      id: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          username: true,
          role: true,
          authType: true,
        },
      },
    },
  })

  if (!record) {
    throw new Error('CREDENTIAL_INVALID')
  }

  if (record.expiresAt.getTime() < Date.now()) {
    throw new Error(record.user.authType === 'FULL' ? 'CREDENTIAL_EXPIRED_FULL' : 'CREDENTIAL_EXPIRED_GUEST')
  }

  const rotated = await issueDeviceCredential({
    userId: record.user.id,
    deviceId: params.deviceId,
  })

  const token = createToken({
    userId: record.user.id as UUID,
    username: record.user.username,
    role: record.user.role as PlayerFacingRole,
    authType: record.user.authType,
  })

  return { token, credential: rotated.credential }
}

/**
 * Lists the authenticated user's active (non-revoked) device credentials
 * for an account settings "Connected Devices" panel. Never returns the
 * credential hash.
 */
export async function listDeviceCredentials(userId: string): Promise<
  Array<{
    id: string
    deviceId: string
    createdAt: Date
    lastUsedAt: Date
    expiresAt: Date
  }>
> {
  return prisma.deviceCredential.findMany({
    where: { userId, revokedAt: null },
    select: {
      id: true,
      deviceId: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
    orderBy: { lastUsedAt: 'desc' },
  })
}

/**
 * Revokes a device credential immediately, regardless of remaining expiry
 * window. A user may revoke their own; an admin may revoke any.
 * Throws 'CREDENTIAL_NOT_FOUND' or 'NOT_CREDENTIAL_OWNER'.
 */
export async function revokeDeviceCredential(params: {
  credentialId: string
  requestingUserId: string
  isAdmin: boolean
}): Promise<void> {
  const record = await prisma.deviceCredential.findUnique({
    where: { id: params.credentialId },
    select: { id: true, userId: true },
  })

  if (!record) {
    throw new Error('CREDENTIAL_NOT_FOUND')
  }

  if (record.userId !== params.requestingUserId && !params.isAdmin) {
    throw new Error('NOT_CREDENTIAL_OWNER')
  }

  await prisma.deviceCredential.update({
    where: { id: params.credentialId },
    data: { revokedAt: new Date() },
  })
}
