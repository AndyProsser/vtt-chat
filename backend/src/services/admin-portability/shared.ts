import { randomUUID } from 'node:crypto'
import { PORTABILITY_FORMAT_VERSION } from '@/constants/admin-portability.constants'
import type { CampaignTransferBundle } from '@/types/portability.types'
import type { Prisma, PrismaClient, Role } from '@prisma/client'

export function toIso(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function toDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function slugifyUsername(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  return slug.replace(/-+/g, '-').replace(/^-|-$/g, '') || 'imported-user'
}

export function mapUserIdList(
  value: Prisma.JsonValue | null,
  userIdMap: Map<string, string>
): Prisma.JsonValue | null {
  if (!Array.isArray(value)) {
    return value
  }

  const mapped = value
    .map((entry) => (typeof entry === 'string' ? userIdMap.get(entry) || entry : null))
    .filter((entry): entry is string => Boolean(entry))

  return mapped
}

export function buildCounts(bundle: CampaignTransferBundle) {
  return {
    members: bundle.members.length,
    characters: bundle.characters.length,
    sessions: bundle.sessions.length,
    rooms: bundle.sessions.reduce((total, session) => total + session.rooms.length, 0),
    messages: bundle.sessions.reduce((total, session) => total + session.messages.length, 0),
    notes: bundle.sessions.reduce((total, session) => total + session.notes.length, 0),
    logs: bundle.sessions.reduce((total, session) => total + session.logs.length, 0),
    recordings: bundle.recordings.length,
  }
}

export function isCampaignTransferBundle(input: unknown): input is CampaignTransferBundle {
  if (!input || typeof input !== 'object') {
    return false
  }

  const candidate = input as Partial<CampaignTransferBundle>
  return (
    candidate.version === PORTABILITY_FORMAT_VERSION &&
    typeof candidate.sourceCampaignId === 'string' &&
    Boolean(candidate.campaign) &&
    Array.isArray(candidate.members) &&
    Array.isArray(candidate.characters) &&
    Array.isArray(candidate.sessions) &&
    Array.isArray(candidate.recordings)
  )
}

export function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export async function resolveImportedUsers(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  bundle: CampaignTransferBundle
): Promise<Map<string, string>> {
  const sourceUsers = new Map<
    string,
    {
      username: string
      displayName: string
      role: Role
    }
  >()

  bundle.members.forEach((member) => {
    sourceUsers.set(member.userId, {
      username: member.username,
      displayName: member.displayName,
      role: member.userRole,
    })
  })

  bundle.sessions.forEach((session) => {
    session.members.forEach((member) => {
      if (!sourceUsers.has(member.userId)) {
        sourceUsers.set(member.userId, {
          username: member.username,
          displayName: member.username,
          role: member.role,
        })
      }
    })

    session.messages.forEach((message) => {
      if (!sourceUsers.has(message.authorId)) {
        sourceUsers.set(message.authorId, {
          username: message.authorUsername,
          displayName: message.authorUsername,
          role: 'PLAYER',
        })
      }
    })

    session.notes.forEach((note) => {
      if (!sourceUsers.has(note.authorId)) {
        sourceUsers.set(note.authorId, {
          username: note.authorUsername,
          displayName: note.authorUsername,
          role: 'PLAYER',
        })
      }
    })

    session.logs.forEach((entry) => {
      if (entry.userId && !sourceUsers.has(entry.userId)) {
        sourceUsers.set(entry.userId, {
          username: entry.username,
          displayName: entry.username,
          role: 'PLAYER',
        })
      }
    })
  })

  bundle.characters.forEach((character) => {
    if (!sourceUsers.has(character.userId)) {
      sourceUsers.set(character.userId, {
        username: `imported-${character.name}`,
        displayName: character.name,
        role: 'PLAYER',
      })
    }
  })

  const userIdMap = new Map<string, string>()
  userIdMap.set(bundle.campaign.currentDmId, actorUserId)

  for (const [sourceUserId, sourceUser] of sourceUsers.entries()) {
    if (sourceUserId === bundle.campaign.currentDmId) {
      continue
    }

    const existing = await tx.user.findUnique({
      where: { id: sourceUserId },
      select: { id: true },
    })

    if (existing) {
      userIdMap.set(sourceUserId, existing.id)
      continue
    }

    const created = await tx.user.create({
      data: {
        username: `${slugifyUsername(sourceUser.username)}-${randomUUID().slice(0, 8)}`,
        displayName: normalizeString(sourceUser.displayName) || sourceUser.username,
        role: sourceUser.role,
      },
      select: { id: true },
    })

    userIdMap.set(sourceUserId, created.id)
  }

  return userIdMap
}
