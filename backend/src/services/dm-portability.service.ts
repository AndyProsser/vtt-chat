import { randomUUID } from 'node:crypto'
import { getPrismaClient } from '@/infra/db'
import { PORTABILITY_FORMAT_VERSION } from '@/constants/admin-portability.constants'
import type { CampaignTransferBundle } from '@/types/portability.types'
import type { Prisma } from '@prisma/client'

const prisma = getPrismaClient()

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
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
    campaignNotes: bundle.campaignNotes.length,
    greenroomMessages: bundle.greenroomMessages.length,
  }
}

/**
 * DM self-service campaign export.
 * - Strips member emails (no PII in DM exports)
 * - Excludes PRIVATE room (Whisper bubble) messages and WHISPER-type messages
 * Uses JS post-processing for privacy filtering to avoid stale Prisma client issues.
 */
export async function buildDmCampaignExport(campaignId: string, actorUserId?: string | null) {
  const result = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      currentDm: { select: { id: true, username: true } },
      members: {
        include: {
          user: {
            select: { id: true, username: true, displayName: true, role: true },
          },
        },
        orderBy: { joinedAt: 'asc' },
      },
      characters: { orderBy: { createdAt: 'asc' } },
      notes: {
        where: { sessionId: null },
        orderBy: { createdAt: 'asc' },
      },
      greenroomMessages: {
        orderBy: { createdAt: 'asc' },
      },
      sessions: {
        orderBy: { createdAt: 'asc' },
        include: {
          rooms: { orderBy: { createdAt: 'asc' } },
          members: { orderBy: { joinedAt: 'asc' } },
          messages: { orderBy: { createdAt: 'asc' } },
          notes: { orderBy: { createdAt: 'asc' } },
          logs: { orderBy: { createdAt: 'asc' } },
        },
      },
      recordings: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!result) return null

  // Cast through any to access included relations not reflected in the stale
  // generated Prisma client types. The include clause above guarantees the shape.
  const campaign = result as any

  const bundle: CampaignTransferBundle = {
    version: PORTABILITY_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    sourceCampaignId: campaign.id,
    campaign: {
      name: campaign.name,
      description: campaign.description,
      posterUrl: campaign.posterUrl,
      inviteCode: campaign.inviteCode,
      currentDmId: campaign.currentDmId,
      currentDmUsername: campaign.currentDm.username,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
      settings: {
        discoverable: campaign.discoverable,
        spectatorPolicy: campaign.spectatorPolicy,
        spectatorMax: campaign.spectatorMax,
        spectatorWaitlistEnabled: campaign.spectatorWaitlistEnabled,
        spectatorReconnectGraceSecs: campaign.spectatorReconnectGraceSecs,
        extensionSyncPolicy: campaign.extensionSyncPolicy,
        lateJoinPolicy: campaign.lateJoinPolicy,
        lateJoinGraceMinutes: campaign.lateJoinGraceMinutes,
        postSessionChatEnabled: campaign.postSessionChatEnabled,
        postSessionChatDurationMs: campaign.postSessionChatDurationMs,
        dmAutoTargetOnFirstPlayerJoin: campaign.dmAutoTargetOnFirstPlayerJoin,
        defaultSessionDurationMins: campaign.defaultSessionDurationMins,
        supportedPlatforms: campaign.supportedPlatforms,
      },
    },
    // email omitted intentionally — DM self-service exports contain no PII
    members: campaign.members.map((membership: any) => ({
      userId: membership.userId,
      username: membership.user.username,
      displayName: membership.user.displayName,
      email: null,
      campaignRole: membership.role,
      userRole: membership.user.role,
    })),
    characters: campaign.characters.map((character: any) => ({
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
    campaignNotes: campaign.notes.map((note: any) => ({
      authorId: note.authorId,
      authorUsername: note.authorUsername,
      title: note.title,
      content: note.content,
      visibility: note.visibility,
      tags: note.tags as Prisma.JsonValue | null,
      allowedUsers: note.allowedUsers as Prisma.JsonValue | null,
      attachments: note.attachments as Prisma.JsonValue | null,
      publishedAt: toIso(note.publishedAt),
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    })),
    greenroomMessages: campaign.greenroomMessages.map((message: any) => ({
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
    sessions: campaign.sessions.map((session: any) => {
      // Build a Set of PRIVATE room IDs so whisper messages are excluded
      const privateRoomIds = new Set<string>(
        session.rooms.filter((room: any) => room.type === 'PRIVATE').map((room: any) => room.id)
      )
      const publicMessages = session.messages.filter(
        (message: any) =>
          message.type !== 'WHISPER' && !(message.roomId && privateRoomIds.has(message.roomId))
      )

      return {
        id: session.id,
        name: session.name,
        description: session.description,
        state: session.state,
        createdAt: session.createdAt.toISOString(),
        startedAt: toIso(session.startedAt),
        endedAt: toIso(session.endedAt),
        updatedAt: session.updatedAt.toISOString(),
        rooms: session.rooms.map((room: any) => ({
          id: room.id,
          name: room.name,
          type: room.type,
          createdBy: room.createdBy,
          createdAt: room.createdAt.toISOString(),
          updatedAt: room.updatedAt.toISOString(),
        })),
        members: session.members.map((member: any) => ({
          userId: member.userId,
          username: member.username,
          role: member.role,
          joinedAt: member.joinedAt.toISOString(),
        })),
        messages: publicMessages.map((message: any) => ({
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
        notes: session.notes.map((note: any) => ({
          authorId: note.authorId,
          authorUsername: note.authorUsername,
          title: note.title,
          content: note.content,
          visibility: note.visibility,
          tags: note.tags as Prisma.JsonValue | null,
          allowedUsers: note.allowedUsers as Prisma.JsonValue | null,
          attachments: note.attachments as Prisma.JsonValue | null,
          publishedAt: toIso(note.publishedAt),
          createdAt: note.createdAt.toISOString(),
          updatedAt: note.updatedAt.toISOString(),
        })),
        logs: session.logs.map((log: any) => ({
          userId: log.userId,
          username: log.username,
          eventType: log.eventType,
          detail: log.detail,
          createdAt: log.createdAt.toISOString(),
        })),
      }
    }),
    recordings: campaign.recordings.map((recording: any) => ({
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
      metadata: { ...counts, dmSelfService: true } as Prisma.InputJsonValue,
    },
    select: { id: true },
  })

  // Randomise the invite code so re-imports don't collide with the source campaign
  bundle.campaign.inviteCode = randomUUID().slice(0, 6).toUpperCase()

  return { bundle, artifactId: artifact.id, counts }
}
