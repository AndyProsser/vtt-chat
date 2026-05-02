import { randomUUID } from 'crypto'
import type { PortabilityArtifactType, PresenceState, Prisma, PrismaClient } from '@prisma/client'
import type { CampaignTransferBundle, OperationalExportBundle } from '@/types/portability.types'

export const PORTABILITY_FORMAT_VERSION = 1

interface RecordingCreateInput {
  campaignId: string
  sessionId?: string | null
  roomId?: string | null
  title: string
  storageKey?: string | null
  sourceUrl?: string | null
  durationSeconds?: number | null
  startedAt?: string | null
  endedAt?: string | null
  journalSummary?: string | null
  metadata?: Prisma.InputJsonValue | null
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function slugifyUsername(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  return slug.replace(/-+/g, '-').replace(/^-|-$/g, '') || 'imported-user'
}

function mapUserIdList(
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

function buildCounts(bundle: CampaignTransferBundle) {
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

function isCampaignTransferBundle(input: unknown): input is CampaignTransferBundle {
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

function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

async function resolveImportedUsers(
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

export async function buildCampaignExport(
  prisma: PrismaClient,
  campaignId: string,
  actorUserId?: string | null
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      currentDm: {
        select: {
          id: true,
          username: true,
        },
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              role: true,
            },
          },
        },
        orderBy: { joinedAt: 'asc' },
      },
      characters: {
        orderBy: { createdAt: 'asc' },
      },
      sessions: {
        orderBy: { createdAt: 'asc' },
        include: {
          rooms: {
            orderBy: { createdAt: 'asc' },
          },
          members: {
            orderBy: { joinedAt: 'asc' },
          },
          messages: {
            orderBy: { createdAt: 'asc' },
          },
          notes: {
            orderBy: { createdAt: 'asc' },
          },
          logs: {
            orderBy: { createdAt: 'asc' },
          },
        },
      },
      recordings: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!campaign) {
    return null
  }

  const bundle: CampaignTransferBundle = {
    version: PORTABILITY_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    sourceCampaignId: campaign.id,
    campaign: {
      name: campaign.name,
      description: campaign.description,
      inviteCode: campaign.inviteCode,
      currentDmId: campaign.currentDmId,
      currentDmUsername: campaign.currentDm.username,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
    },
    members: campaign.members.map((membership) => ({
      userId: membership.userId,
      username: membership.user.username,
      displayName: membership.user.displayName,
      campaignRole: membership.role,
      userRole: membership.user.role,
    })),
    characters: campaign.characters.map((character) => ({
      userId: character.userId,
      name: character.name,
      status: character.status,
      race: character.race,
      class: character.class,
      subclass: character.subclass,
      avatarUrl: character.avatarUrl,
      isActive: character.isActive,
      metadata: character.metadata as Prisma.JsonValue | null,
      createdAt: character.createdAt.toISOString(),
      updatedAt: character.updatedAt.toISOString(),
    })),
    sessions: campaign.sessions.map((session) => ({
      id: session.id,
      name: session.name,
      description: session.description,
      state: session.state,
      createdAt: session.createdAt.toISOString(),
      startedAt: toIso(session.startedAt),
      endedAt: toIso(session.endedAt),
      updatedAt: session.updatedAt.toISOString(),
      rooms: session.rooms.map((room) => ({
        id: room.id,
        name: room.name,
        type: room.type,
        createdBy: room.createdBy,
        createdAt: room.createdAt.toISOString(),
        updatedAt: room.updatedAt.toISOString(),
      })),
      members: session.members.map((member) => ({
        userId: member.userId,
        username: member.username,
        role: member.role,
        joinedAt: member.joinedAt.toISOString(),
      })),
      messages: session.messages.map((message) => ({
        authorId: message.authorId,
        authorUsername: message.authorUsername,
        content: message.content,
        type: message.type,
        isDmOnly: message.isDmOnly,
        visibleTo: message.visibleTo as Prisma.JsonValue | null,
        createdAt: message.createdAt.toISOString(),
        editedAt: toIso(message.editedAt),
        deletedAt: toIso(message.deletedAt),
        deletedBy: message.deletedBy,
      })),
      notes: session.notes.map((note) => ({
        authorId: note.authorId,
        authorUsername: note.authorUsername,
        title: note.title,
        content: note.content,
        visibility: note.visibility,
        tags: note.tags as Prisma.JsonValue | null,
        allowedUsers: note.allowedUsers as Prisma.JsonValue | null,
        publishedAt: toIso(note.publishedAt),
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      })),
      logs: session.logs.map((log) => ({
        userId: log.userId,
        username: log.username,
        eventType: log.eventType,
        detail: log.detail,
        createdAt: log.createdAt.toISOString(),
      })),
    })),
    recordings: campaign.recordings.map((recording) => ({
      title: recording.title,
      sessionId: recording.sessionId,
      roomId: recording.roomId,
      storageKey: recording.storageKey,
      sourceUrl: recording.sourceUrl,
      durationSeconds: recording.durationSeconds,
      startedAt: toIso(recording.startedAt),
      endedAt: toIso(recording.endedAt),
      journalSummary: recording.journalSummary,
      metadata: recording.metadata as Prisma.JsonValue | null,
      createdAt: recording.createdAt.toISOString(),
      updatedAt: recording.updatedAt.toISOString(),
    })),
  }

  const counts = buildCounts(bundle)

  const artifact = await prisma.importExportArtifact.create({
    data: {
      type: 'CAMPAIGN_EXPORT',
      campaignId,
      createdByUserId: actorUserId || undefined,
      formatVersion: PORTABILITY_FORMAT_VERSION,
      payload: bundle as unknown as Prisma.InputJsonValue,
      metadata: counts as Prisma.InputJsonValue,
    },
    select: { id: true },
  })

  return {
    bundle,
    artifactId: artifact.id,
    counts,
  }
}

export async function importCampaignBundle(
  prisma: PrismaClient,
  actorUserId: string,
  input: unknown,
  nameOverride?: string | null
) {
  if (!isCampaignTransferBundle(input)) {
    return null
  }

  const bundle = input

  const imported = await prisma.$transaction(async (tx) => {
    const userIdMap = await resolveImportedUsers(tx, actorUserId, bundle)
    const campaignName = normalizeString(nameOverride) || `${bundle.campaign.name} (Imported)`

    const campaign = await tx.campaign.create({
      data: {
        name: campaignName,
        description: bundle.campaign.description,
        inviteCode: generateInviteCode(),
        currentDmId: actorUserId,
      },
      select: {
        id: true,
        name: true,
        inviteCode: true,
        currentDmId: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    const membershipRows = bundle.members
      .map((member) => ({
        campaignId: campaign.id,
        userId: userIdMap.get(member.userId) || actorUserId,
        role: member.userId === bundle.campaign.currentDmId ? 'DM' : member.campaignRole,
      }))
      .filter(
        (member, index, rows) => rows.findIndex((entry) => entry.userId === member.userId) === index
      )

    if (!membershipRows.some((member) => member.userId === actorUserId)) {
      membershipRows.unshift({
        campaignId: campaign.id,
        userId: actorUserId,
        role: 'DM',
      })
    }

    if (membershipRows.length > 0) {
      await tx.campaignMembership.createMany({ data: membershipRows })
    }

    if (bundle.characters.length > 0) {
      await tx.character.createMany({
        data: bundle.characters.map((character) => ({
          campaignId: campaign.id,
          userId: userIdMap.get(character.userId) || actorUserId,
          name: character.name,
          status: character.status as any,
          race: character.race,
          class: character.class,
          subclass: character.subclass,
          avatarUrl: character.avatarUrl,
          isActive: character.isActive,
          metadata:
            character.metadata === null ? undefined : (character.metadata as Prisma.InputJsonValue),
          createdAt: toDate(character.createdAt) || new Date(),
          updatedAt: toDate(character.updatedAt) || new Date(),
        })),
      })
    }

    const sessionIdMap = new Map<string, string>()
    const roomIdMap = new Map<string, string>()

    if (bundle.sessions.length > 0) {
      await tx.session.createMany({
        data: bundle.sessions.map((session) => {
          const newId = randomUUID()
          sessionIdMap.set(session.id, newId)
          return {
            id: newId,
            campaignId: campaign.id,
            name: session.name,
            description: session.description,
            dmId: actorUserId,
            state: session.state,
            createdAt: toDate(session.createdAt) || new Date(),
            startedAt: toDate(session.startedAt),
            endedAt: toDate(session.endedAt),
            updatedAt: toDate(session.updatedAt) || new Date(),
          }
        }),
      })
    }

    const roomRows: Array<Record<string, unknown>> = []
    const memberRows: Array<Record<string, unknown>> = []
    const messageRows: Array<Record<string, unknown>> = []
    const noteRows: Array<Record<string, unknown>> = []
    const logRows: Array<Record<string, unknown>> = []

    bundle.sessions.forEach((session) => {
      const mappedSessionId = sessionIdMap.get(session.id)
      if (!mappedSessionId) {
        return
      }

      session.rooms.forEach((room) => {
        const newRoomId = randomUUID()
        roomIdMap.set(room.id, newRoomId)
        roomRows.push({
          id: newRoomId,
          sessionId: mappedSessionId,
          name: room.name,
          type: room.type,
          createdBy: userIdMap.get(room.createdBy) || actorUserId,
          createdAt: toDate(room.createdAt) || new Date(),
          updatedAt: toDate(room.updatedAt) || new Date(),
        })
      })

      session.members.forEach((member) => {
        memberRows.push({
          id: randomUUID(),
          sessionId: mappedSessionId,
          userId: userIdMap.get(member.userId) || actorUserId,
          username: member.username,
          role: member.role,
          joinedAt: toDate(member.joinedAt) || new Date(),
        })
      })

      session.messages.forEach((message) => {
        messageRows.push({
          id: randomUUID(),
          sessionId: mappedSessionId,
          authorId: userIdMap.get(message.authorId) || actorUserId,
          authorUsername: message.authorUsername,
          content: message.content,
          type: message.type,
          isDmOnly: message.isDmOnly,
          visibleTo: mapUserIdList(message.visibleTo, userIdMap) as Prisma.InputJsonValue | null,
          createdAt: toDate(message.createdAt) || new Date(),
          editedAt: toDate(message.editedAt),
          deletedAt: toDate(message.deletedAt),
          deletedBy: message.deletedBy ? userIdMap.get(message.deletedBy) || null : null,
        })
      })

      session.notes.forEach((note) => {
        noteRows.push({
          id: randomUUID(),
          sessionId: mappedSessionId,
          authorId: userIdMap.get(note.authorId) || actorUserId,
          authorUsername: note.authorUsername,
          title: note.title,
          content: note.content,
          visibility: note.visibility,
          tags: note.tags as Prisma.InputJsonValue | null,
          allowedUsers: mapUserIdList(note.allowedUsers, userIdMap) as Prisma.InputJsonValue | null,
          publishedAt: toDate(note.publishedAt),
          createdAt: toDate(note.createdAt) || new Date(),
          updatedAt: toDate(note.updatedAt) || new Date(),
        })
      })

      session.logs.forEach((entry) => {
        logRows.push({
          id: randomUUID(),
          sessionId: mappedSessionId,
          userId: entry.userId ? userIdMap.get(entry.userId) || null : null,
          username: entry.username,
          eventType: entry.eventType,
          detail: entry.detail,
          createdAt: toDate(entry.createdAt) || new Date(),
        })
      })
    })

    if (roomRows.length > 0) {
      await tx.room.createMany({ data: roomRows as any[] })
    }

    if (memberRows.length > 0) {
      await tx.sessionMember.createMany({ data: memberRows as any[] })
    }

    if (messageRows.length > 0) {
      await tx.chatMessage.createMany({ data: messageRows as any[] })
    }

    if (noteRows.length > 0) {
      await tx.note.createMany({ data: noteRows as any[] })
    }

    if (logRows.length > 0) {
      await tx.sessionLog.createMany({ data: logRows as any[] })
    }

    if (bundle.recordings.length > 0) {
      await tx.recordingMetadata.createMany({
        data: bundle.recordings.map((recording) => ({
          id: randomUUID(),
          campaignId: campaign.id,
          sessionId: recording.sessionId ? sessionIdMap.get(recording.sessionId) || null : null,
          roomId: recording.roomId ? roomIdMap.get(recording.roomId) || null : null,
          title: recording.title,
          storageKey: recording.storageKey,
          sourceUrl: recording.sourceUrl,
          durationSeconds: recording.durationSeconds,
          startedAt: toDate(recording.startedAt),
          endedAt: toDate(recording.endedAt),
          journalSummary: recording.journalSummary,
          metadata:
            recording.metadata === null ? undefined : (recording.metadata as Prisma.InputJsonValue),
          createdAt: toDate(recording.createdAt) || new Date(),
          updatedAt: toDate(recording.updatedAt) || new Date(),
        })),
      })
    }

    const counts = buildCounts(bundle)

    const artifact = await tx.importExportArtifact.create({
      data: {
        type: 'CAMPAIGN_IMPORT',
        campaignId: campaign.id,
        createdByUserId: actorUserId,
        formatVersion: PORTABILITY_FORMAT_VERSION,
        payload: bundle as unknown as Prisma.InputJsonValue,
        metadata: {
          importedCampaignId: campaign.id,
          importedCampaignName: campaign.name,
          ...counts,
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    })

    return {
      campaign,
      artifactId: artifact.id,
      counts,
    }
  })

  return imported
}

export async function listRecordingMetadata(prisma: PrismaClient, campaignId: string) {
  return prisma.recordingMetadata.findMany({
    where: { campaignId },
    orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      campaignId: true,
      sessionId: true,
      roomId: true,
      title: true,
      storageKey: true,
      sourceUrl: true,
      durationSeconds: true,
      startedAt: true,
      endedAt: true,
      journalSummary: true,
      metadata: true,
      session: {
        select: {
          id: true,
          name: true,
        },
      },
      room: {
        select: {
          id: true,
          name: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    },
  })
}

export async function createRecordingMetadata(prisma: PrismaClient, input: RecordingCreateInput) {
  return prisma.recordingMetadata.create({
    data: {
      campaignId: input.campaignId,
      sessionId: input.sessionId || null,
      roomId: input.roomId || null,
      title: input.title,
      storageKey: input.storageKey || null,
      sourceUrl: input.sourceUrl || null,
      durationSeconds: input.durationSeconds || null,
      startedAt: toDate(input.startedAt),
      endedAt: toDate(input.endedAt),
      journalSummary: input.journalSummary || null,
      metadata: input.metadata || undefined,
    },
    select: {
      id: true,
      campaignId: true,
      sessionId: true,
      roomId: true,
      title: true,
      storageKey: true,
      sourceUrl: true,
      durationSeconds: true,
      startedAt: true,
      endedAt: true,
      journalSummary: true,
      metadata: true,
      session: {
        select: {
          id: true,
          name: true,
        },
      },
      room: {
        select: {
          id: true,
          name: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    },
  })
}

export async function createOperationalExportArtifact(
  prisma: PrismaClient,
  actorUserId: string,
  settings: Record<string, unknown>,
  telemetry: Array<Record<string, unknown>>,
  diagnostics: Array<Record<string, unknown>>,
  auditLog: Array<Record<string, unknown>>
) {
  const bundle: OperationalExportBundle = {
    version: PORTABILITY_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    telemetry,
    diagnostics,
    auditLog,
  }

  const artifact = await prisma.importExportArtifact.create({
    data: {
      type: 'OPERATIONS_EXPORT',
      createdByUserId: actorUserId,
      formatVersion: PORTABILITY_FORMAT_VERSION,
      payload: bundle as unknown as Prisma.InputJsonValue,
      metadata: {
        telemetryCount: telemetry.length,
        diagnosticCount: diagnostics.length,
        auditCount: auditLog.length,
      } as Prisma.InputJsonValue,
    },
    select: { id: true },
  })

  return {
    artifactId: artifact.id,
    bundle,
  }
}

export function isValidTransferBundle(input: unknown): input is CampaignTransferBundle {
  return isCampaignTransferBundle(input)
}

export function portabilityArtifactTypeLabel(type: PortabilityArtifactType): string {
  if (type === 'CAMPAIGN_EXPORT') return 'Campaign export'
  if (type === 'CAMPAIGN_IMPORT') return 'Campaign import'
  return 'Operations export'
}

export function defaultRecordingState(): PresenceState {
  return 'OFFLINE'
}
