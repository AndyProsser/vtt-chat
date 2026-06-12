import { randomBytes } from 'node:crypto'
import type { HandoffTarget } from '@/types/handoff.types'

export type { HandoffTarget } from '@/types/handoff.types'

interface HandoffRecord {
  token: string
  userId: string
  username: string
  target: HandoffTarget
  expiresAtMs: number
}

const HANDOFF_TTL_MS = 60 * 1000
const handoffStore = new Map<string, HandoffRecord>()

function generateHandoffToken(): string {
  return randomBytes(32).toString('hex')
}

function cleanupExpiredTokens(): void {
  const now = Date.now()
  for (const [token, record] of handoffStore.entries()) {
    if (record.expiresAtMs <= now) {
      handoffStore.delete(token)
    }
  }
}

export function issueHandoffToken(params: {
  userId: string
  username: string
  target: HandoffTarget
}): { handoffToken: string; expiresInSec: number } {
  cleanupExpiredTokens()

  const handoffToken = generateHandoffToken()
  const expiresAtMs = Date.now() + HANDOFF_TTL_MS

  handoffStore.set(handoffToken, {
    token: handoffToken,
    userId: params.userId,
    username: params.username,
    target: params.target,
    expiresAtMs,
  })

  return {
    handoffToken,
    expiresInSec: Math.floor(HANDOFF_TTL_MS / 1000),
  }
}

export function consumeHandoffToken(
  handoffToken: string,
  expectedTarget: HandoffTarget
): { userId: string; username: string } | null {
  cleanupExpiredTokens()

  const record = handoffStore.get(handoffToken)
  if (!record) {
    return null
  }

  if (record.target !== expectedTarget) {
    return null
  }

  if (record.expiresAtMs <= Date.now()) {
    handoffStore.delete(handoffToken)
    return null
  }

  // One-time use: only consume when all checks pass.
  handoffStore.delete(handoffToken)

  return {
    userId: record.userId,
    username: record.username,
  }
}
