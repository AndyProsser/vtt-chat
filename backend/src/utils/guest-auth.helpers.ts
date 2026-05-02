import { randomBytes } from 'crypto'

export function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function sanitizeInviteCode(inviteCode: string): string {
  return inviteCode.trim().toUpperCase()
}

export function sanitizeExternalSystem(externalSystem: string): string {
  return externalSystem.trim().toLowerCase()
}

export function randomOpaqueToken(bytes = 18): string {
  return randomBytes(bytes).toString('base64url')
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
